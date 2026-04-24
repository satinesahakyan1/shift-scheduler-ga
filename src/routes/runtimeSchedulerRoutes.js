const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/authMiddleware');
const { buildRuntimePlanningData } = require('../services/runtimePlanningService');
const { runGeneticAlgorithm } = require('../ga/scheduler');

router.post('/run', requireAuth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      populationSize = 20,
      generations = 30,
      mutationRate = 0.15,
      crossoverRate = 0.8,
      elitismCount = 2,
      tournamentSize = 3,
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Ընտրեք սկսելու և ավարտի ամսաթիվը',
      });
    }

    const planningData = await buildRuntimePlanningData(
      req.user.id,
      startDate,
      endDate
    );

    const result = runGeneticAlgorithm(planningData, {
      populationSize: Number(populationSize),
      generations: Number(generations),
      mutationRate: Number(mutationRate),
      crossoverRate: Number(crossoverRate),
      elitismCount: Number(elitismCount),
      tournamentSize: Number(tournamentSize),
    });

    res.json({
      success: true,
      selectedRange: {
        startDate,
        endDate,
      },
      planningMeta: {
        employees: planningData.employees,
        shiftTypes: planningData.shiftTypes,
        planningPeriod: planningData.planningPeriod,
      },
      bestCandidate: {
        generation: result.bestCandidate.generation,
        score: result.bestCandidate.fitness.score,
        totalPenalty: result.bestCandidate.fitness.totalPenalty,
        totalBonus: result.bestCandidate.fitness.totalBonus,
        stats: result.bestCandidate.fitness.stats,
        breakdown: result.bestCandidate.fitness.breakdown,
        violations: result.bestCandidate.fitness.violations,
        schedule: result.bestCandidate.schedule,
      },
      generationStats: result.generationStats,
    });
  } catch (error) {
    console.error('Runtime scheduler error:', error.message);

    res.status(500).json({
      success: false,
      message: error.message || 'Չհաջողվեց կազմել ժամանակացույցը',
    });
  }
});

module.exports = router;