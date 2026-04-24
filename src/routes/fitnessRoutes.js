const express = require('express');
const router = express.Router();
const { getPlanningData } = require('../services/planningDataService');
const { calculateFitness } = require('../ga/fitness');

router.get('/test/:periodId', async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);

    const planningData = await getPlanningData(periodId);

    if (!planningData) {
      return res.status(404).json({
        success: false,
        message: 'Planning period not found',
      });
    }

    const mockSchedule = [
      { work_date: '2026-04-08', shift_type_id: 1, employee_ids: [1, 2] },
      { work_date: '2026-04-08', shift_type_id: 2, employee_ids: [3, 5] },
      { work_date: '2026-04-08', shift_type_id: 3, employee_ids: [4] },

      { work_date: '2026-04-09', shift_type_id: 1, employee_ids: [1, 2] },
      { work_date: '2026-04-09', shift_type_id: 2, employee_ids: [3, 4] },
      { work_date: '2026-04-09', shift_type_id: 3, employee_ids: [2] },

      { work_date: '2026-04-10', shift_type_id: 1, employee_ids: [1, 3] },
      { work_date: '2026-04-10', shift_type_id: 2, employee_ids: [5] },
      { work_date: '2026-04-10', shift_type_id: 3, employee_ids: [4] },

      { work_date: '2026-04-11', shift_type_id: 1, employee_ids: [2] },
      { work_date: '2026-04-11', shift_type_id: 2, employee_ids: [1, 5] },
      { work_date: '2026-04-11', shift_type_id: 3, employee_ids: [4] },

      { work_date: '2026-04-12', shift_type_id: 1, employee_ids: [1, 3] },
      { work_date: '2026-04-12', shift_type_id: 2, employee_ids: [5] },
      { work_date: '2026-04-12', shift_type_id: 3, employee_ids: [2] },

      { work_date: '2026-04-13', shift_type_id: 1, employee_ids: [1, 5] },
      { work_date: '2026-04-13', shift_type_id: 2, employee_ids: [3, 4] },
      { work_date: '2026-04-13', shift_type_id: 3, employee_ids: [2] },

      { work_date: '2026-04-14', shift_type_id: 1, employee_ids: [5] },
      { work_date: '2026-04-14', shift_type_id: 2, employee_ids: [1] },
      { work_date: '2026-04-14', shift_type_id: 3, employee_ids: [2] },
    ];

    const result = calculateFitness(mockSchedule, planningData);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Fitness test error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to calculate fitness',
      error: error.message,
    });
  }
});

module.exports = router;