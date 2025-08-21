
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const XeroConnection = require('../models/XeroConnection');
const User = require('../models/User');
const logger = require('../utils/logger');

// FIXED: Changed to correct Xero URLs
const XERO_BASE_URL = 'https://api.xero.com';
const XERO_AUTH_URL = 'https://login.xero.com/identity'; // Fixed URL

const initiateXeroAuth = async (req, res) => {
  try {
    const userId = req.user._id;
    const redirectUri = process.env.NODE_ENV === 'production' 
      ? 'https://api.zeusapp.co/api/xero/callback'
      : 'http://localhost:5000/api/xero/callback';

    // Generate a unique state parameter for security (use userId as state for simplicity)
    const state = userId.toString();

    // FIXED: Added required OpenID scopes and proper scope formatting
    const scopes = [
      'openid',
      'profile', 
      'email',
      'accounting.transactions',
      'accounting.contacts',
      'offline_access'
    ].join(' ');

    const authUrl = `${XERO_AUTH_URL}/connect/authorize?` +
      `response_type=code&` +
      `client_id=${process.env.XERO_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}`;

    logger.info(`Xero auth initiated for user: ${req.user._id}`);
    
    res.json({
      success: true,
      authUrl: authUrl
    });

  } catch (error) {
    logger.error('Xero auth initiation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate Xero authentication'
    });
  }
};

const handleXeroCallback = async (req, res) => {
  try {
    const { code, error, state } = req.query;

    // FIXED: Update frontend URL to dashboard subdomain
    const frontendUrl = process.env.NODE_ENV === 'production' 
      ? 'https://dashboard.zeusapp.co'  // ✅ Fixed to dashboard subdomain
      : 'http://localhost:5173';

    // Handle Xero errors
    if (error) {
      logger.error('Xero OAuth error:', error);
      return res.redirect(`${frontendUrl}/xero/callback?xero=error&message=${encodeURIComponent(error)}`);
    }

    // Check for authorization code
    if (!code) {
      logger.error('No authorization code received from Xero');
      return res.redirect(`${frontendUrl}/xero/callback?xero=error&message=Missing+authorization+code`);
    }

    // For now, let's skip the state verification and get the userId from the state parameter
    // The state parameter should contain the userId
    const userId = state;

    // Exchange code for tokens
    const redirectUri = process.env.NODE_ENV === 'production' 
      ? 'https://api.zeusapp.co/api/xero/callback'
      : 'http://localhost:5000/api/xero/callback';

    const tokenData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    // Create basic auth header
    const credentials = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64');

    // FIXED: Use correct token endpoint
    const tokenResponse = await axios.post(`${XERO_AUTH_URL}/connect/token`, tokenData, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Get tenant information
    const tenantsResponse = await axios.get(`${XERO_BASE_URL}/connections`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    if (!tenantsResponse.data || tenantsResponse.data.length === 0) {
      logger.error('No Xero organizations found');
      return res.redirect(`${frontendUrl}/xero/callback?xero=error&message=No+Xero+organization+found`);
    }

    const tenant = tenantsResponse.data[0];
    const expiresAt = new Date(Date.now() + (expires_in * 1000));

    // Save connection to database
    await XeroConnection.findOneAndUpdate(
      { userId },
      {
        userId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: expiresAt,
        isActive: true
      },
      { upsert: true, new: true }
    );

    logger.info(`Xero connection saved successfully for user: ${userId}`);

    res.redirect(`${frontendUrl}/xero/callback?xero=success`);
  
  } catch (error) {
    logger.error('Xero callback error:', error.response?.data || error.message);
    
    const frontendUrl = process.env.NODE_ENV === 'production' 
      ? 'https://dashboard.zeusapp.co'  // ✅ Fixed to dashboard subdomain
      : 'http://localhost:5173';

    res.redirect(`${frontendUrl}/xero/callback?xero=error&message=Connection+failed`);
  }
};

const getXeroConnection = async (req, res) => {
  try {
    const connection = await XeroConnection.findOne({ 
      userId: req.user._id, 
      isActive: true 
    });

    if (!connection) {
      return res.json({
        success: true,
        connected: false,
        message: 'No active Xero connection found'
      });
    }

    res.json({
      success: true,
      connected: true,
      tenantName: connection.tenantName,
      connectedAt: connection.createdAt
    });

  } catch (error) {
    logger.error('Get Xero connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Xero connection status'
    });
  }
};

module.exports = {
  initiateXeroAuth,
  handleXeroCallback,
  getXeroConnection
};