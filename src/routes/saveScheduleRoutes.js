const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/authMiddleware');
const {
  saveGeneratedSchedule,
  listUserSchedules,
  getUserScheduleDetails,
  deleteUserSchedule,
  buildScheduleCsv,
} = require('../services/schedulePersistenceService');

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { scheduleName, startDate, endDate, bestCandidate } = req.body;

    if (!bestCandidate || !Array.isArray(bestCandidate.schedule)) {
      return res.status(400).json({
        success: false,
        message: 'Պահպանելու համար ժամանակացույցի տվյալներ չեն փոխանցվել',
      });
    }

    if (bestCandidate.schedule.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Դատարկ ժամանակացույցը հնարավոր չէ պահպանել',
      });
    }

    const saved = await saveGeneratedSchedule({
      planningPeriodId: null,
      bestCandidate,
      scheduleName: scheduleName || 'Պահպանված ժամանակացույց',
      startDate,
      endDate,
    });

    res.status(201).json({
      success: true,
      message: 'Ժամանակացույցը հաջողությամբ պահպանվեց',
      data: saved,
    });
  } catch (error) {
    console.error('Save schedule error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց պահպանել ժամանակացույցը',
      error: error.message,
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await listUserSchedules(req.user.id);

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error('List schedules error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց բեռնել պահպանված ժամանակացույցերը',
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);

    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Անվավեր schedule ID',
      });
    }

    const details = await getUserScheduleDetails(req.user.id, scheduleId);

    if (!details) {
      return res.status(404).json({
        success: false,
        message: 'Ժամանակացույցը չի գտնվել',
      });
    }

    res.json({
      success: true,
      data: details,
    });
  } catch (error) {
    console.error('Get schedule details error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց բեռնել ժամանակացույցի տվյալները',
    });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);

    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Անվավեր schedule ID',
      });
    }

    const details = await getUserScheduleDetails(req.user.id, scheduleId);

    if (!details) {
      return res.status(404).json({
        success: false,
        message: 'Ժամանակացույցը չի գտնվել',
      });
    }

    const csv = buildScheduleCsv(details);
    const safeName = String(details.meta.schedule_name || 'schedule')
      .replace(/[^a-zA-Z0-9\u0531-\u0587\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName || 'schedule'}.csv"`
    );

    res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('Download schedule error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց ներբեռնել ժամանակացույցը',
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);

    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Անվավեր schedule ID',
      });
    }

    const deleted = await deleteUserSchedule(req.user.id, scheduleId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Ժամանակացույցը չի գտնվել կամ հասանելի չէ',
      });
    }

    res.json({
      success: true,
      message: 'Ժամանակացույցը ջնջվեց',
    });
  } catch (error) {
    console.error('Delete schedule error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց ջնջել ժամանակացույցը',
    });
  }
});

module.exports = router;

