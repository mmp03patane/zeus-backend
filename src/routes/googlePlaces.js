const express = require('express');
const router = express.Router();
const { searchPlaces, getPlaceDetails } = require('../services/googlePlacesService');
const auth = require('../middleware/auth');
const User = require('../models/User');

// GET /api/google-places/search?query=business+name
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const results = await searchPlaces(query);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Places search error:', error);
    res.status(500).json({ error: 'Failed to search places' });
  }
});

// GET /api/google-places/details/:placeId
router.get('/details/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;
    const details = await getPlaceDetails(placeId);
    res.json({ success: true, data: details });
  } catch (error) {
    console.error('Place details error:', error);
    res.status(500).json({ error: 'Failed to get place details' });
  }
});

// NEW ROUTES FOR DASHBOARD:

// GET /api/google-places/status - Check Google Places connection status
router.get('/status', auth, async (req, res) => {
  try {
    const user = req.user; // User is already available from auth middleware
    
    // Check if user has Google Places connected (only need review URL)
    const isConnected = !!(user.googleReviewUrl);
    
    const connectionData = {
      status: isConnected ? 'connected' : 'disconnected',
      lastSync: user.updatedAt, // Use user's last update as sync time
      businessInfo: isConnected ? {
        name: user.businessName,
        placeId: user.googlePlaceId,
        reviewUrl: user.googleReviewUrl,
        // You can add more fields here if you store them
        address: null, // Add if you store this
        phone: null,   // Add if you store this
        rating: null,  // Add if you store this
        reviewCount: null, // Add if you store this
        website: null  // Add if you store this
      } : null
    };

    res.json({
      success: true,
      data: connectionData
    });

  } catch (error) {
    console.error('Error fetching Google Places status:', error);
    res.status(500).json({ error: 'Failed to fetch connection status' });
  }
});

// POST /api/google-places/disconnect - Disconnect Google Places
router.post('/disconnect', auth, async (req, res) => {
  try {
    const user = req.user; // User is already available from auth middleware

    // Clear Google Places data
    user.googlePlaceId = null;
    user.googleReviewUrl = null;
    // Clear any other Google-related fields you might have
    
    await user.save();

    res.json({
      success: true,
      message: 'Google Places disconnected successfully'
    });

  } catch (error) {
    console.error('Error disconnecting Google Places:', error);
    res.status(500).json({ error: 'Failed to disconnect Google Places' });
  }
});

// GET /api/google-places/auth-url - Get Google OAuth URL for reconnection
router.get('/auth-url', auth, async (req, res) => {
  try {
    // You'll need to implement this based on your Google OAuth setup
    // This should return the URL to start the Google Places OAuth flow
    
    // For now, return a placeholder - you'll need to implement the actual OAuth flow
    const authUrl = `${process.env.FRONTEND_URL}/onboarding?step=2&reconnect=true`;
    
    res.json({
      success: true,
      authUrl: authUrl
    });

  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

module.exports = router;