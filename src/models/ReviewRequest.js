const mongoose = require('mongoose');

const reviewRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  xeroInvoiceId: {
    type: String,
    required: true
  },
  invoiceNumber: {
    type: String
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    default: null  // Changed from required to optional
  },
  customerPhone: {
    type: String,
    default: null
  },
  smsStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'delivered', 'SMS failed - $0 balance, please top up', 'Cellcast account needs recharging', 'Cellcast API key issue'],
    default: 'pending'
  },
  twilioSid: {
    type: String,
    default: null
  },
  sentAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ReviewRequest', reviewRequestSchema);