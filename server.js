const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');
require('dotenv').config();

const employeeRoutes = require('./src/routes/employeeRoutes');
const planningRoutes = require('./src/routes/planningRoutes');
const fitnessRoutes = require('./src/routes/fitnessRoutes');
const populationRoutes = require('./src/routes/populationRoutes');
const selectionRoutes = require('./src/routes/selectionRoutes');
const crossoverRoutes = require('./src/routes/crossoverRoutes');
const mutationRoutes = require('./src/routes/mutationRoutes');
const schedulerRoutes = require('./src/routes/schedulerRoutes');
const saveScheduleRoutes = require('./src/routes/saveScheduleRoutes');
const runtimeSchedulerRoutes = require('./src/routes/runtimeSchedulerRoutes');
const planningPeriodRoutes = require('./src/routes/planningPeriodRoutes');
const employeeManagementRoutes = require('./src/routes/employeeManagementRoutes');
const authRoutes = require('./src/routes/authRoutes');
const shiftTypeManagementRoutes = require('./src/routes/shiftTypeManagementRoutes');
const shiftRoutes = require('./src/routes/shiftRoutes');
const requirementTemplateRoutes = require('./src/routes/requirementTemplateRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');

    res.json({
      success: true,
      message: 'Server and database are working',
      dbTime: result.rows[0].current_time,
    });
  } catch (error) {
    console.error('Health check error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/fitness', fitnessRoutes);
app.use('/api/population', populationRoutes);
app.use('/api/selection', selectionRoutes);
app.use('/api/crossover', crossoverRoutes);
app.use('/api/mutation', mutationRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/schedules', saveScheduleRoutes);
app.use('/api/runtime-scheduler', runtimeSchedulerRoutes);
app.use('/api/planning-periods', planningPeriodRoutes);
app.use('/api/employee-management', employeeManagementRoutes);
app.use('/api/shift-types', shiftTypeManagementRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/requirements', requirementTemplateRoutes);


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});