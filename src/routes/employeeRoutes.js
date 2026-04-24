const express = require('express');
const router = express.Router();
const pool = require('../../config/db');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, max_shifts_per_week FROM employees ORDER BY id'
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching employees:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees',
    });
  }
});

module.exports = router;