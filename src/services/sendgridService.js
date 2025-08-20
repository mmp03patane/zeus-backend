const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendReviewRequestEmail = async (email, customerName, businessName, reviewUrl) => {
  try {
    const msg = {
      to: email,
      from: {
        email: process.env.FROM_EMAIL_ADDRESS,
        name: businessName
      },
      subject: `Your feedback matters to ${businessName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Thank you for choosing ${businessName}!</h2>
          <p>Hi ${customerName},</p>
          <p>We hope you had a great experience with us. Your feedback is incredibly valuable and helps us continue to improve our service.</p>
          <p>Would you mind taking a moment to leave us a review?</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${reviewUrl}" 
               style="background-color: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Leave a Review
            </a>
          </div>
          <p>Thank you for your time and for being a valued customer!</p>
          <p>Best regards,<br>The ${businessName} Team</p>
        </div>
      `
    };

    const result = await sgMail.send(msg);
    logger.info(`Email sent successfully to ${email}`);
    
    return {
      messageId: result[0].headers['x-message-id'],
      status: 'sent'
    };

  } catch (error) {
    logger.error('SendGrid email error:', error);
    throw error;
  }
};

module.exports = {
  sendReviewRequestEmail
};