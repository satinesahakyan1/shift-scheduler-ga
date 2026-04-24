const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/templates', requireAuth, async (req, res) => {
  try {
    const shiftTypesResult = await pool.query(
      `
      SELECT id, name, sort_order
      FROM shift_types
      WHERE user_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [req.user.id]
    );

    const templatesResult = await pool.query(
      `
      SELECT id, user_id, day_of_week, shift_type_id, required_employees
      FROM requirement_templates
      WHERE user_id = $1
      ORDER BY day_of_week, shift_type_id
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      shiftTypes: shiftTypesResult.rows,
      templates: templatesResult.rows,
      days: [
        { id: 1, name: 'Երկուշաբթի' },
        { id: 2, name: 'Երեքշաբթի' },
        { id: 3, name: 'Չորեքշաբթի' },
        { id: 4, name: 'Հինգշաբթի' },
        { id: 5, name: 'Ուրբաթ' },
        { id: 6, name: 'Շաբաթ' },
        { id: 7, name: 'Կիրակի' },
      ],
    });
  } catch (error) {
    console.error('Get requirement templates error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց բեռնել պահանջարկի ձևանմուշները',
    });
  }
});

router.post('/templates', requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Պահանջարկի տվյալներ չեն փոխանցվել',
      });
    }

    await client.query('BEGIN');

    const userShiftTypesResult = await client.query(
      `
      SELECT id
      FROM shift_types
      WHERE user_id = $1
      `,
      [req.user.id]
    );

    const allowedShiftIds = new Set(userShiftTypesResult.rows.map((row) => row.id));

    for (const item of items) {
      const dayOfWeek = Number(item.day_of_week);
      const shiftTypeId = Number(item.shift_type_id);
      const requiredEmployees = Number(item.required_employees);

      if (!allowedShiftIds.has(shiftTypeId)) {
        throw new Error('Գտնվեց այս կազմակերպությանը չպատկանող հերթափոխ');
      }

      if (dayOfWeek < 1 || dayOfWeek > 7) {
        throw new Error('Շաբաթվա օրը պետք է լինի 1-ից 7 միջակայքում');
      }

      if (!Number.isInteger(requiredEmployees) || requiredEmployees < 0) {
        throw new Error('Պահանջվող աշխատակիցների քանակը պետք է լինի 0 կամ դրական ամբողջ թիվ');
      }

      await client.query(
        `
        INSERT INTO requirement_templates (
          user_id,
          day_of_week,
          shift_type_id,
          required_employees
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, day_of_week, shift_type_id)
        DO UPDATE SET required_employees = EXCLUDED.required_employees
        `,
        [req.user.id, dayOfWeek, shiftTypeId, requiredEmployees]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Պահանջարկի ձևանմուշները հաջողությամբ պահպանվեցին',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Save requirement templates error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Չհաջողվեց պահպանել պահանջարկի ձևանմուշները',
    });
  } finally {
    client.release();
  }
});

module.exports = router;