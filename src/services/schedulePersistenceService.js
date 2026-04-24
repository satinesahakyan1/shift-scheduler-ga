const pool = require('../../config/db');

function getViolationCount(bestCandidate = {}) {
  return Object.values(bestCandidate.fitness?.violations || {}).reduce((sum, value) => {
    return sum + (Array.isArray(value) ? value.length : 0);
  }, 0);
}

async function resolveOrCreatePlanningPeriod(client, startDate, endDate) {
  const normalizedStartDate = startDate ? String(startDate).slice(0, 10) : null;
  const normalizedEndDate = endDate ? String(endDate).slice(0, 10) : null;

  if (!normalizedStartDate || !normalizedEndDate) {
    return null;
  }

  const existingResult = await client.query(
    `
    SELECT id
    FROM planning_periods
    WHERE start_date = $1 AND end_date = $2
    LIMIT 1
    `,
    [normalizedStartDate, normalizedEndDate]
  );

  if (existingResult.rows.length > 0) {
    return existingResult.rows[0].id;
  }

  const insertResult = await client.query(
    `
    INSERT INTO planning_periods (name, start_date, end_date)
    VALUES ($1, $2, $3)
    RETURNING id
    `,
    [`${normalizedStartDate}-ից ${normalizedEndDate}`, normalizedStartDate, normalizedEndDate]
  );

  return insertResult.rows[0].id;
}

async function saveGeneratedSchedule({
  planningPeriodId = null,
  startDate = null,
  endDate = null,
  bestCandidate,
  scheduleName = 'GA Generated Schedule',
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const effectivePlanningPeriodId =
      planningPeriodId || (await resolveOrCreatePlanningPeriod(client, startDate, endDate));

    const insertScheduleQuery = `
      INSERT INTO generated_schedules (
        planning_period_id,
        schedule_name,
        fitness_score,
        violation_count
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, planning_period_id, schedule_name, fitness_score, violation_count
    `;

    const violationCount = getViolationCount(bestCandidate);

    const scheduleResult = await client.query(insertScheduleQuery, [
      effectivePlanningPeriodId,
      String(scheduleName || 'GA Generated Schedule').trim(),
      Number(bestCandidate?.fitness?.score || 0),
      violationCount,
    ]);

    const savedSchedule = scheduleResult.rows[0];
    const generatedScheduleId = savedSchedule.id;

    const insertAssignmentQuery = `
      INSERT INTO schedule_assignments (
        schedule_id,
        employee_id,
        work_date,
        shift_type_id
      )
      VALUES ($1, $2, $3, $4)
    `;

    for (const entry of bestCandidate?.schedule || []) {
      const workDate =
        typeof entry.work_date === 'string'
          ? entry.work_date.slice(0, 10)
          : entry.work_date;

      const employeeIds = Array.isArray(entry.employee_ids) ? entry.employee_ids : [];

      for (const employeeId of employeeIds) {
        await client.query(insertAssignmentQuery, [
          generatedScheduleId,
          Number(employeeId),
          workDate,
          Number(entry.shift_type_id),
        ]);
      }
    }

    await client.query('COMMIT');

    return {
      generatedScheduleId,
      planningPeriodId: savedSchedule.planning_period_id,
      scheduleName: savedSchedule.schedule_name,
      fitnessScore: savedSchedule.fitness_score,
      violationCount: savedSchedule.violation_count,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listUserSchedules(userId) {
  const result = await pool.query(
    `
    SELECT
      gs.id,
      gs.schedule_name,
      gs.fitness_score,
      gs.violation_count,
      MIN(sa.work_date) AS start_date,
      MAX(sa.work_date) AS end_date,
      COUNT(sa.id) AS assignment_count
    FROM generated_schedules gs
    INNER JOIN schedule_assignments sa ON sa.schedule_id = gs.id
    INNER JOIN employees e ON e.id = sa.employee_id
    WHERE e.user_id = $1
    GROUP BY gs.id, gs.schedule_name, gs.fitness_score, gs.violation_count
    ORDER BY gs.id DESC
    `,
    [userId]
  );

  return result.rows;
}

async function getUserScheduleDetails(userId, scheduleId) {
  const metaResult = await pool.query(
    `
    SELECT
      gs.id,
      gs.schedule_name,
      gs.fitness_score,
      gs.violation_count,
      MIN(sa.work_date) AS start_date,
      MAX(sa.work_date) AS end_date,
      COUNT(sa.id) AS assignment_count
    FROM generated_schedules gs
    INNER JOIN schedule_assignments sa ON sa.schedule_id = gs.id
    INNER JOIN employees e ON e.id = sa.employee_id
    WHERE gs.id = $1 AND e.user_id = $2
    GROUP BY gs.id, gs.schedule_name, gs.fitness_score, gs.violation_count
    LIMIT 1
    `,
    [scheduleId, userId]
  );

  if (metaResult.rows.length === 0) {
    return null;
  }

  const assignmentsResult = await pool.query(
    `
    SELECT
      sa.work_date,
      sa.shift_type_id,
      st.name AS shift_name,
      e.id AS employee_id,
      e.full_name AS employee_name
    FROM schedule_assignments sa
    INNER JOIN employees e ON e.id = sa.employee_id
    INNER JOIN shift_types st ON st.id = sa.shift_type_id
    WHERE sa.schedule_id = $1 AND e.user_id = $2
    ORDER BY sa.work_date ASC, st.sort_order ASC NULLS LAST, st.id ASC, e.full_name ASC
    `,
    [scheduleId, userId]
  );

  const groupedMap = new Map();

  for (const row of assignmentsResult.rows) {
    const key = `${row.work_date}|${row.shift_type_id}`;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        work_date: String(row.work_date).slice(0, 10),
        shift_type_id: Number(row.shift_type_id),
        shift_name: row.shift_name,
        employee_ids: [],
        employee_names: [],
      });
    }

    const current = groupedMap.get(key);
    current.employee_ids.push(Number(row.employee_id));
    current.employee_names.push(row.employee_name);
  }

  return {
    meta: metaResult.rows[0],
    schedule: [...groupedMap.values()],
  };
}

async function deleteUserSchedule(userId, scheduleId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const ownershipCheck = await client.query(
      `
      SELECT gs.id
      FROM generated_schedules gs
      INNER JOIN schedule_assignments sa ON sa.schedule_id = gs.id
      INNER JOIN employees e ON e.id = sa.employee_id
      WHERE gs.id = $1 AND e.user_id = $2
      GROUP BY gs.id
      LIMIT 1
      `,
      [scheduleId, userId]
    );

    if (ownershipCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `
      DELETE FROM schedule_assignments
      WHERE schedule_id = $1
      `,
      [scheduleId]
    );

    await client.query(
      `
      DELETE FROM generated_schedules
      WHERE id = $1
      `,
      [scheduleId]
    );

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function buildScheduleCsv(scheduleDetails) {
  const rows = [
    ['Անվանում', scheduleDetails.meta.schedule_name],
    ['Սկսելու ամսաթիվ', String(scheduleDetails.meta.start_date).slice(0, 10)],
    ['Ավարտի ամսաթիվ', String(scheduleDetails.meta.end_date).slice(0, 10)],
    ['Fitness score', scheduleDetails.meta.fitness_score],
    ['Violation count', scheduleDetails.meta.violation_count],
    [],
    ['Ամսաթիվ', 'Հերթափոխ', 'Աշխատակիցներ'],
  ];

  for (const item of scheduleDetails.schedule || []) {
    rows.push([
      item.work_date,
      item.shift_name || item.shift_type_id,
      (item.employee_names || []).join(', '),
    ]);
  }

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');
}

module.exports = {
  saveGeneratedSchedule,
  listUserSchedules,
  getUserScheduleDetails,
  deleteUserSchedule,
  buildScheduleCsv,
};