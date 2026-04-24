const express = require('express');
const router = express.Router();

const { getPlanningData } = require('../services/planningDataService');
const { generateRandomSchedule, generateInitialPopulation } = require('../ga/population');
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

    const schedule = generateRandomSchedule(planningData);
    const fitness = calculateFitness(schedule, planningData);

    res.json({
      success: true,
      schedule,
      fitness,
    });
  } catch (error) {
    console.error('Population test error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to generate random schedule',
      error: error.message,
    });
  }
});

router.get('/test/:periodId/:size', async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);
    const size = Number(req.params.size);

    const planningData = await getPlanningData(periodId);

    if (!planningData) {
      return res.status(404).json({
        success: false,
        message: 'Planning period not found',
      });
    }

    const population = generateInitialPopulation(planningData, size);

    const evaluatedPopulation = population.map((schedule, index) => ({
      index: index + 1,
      fitness: calculateFitness(schedule, planningData),
      schedule,
    }));

    evaluatedPopulation.sort((a, b) => b.fitness.score - a.fitness.score);

    res.json({
      success: true,
      populationSize: size,
      bestCandidate: evaluatedPopulation[0],
      worstCandidate: evaluatedPopulation[evaluatedPopulation.length - 1],
    });
  } catch (error) {
    console.error('Population generation error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to generate population',
      error: error.message,
    });
  }
});

module.exports = router;