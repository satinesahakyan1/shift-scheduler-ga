const express = require('express');
const router = express.Router();

const { getPlanningData } = require('../services/planningDataService');
const { generateInitialPopulation } = require('../ga/population');
const { evaluatePopulation, selectParents } = require('../ga/selection');
const { singlePointCrossover } = require('../ga/crossover');
const { mutateSchedule } = require('../ga/mutation');
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

    const { childA } = singlePointCrossover(
      parent1.schedule,
      parent2.schedule,
      planningData
    );

    const beforeFitness = calculateFitness(childA, planningData);

    const mutationResult = mutateSchedule(childA, planningData, 0.2);
    const afterFitness = calculateFitness(
      mutationResult.mutatedSchedule,
      planningData
    );

    res.json({
      success: true,
      beforeMutation: {
        score: beforeFitness.score,
        totalPenalty: beforeFitness.totalPenalty,
        totalBonus: beforeFitness.totalBonus,
      },
      afterMutation: {
        score: afterFitness.score,
        totalPenalty: afterFitness.totalPenalty,
        totalBonus: afterFitness.totalBonus,
      },
      mutationCount: mutationResult.mutationCount,
      mutationLog: mutationResult.mutationLog,
    });
  } catch (error) {
    console.error('Mutation test error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to test mutation',
      error: error.message,
    });
  }
});

module.exports = router;