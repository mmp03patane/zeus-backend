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

module.exports = router;