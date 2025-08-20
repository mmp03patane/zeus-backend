const twilio = require('twilio');
const logger = require('../utils/logger');
const User = require('../models/User');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Default message template for backward compatibility
const DEFAULT_MESSAGE_TEMPLATE = `Hi {customerName}! Thank you for choosing {businessName}. We'd love to hear about your experience. Please leave us a review: {reviewUrl}`;

const sendReviewRequestSMS = async (phoneNumber, customerName, businessName, reviewUrl, userId = null) => {
  try {
    let message;
    
    // If userId is provided, try to get custom template
    if (userId) {
      try {
        const user = await User.findById(userId);
        if (user && user.smsTemplate && user.smsTemplate.isEnabled && user.smsTemplate.message) {
          // Use custom template with placeholder replacement
          message = user.smsTemplate.message
            .replace(/{customerName}/g, customerName)
            .replace(/{businessName}/g, businessName)
            .replace(/{reviewUrl}/g, reviewUrl);
          
          logger.info(`Using custom SMS template for user: ${userId}`);
        } else {
          // Fall back to default template with placeholder replacement
          message = DEFAULT_MESSAGE_TEMPLATE
            .replace(/{customerName}/g, customerName)
            .replace(/{businessName}/g, businessName)
            .replace(/{reviewUrl}/g, reviewUrl);
          
          logger.info(`Using default SMS template (custom template not found/disabled for user: ${userId})`);
        }
      } catch (error) {
        logger.warn('Failed to get custom SMS template, using default:', error);
        // Fall back to default template with placeholder replacement
        message = DEFAULT_MESSAGE_TEMPLATE
          .replace(/{customerName}/g, customerName)
          .replace(/{businessName}/g, businessName)
          .replace(/{reviewUrl}/g, reviewUrl);
      }
    } else {
      // No userId provided - use original default message (backward compatibility)
      message = `Hi ${customerName}! Thank you for choosing ${businessName}. We'd love to hear about your experience. Please leave us a review: ${reviewUrl}`;
      logger.info('Using legacy default SMS message (no userId provided)');
    }

    const result = await client.messages.create({
      body: message,
      messagingServiceSid: process.env.MESSAGING_SERVICE_SID,
      to: phoneNumber
    });

    logger.info(`SMS sent successfully: ${result.sid}`);
    return result;

  } catch (error) {
    logger.error('Twilio SMS error:', error);
    throw error;
  }
};

const checkSMSStatus = async (messageSid) => {
  try {
    const message = await client.messages(messageSid).fetch();
    return message.status;
  } catch (error) {
    logger.error('SMS status check error:', error);
    throw error;
  }
};

module.exports = {
  sendReviewRequestSMS,
  checkSMSStatus
};