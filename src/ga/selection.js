const { calculateFitness } = require('./fitness');

function evaluatePopulation(population, planningData, fitnessOptions = {}) {
  if (!Array.isArray(population)) {
    throw new Error('Population must be an array');
  }

  const evaluatedPopulation = population.map((schedule, index) => {
    const fitness = calculateFitness(schedule, planningData, fitnessOptions);

    return {
      id: index + 1,
      schedule,
      fitness,
    };
  });

  evaluatedPopulation.sort((a, b) => b.fitness.score - a.fitness.score);

  return evaluatedPopulation;
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function tournamentSelection(evaluatedPopulation, tournamentSize = 3) {
  if (!Array.isArray(evaluatedPopulation) || evaluatedPopulation.length === 0) {
    throw new Error('Evaluated population must be a non-empty array');
  }

  if (!Number.isInteger(tournamentSize) || tournamentSize <= 0) {
    throw new Error('Tournament size must be a positive integer');
  }

  const actualTournamentSize = Math.min(tournamentSize, evaluatedPopulation.length);
  const contenders = [];

  for (let i = 0; i < actualTournamentSize; i += 1) {
    const randomIndex = getRandomInt(evaluatedPopulation.length);
    contenders.push(evaluatedPopulation[randomIndex]);
  }

  contenders.sort((a, b) => b.fitness.score - a.fitness.score);

  return contenders[0];
}

function selectParents(evaluatedPopulation, parentCount = 2, tournamentSize = 3) {
  if (!Number.isInteger(parentCount) || parentCount <= 0) {
    throw new Error('Parent count must be a positive integer');
  }

  const parents = [];

  for (let i = 0; i < parentCount; i += 1) {
    const parent = tournamentSelection(evaluatedPopulation, tournamentSize);
    parents.push(parent);
  }

  return parents;
}

module.exports = {
  evaluatePopulation,
  tournamentSelection,
  selectParents,
};