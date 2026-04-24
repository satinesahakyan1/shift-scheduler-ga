const pool = require('../../config/db');

async function getPlanningData(periodId) {
  const client = await pool.connect();

  try {
    const periodQuery = `
      SELECT id, name, start_date, end_date
      FROM planning_periods
      WHERE id = $1
    `;

    const shiftTypesQuery = `
      SELECT id, name, start_time, end_time
      FROM shift_types
      ORDER BY id
    `;

    const employeesQuery = `
      SELECT id, full_name, max_shifts_per_week
      FROM employees
      ORDER BY id
    `;

    const availabilityQuery = `
      SELECT
        employee_id,
        day_of_week,
        shift_type_id,
        is_available
      FROM employee_availability
      ORDER BY employee_id, day_of_week, shift_type_id
    `;

    const preferencesQuery = `
      SELECT
        employee_id,
        shift_type_id,
        preference_level
      FROM employee_preferences
      ORDER BY employee_id, shift_type_id
    `;

    const requirementsQuery = `
      SELECT
        planning_period_id,
        work_date,
        shift_type_id,
        required_employees
      FROM shift_requirements
      WHERE planning_period_id = $1
      ORDER BY work_date, shift_type_id
    `;

    const [
      periodResult,
      shiftTypesResult,
      employeesResult,
      availabilityResult,
      preferencesResult,
      requirementsResult,
    ] = await Promise.all([
      client.query(periodQuery, [periodId]),
      client.query(shiftTypesQuery),
      client.query(employeesQuery),
      client.query(availabilityQuery),
      client.query(preferencesQuery),
      client.query(requirementsQuery, [periodId]),
    ]);

    if (periodResult.rows.length === 0) {
      return null;
    }

    const planningPeriod = periodResult.rows[0];
    const shiftTypes = shiftTypesResult.rows;
    const employees = employeesResult.rows;
    const availability = availabilityResult.rows;
    const preferences = preferencesResult.rows;
    const requirements = requirementsResult.rows;

    return {
      planningPeriod,
      shiftTypes,
      employees,
      availability,
      preferences,
      requirements,
    };
  } finally {
    client.release();
  }
}

module.exports = {
  getPlanningData,
};