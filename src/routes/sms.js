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

// NEW: Get SMS balance
router.get('/balance', auth, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      balance: user.smsBalance || 0,
      smsCount: user.getAvailableSMS(),
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