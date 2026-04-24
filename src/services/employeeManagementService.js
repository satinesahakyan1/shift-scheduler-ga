const pool = require('../../config/db');

async function validateEmployeeOwner(client, userId, employeeId) {
  const result = await client.query(
    `
    SELECT id, user_id, full_name, max_shifts_per_week, created_at
    FROM employees
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [employeeId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Աշխատակիցը չի գտնվել կամ չի պատկանում այս օգտատիրոջը');
  }

  return result.rows[0];
}

async function getAllowedShiftIds(client, userId) {
  const result = await client.query(
    `
    SELECT id
    FROM shift_types
    WHERE user_id = $1
    `,
    [userId]
  );

  return new Set(result.rows.map((row) => Number(row.id)));
}

function validateEmployeePayload(payload) {
  const fullName = String(payload.full_name || '').trim();
  const maxShiftsPerWeek = Number(payload.max_shifts_per_week);

  if (!fullName) {
    throw new Error('Աշխատակցի անուն ազգանունը պարտադիր է');
  }

  if (!Number.isInteger(maxShiftsPerWeek) || maxShiftsPerWeek < 0) {
    throw new Error('Շաբաթական առավելագույն հերթափոխերի քանակը պետք է լինի 0 կամ դրական ամբողջ թիվ');
  }

  return {
    fullName,
    maxShiftsPerWeek,
    availability: Array.isArray(payload.availability) ? payload.availability : [],
    preferences: Array.isArray(payload.preferences) ? payload.preferences : [],
  };
}

function validateAvailabilityItem(item, allowedShiftIds) {
  const dayOfWeek = Number(item.day_of_week);
  const shiftTypeId = Number(item.shift_type_id);

  if (dayOfWeek < 1 || dayOfWeek > 7) {
    throw new Error('Հասանելիության օրը պետք է լինի 1-ից 7 միջակայքում');
  }

  if (!allowedShiftIds.has(shiftTypeId)) {
    throw new Error('Գտնվեց այս կազմակերպությանը չպատկանող հերթափոխ');
  }

  return {
    dayOfWeek,
    shiftTypeId,
    isAvailable: Boolean(item.is_available),
  };
}

function validatePreferenceItem(item, allowedShiftIds) {
  const shiftTypeId = Number(item.shift_type_id);
  const preferenceLevel = Number(item.preference_level);

  if (!allowedShiftIds.has(shiftTypeId)) {
    throw new Error('Գտնվեց այս կազմակերպությանը չպատկանող հերթափոխ');
  }

  if (![-1, 0, 1].includes(preferenceLevel)) {
    throw new Error('Նախասիրության արժեքը պետք է լինի -1, 0 կամ 1');
  }

  return {
    shiftTypeId,
    preferenceLevel,
  };
}

async function saveEmployeeAvailabilityAndPreferences(client, userId, employeeId, availability, preferences) {
  const allowedShiftIds = await getAllowedShiftIds(client, userId);

  const availabilityInsertQuery = `
    INSERT INTO employee_availability (
      employee_id,
      day_of_week,
      shift_type_id,
      is_available
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (employee_id, day_of_week, shift_type_id)
    DO UPDATE SET is_available = EXCLUDED.is_available
  `;

  for (const item of availability) {
    const cleaned = validateAvailabilityItem(item, allowedShiftIds);

    await client.query(availabilityInsertQuery, [
      employeeId,
      cleaned.dayOfWeek,
      cleaned.shiftTypeId,
      cleaned.isAvailable,
    ]);
  }

  const preferenceInsertQuery = `
    INSERT INTO employee_preferences (
      employee_id,
      shift_type_id,
      preference_level
    )
    VALUES ($1, $2, $3)
    ON CONFLICT (employee_id, shift_type_id)
    DO UPDATE SET preference_level = EXCLUDED.preference_level
  `;

  for (const item of preferences) {
    const cleaned = validatePreferenceItem(item, allowedShiftIds);

    await client.query(preferenceInsertQuery, [
      employeeId,
      cleaned.shiftTypeId,
      cleaned.preferenceLevel,
    ]);
  }
}

async function createEmployeeProfile(userId, payload) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (!userId) {
      throw new Error('userId is required');
    }

    const cleanedPayload = validateEmployeePayload(payload);

    const employeeInsertQuery = `
      INSERT INTO employees (user_id, full_name, max_shifts_per_week)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, full_name, max_shifts_per_week
    `;

    const employeeResult = await client.query(employeeInsertQuery, [
      userId,
      cleanedPayload.fullName,
      cleanedPayload.maxShiftsPerWeek,
    ]);

    const employee = employeeResult.rows[0];

    await saveEmployeeAvailabilityAndPreferences(
      client,
      userId,
      employee.id,
      cleanedPayload.availability,
      cleanedPayload.preferences
    );

    await client.query('COMMIT');

    return {
      employee,
      insertedAvailabilityCount: cleanedPayload.availability.length,
      insertedPreferencesCount: cleanedPayload.preferences.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getEmployeesByUser(userId) {
  const result = await pool.query(
    `
    SELECT id, user_id, full_name, max_shifts_per_week, created_at
    FROM employees
    WHERE user_id = $1
    ORDER BY id DESC
    `,
    [userId]
  );

  return result.rows;
}

async function getEmployeeProfile(userId, employeeId) {
  const client = await pool.connect();

  try {
    const employee = await validateEmployeeOwner(client, userId, employeeId);

    const availabilityResult = await client.query(
      `
      SELECT employee_id, day_of_week, shift_type_id, is_available
      FROM employee_availability
      WHERE employee_id = $1
      ORDER BY day_of_week, shift_type_id
      `,
      [employeeId]
    );

    const preferencesResult = await client.query(
      `
      SELECT employee_id, shift_type_id, preference_level
      FROM employee_preferences
      WHERE employee_id = $1
      ORDER BY shift_type_id
      `,
      [employeeId]
    );

    return {
      employee,
      availability: availabilityResult.rows,
      preferences: preferencesResult.rows,
    };
  } finally {
    client.release();
  }
}

async function updateEmployeeProfile(userId, employeeId, payload) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await validateEmployeeOwner(client, userId, employeeId);
    const cleanedPayload = validateEmployeePayload(payload);

    const employeeResult = await client.query(
      `
      UPDATE employees
      SET full_name = $1,
          max_shifts_per_week = $2
      WHERE id = $3 AND user_id = $4
      RETURNING id, user_id, full_name, max_shifts_per_week
      `,
      [cleanedPayload.fullName, cleanedPayload.maxShiftsPerWeek, employeeId, userId]
    );

    await client.query('DELETE FROM employee_availability WHERE employee_id = $1', [employeeId]);
    await client.query('DELETE FROM employee_preferences WHERE employee_id = $1', [employeeId]);

    await saveEmployeeAvailabilityAndPreferences(
      client,
      userId,
      employeeId,
      cleanedPayload.availability,
      cleanedPayload.preferences
    );

    await client.query('COMMIT');

    return {
      employee: employeeResult.rows[0],
      updatedAvailabilityCount: cleanedPayload.availability.length,
      updatedPreferencesCount: cleanedPayload.preferences.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteEmployeeProfile(userId, employeeId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await validateEmployeeOwner(client, userId, employeeId);

    await client.query('DELETE FROM schedule_assignments WHERE employee_id = $1', [employeeId]);
    await client.query('DELETE FROM employee_availability WHERE employee_id = $1', [employeeId]);
    await client.query('DELETE FROM employee_preferences WHERE employee_id = $1', [employeeId]);
    await client.query('DELETE FROM employees WHERE id = $1 AND user_id = $2', [employeeId, userId]);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createEmployeeProfile,
  getEmployeesByUser,
  getEmployeeProfile,
  updateEmployeeProfile,
  deleteEmployeeProfile,
};