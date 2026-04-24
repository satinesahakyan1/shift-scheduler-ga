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

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function buildAvailabilityMap(availability) {
  const map = new Map();

  for (const item of availability) {
    const key = createKey(item.employee_id, item.day_of_week, item.shift_type_id);
    map.set(key, item.is_available === true);
  }

  return map;
}

function getDayOfWeekNumber(workDate) {
  const date = new Date(`${workDate}T00:00:00Z`);
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function getWeekBucket(workDate, periodStartDate) {
  const work = new Date(`${workDate}T00:00:00Z`);
  const start = new Date(`${periodStartDate}T00:00:00Z`);

  const diffDays = Math.floor((work - start) / (24 * 60 * 60 * 1000));
  return Math.floor(diffDays / 7) + 1;
}

function generateRandomSchedule(planningData) {
  const {
    planningPeriod,
    employees = [],
    availability = [],
    requirements = [],
  } = planningData;

  if (!planningPeriod) {
    throw new Error('Planning period is missing');
  }

  const availabilityMap = buildAvailabilityMap(availability);
  const employeeWeekShiftCount = new Map();
  const employeeDateAssignments = new Map();

  const sortedRequirements = [...requirements].sort((a, b) => {
    const dateA = normalizeDateKey(a.work_date);
    const dateB = normalizeDateKey(b.work_date);

    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    return a.shift_type_id - b.shift_type_id;
  });

  const schedule = [];

  for (const requirement of sortedRequirements) {
    const workDate = normalizeDateKey(requirement.work_date);
    const requiredCount = requirement.required_employees;
    const dayOfWeek = getDayOfWeekNumber(workDate);
    const weekBucket = getWeekBucket(workDate, planningPeriod.start_date);

    const candidates = employees.filter((employee) => {
      const availabilityKey = createKey(employee.id, dayOfWeek, requirement.shift_type_id);
      const isAvailable = availabilityMap.get(availabilityKey) === true;

      if (!isAvailable) {
        return false;
      }

      const weekKey = createKey(employee.id, weekBucket);
      const weeklyAssignedCount = employeeWeekShiftCount.get(weekKey) || 0;

      if (weeklyAssignedCount >= employee.max_shifts_per_week) {
        return false;
      }

      const sameDayKey = createKey(employee.id, workDate);
      const hasShiftSameDay = (employeeDateAssignments.get(sameDayKey) || 0) > 0;

      if (hasShiftSameDay) {
        return false;
      }

      return true;
    });

    const shuffledCandidates = shuffle(candidates);
    const selectedEmployees = shuffledCandidates
      .slice(0, requiredCount)
      .map((employee) => employee.id);

    for (const employeeId of selectedEmployees) {
      const weekKey = createKey(employeeId, weekBucket);
      employeeWeekShiftCount.set(
        weekKey,
        (employeeWeekShiftCount.get(weekKey) || 0) + 1
      );

      const sameDayKey = createKey(employeeId, workDate);
      employeeDateAssignments.set(
        sameDayKey,
        (employeeDateAssignments.get(sameDayKey) || 0) + 1
      );
    }

    schedule.push({
      work_date: workDate,
      shift_type_id: requirement.shift_type_id,
      employee_ids: selectedEmployees,
    });
  }

  return schedule;
}

function generateInitialPopulation(planningData, populationSize = 20) {
  if (!Number.isInteger(populationSize) || populationSize <= 0) {
    throw new Error('Population size must be a positive integer');
  }

  const population = [];

  for (let i = 0; i < populationSize; i += 1) {
    population.push(generateRandomSchedule(planningData));
  }

  return population;
}

module.exports = {
  generateRandomSchedule,
  generateInitialPopulation,
};