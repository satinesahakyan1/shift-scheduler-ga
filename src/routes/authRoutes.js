const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../../config/db');
const { sendSetupPasswordEmail } = require('../utils/emailService');
require('dotenv').config();

const router = express.Router();

const DUPLICATE_EMAIL_MESSAGE =
  'Այս էլ․ փոստով օգտատեր արդեն գոյություն ունի, խնդրում ենք մուտք գործել կամ օգտագործել այլ էլ․ փոստ';

const INCOMPLETE_REGISTRATION_MESSAGE =
  'Գրանցումը դեռ ավարտված չէ։ Ստուգեք ձեր մեյլը և սահմանեք գաղտնաբառը։';

function validatePassword(password) {
  const passwordValue = String(password || '');

  if (!passwordValue) {
    return 'Գաղտնաբառը պարտադիր է';
  }

  if (passwordValue.length < 8) {
    return 'Գաղտնաբառը պետք է լինի առնվազն 8 նիշ';
  }

  if (!/[a-z]/.test(passwordValue)) {
    return 'Գաղտնաբառում պետք է լինի առնվազն 1 փոքրատառ';
  }

  if (!/[A-Z]/.test(passwordValue)) {
    return 'Գաղտնաբառում պետք է լինի առնվազն 1 մեծատառ';
  }

  if (!/[0-9]/.test(passwordValue)) {
    return 'Գաղտնաբառում պետք է լինի առնվազն 1 թիվ';
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(passwordValue)) {
    return 'Գաղտնաբառում պետք է լինի առնվազն 1 հատուկ նիշ';
  }

  return null;
}

function generateSetupToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildSetupLink(email, token) {
  const baseUrl = String(process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${baseUrl}/set-password.html?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

router.post('/register', async (req, res) => {
  try {
    const { full_name, email, organization_name } = req.body;

    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Անուն ազգանունը պարտադիր է',
      });
    }

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Էլ․ փոստը պարտադիր է',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const rawToken = generateSetupToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    const existingUserResult = await pool.query(
      `
      SELECT id, password_hash, is_email_verified
      FROM users
      WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
      LIMIT 1
      `,
      [normalizedEmail]
    );

    let user;

    if (existingUserResult.rows.length > 0) {
      const existingUser = existingUserResult.rows[0];

      if (existingUser.password_hash) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_EMAIL_MESSAGE,
        });
      }

      const updatedUserResult = await pool.query(
        `
        UPDATE users
        SET
          full_name = $1,
          organization_name = $2,
          setup_password_token_hash = $3,
          setup_password_token_expires_at = $4,
          is_email_verified = FALSE
        WHERE id = $5
        RETURNING id, full_name, email, organization_name
        `,
        [
          String(full_name).trim(),
          organization_name ? String(organization_name).trim() : null,
          tokenHash,
          expiresAt,
          existingUser.id,
        ]
      );

      user = updatedUserResult.rows[0];
    } else {
      const insertResult = await pool.query(
        `
        INSERT INTO users (
          full_name,
          email,
          password_hash,
          organization_name,
          is_email_verified,
          setup_password_token_hash,
          setup_password_token_expires_at
        )
        VALUES ($1, $2, NULL, $3, FALSE, $4, $5)
        RETURNING id, full_name, email, organization_name
        `,
        [
          String(full_name).trim(),
          normalizedEmail,
          organization_name ? String(organization_name).trim() : null,
          tokenHash,
          expiresAt,
        ]
      );

      user = insertResult.rows[0];
    }

    const setupLink = buildSetupLink(normalizedEmail, rawToken);

    await sendSetupPasswordEmail({
      to: normalizedEmail,
      fullName: user.full_name,
      setupLink,
    });

    res.status(200).json({
      success: true,
      message: 'Մեյլին ուղարկվեց գաղտնաբառ սահմանելու հղումը',
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: DUPLICATE_EMAIL_MESSAGE,
      });
    }

    console.error('Register error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց ուղարկել գրանցման նամակը',
    });
  }
});

router.post('/set-password', async (req, res) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Էլ․ փոստը պարտադիր է',
      });
    }

    if (!token || !String(token).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Անվավեր կամ բացակայող հղում',
      });
    }

    const passwordError = validatePassword(password);

    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError,
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const tokenHash = hashToken(token);

    const userResult = await pool.query(
      `
      SELECT id, full_name, email, organization_name
      FROM users
      WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
        AND setup_password_token_hash = $2
        AND setup_password_token_expires_at IS NOT NULL
        AND setup_password_token_expires_at > NOW()
      LIMIT 1
      `,
      [normalizedEmail, tokenHash]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Հղումը անվավեր է կամ ժամկետանց',
      });
    }

    const user = userResult.rows[0];
    const passwordHash = await bcrypt.hash(String(password), 10);

    await pool.query(
      `
      UPDATE users
      SET
        password_hash = $1,
        is_email_verified = TRUE,
        setup_password_token_hash = NULL,
        setup_password_token_expires_at = NULL
      WHERE id = $2
      `,
      [passwordHash, user.id]
    );

    const jwtToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Գաղտնաբառը հաջողությամբ սահմանվեց',
      token: jwtToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        organization_name: user.organization_name,
      },
    });
  } catch (error) {
    console.error('Set password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց սահմանել գաղտնաբառը',
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Մուտքագրեք էլ․ փոստը և գաղտնաբառը',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await pool.query(
      `
      SELECT id, full_name, email, password_hash, organization_name, is_email_verified
      FROM users
      WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
      LIMIT 1
      `,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Սխալ էլ․ փոստ կամ գաղտնաբառ',
      });
    }

    const user = result.rows[0];

    if (!user.password_hash || !user.is_email_verified) {
      return res.status(401).json({
        success: false,
        message: INCOMPLETE_REGISTRATION_MESSAGE,
      });
    }

    const isMatch = await bcrypt.compare(String(password), user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Սխալ էլ․ փոստ կամ գաղտնաբառ',
      });
    }

    const jwtToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Մուտքը հաջողությամբ կատարվեց',
      token: jwtToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        organization_name: user.organization_name,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց մուտք գործել',
    });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token չի գտնվել',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      `
      SELECT id, full_name, email, organization_name, created_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Օգտատերը չի գտնվել',
      });
    }

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Me error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Անվավեր token',
    });
  }
});

module.exports = router;