/**
 * Managinga Space - Smart Activity Manager
 * Main application entry point
 */

require('dotenv').config();

// Run database setup on startup
const { setupDatabase, runMigrations } = require('./utils/dbSetup');

const express = require('express');
const session = require('express-session');
const MySQLStore = require('connect-mysql')(session);
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cron = require('node-cron');

// Import database configuration
const db = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const activityRoutes = require('./routes/activities');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const apiRoutes = require('./routes/api');
const oauthRoutes = require('./routes/oauth');
const collaborationRoutes = require('./routes/collaboration');
const notificationRoutes = require('./routes/notifications');
const testNotificationRoutes = require('./routes/test-notifications');
const dailyNotificationRoutes = require('./routes/daily-notifications');

// Import utilities
const reminderService = require('./utils/reminderService');
const DailyNotificationService = require('./utils/dailyNotificationService');
const { checkTrialExpiry } = require('./utils/planManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://checkout.flutterwave.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.flutterwave.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      frameSrc: ["'self'", "https://checkout.flutterwave.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"]
    }
  }
}));

app.use(cors());

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Method override middleware for PUT/DELETE in forms
const methodOverride = require('method-override');
app.use(methodOverride('_method'));

// Session configuration
app.use(session({
  key: 'managinga_session',
  secret: process.env.SESSION_SECRET,
  store: new MySQLStore({
    config: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    },
    table: 'sessions'
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Global middleware to pass user data to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.userPlan = null; // Default to null, will be set by auth middleware if needed
  res.locals.appName = process.env.APP_NAME || 'Managinga Space';
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/oauth', oauthRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/activities', activityRoutes);
app.use('/collaboration', collaborationRoutes);
app.use('/notifications', notificationRoutes);
app.use('/test', testNotificationRoutes);
app.use('/daily-notifications', dailyNotificationRoutes);
app.use('/admin', adminRoutes);
app.use('/payments', paymentRoutes);
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('index', { 
    title: 'Welcome to Managinga Space',
    description: 'Smart Activity Manager with Advanced Features'
  });
});

// PWA routes
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'Managinga Space',
    short_name: 'Managinga',
    description: 'Smart Activity Manager with Advanced Features',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#007bff',
    icons: [
      {
        src: '/images/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/images/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  });
});

app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/js/sw.js'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {},
    user: req.user || null,
    userPlan: req.user?.plan || null,
    appName: 'Managinga Space'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    error: {},
    user: req.user || null,
    userPlan: req.user?.plan || null,
    appName: 'Managinga Space'
  });
});

// Schedule reminder checks every hour
cron.schedule('0 * * * *', () => {
  console.log('Checking for reminders...');
  reminderService.checkAndSendReminders();
});

// Send daily notification summary at 8 PM (20:00)
cron.schedule('0 20 * * *', () => {
  console.log('🌅 Sending daily notifications at 8 PM...');
  DailyNotificationService.sendDailyNotifications();
});

// Check trial expiry daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('Checking trial expiry...');
  checkTrialExpiry();
});

// Start server with database setup
async function startServer() {
  try {
    console.log('🔧 Setting up database...');
    await setupDatabase();
    console.log('✅ Database setup completed');
    
    console.log('🔄 Running database migrations...');
    await runMigrations();
    console.log('✅ Database migrations completed');
    
    app.listen(PORT, () => {
      console.log(`🚀 Managinga Space server running on port ${PORT}`);
      console.log(`📱 Access the app at: http://localhost:${PORT}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
