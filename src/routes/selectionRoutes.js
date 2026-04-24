const express = require('express');
const router = express.Router();

const { getPlanningData } = require('../services/planningDataService');
const { generateInitialPopulation } = require('../ga/population');
const {
  evaluatePopulation,
  tournamentSelection,
  selectParents,
} = require('../ga/selection');

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

    const tournamentWinner = tournamentSelection(evaluatedPopulation, 3);
    const parents = selectParents(evaluatedPopulation, 2, 3);

    res.json({
      success: true,
      populationSize,
      bestCandidate: {
        id: evaluatedPopulation[0].id,
        score: evaluatedPopulation[0].fitness.score,
        totalPenalty: evaluatedPopulation[0].fitness.totalPenalty,
      },
      worstCandidate: {
        id: evaluatedPopulation[evaluatedPopulation.length - 1].id,
        score: evaluatedPopulation[evaluatedPopulation.length - 1].fitness.score,
        totalPenalty: evaluatedPopulation[evaluatedPopulation.length - 1].fitness.totalPenalty,
      },
      tournamentWinner: {
        id: tournamentWinner.id,
        score: tournamentWinner.fitness.score,
      },
      selectedParents: parents.map((parent) => ({
        id: parent.id,
        score: parent.fitness.score,
      })),
      top5: evaluatedPopulation.slice(0, 5).map((candidate) => ({
        id: candidate.id,
        score: candidate.fitness.score,
        totalPenalty: candidate.fitness.totalPenalty,
      })),
    });
  } catch (error) {
    console.error('Selection test error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to test selection',
      error: error.message,
    });
  }
});

module.exports = router;