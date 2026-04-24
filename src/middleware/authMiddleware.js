const jwt = require('jsonwebtoken');
require('dotenv').config();

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Մուտք գործած չեք',
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.id,
      email: decoded.email,
      full_name: decoded.full_name,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Անվավեր կամ ժամկետանց token',
    });
  }
}

module.exports = {
  requireAuth,
};