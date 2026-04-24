const express = require('express');
const router = express.Router();
const pool = require('../../config/db');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, start_date, end_date
      FROM planning_periods
      ORDER BY start_date
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching planning periods:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց բեռնել ժամանակահատվածների ցանկը',
    });
  }
});

router.post('/resolve', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Պետք է ընտրել սկսելու և ավարտի ամսաթիվը',
      });
    }

    const result = await pool.query(
      `
      SELECT id, name, start_date, end_date
      FROM planning_periods
      WHERE start_date = $1 AND end_date = $2
      LIMIT 1
      `,
      [startDate, endDate]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Այս ամսաթվերի համար պլանավորման շրջան չի գտնվել',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error resolving planning period:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց գտնել համապատասխան ժամանակահատվածը',
    });
  }
});

module.exports = router;