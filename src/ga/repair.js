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

function cloneSchedule(schedule = []) {
  return schedule.map((entry) => ({
    work_date: normalizeDateKey(entry.work_date),
    shift_type_id: Number(entry.shift_type_id),
    employee_ids: Array.isArray(entry.employee_ids) ? [...new Set(entry.employee_ids.map(Number))] : [],
  }));
}

function buildRequirementMap(requirements = []) {
  const map = new Map();

  for (const item of requirements) {
    const key = createKey(normalizeDateKey(item.work_date), Number(item.shift_type_id));
    map.set(key, Number(item.required_employees));
  }

  return map;
}

function buildAvailabilityMap(availability = []) {
  const map = new Map();

  for (const item of availability) {
    const key = createKey(
      Number(item.employee_id),
      Number(item.day_of_week),
      Number(item.shift_type_id)
    );
    map.set(key, item.is_available === true);
  }

  return map;
}

function buildEmployeeMap(employees = []) {
  const map = new Map();

  for (const employee of employees) {
    map.set(Number(employee.id), {
      ...employee,
      id: Number(employee.id),
      max_shifts_per_week: Number(employee.max_shifts_per_week),
    });
  }

  return map;
}

function buildScheduleMap(schedule = [], requirements = []) {
  const map = new Map();

  for (const req of requirements) {
    const workDate = normalizeDateKey(req.work_date);
    const shiftTypeId = Number(req.shift_type_id);
    const key = createKey(workDate, shiftTypeId);

    map.set(key, {
      work_date: workDate,
      shift_type_id: shiftTypeId,
      employee_ids: [],
    });
  }

  for (const entry of schedule) {
    const workDate = normalizeDateKey(entry.work_date);
    const shiftTypeId = Number(entry.shift_type_id);
    const key = createKey(workDate, shiftTypeId);

    map.set(key, {
      work_date: workDate,
      shift_type_id: shiftTypeId,
      employee_ids: Array.isArray(entry.employee_ids)
        ? [...new Set(entry.employee_ids.map(Number))]
        : [],
    });
  }

  return map;
}

function buildStats(scheduleMap, planningPeriodStartDate) {
  const employeeWeekAssignmentCount = new Map();
  const employeeDateAssignmentCount = new Map();

  for (const entry of scheduleMap.values()) {
    const workDate = normalizeDateKey(entry.work_date);
    const weekBucket = getWeekBucket(workDate, planningPeriodStartDate);

    for (const employeeId of entry.employee_ids) {
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

function canAssignEmployeeToTarget({
  employeeId,
  targetEntry,
  sourceEntry = null,
  availabilityMap,
  employeeMap,
  employeeWeekAssignmentCount,
  employeeDateAssignmentCount,
  planningPeriodStartDate,
}) {
  const employee = employeeMap.get(Number(employeeId));

  if (!employee) {
    return false;
  }

  if (targetEntry.employee_ids.includes(Number(employeeId))) {
    return false;
  }

  const targetDate = normalizeDateKey(targetEntry.work_date);
  const targetDayOfWeek = getDayOfWeekNumber(targetDate);
  const targetWeekBucket = getWeekBucket(targetDate, planningPeriodStartDate);

  const availabilityKey = createKey(employee.id, targetDayOfWeek, targetEntry.shift_type_id);
  const isAvailable = availabilityMap.get(availabilityKey) === true;

  if (!isAvailable) {
    return false;
  }

  const sourceDate = sourceEntry ? normalizeDateKey(sourceEntry.work_date) : null;
  const sourceWeekBucket = sourceEntry
    ? getWeekBucket(sourceDate, planningPeriodStartDate)
    : null;

  const sameDayKey = createKey(employee.id, targetDate);
  const currentDayAssignments = employeeDateAssignmentCount.get(sameDayKey) || 0;

  if (currentDayAssignments > 0 && sourceDate !== targetDate) {
    return false;
  }

  const targetWeekKey = createKey(employee.id, targetWeekBucket);
  const currentWeekAssignments = employeeWeekAssignmentCount.get(targetWeekKey) || 0;

  if (sourceWeekBucket !== targetWeekBucket && currentWeekAssignments >= employee.max_shifts_per_week) {
    return false;
  }

  return true;
}

function getEntryAssignedCount(entry) {
  return Array.isArray(entry.employee_ids) ? entry.employee_ids.length : 0;
}

function removeEmployeeFromEntry({
  employeeId,
  entry,
  employeeWeekAssignmentCount,
  employeeDateAssignmentCount,
  planningPeriodStartDate,
}) {
  entry.employee_ids = entry.employee_ids.filter((id) => Number(id) !== Number(employeeId));

  const workDate = normalizeDateKey(entry.work_date);
  const weekBucket = getWeekBucket(workDate, planningPeriodStartDate);

  const weekKey = createKey(employeeId, weekBucket);
  employeeWeekAssignmentCount.set(
    weekKey,
    Math.max(0, (employeeWeekAssignmentCount.get(weekKey) || 0) - 1)
  );

  const dayKey = createKey(employeeId, workDate);
  employeeDateAssignmentCount.set(
    dayKey,
    Math.max(0, (employeeDateAssignmentCount.get(dayKey) || 0) - 1)
  );
}

function addEmployeeToEntry({
  employeeId,
  entry,
  employeeWeekAssignmentCount,
  employeeDateAssignmentCount,
  planningPeriodStartDate,
}) {
  entry.employee_ids.push(Number(employeeId));

  const workDate = normalizeDateKey(entry.work_date);
  const weekBucket = getWeekBucket(workDate, planningPeriodStartDate);

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

function getFreeCandidates({
  employees,
  targetEntry,
  availabilityMap,
  employeeMap,
  employeeWeekAssignmentCount,
  employeeDateAssignmentCount,
  planningPeriodStartDate,
}) {
  return employees
    .filter((employee) =>
      canAssignEmployeeToTarget({
        employeeId: employee.id,
        targetEntry,
        sourceEntry: null,
        availabilityMap,
        employeeMap,
        employeeWeekAssignmentCount,
        employeeDateAssignmentCount,
        planningPeriodStartDate,
      })
    )
    .sort((a, b) => {
      const targetWeekBucket = getWeekBucket(targetEntry.work_date, planningPeriodStartDate);

      const weekKeyA = createKey(a.id, targetWeekBucket);
      const weekKeyB = createKey(b.id, targetWeekBucket);

      const weekLoadA = employeeWeekAssignmentCount.get(weekKeyA) || 0;
      const weekLoadB = employeeWeekAssignmentCount.get(weekKeyB) || 0;

      if (weekLoadA !== weekLoadB) {
        return weekLoadA - weekLoadB;
      }

      return a.id - b.id;
    });
}

function repairSchedule(schedule, planningData) {
  const { planningPeriod, employees = [], availability = [], requirements = [] } = planningData;

  if (!planningPeriod) {
    throw new Error('Planning period is missing');
  }

  const repairedSchedule = cloneSchedule(schedule);
  const employeeMap = buildEmployeeMap(employees);
  const availabilityMap = buildAvailabilityMap(availability);
  const requirementMap = buildRequirementMap(requirements);
  const scheduleMap = buildScheduleMap(repairedSchedule, requirements);

  const { employeeWeekAssignmentCount, employeeDateAssignmentCount } = buildStats(
    scheduleMap,
    planningPeriod.start_date
  );

  const orderedKeys = requirements
    .map((req) => createKey(normalizeDateKey(req.work_date), Number(req.shift_type_id)))
    .filter((key, index, array) => array.indexOf(key) === index);

  let changed = true;
  let iteration = 0;

  while (changed && iteration < 4) {
    changed = false;
    iteration += 1;

    const targets = orderedKeys
      .map((key) => {
        const entry = scheduleMap.get(key);
        const required = requirementMap.get(key) || 0;
        const assigned = getEntryAssignedCount(entry);
        const missing = Math.max(0, required - assigned);

        return {
          key,
          entry,
          required,
          assigned,
          missing,
        };
      })
      .filter((item) => item.missing > 0)
      .sort((a, b) => {
        if (a.assigned !== b.assigned) {
          return a.assigned - b.assigned;
        }

        return b.missing - a.missing;
      });

    for (const target of targets) {
      while (getEntryAssignedCount(target.entry) < target.required) {
        const freeCandidates = getFreeCandidates({
          employees,
          targetEntry: target.entry,
          availabilityMap,
          employeeMap,
          employeeWeekAssignmentCount,
          employeeDateAssignmentCount,
          planningPeriodStartDate: planningPeriod.start_date,
        });

        if (freeCandidates.length > 0) {
          const chosen = freeCandidates[0];

          addEmployeeToEntry({
            employeeId: chosen.id,
            entry: target.entry,
            employeeWeekAssignmentCount,
            employeeDateAssignmentCount,
            planningPeriodStartDate: planningPeriod.start_date,
          });

          changed = true;
          continue;
        }

        const sources = orderedKeys
          .map((key) => {
            const entry = scheduleMap.get(key);
            const required = requirementMap.get(key) || 0;
            const assigned = getEntryAssignedCount(entry);

            return {
              key,
              entry,
              required,
              assigned,
            };
          })
          .filter(
            (source) =>
              source.key !== target.key &&
              source.assigned > 1
          )
          .sort((a, b) => b.assigned - a.assigned);

        let moved = false;

        for (const source of sources) {
          const sourceShortageAfterMove = Math.max(
            0,
            source.required - (source.assigned - 1)
          );
          const targetCurrentShortage = Math.max(
            0,
            target.required - getEntryAssignedCount(target.entry)
          );

          if (
            getEntryAssignedCount(target.entry) > 0 &&
            sourceShortageAfterMove > targetCurrentShortage - 1
          ) {
            continue;
          }

          const candidateIds = [...source.entry.employee_ids];

          for (const employeeId of candidateIds) {
            const canMove = canAssignEmployeeToTarget({
              employeeId,
              targetEntry: target.entry,
              sourceEntry: source.entry,
              availabilityMap,
              employeeMap,
              employeeWeekAssignmentCount,
              employeeDateAssignmentCount,
              planningPeriodStartDate: planningPeriod.start_date,
            });

            if (!canMove) {
              continue;
            }

            removeEmployeeFromEntry({
              employeeId,
              entry: source.entry,
              employeeWeekAssignmentCount,
              employeeDateAssignmentCount,
              planningPeriodStartDate: planningPeriod.start_date,
            });

            addEmployeeToEntry({
              employeeId,
              entry: target.entry,
              employeeWeekAssignmentCount,
              employeeDateAssignmentCount,
              planningPeriodStartDate: planningPeriod.start_date,
            });

            changed = true;
            moved = true;
            break;
          }

          if (moved) {
            break;
          }
        }

        if (!moved) {
          break;
        }
      }
    }
  }

  return orderedKeys.map((key) => {
    const entry = scheduleMap.get(key);

    return {
      work_date: entry.work_date,
      shift_type_id: entry.shift_type_id,
      employee_ids: [...entry.employee_ids],
    };
  });
}

module.exports = {
  repairSchedule,
};