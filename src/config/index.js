require('dotenv').config();

const config = {
  // Server Configuration
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database Configuration
  MONGODB_URI: process.env.MONGODB_URI,
  
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // Xero Configuration
XERO: {
  CLIENT_ID: process.env.XERO_CLIENT_ID,
  CLIENT_SECRET: process.env.XERO_CLIENT_SECRET,
  WEBHOOK_KEY: process.env.XERO_WEBHOOK_KEY,
  REDIRECT_URI: process.env.NODE_ENV === 'production' 
    ? 'https://api.zeusapp.co/api/xero/callback'
    : 'http://localhost:5000/api/xero/callback',
  // FIXED: Added required OpenID scopes  
  SCOPES: 'openid profile email accounting.transactions accounting.contacts offline_access'
},
  
  // Google Configuration
  GOOGLE: {
    API_KEY: process.env.GOOGLE_API_KEY,
    PLACES_API_URL: 'https://maps.googleapis.com/maps/api/place'
  },
  
  // Twilio Configuration
  TWILIO: {
    ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
    MESSAGING_SERVICE_SID: process.env.MESSAGING_SERVICE_SID
  },
  
  // SendGrid Configuration
  SENDGRID: {
    API_KEY: process.env.SENDGRID_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL_ADDRESS || 'noreply@zeusapp.co'
  },
  
  // Firebase Configuration
  FIREBASE: {
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    PRIVATE_KEY_ID: process.env.FIREBASE_PRIVATE_KEY_ID,
    PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    CLIENT_ID: process.env.FIREBASE_CLIENT_ID
  },
  
  // CORS Configuration
  CORS: {
    ORIGIN: process.env.NODE_ENV === 'production' 
      ? ['https://dashboard.zeusapp.co', 'https://zeusapp.co']
      : ['http://localhost:5173', 'http://localhost:3000'],
    CREDENTIALS: true
  },
  
  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: process.env.NODE_ENV === 'production' ? 100 : 1000
  },
  
  // Security
  SECURITY: {
    BCRYPT_ROUNDS: 12,
    SESSION_SECRET: process.env.SESSION_SECRET || 'zeus-session-secret',
    COOKIE_MAX_AGE: 24 * 60 * 60 * 1000 // 24 hours
  },
  
  // Logging
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    FILE_MAX_SIZE: '20m',
    FILE_MAX_FILES: '14d'
  },
  
  // Application URLs
  URLS: {
    FRONTEND: process.env.NODE_ENV === 'production' 
      ? 'https://dashboard.zeusapp.co'
      : 'http://localhost:5173',
    BACKEND: process.env.NODE_ENV === 'production' 
      ? 'https://api.zeusapp.co'
      : 'http://localhost:5000'
  },
  
  // Webhook Configuration
  WEBHOOKS: {
    XERO_ENDPOINT: '/api/webhook/xero',
    TIMEOUT: 30000 // 30 seconds
  },
  
  // Review Settings
  REVIEWS: {
    DEFAULT_DELAY_HOURS: 2,
    MAX_RETRIES: 3,
    RETRY_INTERVAL_HOURS: 24
  }
};

// Validation
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'XERO_CLIENT_ID',
  'XERO_CLIENT_SECRET',
  'GOOGLE_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'SENDGRID_API_KEY'
];

const validateConfig = () => {
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Only validate in production
if (process.env.NODE_ENV === 'production') {
  validateConfig();
}

module.exports = config;