const XeroConnection = require('../models/XeroConnection');

const refreshXeroToken = async (connection) => {
  try {
    console.log('🔄 Refreshing Xero token for:', connection.tenantName);
    
    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Token refresh failed:', error);
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const tokenData = await response.json();
    
    // Update the connection with new tokens
    connection.accessToken = tokenData.access_token;
    connection.refreshToken = tokenData.refresh_token;
    connection.tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
    connection.updatedAt = new Date();
    
    await connection.save();
    
    console.log('✅ Xero token refreshed successfully');
    return connection;
    
  } catch (error) {
    console.error('❌ Error refreshing Xero token:', error);
    
    // Mark connection as inactive if refresh fails
    connection.isActive = false;
    await connection.save();
    
    throw error;
  }
};

const getValidXeroConnection = async (userId) => {
  try {
    const connection = await XeroConnection.findOne({ 
      userId, 
      isActive: true 
    });
    
    if (!connection) {
      throw new Error('No active Xero connection found');
    }
    
    // Check if token is expired or will expire in the next 5 minutes
    const expiresAt = new Date(connection.tokenExpiresAt);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + (5 * 60 * 1000));
    
    if (expiresAt <= fiveMinutesFromNow) {
      console.log('🔄 Token expired or expiring soon, refreshing...');
      return await refreshXeroToken(connection);
    }
    
    return connection;
    
  } catch (error) {
    console.error('❌ Error getting valid Xero connection:', error);
    throw error;
  }
};

module.exports = {
  refreshXeroToken,
  getValidXeroConnection
};