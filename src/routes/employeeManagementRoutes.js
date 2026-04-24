const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  createEmployeeProfile,
  getEmployeesByUser,
  getEmployeeProfile,
  updateEmployeeProfile,
  deleteEmployeeProfile,
} = require('../services/employeeManagementService');

router.get('/meta', requireAuth, async (req, res) => {
  try {
    const shiftTypesResult = await pool.query(
      `
      SELECT id, name, sort_order
      FROM shift_types
      WHERE user_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      shiftTypes: shiftTypesResult.rows,
      days: [
        { id: 1, name: 'Երկուշաբթի' },
        { id: 2, name: 'Երեքշաբթի' },
        { id: 3, name: 'Չորեքշաբթի' },
        { id: 4, name: 'Հինգշաբթի' },
        { id: 5, name: 'Ուրբաթ' },
        { id: 6, name: 'Շաբաթ' },
        { id: 7, name: 'Կիրակի' },
      ],
    });
  } catch (error) {
    console.error('Employee meta error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց բեռնել ձևի տվյալները',
    });
  }
});

router.get('/my-employees', requireAuth, async (req, res) => {
  try {
    const employees = await getEmployeesByUser(req.user.id);

    res.json({
      success: true,
      data: employees,
    });
  } catch (error) {
    console.error('Get my employees error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Չհաջողվեց բեռնել ձեր աշխատակիցների ցանկը',
    });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const result = await createEmployeeProfile(req.user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Աշխատակիցը հաջողությամբ ավելացվեց',
      data: result,
    });
  } catch (error) {
    console.error('Create employee profile error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Չհաջողվեց ստեղծել աշխատակցի պրոֆիլը',
    });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await getEmployeeProfile(req.user.id, Number(req.params.id));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get employee profile error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Չհաջողվեց բեռնել աշխատակցի տվյալները',
    });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const result = await updateEmployeeProfile(req.user.id, Number(req.params.id), req.body);

    res.json({
      success: true,
      message: 'Աշխատակցի տվյալները հաջողությամբ թարմացվեցին',
      data: result,
    });
  } catch (error) {
    console.error('Update employee profile error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Չհաջողվեց թարմացնել աշխատակցի տվյալները',
    });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await deleteEmployeeProfile(req.user.id, Number(req.params.id));

    res.json({
      success: true,
      message: 'Աշխատակիցը հաջողությամբ ջնջվեց',
    });
  } catch (error) {
    console.error('Delete employee profile error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Չհաջողվեց ջնջել աշխատակցին',
    });
  }
});

module.exports = router;