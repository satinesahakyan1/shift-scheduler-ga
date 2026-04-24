const DEFAULT_PENALTIES = {
  uncoveredShiftUnit: 80,
  uncoveredShiftQuadraticUnit: 35,
  completelyUncoveredExtra: 450,
  overstaffedShift: 20,
  unavailableAssignment: 50,
  duplicateEmployeeInShift: 60,
  unknownEmployee: 70,
  multipleShiftsSameDay: 40,
  maxShiftExceeded: 35,
  unwantedShift: 15,
  fairnessUnit: 5,
  shortageImbalanceUnit: 12,
};

const DEFAULT_BONUSES = {
  preferredShift: 5,
};

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

function calculateStdDev(numbers) {
  if (!numbers.length) {
    return 0;
  }

  const average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const variance =
    numbers.reduce((sum, value) => sum + (value - average) ** 2, 0) / numbers.length;

  return Math.sqrt(variance);
}

function calculateFitness(schedule, planningData, options = {}) {
  if (!Array.isArray(schedule)) {
    throw new Error('Schedule must be an array');
  }

  if (!planningData || typeof planningData !== 'object') {
    throw new Error('Planning data is required');
  }

  const penalties = {
    ...DEFAULT_PENALTIES,
    ...(options.penalties || {}),
  };

  const bonuses = {
    ...DEFAULT_BONUSES,
    ...(options.bonuses || {}),
  };

  const {
    planningPeriod,
    employees = [],
    availability = [],
    preferences = [],
    requirements = [],
  } = planningData;

  if (!planningPeriod) {
    throw new Error('Planning period is missing');
  }

  const employeeMap = new Map();
  const availabilityMap = new Map();
  const preferenceMap = new Map();
  const scheduleMap = new Map();

  for (const employee of employees) {
    employeeMap.set(employee.id, employee);
  }

  for (const item of availability) {
    const key = createKey(item.employee_id, item.day_of_week, item.shift_type_id);
    availabilityMap.set(key, item.is_available);
  }

  for (const item of preferences) {
    const key = createKey(item.employee_id, item.shift_type_id);
    preferenceMap.set(key, item.preference_level);
  }

  for (const item of schedule) {
    const dateKey = normalizeDateKey(item.work_date);
    const key = createKey(dateKey, item.shift_type_id);

    scheduleMap.set(key, {
      work_date: dateKey,
      shift_type_id: item.shift_type_id,
      employee_ids: Array.isArray(item.employee_ids) ? item.employee_ids : [],
    });
  }

  const breakdown = {
    uncoveredShiftPenalty: 0,
    uncoveredShiftQuadraticPenalty: 0,
    completelyUncoveredPenalty: 0,
    shortageImbalancePenalty: 0,
    overstaffedShiftPenalty: 0,
    unavailableAssignmentPenalty: 0,
    duplicateEmployeePenalty: 0,
    unknownEmployeePenalty: 0,
    multipleShiftsSameDayPenalty: 0,
    maxShiftExceededPenalty: 0,
    unwantedShiftPenalty: 0,
    fairnessPenalty: 0,
    preferredShiftBonus: 0,
  };

  const violations = {
    uncoveredShifts: [],
    overstaffedShifts: [],
    unavailableAssignments: [],
    duplicateAssignments: [],
    unknownEmployees: [],
    multipleShiftsSameDay: [],
    maxShiftExceeded: [],
  };

  const employeeAssignmentCount = new Map();
  const employeeDateAssignmentCount = new Map();
  const employeeWeekAssignmentCount = new Map();

  for (const employee of employees) {
    employeeAssignmentCount.set(employee.id, 0);
  }

  let totalAssignedCount = 0;
  const shortageValues = [];

  for (const requirement of requirements) {
    const workDateKey = normalizeDateKey(requirement.work_date);
    const scheduleKey = createKey(workDateKey, requirement.shift_type_id);

    const scheduleEntry = scheduleMap.get(scheduleKey) || {
      work_date: workDateKey,
      shift_type_id: requirement.shift_type_id,
      employee_ids: [],
    };

    const rawEmployeeIds = scheduleEntry.employee_ids;
    const uniqueEmployeeIds = [...new Set(rawEmployeeIds)];

    if (uniqueEmployeeIds.length !== rawEmployeeIds.length) {
      const duplicateCount = rawEmployeeIds.length - uniqueEmployeeIds.length;
      const penalty = duplicateCount * penalties.duplicateEmployeeInShift;

      breakdown.duplicateEmployeePenalty += penalty;

      violations.duplicateAssignments.push({
        work_date: workDateKey,
        shift_type_id: requirement.shift_type_id,
        duplicateCount,
      });
    }

    const requiredCount = Number(requirement.required_employees);
    const assignedCount = uniqueEmployeeIds.length;

    if (assignedCount < requiredCount) {
      const missing = requiredCount - assignedCount;

      const basePenalty = missing * penalties.uncoveredShiftUnit;
      const quadraticPenalty = (missing ** 2) * penalties.uncoveredShiftQuadraticUnit;

      breakdown.uncoveredShiftPenalty += basePenalty;
      breakdown.uncoveredShiftQuadraticPenalty += quadraticPenalty;
      shortageValues.push(missing);

      if (assignedCount === 0) {
        breakdown.completelyUncoveredPenalty += penalties.completelyUncoveredExtra;
      }

      violations.uncoveredShifts.push({
        work_date: workDateKey,
        shift_type_id: requirement.shift_type_id,
        required: requiredCount,
        assigned: assignedCount,
        missing,
      });
    } else {
      shortageValues.push(0);
    }

    if (assignedCount > requiredCount) {
      const extra = assignedCount - requiredCount;
      const penalty = extra * penalties.overstaffedShift;

      breakdown.overstaffedShiftPenalty += penalty;

      violations.overstaffedShifts.push({
        work_date: workDateKey,
        shift_type_id: requirement.shift_type_id,
        required: requiredCount,
        assigned: assignedCount,
        extra,
      });
    }

    const dayOfWeek = getDayOfWeekNumber(workDateKey);
    const weekBucket = getWeekBucket(workDateKey, planningPeriod.start_date);

    for (const employeeId of uniqueEmployeeIds) {
      totalAssignedCount += 1;

      if (!employeeMap.has(employeeId)) {
        breakdown.unknownEmployeePenalty += penalties.unknownEmployee;

        violations.unknownEmployees.push({
          work_date: workDateKey,
          shift_type_id: requirement.shift_type_id,
          employee_id: employeeId,
        });

        continue;
      }

      employeeAssignmentCount.set(
        employeeId,
        (employeeAssignmentCount.get(employeeId) || 0) + 1
      );

      const dateKey = createKey(employeeId, workDateKey);
      employeeDateAssignmentCount.set(
        dateKey,
        (employeeDateAssignmentCount.get(dateKey) || 0) + 1
      );

      const weekKey = createKey(employeeId, weekBucket);
      employeeWeekAssignmentCount.set(
        weekKey,
        (employeeWeekAssignmentCount.get(weekKey) || 0) + 1
      );

      const availabilityKey = createKey(employeeId, dayOfWeek, requirement.shift_type_id);
      const isAvailable = availabilityMap.get(availabilityKey) === true;

      if (!isAvailable) {
        breakdown.unavailableAssignmentPenalty += penalties.unavailableAssignment;

        violations.unavailableAssignments.push({
          work_date: workDateKey,
          shift_type_id: requirement.shift_type_id,
          employee_id: employeeId,
        });
      }

      const preferenceKey = createKey(employeeId, requirement.shift_type_id);
      const preferenceLevel = preferenceMap.get(preferenceKey);

      if (preferenceLevel === -1) {
        breakdown.unwantedShiftPenalty += penalties.unwantedShift;
      }

      if (preferenceLevel === 1) {
        breakdown.preferredShiftBonus += bonuses.preferredShift;
      }
    }
  }

  const shortageStdDev = calculateStdDev(shortageValues);
  breakdown.shortageImbalancePenalty = Number(
    (shortageStdDev * penalties.shortageImbalanceUnit).toFixed(2)
  );

  for (const [key, count] of employeeDateAssignmentCount.entries()) {
    if (count > 1) {
      const extraAssignments = count - 1;
      const penalty = extraAssignments * penalties.multipleShiftsSameDay;
      const [employeeId, workDate] = key.split('|');

      breakdown.multipleShiftsSameDayPenalty += penalty;

      violations.multipleShiftsSameDay.push({
        employee_id: Number(employeeId),
        work_date: workDate,
        shiftsAssignedInSameDay: count,
      });
    }
  }

  for (const [key, assignedCount] of employeeWeekAssignmentCount.entries()) {
    const [employeeIdText, weekBucketText] = key.split('|');
    const employeeId = Number(employeeIdText);
    const weekBucket = Number(weekBucketText);
    const employee = employeeMap.get(employeeId);

    if (!employee) {
      continue;
    }

    if (assignedCount > employee.max_shifts_per_week) {
      const exceededBy = assignedCount - employee.max_shifts_per_week;
      const penalty = exceededBy * penalties.maxShiftExceeded;

      breakdown.maxShiftExceededPenalty += penalty;

      violations.maxShiftExceeded.push({
        employee_id: employeeId,
        full_name: employee.full_name,
        weekBucket,
        assigned: assignedCount,
        max_allowed: employee.max_shifts_per_week,
        exceededBy,
      });
    }
  }

  const employeeCount = employees.length || 1;
  const averageAssignments = totalAssignedCount / employeeCount;

  for (const employee of employees) {
    const assignedCount = employeeAssignmentCount.get(employee.id) || 0;
    const deviation = Math.abs(assignedCount - averageAssignments);
    breakdown.fairnessPenalty += deviation * penalties.fairnessUnit;
  }

  const totalPenalty =
    breakdown.uncoveredShiftPenalty +
    breakdown.uncoveredShiftQuadraticPenalty +
    breakdown.completelyUncoveredPenalty +
    breakdown.shortageImbalancePenalty +
    breakdown.overstaffedShiftPenalty +
    breakdown.unavailableAssignmentPenalty +
    breakdown.duplicateEmployeePenalty +
    breakdown.unknownEmployeePenalty +
    breakdown.multipleShiftsSameDayPenalty +
    breakdown.maxShiftExceededPenalty +
    breakdown.unwantedShiftPenalty +
    breakdown.fairnessPenalty;

  const totalBonus = breakdown.preferredShiftBonus;
  const baseScore = options.baseScore ?? 1000;
  const rawScore = baseScore - totalPenalty + totalBonus;
  const finalScore = Math.max(0, Number(rawScore.toFixed(2)));

  return {
    score: finalScore,
    baseScore,
    totalPenalty: Number(totalPenalty.toFixed(2)),
    totalBonus: Number(totalBonus.toFixed(2)),
    breakdown: {
      ...breakdown,
      fairnessPenalty: Number(breakdown.fairnessPenalty.toFixed(2)),
    },
    stats: {
      totalEmployees: employees.length,
      totalRequirements: requirements.length,
      totalAssignedCount,
      averageAssignments: Number(averageAssignments.toFixed(2)),
    },
    violations,
  };
}

module.exports = {
  calculateFitness,
};