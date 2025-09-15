const express = require('express');
const router = express.Router();
const smsController = require('../controllers/smsController');
const auth = require('../middleware/auth');

// Get SMS template
router.get('/template', auth, smsController.getSMSTemplate);

// Update SMS template
router.put('/template', auth, smsController.updateSMSTemplate);

// Preview SMS template
router.post('/template/preview', auth, smsController.previewSMSTemplate);

// NEW: Test SMS endpoint with balance check
router.post('/test', auth, smsController.sendTestSMS);

// Get SMS balance
router.get('/balance', auth, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      balance: user.smsBalance || 0,
      smsCount: Math.floor((user.smsBalance || 0) / 0.10), // Calculate available SMS count
      totalSMSCredits: user.totalSMSCredits || 0
    });

  } catch (error) {
    console.error('Error fetching SMS balance:', error);
    res.status(500).json({ 
      message: 'Failed to fetch balance',
      error: error.message 
    });
  }
});

module.exports = router;