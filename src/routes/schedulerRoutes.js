const express = require('express');
const router = express.Router();

const { getPlanningData } = require('../services/planningDataService');
const { runGeneticAlgorithm } = require('../ga/scheduler');

router.get('/run/:periodId', async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);

    const populationSize = Number(req.query.populationSize || 20);
    const generations = Number(req.query.generations || 30);
    const mutationRate = Number(req.query.mutationRate || 0.15);
    const crossoverRate = Number(req.query.crossoverRate || 0.8);
    const elitismCount = Number(req.query.elitismCount || 2);
    const tournamentSize = Number(req.query.tournamentSize || 3);

    const planningData = await getPlanningData(periodId);

    if (!planningData) {
      return res.status(404).json({
        success: false,
        message: 'Planning period not found',
      });
    }

    const result = runGeneticAlgorithm(planningData, {
      populationSize,
      generations,
      mutationRate,
      crossoverRate,
      elitismCount,
      tournamentSize,
    });

    res.json({
      success: true,
      config: result.config,
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
    console.error('Scheduler run error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to run scheduler',
      error: error.message,
    });
  }
});

module.exports = router;