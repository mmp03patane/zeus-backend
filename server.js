// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('./src/config/passport');

const { connectDatabase } = require('./src/config/db');
const logger = require('./src/utils/logger');

// Import routes
const authRoutes = require('./src/routes/auth');
const xeroRoutes = require('./src/routes/xero');
const webhookRoutes = require('./src/routes/webhook');
const googlePlacesRoutes = require('./src/routes/googlePlaces');
const reviewRequestRoutes = require('./src/routes/reviewRequests');
const smsRoutes = require('./src/routes/sms');
const stripeRoutes = require('./src/routes/stripe');

// Import Stripe webhook handler
const { handleStripeWebhook } = require('./src/controllers/webhookController');

// Import token services
const googleTokenService = require('./src/services/googleTokenService');
const User = require('./src/models/User');
const XeroConnection = require('./src/models/XeroConnection');
const { refreshXeroToken } = require('./src/services/xeroTokenService');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://zeusapp.co', 'https://www.zeusapp.co']
    : ['http://localhost:5173'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// CRITICAL: Raw body middleware for webhooks MUST come BEFORE json() middleware

// Raw body capture for Xero webhooks
app.use('/api/webhook/xero', (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => data += chunk);
  req.on('end', () => {
    req.rawBody = data;
    try {
      req.body = JSON.parse(data);
    } catch (e) {
      req.body = {};
    }
    next();
  });
});

// Raw body capture for Stripe webhooks - FIXED: Uncommented and properly configured
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Body parser middleware (this comes AFTER the raw body handlers)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Connect to database
connectDatabase();

// Routes - check each one individually
if (authRoutes) {
  app.use('/api/auth', authRoutes);
} else {
  console.error('authRoutes is undefined');
}

if (xeroRoutes) {
  app.use('/api/xero', xeroRoutes);
} else {
  console.error('xeroRoutes is undefined');
}

if (webhookRoutes) {
  app.use('/api/webhook', webhookRoutes);
} else {
  console.error('webhookRoutes is undefined');
}

if (googlePlacesRoutes) {
  app.use('/api/google-places', googlePlacesRoutes);
} else {
  console.error('googlePlacesRoutes is undefined');
}

if (reviewRequestRoutes) {
  app.use('/api/review-requests', reviewRequestRoutes);
} else {
  console.error('reviewRequestRoutes is undefined');
}

if (smsRoutes) {
  app.use('/api/sms', smsRoutes);
} else {
  console.error('smsRoutes is undefined');
}

if (stripeRoutes) {
  app.use('/api/stripe', stripeRoutes);
} else {
  console.error('stripeRoutes is undefined');
}

// Health check routes
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'zeus-backend'
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Zeus Backend API',
    status: 'running'
  });
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

const initializeAllTokens = async () => {
  try {
    console.log('🚀 Initializing token refresh on startup...');
    
    const allGoogleUsers = await User.find({
      googleRefreshToken: { $exists: true, $ne: null }
    });
    
    console.log(`📋 Found ${allGoogleUsers.length} users with Google tokens to check`);
    
    let googleInitSuccess = 0;
    let googleInitFailed = 0;
    
    for (const user of allGoogleUsers) {
      try {
        if (!user.googleTokenExpiry || user.googleTokenExpiry <= new Date(Date.now() + 10 * 60 * 1000)) {
          console.log(`🔄 Refreshing expired Google token for user: ${user.email}`);
          const result = await googleTokenService.getValidAccessToken(user);
          if (result.success) {
            console.log(`✅ Successfully initialized Google token for user: ${user.email}`);
            googleInitSuccess++;
          } else {
            console.error(`❌ Failed to initialize Google token for user: ${user.email}`);
            googleInitFailed++;
          }
        } else {
          console.log(`✅ Google token still valid for user: ${user.email}`);
          googleInitSuccess++;
        }
      } catch (error) {
        console.error(`❌ Error checking Google token for user ${user.email}:`, error.message);
        googleInitFailed++;
      }
    }
    
    const allXeroConnections = await XeroConnection.find({
      isActive: true,
      refreshToken: { $exists: true, $ne: null }
    });
    
    console.log(`📋 Found ${allXeroConnections.length} Xero connections to check`);
    
    let xeroInitSuccess = 0;
    let xeroInitFailed = 0;
    
    for (const connection of allXeroConnections) {
      try {
        if (!connection.tokenExpiresAt || connection.tokenExpiresAt <= new Date(Date.now() + 15 * 60 * 1000)) {
          console.log(`🔄 Refreshing expired Xero token for: ${connection.tenantName}`);
          await refreshXeroToken(connection);
          console.log(`✅ Successfully initialized Xero token for: ${connection.tenantName}`);
          xeroInitSuccess++;
        } else {
          console.log(`✅ Xero token still valid for: ${connection.tenantName}`);
          xeroInitSuccess++;
        }
      } catch (error) {
        console.error(`❌ Error checking Xero token for ${connection.tenantName}:`, error.message);
        xeroInitFailed++;
      }
    }
    
    console.log('🎯 Token initialization completed:');
    console.log(`   Google: ${googleInitSuccess} successful, ${googleInitFailed} failed`);
    console.log(`   Xero: ${xeroInitSuccess} successful, ${xeroInitFailed} failed`);
    
  } catch (error) {
    console.error('❌ Token initialization failed:', error);
  }
};

const startUnifiedTokenRefresh = () => {
  console.log('🚀 Starting unified Google & Xero token refresh scheduler (every 5 minutes)');

  setInterval(async () => {
    try {
      console.log('🔄 Starting background token refresh job...');
      
      const usersNeedingGoogleRefresh = await User.find({
        googleRefreshToken: { $exists: true, $ne: null },
        googleTokenExpiry: { $lte: new Date(Date.now() + 10 * 60 * 1000) }
      });
      
      console.log(`📋 Found ${usersNeedingGoogleRefresh.length} users needing Google token refresh`);
      
      let googleSuccessCount = 0;
      let googleFailCount = 0;
      
      for (const user of usersNeedingGoogleRefresh) {
        try {
          console.log(`🔄 Refreshing Google tokens for user: ${user.email}`);
          const result = await googleTokenService.getValidAccessToken(user);
          if (result.success) {
            console.log(`✅ Successfully refreshed tokens for user: ${user.email}`);
            console.log(`🕐 New token expires at: ${user.googleTokenExpiry}`);
            googleSuccessCount++;
          } else {
            console.error(`❌ Failed to refresh tokens for user: ${user.email}`);
            googleFailCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to refresh Google token for user ${user._id}:`, error.message);
          googleFailCount++;
        }
      }

      const xeroConnectionsNeedingRefresh = await XeroConnection.find({
        isActive: true,
        refreshToken: { $exists: true, $ne: null },
        tokenExpiresAt: { $lte: new Date(Date.now() + 15 * 60 * 1000) }
      });
      
      console.log(`📋 Found ${xeroConnectionsNeedingRefresh.length} Xero connections needing token refresh`);
      
      let xeroSuccessCount = 0;
      let xeroFailCount = 0;
      
      for (const connection of xeroConnectionsNeedingRefresh) {
        try {
          console.log(`🔄 Refreshing Xero token for: ${connection.tenantName}`);
          await refreshXeroToken(connection);
          console.log(`✅ Xero token refreshed successfully`);
          console.log(`Refreshed Xero token for user ${connection.userId} (${connection.tenantName})`);
          xeroSuccessCount++;
        } catch (error) {
          console.error(`❌ Failed to refresh Xero token for user ${connection.userId}:`, error.message);
          xeroFailCount++;
        }
      }
      
      console.log(`✅ Background token refresh completed: ${googleSuccessCount + xeroSuccessCount} successful, ${googleFailCount + xeroFailCount} failed`);
      
    } catch (error) {
      console.error('❌ Background token refresh job failed:', error);
    }
  }, 5 * 60 * 1000);
};

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await initializeAllTokens();
  
  startUnifiedTokenRefresh();
  
  console.log('🎯 Token management system fully initialized!');
});

module.exports = app;