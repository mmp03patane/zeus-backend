const User = require('../models/User');
const XeroConnection = require('../models/XeroConnection');
const googleTokenService = require('../services/googleTokenService');
const { getValidXeroConnection } = require('../services/xeroTokenService');

const ensureValidTokens = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return next(); // Skip if no user
    }

    // Get fresh user data to check token status
    const user = await User.findById(req.user._id);
    if (!user) {
      return next();
    }

    // GOOGLE TOKEN REFRESH - only refresh if needed
    if (user.googleAccessToken && user.needsGoogleTokenRefresh()) {
      console.log('🔄 Middleware: Refreshing Google token for user:', user.email);
      
      const result = await googleTokenService.getValidAccessToken(user);
      if (!result.success) {
        console.log('❌ Middleware: Google token refresh failed:', result.error);
        // Don't block the request, just log the issue
      } else {
        console.log('✅ Middleware: Google token refreshed successfully for user:', user.email);
      }
    }

    // XERO TOKEN REFRESH (only for Xero-related requests)
    if (req.path.includes('/xero/') || req.path.includes('/invoices') || req.path.includes('/accounting')) {
      try {
        const connection = await getValidXeroConnection(req.user._id);
        console.log('✅ Middleware: Xero token validated/refreshed for user:', req.user._id);
        // Attach the connection to the request for potential use
        req.xeroConnection = connection;
      } catch (error) {
        console.log('❌ Middleware: Xero token validation failed:', error.message);
        // Don't block the request - let the actual endpoint handle the missing connection
      }
    }

    next();
  } catch (error) {
    console.error('❌ Error in tokenRefresh middleware:', error);
    // Don't block the request on middleware errors
    next();
  }
};

// Specific middleware for Xero endpoints that REQUIRE valid tokens
const ensureValidXeroToken = async (req, res, next) => {
  try {
    console.log('🔍 Ensuring valid Xero token for user:', req.user._id);
    
    const connection = await getValidXeroConnection(req.user._id);
    
    // Attach the connection to the request for use in the route handler
    req.xeroConnection = connection;
    
    console.log('✅ Xero token validation passed for user:', req.user._id);
    next();
  } catch (error) {
    console.error('❌ Xero token validation failed for user:', req.user._id, error.message);
    
    return res.status(401).json({
      success: false,
      error: 'Xero connection expired or invalid',
      message: 'Please reconnect your Xero account',
      requiresReauth: true
    });
  }
};

// NEW: Health check middleware for token status
const checkTokenHealth = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return next();
    }

    const user = await User.findById(req.user._id);
    const xeroConnection = await XeroConnection.findOne({ 
      userId: req.user._id, 
      isActive: true 
    });

    const tokenStatus = {
      google: {
        connected: !!user?.googleAccessToken,
        valid: user?.googleTokenExpiry > new Date(),
        expiresAt: user?.googleTokenExpiry
      },
      xero: {
        connected: !!xeroConnection?.accessToken,
        valid: xeroConnection?.tokenExpiresAt > new Date(),
        expiresAt: xeroConnection?.tokenExpiresAt,
        tenantName: xeroConnection?.tenantName
      }
    };

    // Attach token status to request for debugging/monitoring
    req.tokenStatus = tokenStatus;
    next();
  } catch (error) {
    console.error('❌ Error checking token health:', error);
    next(); // Don't block on health check errors
  }
};

module.exports = { 
  ensureValidTokens,
  ensureValidXeroToken,
  checkTokenHealth
};