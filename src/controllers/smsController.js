const User = require('../models/User');
const logger = require('../utils/logger');

// Get user's SMS template
const getSMSTemplate = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const template = user.smsTemplate || {
      message: 'Hi {customerName}! Thank you for choosing {businessName}. We\'d love to hear about your experience. Please leave us a review: {reviewUrl}',
      isEnabled: true
    };

    res.json(template);
  } catch (error) {
    logger.error('Get SMS template error:', error);
    res.status(500).json({ message: 'Failed to get SMS template' });
  }
};

// Update user's SMS template
const updateSMSTemplate = async (req, res) => {
  try {
    const { message, isEnabled } = req.body;
    
    // Validate required fields
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Check if message contains required placeholders
    const requiredPlaceholders = ['{customerName}', '{businessName}', '{reviewUrl}'];
    const missingPlaceholders = requiredPlaceholders.filter(placeholder => 
      !message.includes(placeholder)
    );

    if (missingPlaceholders.length > 0) {
      return res.status(400).json({ 
        message: `Message must contain the following placeholders: ${missingPlaceholders.join(', ')}` 
      });
    }

    // Check message length (SMS limit is 1600 characters)
    if (message.length > 1400) { // Leave room for placeholder expansion
      return res.status(400).json({ 
        message: 'Message is too long. Please keep it under 1400 characters.' 
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        smsTemplate: {
          message: message.trim(),
          isEnabled: isEnabled !== false, // Default to true if not specified
          updatedAt: new Date()
        }
      },
      { new: true, upsert: false }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info(`SMS template updated for user: ${req.user.id}`);
    res.json({ 
      message: 'SMS template updated successfully',
      template: user.smsTemplate 
    });

  } catch (error) {
    logger.error('Update SMS template error:', error);
    res.status(500).json({ message: 'Failed to update SMS template' });
  }
};

// Test SMS template with sample data
const previewSMSTemplate = async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Sample data for preview
    const sampleData = {
      customerName: 'John Smith',
      businessName: 'ABC Company',
      reviewUrl: 'https://g.page/r/abc123'
    };

    // Replace placeholders with sample data
    let previewMessage = message;
    Object.entries(sampleData).forEach(([key, value]) => {
      previewMessage = previewMessage.replace(new RegExp(`{${key}}`, 'g'), value);
    });

    res.json({ 
      preview: previewMessage,
      characterCount: previewMessage.length,
      sampleData
    });

  } catch (error) {
    logger.error('Preview SMS template error:', error);
    res.status(500).json({ message: 'Failed to generate preview' });
  }
};

module.exports = {
  getSMSTemplate,
  updateSMSTemplate,
  previewSMSTemplate
};