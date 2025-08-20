const express = require('express');
const { initiateXeroAuth, handleXeroCallback, getXeroConnection } = require('../controllers/xeroController');
const authMiddleware = require('../middleware/auth');
const XeroConnection = require('../models/XeroConnection');

const router = express.Router();

// EXISTING ROUTES:
router.get('/initiate', authMiddleware, initiateXeroAuth);
router.get('/callback', handleXeroCallback);
router.get('/connection', authMiddleware, getXeroConnection);

// NEW ROUTES FOR DASHBOARD:

// GET /api/xero/status - Check Xero connection status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const connection = await XeroConnection.findOne({ 
      userId: req.user._id, // Use _id instead of uid
      isActive: true 
    });

    if (!connection) {
      return res.json({
        success: true,
        data: {
          status: 'disconnected',
          lastSync: null,
          connectedAt: null,
          lastActivity: null,
          tokenExpiry: null,
          scopes: null
        }
      });
    }

    // Check if token is expired
    const now = new Date();
    const isTokenValid = connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) > now;

    const connectionData = {
      status: isTokenValid ? 'connected' : 'expired',
      lastSync: connection.updatedAt,
      connectedAt: connection.createdAt,
      lastActivity: connection.updatedAt,
      tokenExpiry: connection.tokenExpiresAt,
      scopes: 'accounting.settings accounting.transactions accounting.contacts accounting.journals.read accounting.reports.read accounting.attachments' // Default Xero scopes
    };

    res.json({
      success: true,
      data: connectionData
    });

  } catch (error) {
    console.error('Error fetching Xero status:', error);
    res.status(500).json({ error: 'Failed to fetch connection status' });
  }
});

// GET /api/xero/tenants - Get connected Xero organizations
router.get('/tenants', authMiddleware, async (req, res) => {
  try {
    const connection = await XeroConnection.findOne({ 
      userId: req.user._id, // Use _id instead of uid
      isActive: true 
    });

    if (!connection) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Return the tenant information
    const tenantData = [{
      tenantId: connection.tenantId,
      tenantName: connection.tenantName,
      tenantType: 'ORGANISATION', // Default type
      createdDateUtc: connection.createdAt
    }];

    res.json({
      success: true,
      data: tenantData
    });

  } catch (error) {
    console.error('Error fetching Xero tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// POST /api/xero/disconnect - Disconnect Xero
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    const connection = await XeroConnection.findOne({ 
      userId: req.user._id, // Use _id instead of uid
      isActive: true 
    });

    if (!connection) {
      return res.status(404).json({ error: 'No active Xero connection found' });
    }

    // Mark connection as inactive instead of deleting (for audit trail)
    connection.isActive = false;
    await connection.save();

    res.json({
      success: true,
      message: 'Xero connection disconnected successfully'
    });

  } catch (error) {
    console.error('Error disconnecting Xero:', error);
    res.status(500).json({ error: 'Failed to disconnect Xero' });
  }
});

// GET /api/xero/auth-url - Get Xero OAuth URL for reconnection  
router.get('/auth-url', authMiddleware, async (req, res) => {
  try {
    // You can reuse your existing initiateXeroAuth logic here
    // Or redirect to your existing /initiate endpoint
    const authUrl = `${req.protocol}://${req.get('host')}/api/xero/initiate`;
    
    res.json({
      success: true,
      authUrl: authUrl
    });

  } catch (error) {
    console.error('Error generating Xero auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

module.exports = router;