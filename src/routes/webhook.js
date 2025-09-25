const express = require('express');
const { handleXeroWebhook, handleStripeWebhook } = require('../controllers/webhookController');
const cellcastService = require('../services/cellcastService'); // Changed from twilioService
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Xero webhook endpoint (no auth needed - Xero calls this)
router.post('/xero', handleXeroWebhook);

// Stripe webhook endpoint (no auth needed - Stripe calls this)
router.post('/stripe', handleStripeWebhook);

// TEST ENDPOINT - Updated for Cellcast
router.get('/test-sms', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user.googleReviewUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'No Google review URL configured. Complete onboarding first.' 
      });
    }

    // Replace with YOUR phone number for testing
    const testPhoneNumber = '+61400803880'; // ← PUT YOUR PHONE NUMBER HERE
    
    // Create review request message
    const message = `Hi Test Customer! 

Thanks for choosing ${user.businessName}! We'd love to hear about your experience.

Please leave us a Google review: ${user.googleReviewUrl}

Your feedback helps us serve you better!`;

    const result = await cellcastService.sendSMS(testPhoneNumber, message);

    res.json({
      success: true,
      message: 'Test SMS sent successfully via Cellcast!',
      messageId: result.messageId,
      phoneNumber: testPhoneNumber,
      data: result.data
    });

  } catch (error) {
    console.error('Test SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test SMS',
      error: error.message
    });
  }
});

// DEBUG ENDPOINT - Check Xero connection (Remove after testing)
router.get('/debug-xero', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      hasXeroTokens: !!user.xeroTokens,
      xeroTokens: user.xeroTokens ? {
        hasAccessToken: !!user.xeroTokens.access_token,
        hasRefreshToken: !!user.xeroTokens.refresh_token,
        hasTenantId: !!user.xeroTokens.tenantId,
        expiresAt: user.xeroTokens.expires_at,
        tokenLength: user.xeroTokens.access_token ? user.xeroTokens.access_token.length : 0
      } : null,
      userId: user._id,
      businessName: user.businessName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DEBUG ENDPOINT - Test Cellcast connection
router.get('/test-cellcast', authMiddleware, async (req, res) => {
  try {
    const verification = await cellcastService.verifyToken();
    
    res.json({
      success: !!verification,
      message: verification ? 'Cellcast API key is valid' : 'Cellcast API key verification failed',
      data: verification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Register webhook with Xero - DEBUG VERSION
router.post('/register-xero-webhook', authMiddleware, async (req, res) => {
  try {
    console.log('🔧 DEBUG: Starting webhook registration...');
    const { getValidXeroConnection } = require('../services/xeroTokenService');
    
    // Get valid connection (auto-refreshes if needed)
    console.log('🔧 DEBUG: Getting Xero connection for user:', req.user._id);
    const connection = await getValidXeroConnection(req.user._id);
    
    if (!connection) {
      console.log('🔧 DEBUG: No active Xero connection found');
      return res.status(400).json({ error: 'No active Xero connection found' });
    }

    console.log('🔧 DEBUG: Connection found, access token length:', connection.accessToken?.length);

    // Your public webhook URL
    const webhookUrl = process.env.WEBHOOK_URL || 'https://62fc09fff7b9.ngrok-free.app/api/webhook/xero';
    console.log('🔧 DEBUG: Using webhook URL:', webhookUrl);
    
    const webhookPayload = {
      callbackUrl: webhookUrl,
      resource: 'INVOICES',
      event: 'UPDATE'
    };

    // Get Xero connections to find tenant ID
    console.log('🔧 DEBUG: Fetching Xero connections...');
    const response = await fetch('https://api.xero.com/connections', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('🔧 DEBUG: Connections response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔧 DEBUG: Connections API failed:', errorText);
      return res.status(400).json({ 
        error: 'Failed to fetch Xero connections', 
        details: errorText,
        status: response.status 
      });
    }

    let connections;
    try {
      connections = await response.json();
    } catch (parseError) {
      console.error('🔧 DEBUG: Failed to parse connections response');
      return res.status(400).json({ error: 'Invalid response from Xero connections API' });
    }

    console.log('🔧 DEBUG: Connections:', connections);
    const tenantId = connections[0]?.tenantId || connection.tenantId;
    console.log('🔧 DEBUG: Using tenant ID:', tenantId);

    if (!tenantId) {
      return res.status(400).json({ error: 'No Xero tenant found' });
    }

    // Register the webhook
    console.log('🔧 DEBUG: Registering webhook with payload:', webhookPayload);
    const webhookResponse = await fetch(`https://api.xero.com/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json',
        'xero-tenant-id': tenantId
      },
      body: JSON.stringify(webhookPayload)
    });

    console.log('🔧 DEBUG: Webhook response status:', webhookResponse.status);

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('🔧 DEBUG: Webhook registration failed:', errorText);
      return res.status(400).json({ 
        error: 'Failed to register webhook', 
        details: errorText,
        status: webhookResponse.status 
      });
    }

    let webhookResult;
    try {
      webhookResult = await webhookResponse.json();
    } catch (parseError) {
      console.error('🔧 DEBUG: Failed to parse webhook response');
      return res.status(400).json({ error: 'Invalid response from Xero webhook API' });
    }

    console.log('🔧 DEBUG: Webhook registration successful:', webhookResult);

    // Store webhook ID in connection record
    if (webhookResult.webhookId) {
      connection.webhookId = webhookResult.webhookId;
      await connection.save();
    }

    res.json({
      success: true,
      message: 'Xero webhook registered successfully!',
      webhookId: webhookResult.webhookId,
      callbackUrl: webhookUrl,
      tenantId: tenantId
    });

  } catch (error) {
    console.error('🔧 DEBUG: Webhook registration error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;