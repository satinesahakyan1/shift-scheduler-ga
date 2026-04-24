const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

async function createDefaultRowsForShift(client, userId, shiftId) {
  for (let day = 1; day <= 7; day += 1) {
    await client.query(
      `
      INSERT INTO requirement_templates (
        user_id,
        day_of_week,
        shift_type_id,
        required_employees
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, day_of_week, shift_type_id)
      DO NOTHING
      `,
      [userId, day, shiftId, 1]
    );
  }

  await client.query(
    `
    INSERT INTO employee_preferences (
      employee_id,
      shift_type_id,
      preference_level
    )
    SELECT e.id, $2, 0
    FROM employees e
    WHERE e.user_id = $1
    ON CONFLICT (employee_id, shift_type_id)
    DO NOTHING
    `,
    [userId, shiftId]
  );

  for (let day = 1; day <= 7; day += 1) {
    await client.query(
      `
      INSERT INTO employee_availability (
        employee_id,
        day_of_week,
        shift_type_id,
        is_available
      )
      SELECT e.id, $2, $3, true
      FROM employees e
      WHERE e.user_id = $1
      ON CONFLICT (employee_id, day_of_week, shift_type_id)
      DO NOTHING
      `,
      [userId, day, shiftId]
    );
  }
}

router.get('/my-shifts', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, user_id, name, sort_order
      FROM shift_types
      WHERE user_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get my shifts error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց բեռնել կազմակերպության հերթափոխերը',
    });
  }
});

router.post('/setup', requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { shifts } = req.body;

    if (!Array.isArray(shifts) || shifts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Նշեք առնվազն մեկ հերթափոխ',
      });
    }

    const cleanedShifts = shifts
      .map((shift, index) => ({
        id: shift.id ? Number(shift.id) : null,
        name: String(shift.name || '').trim(),
        sort_order: Number(shift.sort_order || index + 1),
      }))
      .filter((shift) => shift.name);

    if (cleanedShifts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Հերթափոխերի անունները պարտադիր են',
      });
    }

    const lowerNames = cleanedShifts.map((shift) => shift.name.toLowerCase());

    if (lowerNames.length !== new Set(lowerNames).size) {
      return res.status(400).json({
        success: false,
        message: 'Նույն անունով հերթափոխ մի գրեք երկու անգամ',
      });
    }

    await client.query('BEGIN');

    const existingResult = await client.query(
      `
      SELECT id, user_id, name, sort_order
      FROM shift_types
      WHERE user_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [req.user.id]
    );

    const existingShifts = existingResult.rows;
    const existingIds = new Set(existingShifts.map((shift) => Number(shift.id)));
    const savedShifts = [];

    for (const shift of cleanedShifts) {
      if (shift.id && existingIds.has(shift.id)) {
        const duplicateName = await client.query(
          `
          SELECT id
          FROM shift_types
          WHERE user_id = $1
            AND LOWER(name) = LOWER($2)
            AND id <> $3
          LIMIT 1
          `,
          [req.user.id, shift.name, shift.id]
        );

        if (duplicateName.rows.length > 0) {
          throw new Error(`"${shift.name}" անունով հերթափոխ արդեն կա`);
        }

        const updateResult = await client.query(
          `
          UPDATE shift_types
          SET name = $1,
              sort_order = $2
          WHERE id = $3 AND user_id = $4
          RETURNING id, user_id, name, sort_order
          `,
          [shift.name, shift.sort_order, shift.id, req.user.id]
        );

        const updatedShift = updateResult.rows[0];
        savedShifts.push(updatedShift);

        await createDefaultRowsForShift(client, req.user.id, updatedShift.id);
      } else {
        const insertResult = await client.query(
          `
          INSERT INTO shift_types (user_id, name, sort_order)
          VALUES ($1, $2, $3)
          RETURNING id, user_id, name, sort_order
          `,
          [req.user.id, shift.name, shift.sort_order]
        );

        const createdShift = insertResult.rows[0];
        savedShifts.push(createdShift);

        await createDefaultRowsForShift(client, req.user.id, createdShift.id);
      }
    }

    const savedIds = new Set(savedShifts.map((shift) => Number(shift.id)));

    const shiftsToRemove = existingShifts.filter(
      (shift) => !savedIds.has(Number(shift.id))
    );

    for (const shift of shiftsToRemove) {
      await client.query('DELETE FROM schedule_assignments WHERE shift_type_id = $1', [shift.id]);
      await client.query('DELETE FROM employee_availability WHERE shift_type_id = $1', [shift.id]);
      await client.query('DELETE FROM employee_preferences WHERE shift_type_id = $1', [shift.id]);
      await client.query(
        'DELETE FROM requirement_templates WHERE user_id = $1 AND shift_type_id = $2',
        [req.user.id, shift.id]
      );
      await client.query(
        'DELETE FROM shift_types WHERE user_id = $1 AND id = $2',
        [req.user.id, shift.id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Կազմակերպության հերթափոխերը հաջողությամբ պահպանվեցին',
      data: savedShifts,
      note: 'Նոր հերթափոխերի համար հին աշխատակիցները ավտոմատ նշվեցին որպես հասանելի։',
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Setup shifts error:', error.message);

    res.status(500).json({
      success: false,
      message: error.message || 'Չհաջողվեց պահպանել հերթափոխերը',
    });
  } finally {
    client.release();
  }
});

module.exports = router;