const express = require('express');
const router = express.Router();

const { getPlanningData } = require('../services/planningDataService');
const { generateInitialPopulation } = require('../ga/population');
const { evaluatePopulation, selectParents } = require('../ga/selection');
const { singlePointCrossover } = require('../ga/crossover');
const { calculateFitness } = require('../ga/fitness');

router.get('/test/:periodId/:populationSize', async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);
    const populationSize = Number(req.params.populationSize);

    const planningData = await getPlanningData(periodId);

    if (!planningData) {
      return res.status(404).json({
        success: false,
        message: 'Planning period not found',
      });
    }

    const population = generateInitialPopulation(planningData, populationSize);
    const evaluatedPopulation = evaluatePopulation(population, planningData);
    const [parent1, parent2] = selectParents(evaluatedPopulation, 2, 3);

    const crossoverResult = singlePointCrossover(
      parent1.schedule,
      parent2.schedule,
      planningData
    );

    const childAFitness = calculateFitness(crossoverResult.childA, planningData);
    const childBFitness = calculateFitness(crossoverResult.childB, planningData);

    res.json({
      success: true,
      parent1: {
        id: parent1.id,
        score: parent1.fitness.score,
      },
      parent2: {
        id: parent2.id,
        score: parent2.fitness.score,
      },
      crossoverIndex: crossoverResult.crossoverIndex,
      crossoverDate: crossoverResult.crossoverDate,
      childA: {
        score: childAFitness.score,
        totalPenalty: childAFitness.totalPenalty,
        totalBonus: childAFitness.totalBonus,
      },
      childB: {
        score: childBFitness.score,
        totalPenalty: childBFitness.totalPenalty,
        totalBonus: childBFitness.totalBonus,
      },
    });
  } catch (error) {
    console.error('Crossover test error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to test crossover',
      error: error.message,
    });
  }
});

module.exports = router;