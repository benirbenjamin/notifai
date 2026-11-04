const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { query } = require('./database/db');
const { setupNeonDatabase, seedInitialData } = require('./database/setupNeon');
const { startReminderScheduler } = require('./services/reminderWorker');

const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const syncRoutes = require('./routes/syncRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for Web frontend & Mobile client
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'verif-hash']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health & System status check
app.get('/health', async (req, res) => {
  try {
    const dbTest = await query('SELECT NOW() as now, current_database() as db');
    res.json({
      status: 'healthy',
      app: 'Notifai space',
      version: '2.0.0',
      database: 'Neon DB (PostgreSQL)',
      connectedDatabase: dbTest.rows[0].db,
      dbTimestamp: dbTest.rows[0].now,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred'
  });
});

// Bootstrapping
async function startServer() {
  try {
    console.log('🚀 Starting Notifai space Backend...');

    // Auto-initialize Neon DB PostgreSQL tables if needed
    try {
      await setupNeonDatabase();
      await seedInitialData();
    } catch (dbErr) {
      console.warn('⚠️ DB Schema auto-setup warning (tables may already exist or Neon credentials need configuring):', dbErr.message);
    }

    // Start Deadline & Reminder scheduler
    startReminderScheduler();

    app.listen(PORT, () => {
      console.log(`✅ Notifai space Backend running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
