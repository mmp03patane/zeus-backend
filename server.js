// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('./src/config/passport'); // Now passport can access env vars

const { connectDatabase } = require('./src/config/db');
const logger = require('./src/utils/logger');

// Import routes
const authRoutes = require('./src/routes/auth');
const xeroRoutes = require('./src/routes/xero');
const webhookRoutes = require('./src/routes/webhook');
const googlePlacesRoutes = require('./src/routes/googlePlaces');
const reviewRequestRoutes = require('./src/routes/reviewRequests');
const smsRoutes = require('./src/routes/sms');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://dashboard.zeusapp.co', 'https://zeusapp.co']
    : ['http://localhost:5173'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Raw body capture for Xero webhooks (must be BEFORE express.json())
app.use('/api/webhook/xero', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body.toString('utf8');
  req.body = JSON.parse(req.rawBody);
  next();
});

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration (required for Passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Connect to database
connectDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/xero', xeroRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/google-places', googlePlacesRoutes);
app.use('/api/review-requests', reviewRequestRoutes);
app.use('/api/sms', smsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = app;