function normalizeDateKey(value) {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  throw new Error(`Invalid date value: ${value}`);
}

function createKey(...parts) {
  return parts.join('|');
}

function deepCloneEntry(entry) {
  return {
    work_date: normalizeDateKey(entry.work_date),
    shift_type_id: entry.shift_type_id,
    employee_ids: Array.isArray(entry.employee_ids) ? [...entry.employee_ids] : [],
  };
}

function buildScheduleMap(schedule) {
  const map = new Map();

  for (const entry of schedule) {
    const key = createKey(normalizeDateKey(entry.work_date), entry.shift_type_id);
    map.set(key, deepCloneEntry(entry));
  }

  return map;
}

function getOrderedDatesFromRequirements(requirements = []) {
  const uniqueDates = new Set();

  for (const item of requirements) {
    uniqueDates.add(normalizeDateKey(item.work_date));
  }

  return [...uniqueDates].sort((a, b) => a.localeCompare(b));
}

function getRandomCrossoverIndex(totalDates) {
  if (totalDates <= 1) {
    return 0;
  }

  return Math.floor(Math.random() * (totalDates - 1)) + 1;
}

function singlePointCrossover(parentA, parentB, planningData) {
  if (!Array.isArray(parentA) || !Array.isArray(parentB)) {
    throw new Error('Both parents must be arrays');
  }

  if (!planningData || !Array.isArray(planningData.requirements)) {
    throw new Error('Planning data with requirements is required');
  }

  const orderedDates = getOrderedDatesFromRequirements(planningData.requirements);

  if (orderedDates.length === 0) {
    throw new Error('Requirements are empty');
  }

  const crossoverIndex = getRandomCrossoverIndex(orderedDates.length);
  const leftDates = new Set(orderedDates.slice(0, crossoverIndex));
  const parentAMap = buildScheduleMap(parentA);
  const parentBMap = buildScheduleMap(parentB);

  const childA = [];
  const childB = [];

  for (const requirement of planningData.requirements) {
    const workDate = normalizeDateKey(requirement.work_date);
    const key = createKey(workDate, requirement.shift_type_id);

    const fromA = parentAMap.get(key) || {
      work_date: workDate,
      shift_type_id: requirement.shift_type_id,
      employee_ids: [],
    };

    const fromB = parentBMap.get(key) || {
      work_date: workDate,
      shift_type_id: requirement.shift_type_id,
      employee_ids: [],
    };

    if (leftDates.has(workDate)) {
      childA.push(deepCloneEntry(fromA));
      childB.push(deepCloneEntry(fromB));
    } else {
      childA.push(deepCloneEntry(fromB));
      childB.push(deepCloneEntry(fromA));
    }
  }

  return {
    crossoverIndex,
    crossoverDate:
      crossoverIndex > 0 ? orderedDates[crossoverIndex - 1] : orderedDates[0],
    childA,
    childB,
  };
}

module.exports = {
  singlePointCrossover,
};