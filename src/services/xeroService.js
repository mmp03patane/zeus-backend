const axios = require('axios');
const XeroConnection = require('../models/XeroConnection');
const logger = require('../utils/logger');

const XERO_BASE_URL = 'https://api.xero.com';
const XERO_AUTH_URL = 'https://login.xero.com/identity'; // Fixed URL

const refreshXeroToken = async (connection) => {
  try {
    const response = await axios.post(`${XERO_AUTH_URL}/connect/token`, {
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
      client_id: process.env.XERO_CLIENT_ID,
      client_secret: process.env.XERO_CLIENT_SECRET
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + (expires_in * 1000));

    // Update connection with new tokens
    connection.accessToken = access_token;
    connection.refreshToken = refresh_token || connection.refreshToken;
    connection.tokenExpiresAt = expiresAt;
    await connection.save();
    
    logger.info(`Xero token refreshed for tenant: ${connection.tenantId}`);
    return connection;

  } catch (error) {
    logger.error('Xero token refresh error:', error);
    throw error;
  }
};

const getInvoiceDetails = async (connection, invoiceId) => {
  try {
    const response = await axios.get(
      `${XERO_BASE_URL}/api.xro/2.0/Invoices/${invoiceId}`, // FIXED: This URL is correct
      {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Xero-tenant-id': connection.tenantId,
          'Accept': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    logger.error('Get invoice details error:', error);
    throw error;
  }
};

module.exports = {
  refreshXeroToken,
  getInvoiceDetails
};