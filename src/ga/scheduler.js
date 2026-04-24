const { generateInitialPopulation } = require('./population');
const { evaluatePopulation, selectParents } = require('./selection');
const { singlePointCrossover } = require('./crossover');
const { mutateSchedule } = require('./mutation');
const { repairSchedule } = require('./repair');

function cloneSchedule(schedule = []) {
  return schedule.map((entry) => ({
    work_date:
      typeof entry.work_date === 'string'
        ? entry.work_date.slice(0, 10)
        : entry.work_date,
    shift_type_id: entry.shift_type_id,
    employee_ids: Array.isArray(entry.employee_ids) ? [...entry.employee_ids] : [],
  }));
}

function runGeneticAlgorithm(planningData, options = {}) {
  const populationSize = options.populationSize ?? 20;
  const generations = options.generations ?? 30;
  const mutationRate = options.mutationRate ?? 0.15;
  const crossoverRate = options.crossoverRate ?? 0.8;
  const elitismCount = options.elitismCount ?? 2;
  const tournamentSize = options.tournamentSize ?? 3;

  if (!Number.isInteger(populationSize) || populationSize <= 1) {
    throw new Error('Population size must be an integer greater than 1');
  }

  if (!Number.isInteger(generations) || generations <= 0) {
    throw new Error('Generations must be a positive integer');
  }

  let population = generateInitialPopulation(planningData, populationSize).map((schedule) =>
    repairSchedule(schedule, planningData)
  );

  let bestCandidateEver = null;
  const generationStats = [];

  for (let generation = 1; generation <= generations; generation += 1) {
    const evaluatedPopulation = evaluatePopulation(population, planningData);

    const bestInGeneration = evaluatedPopulation[0];
    const worstInGeneration = evaluatedPopulation[evaluatedPopulation.length - 1];

    const averageScore =
      evaluatedPopulation.reduce((sum, candidate) => {
        return sum + candidate.fitness.score;
      }, 0) / evaluatedPopulation.length;

    if (
      !bestCandidateEver ||
      bestInGeneration.fitness.score > bestCandidateEver.fitness.score
    ) {
      bestCandidateEver = {
        generation,
        schedule: cloneSchedule(bestInGeneration.schedule),
        fitness: { ...bestInGeneration.fitness },
      };
    }

    generationStats.push({
      generation,
      bestScore: bestInGeneration.fitness.score,
      worstScore: worstInGeneration.fitness.score,
      averageScore: Number(averageScore.toFixed(2)),
      bestPenalty: bestInGeneration.fitness.totalPenalty,
      bestBonus: bestInGeneration.fitness.totalBonus,
    });

    const nextPopulation = [];

    const eliteCandidates = evaluatedPopulation
      .slice(0, Math.min(elitismCount, evaluatedPopulation.length))
      .map((candidate) => repairSchedule(cloneSchedule(candidate.schedule), planningData));

    nextPopulation.push(...eliteCandidates);

    while (nextPopulation.length < populationSize) {
      const [parent1, parent2] = selectParents(
        evaluatedPopulation,
        2,
        tournamentSize
      );

      let childA = cloneSchedule(parent1.schedule);
      let childB = cloneSchedule(parent2.schedule);

      if (Math.random() < crossoverRate) {
        const crossoverResult = singlePointCrossover(
          parent1.schedule,
          parent2.schedule,
          planningData
        );

        childA = crossoverResult.childA;
        childB = crossoverResult.childB;
      }

      const mutationA = mutateSchedule(childA, planningData, mutationRate);
      const mutationB = mutateSchedule(childB, planningData, mutationRate);

      const repairedA = repairSchedule(mutationA.mutatedSchedule, planningData);
      const repairedB = repairSchedule(mutationB.mutatedSchedule, planningData);

      nextPopulation.push(repairedA);

      if (nextPopulation.length < populationSize) {
        nextPopulation.push(repairedB);
      }
    }

    population = nextPopulation.slice(0, populationSize);
  }

  return {
    config: {
      populationSize,
      generations,
      mutationRate,
      crossoverRate,
      elitismCount,
      tournamentSize,
    },
    bestCandidate: bestCandidateEver,
    generationStats,
  };
}

module.exports = {
  runGeneticAlgorithm,
};