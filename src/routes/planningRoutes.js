const express = require('express');
const router = express.Router();
const pool = require('../../config/db');

function getDatesBetween(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// JS getDay(): Sunday=0 ... Saturday=6
// Մենք դարձնում ենք Monday=1 ... Sunday=7
function getIsoDay(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Գեներացնել schedule
 * body:
 * {
 *   organizationId: 1,
 *   startDate: "2026-04-20",
 *   endDate: "2026-05-04"
 * }
 */
router.post('/generate', async (req, res) => {
  const client = await pool.connect();

  try {
    const { organizationId, startDate, endDate } = req.body;

    if (!organizationId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'organizationId, startDate, endDate դաշտերը պարտադիր են',
      });
    }

    await client.query('BEGIN');

    // Կազմակերպության հերթափոխերը
    const shiftsResult = await client.query(
      `
      SELECT id, name, required_employees_per_day
      FROM shift_types
      WHERE organization_id = $1
      ORDER BY id ASC
      `,
      [organizationId]
    );

    const shifts = shiftsResult.rows;

    if (shifts.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Տվյալ կազմակերպության համար հերթափոխեր չկան',
      });
    }

    // Կազմակերպության աշխատակիցները
    const employeesResult = await client.query(
      `
      SELECT id, full_name
      FROM employees
      WHERE organization_id = $1
      ORDER BY id ASC
      `,
      [organizationId]
    );

    const employees = employeesResult.rows;

    if (employees.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Տվյալ կազմակերպության համար աշխատակիցներ չկան',
      });
    }

    // Աշխատակիցների weekly availability / preferences
    const preferencesResult = await client.query(
      `
      SELECT employee_id, shift_type_id, day_of_week
      FROM employee_shift_preferences
      WHERE employee_id = ANY($1::int[])
      `,
      [employees.map((e) => e.id)]
    );

    const preferences = preferencesResult.rows;

    // Հին schedule-ը ջնջենք տվյալ միջակայքի համար
    await client.query(
      `
      DELETE FROM schedules
      WHERE organization_id = $1
        AND work_date BETWEEN $2 AND $3
      `,
      [organizationId, startDate, endDate]
    );

    const dates = getDatesBetween(startDate, endDate);

    const employeeLoad = new Map(); // employeeId -> total assigned count
    const assignedPerDate = new Map(); // date -> Set(employeeId)
    const inserts = [];
    const uncoveredShifts = [];

    for (const employee of employees) {
      employeeLoad.set(employee.id, 0);
    }

    for (const date of dates) {
      const workDate = formatDate(date);
      const dayOfWeek = getIsoDay(date);

      if (!assignedPerDate.has(workDate)) {
        assignedPerDate.set(workDate, new Set());
      }

      const assignedToday = assignedPerDate.get(workDate);

      for (const shift of shifts) {
        const required = Number(shift.required_employees_per_day) || 0;

        if (required === 0) {
          uncoveredShifts.push({
            work_date: workDate,
            shift_type_id: shift.id,
            shift_name: shift.name,
            required: 0,
            assigned: 0,
            missing: 0,
          });
          continue;
        }

        // Այդ օրը/այդ հերթափոխի համար թեկնածուներ
        const candidates = employees.filter((employee) => {
          const hasPreference = preferences.some(
            (pref) =>
              pref.employee_id === employee.id &&
              pref.shift_type_id === shift.id &&
              Number(pref.day_of_week) === dayOfWeek
          );

          const alreadyAssignedThisDay = assignedToday.has(employee.id);

          return hasPreference && !alreadyAssignedThisDay;
        });

        // Fair distribution: ով քիչ է նշանակվել՝ նա առաջինը
        candidates.sort((a, b) => {
          const loadA = employeeLoad.get(a.id) || 0;
          const loadB = employeeLoad.get(b.id) || 0;
          return loadA - loadB;
        });

        const selected = candidates.slice(0, required);

        for (const employee of selected) {
          inserts.push({
            organization_id: organizationId,
            employee_id: employee.id,
            shift_type_id: shift.id,
            work_date: workDate,
          });

          assignedToday.add(employee.id);
          employeeLoad.set(employee.id, (employeeLoad.get(employee.id) || 0) + 1);
        }

        if (selected.length < required) {
          uncoveredShifts.push({
            work_date: workDate,
            shift_type_id: shift.id,
            shift_name: shift.name,
            required,
            assigned: selected.length,
            missing: required - selected.length,
          });
        }
      }
    }

    for (const item of inserts) {
      await client.query(
        `
        INSERT INTO schedules (organization_id, employee_id, shift_type_id, work_date)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        `,
        [
          item.organization_id,
          item.employee_id,
          item.shift_type_id,
          item.work_date,
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Գրաֆիկը հաջողությամբ գեներացվեց',
      totalAssignments: inserts.length,
      uncoveredShifts,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Generate planning error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց գեներացնել գրաֆիկը',
      error: error.message,
    });
  } finally {
    client.release();
  }
});

/**
 * Ստանալ schedule table view
 */
router.get('/table', async (req, res) => {
  try {
    const { organizationId, startDate, endDate } = req.query;

    if (!organizationId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'organizationId, startDate, endDate պարտադիր են',
      });
    }

    const result = await pool.query(
      `
      WITH date_series AS (
        SELECT generate_series($1::date, $2::date, interval '1 day')::date AS work_date
      ),
      org_shifts AS (
        SELECT id AS shift_type_id, name AS shift_name, required_employees_per_day
        FROM shift_types
        WHERE organization_id = $3
      ),
      assignments AS (
        SELECT
          s.work_date,
          s.shift_type_id,
          STRING_AGG(e.full_name, ', ' ORDER BY e.full_name) AS assigned_employees,
          COUNT(s.employee_id) AS assigned_count
        FROM schedules s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.organization_id = $3
          AND s.work_date BETWEEN $1 AND $2
        GROUP BY s.work_date, s.shift_type_id
      )
      SELECT
        ds.work_date,
        os.shift_type_id,
        os.shift_name,
        os.required_employees_per_day AS required_count,
        COALESCE(a.assigned_count, 0) AS assigned_count,
        COALESCE(a.assigned_employees, '-') AS assigned_employees
      FROM date_series ds
      CROSS JOIN org_shifts os
      LEFT JOIN assignments a
        ON a.work_date = ds.work_date
       AND a.shift_type_id = os.shift_type_id
      ORDER BY ds.work_date ASC, os.shift_type_id ASC
      `,
      [startDate, endDate, organizationId]
    );

    res.json({
      success: true,
      schedule: result.rows,
    });
  } catch (error) {
    console.error('Get schedule table error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց ստանալ schedule table-ը',
    });
  }
});

module.exports = router;