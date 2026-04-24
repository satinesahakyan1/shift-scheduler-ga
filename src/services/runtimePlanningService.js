const pool = require('../../config/db');

function normalizeDate(value) {
  return String(value).slice(0, 10);
}

function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function getWeekdayNumber(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

async function buildRuntimePlanningData(userId, startDate, endDate) {
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required');
  }

  const normalizedStartDate = normalizeDate(startDate);
  const normalizedEndDate = normalizeDate(endDate);

  if (normalizedStartDate > normalizedEndDate) {
    throw new Error('startDate cannot be greater than endDate');
  }

  const client = await pool.connect();

  try {
    const [
      shiftTypesResult,
      employeesResult,
      availabilityResult,
      preferencesResult,
      templateResult,
    ] = await Promise.all([
      client.query(
        `
        SELECT id, name, sort_order
        FROM shift_types
        WHERE user_id = $1
        ORDER BY sort_order ASC, id ASC
        `,
        [userId]
      ),

      client.query(
        `
        SELECT id, user_id, full_name, max_shifts_per_week
        FROM employees
        WHERE user_id = $1
        ORDER BY id
        `,
        [userId]
      ),

      client.query(
        `
        SELECT
          ea.employee_id,
          ea.day_of_week,
          ea.shift_type_id,
          ea.is_available
        FROM employee_availability ea
        INNER JOIN employees e ON e.id = ea.employee_id
        WHERE e.user_id = $1
        ORDER BY ea.employee_id, ea.day_of_week, ea.shift_type_id
        `,
        [userId]
      ),

      client.query(
        `
        SELECT
          ep.employee_id,
          ep.shift_type_id,
          ep.preference_level
        FROM employee_preferences ep
        INNER JOIN employees e ON e.id = ep.employee_id
        WHERE e.user_id = $1
        ORDER BY ep.employee_id, ep.shift_type_id
        `,
        [userId]
      ),

      client.query(
        `
        SELECT user_id, day_of_week, shift_type_id, required_employees
        FROM requirement_templates
        WHERE user_id = $1
        ORDER BY day_of_week, shift_type_id
        `,
        [userId]
      ),
    ]);

    if (shiftTypesResult.rows.length === 0) {
      throw new Error('Նախ պետք է սահմանեք կազմակերպության հերթափոխերը');
    }

    if (employeesResult.rows.length === 0) {
      throw new Error('Այս կազմակերպության համար աշխատակիցներ չեն գտնվել');
    }

    if (templateResult.rows.length === 0) {
      throw new Error('Այս կազմակերպության համար պահանջարկի ձևանմուշներ չեն գտնվել');
    }

    const dates = getDateRange(normalizedStartDate, normalizedEndDate);
    const requirements = [];

    for (const workDate of dates) {
      const dayOfWeek = getWeekdayNumber(workDate);

      const dayTemplates = templateResult.rows.filter(
        (item) => Number(item.day_of_week) === dayOfWeek
      );

      for (const item of dayTemplates) {
        requirements.push({
          planning_period_id: null,
          work_date: workDate,
          shift_type_id: Number(item.shift_type_id),
          required_employees: Number(item.required_employees),
        });
      }
    }

    return {
      planningPeriod: {
        id: null,
        name: `${normalizedStartDate}-ից ${normalizedEndDate}`,
        start_date: normalizedStartDate,
        end_date: normalizedEndDate,
      },
      shiftTypes: shiftTypesResult.rows,
      employees: employeesResult.rows,
      availability: availabilityResult.rows,
      preferences: preferencesResult.rows,
      requirements,
    };
  } finally {
    client.release();
  }
}

module.exports = {
  buildRuntimePlanningData,
};