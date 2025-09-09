const axios = require('axios');
const User = require('../models/User');
const logger = require('../utils/logger');

class GoogleTokenService {
  constructor() {
    // Explicitly define properties to avoid TypeScript errors
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Validate environment variables
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google OAuth credentials not configured. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }
  }

  /**
   * Refresh Google OAuth tokens for a user
   * @param {Object} user - User document from MongoDB
   * @returns {Object} - { success: boolean, accessToken?: string, error?: string }
   */
  async refreshUserTokens(user) {
    try {
      if (!user.googleRefreshToken) {
        logger.warn(`User ${user.email} has no refresh token`);
        return { success: false, error: 'No refresh token available' };
      }

      console.log(`🔄 Refreshing Google tokens for user: ${user.email}`);

      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: user.googleRefreshToken,
        grant_type: 'refresh_token'
      });

      const { access_token, expires_in, refresh_token } = response.data;

      // Calculate new expiry time
      const expiryTime = new Date(Date.now() + (expires_in * 1000));

      // Update user's tokens
      await user.updateGoogleTokens(
        access_token,
        refresh_token || user.googleRefreshToken, // Use new refresh token if provided, otherwise keep existing
        expiryTime
      );

      console.log(`✅ Successfully refreshed tokens for user: ${user.email}`);
      console.log(`🕐 New token expires at: ${expiryTime.toISOString()}`);

      return { 
        success: true, 
        accessToken: access_token,
        expiryTime 
      };

    } catch (error) {
      console.error(`❌ Failed to refresh tokens for user ${user.email}:`, error.response?.data || error.message);
      
      // If refresh token is invalid, we need the user to re-authenticate
      if (error.response?.data?.error === 'invalid_grant') {
        logger.warn(`User ${user.email} needs to re-authenticate - refresh token invalid`);
        // Clear invalid tokens
        user.googleAccessToken = null;
        user.googleRefreshToken = null;
        user.googleTokenExpiry = null;
        await user.save();
      }

      return { 
        success: false, 
        error: error.response?.data?.error || error.message 
      };
    }
  }

  /**
   * Get a valid access token for a user, refreshing if necessary
   * @param {Object} user - User document from MongoDB  
   * @returns {Object} - { success: boolean, accessToken?: string, error?: string }
   */
  async getValidAccessToken(user) {
    try {
      // Check if user has Google tokens
      if (!user.googleAccessToken || !user.googleRefreshToken) {
        return { 
          success: false, 
          error: 'User has no Google OAuth tokens - re-authentication required' 
        };
      }

      // Check if token needs refresh
      if (user.needsGoogleTokenRefresh()) {
        console.log(`🔄 User ${user.email} token needs refresh`);
        const refreshResult = await this.refreshUserTokens(user);
        if (!refreshResult.success) {
          return refreshResult;
        }
        return { 
          success: true, 
          accessToken: refreshResult.accessToken 
        };
      }

      // Token is still valid
      console.log(`✅ User ${user.email} token is still valid`);
      return { 
        success: true, 
        accessToken: user.googleAccessToken 
      };

    } catch (error) {
      console.error(`❌ Error getting valid access token for ${user.email}:`, error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Background job to refresh tokens for all users that need it
   */
  async refreshAllExpiredTokens() {
    try {
      console.log('🔄 Starting background token refresh job...');

      // Find users whose tokens expire in the next 10 minutes
      const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
      
      const usersNeedingRefresh = await User.find({
        googleRefreshToken: { $ne: null },
        googleTokenExpiry: { $lte: tenMinutesFromNow }
      });

      console.log(`📋 Found ${usersNeedingRefresh.length} users needing token refresh`);

      let successCount = 0;
      let failureCount = 0;

      for (const user of usersNeedingRefresh) {
        const result = await this.refreshUserTokens(user);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
        
        // Small delay between requests to be nice to Google's API
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ Background token refresh completed: ${successCount} successful, ${failureCount} failed`);
      return { successCount, failureCount };

    } catch (error) {
      console.error('❌ Error in background token refresh job:', error);
      return { error: error.message };
    }
  }

  /**
   * Start the background token refresh scheduler
   */
  startTokenRefreshScheduler() {
    // Run every 5 minutes
    const interval = 5 * 60 * 1000;
    
    console.log('🚀 Starting Google token refresh scheduler (every 5 minutes)');
    
    setInterval(async () => {
      await this.refreshAllExpiredTokens();
    }, interval);

    // Run once immediately
    setTimeout(() => {
      this.refreshAllExpiredTokens();
    }, 5000); // Wait 5 seconds after startup
  }
}

// Create singleton instance
const googleTokenService = new GoogleTokenService();

module.exports = googleTokenService;