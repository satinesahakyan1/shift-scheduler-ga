const express = require('express');
const router = express.Router();
const pool = require('../../config/db');

/**
 * Ստանալ կազմակերպության բոլոր հերթափոխերը
 */
router.get('/organization/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;

    const result = await pool.query(
      `
      SELECT id, name, required_employees_per_day, organization_id, created_at
      FROM shift_types
      WHERE organization_id = $1
      ORDER BY id ASC
      `,
      [organizationId]
    );

    res.json({
      success: true,
      shifts: result.rows,
    });
  } catch (error) {
    console.error('Get organization shifts error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց ստանալ հերթափոխերը',
    });
  }
});

/**
 * Թարմացնել հերթափոխի համար օրական պահանջվող մարդկանց քանակը
 */
router.patch('/:shiftTypeId/required-count', async (req, res) => {
  try {
    const { shiftTypeId } = req.params;
    const { requiredEmployeesPerDay } = req.body;

    if (
      requiredEmployeesPerDay === undefined ||
      requiredEmployeesPerDay === null ||
      Number.isNaN(Number(requiredEmployeesPerDay)) ||
      Number(requiredEmployeesPerDay) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'requiredEmployeesPerDay պետք է լինի 0 կամ դրանից մեծ թիվ',
      });
    }

    const result = await pool.query(
      `
      UPDATE shift_types
      SET required_employees_per_day = $1
      WHERE id = $2
      RETURNING id, name, required_employees_per_day
      `,
      [Number(requiredEmployeesPerDay), shiftTypeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Հերթափոխը չի գտնվել',
      });
    }

    res.json({
      success: true,
      message: 'Պահպանվեց պահանջվող մարդկանց քանակը',
      shift: result.rows[0],
    });
  } catch (error) {
    console.error('Update required count error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց պահպանել պահանջվող մարդկանց քանակը',
    });
  }
});

module.exports = router;