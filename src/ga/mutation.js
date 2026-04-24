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

function deepCloneSchedule(schedule) {
  return schedule.map((entry) => ({
    work_date: normalizeDateKey(entry.work_date),
    shift_type_id: entry.shift_type_id,
    employee_ids: Array.isArray(entry.employee_ids) ? [...entry.employee_ids] : [],
  }));
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

function buildAvailabilityMap(availability = []) {
  const map = new Map();

  for (const item of availability) {
    const key = createKey(item.employee_id, item.day_of_week, item.shift_type_id);
    map.set(key, item.is_available === true);
  }

  return map;
}

function buildEmployeeMap(employees = []) {
  const map = new Map();

  for (const employee of employees) {
    map.set(employee.id, employee);
  }

  return map;
}

function buildAssignmentStats(schedule, planningPeriodStartDate) {
  const employeeWeekAssignmentCount = new Map();
  const employeeDateAssignmentCount = new Map();

  for (const entry of schedule) {
    const workDate = normalizeDateKey(entry.work_date);
    const weekBucket = getWeekBucket(workDate, planningPeriodStartDate);
    const uniqueEmployeeIds = [...new Set(entry.employee_ids || [])];

    for (const employeeId of uniqueEmployeeIds) {
      const weekKey = createKey(employeeId, weekBucket);
      employeeWeekAssignmentCount.set(
        weekKey,
        (employeeWeekAssignmentCount.get(weekKey) || 0) + 1
      );

      const dayKey = createKey(employeeId, workDate);
      employeeDateAssignmentCount.set(
        dayKey,
        (employeeDateAssignmentCount.get(dayKey) || 0) + 1
      );
    }
  }

  return {
    employeeWeekAssignmentCount,
    employeeDateAssignmentCount,
  };
}

function getValidCandidates({
  employees,
  availabilityMap,
  employeeMap,
  employeeWeekAssignmentCount,
  employeeDateAssignmentCount,
  workDate,
  shiftTypeId,
  planningPeriodStartDate,
  excludeEmployeeIds = [],
}) {
  const dayOfWeek = getDayOfWeekNumber(workDate);
  const weekBucket = getWeekBucket(workDate, planningPeriodStartDate);
  const excludeSet = new Set(excludeEmployeeIds);

  return employees.filter((employee) => {
    if (excludeSet.has(employee.id)) {
      return false;
    }

    const availabilityKey = createKey(employee.id, dayOfWeek, shiftTypeId);
    const isAvailable = availabilityMap.get(availabilityKey) === true;

    if (!isAvailable) {
      return false;
    }

    const weekKey = createKey(employee.id, weekBucket);
    const currentWeekShiftCount = employeeWeekAssignmentCount.get(weekKey) || 0;

    if (currentWeekShiftCount >= employee.max_shifts_per_week) {
      return false;
    }

    const sameDayKey = createKey(employee.id, workDate);
    const sameDayAssignments = employeeDateAssignmentCount.get(sameDayKey) || 0;

    if (sameDayAssignments > 0) {
      return false;
    }

    return employeeMap.has(employee.id);
  });
}

function mutateSchedule(schedule, planningData, mutationRate = 0.1) {
  if (!Array.isArray(schedule)) {
    throw new Error('Schedule must be an array');
  }

  if (!planningData || typeof planningData !== 'object') {
    throw new Error('Planning data is required');
  }

  if (typeof mutationRate !== 'number' || mutationRate < 0 || mutationRate > 1) {
    throw new Error('Mutation rate must be between 0 and 1');
  }

  const { employees = [], availability = [], planningPeriod } = planningData;

  if (!planningPeriod) {
    throw new Error('Planning period is missing');
  }

  const mutatedSchedule = deepCloneSchedule(schedule);
  const availabilityMap = buildAvailabilityMap(availability);
  const employeeMap = buildEmployeeMap(employees);
  const { employeeWeekAssignmentCount, employeeDateAssignmentCount } =
    buildAssignmentStats(mutatedSchedule, planningPeriod.start_date);

  const mutationLog = [];

  for (const entry of mutatedSchedule) {
    if (Math.random() > mutationRate) {
      continue;
    }

    const workDate = normalizeDateKey(entry.work_date);
    const weekBucket = getWeekBucket(workDate, planningPeriod.start_date);
    const currentEmployeeIds = [...new Set(entry.employee_ids || [])];

    const candidates = getValidCandidates({
      employees,
      availabilityMap,
      employeeMap,
      employeeWeekAssignmentCount,
      employeeDateAssignmentCount,
      workDate,
      shiftTypeId: entry.shift_type_id,
      planningPeriodStartDate: planningPeriod.start_date,
      excludeEmployeeIds: currentEmployeeIds,
    });

    if (candidates.length === 0) {
      continue;
    }

    const shuffledCandidates = shuffle(candidates);
    const chosenCandidate = shuffledCandidates[0];

    let replacedEmployeeId = null;

    if (currentEmployeeIds.length === 0) {
      currentEmployeeIds.push(chosenCandidate.id);
    } else {
      const replaceIndex = Math.floor(Math.random() * currentEmployeeIds.length);
      replacedEmployeeId = currentEmployeeIds[replaceIndex];
      currentEmployeeIds[replaceIndex] = chosenCandidate.id;
    }

    if (replacedEmployeeId !== null) {
      const oldWeekKey = createKey(replacedEmployeeId, weekBucket);
      employeeWeekAssignmentCount.set(
        oldWeekKey,
        Math.max(0, (employeeWeekAssignmentCount.get(oldWeekKey) || 0) - 1)
      );

      const oldDayKey = createKey(replacedEmployeeId, workDate);
      employeeDateAssignmentCount.set(
        oldDayKey,
        Math.max(0, (employeeDateAssignmentCount.get(oldDayKey) || 0) - 1)
      );
    }

    const newWeekKey = createKey(chosenCandidate.id, weekBucket);
    employeeWeekAssignmentCount.set(
      newWeekKey,
      (employeeWeekAssignmentCount.get(newWeekKey) || 0) + 1
    );

    const newDayKey = createKey(chosenCandidate.id, workDate);
    employeeDateAssignmentCount.set(
      newDayKey,
      (employeeDateAssignmentCount.get(newDayKey) || 0) + 1
    );

    entry.employee_ids = currentEmployeeIds;

    mutationLog.push({
      work_date: workDate,
      shift_type_id: entry.shift_type_id,
      replacedEmployeeId,
      addedEmployeeId: chosenCandidate.id,
    });
  }

  return {
    mutatedSchedule,
    mutationCount: mutationLog.length,
    mutationLog,
  };
}

module.exports = {
  mutateSchedule,
};