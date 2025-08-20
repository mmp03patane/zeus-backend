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
    required: true
  },
  customerPhone: {
    type: String,
    default: null
  },
  smsStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'delivered'],
    default: 'pending'
  },
  emailStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'delivered'],
    default: 'pending'
  },
  twilioSid: {
    type: String,
    default: null
  },
  sendgridMessageId: {
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