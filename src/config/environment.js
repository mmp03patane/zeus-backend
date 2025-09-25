const isProduction = process.env.NODE_ENV === 'production';

const config = {
  // Xero
  xeroRedirectUri: isProduction 
    ? process.env.XERO_REDIRECT_URI_PROD 
    : process.env.XERO_REDIRECT_URI,
  
  // Google
  googleRedirectUri: isProduction 
    ? process.env.GOOGLE_REDIRECT_URI_PROD 
    : process.env.GOOGLE_REDIRECT_URI,
  
  // Frontend
  frontendUrl: isProduction 
    ? process.env.FRONTEND_URL_PROD 
    : process.env.FRONTEND_URL,
  
  // Webhook
  webhookUrl: isProduction 
    ? process.env.WEBHOOK_URL_PROD 
    : process.env.WEBHOOK_URL,
    
  // CORS origins
  corsOrigins: isProduction 
    ? ['https://zeusapp.co', 'https://www.zeusapp.co']
    : ['http://localhost:5173', 'http://localhost:3000'],
    
  isProduction
};

module.exports = config;