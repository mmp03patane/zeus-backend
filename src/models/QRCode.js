// src/models/QRCode.js
const mongoose = require('mongoose');

const qrCodeSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  url: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['unassigned', 'assigned'],
    default: 'unassigned',
    index: true
  },
  
  // Business details (filled when claimed)
  businessName: {
    type: String,
    default: null
  },
  businessId: {
    type: String, // Google Place ID
    default: null
  },
  reviewUrl: {
    type: String,
    default: null
  },
  address: {
    type: String,
    default: null
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  assignedAt: {
    type: Date,
    default: null
  },
  
  // Analytics
  scanCount: {
    type: Number,
    default: 0
  },
  lastScanned: {
    type: Date,
    default: null
  },
  
  // Optional: Link to user if you want to track ownership
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Index for faster queries
qrCodeSchema.index({ slug: 1, status: 1 });

// Method to claim a QR code
qrCodeSchema.methods.claim = function(businessData) {
  this.status = 'assigned';
  this.businessName = businessData.businessName;
  this.businessId = businessData.placeId;
  this.reviewUrl = businessData.reviewUrl;
  this.address = businessData.address;
  this.assignedAt = new Date();
  return this.save();
};

// Method to unclaim (for testing)
qrCodeSchema.methods.unclaim = function() {
  this.status = 'unassigned';
  this.businessName = null;
  this.businessId = null;
  this.reviewUrl = null;
  this.address = null;
  this.assignedAt = null;
  return this.save();
};

// Method to increment scan count
qrCodeSchema.methods.recordScan = function() {
  this.scanCount += 1;
  this.lastScanned = new Date();
  return this.save();
};

// Static method to get analytics
qrCodeSchema.statics.getAnalytics = async function() {
  const total = await this.countDocuments();
  const assigned = await this.countDocuments({ status: 'assigned' });
  const unassigned = await this.countDocuments({ status: 'unassigned' });
  const totalScans = await this.aggregate([
    { $group: { _id: null, total: { $sum: '$scanCount' } } }
  ]);
  
  return {
    total,
    assigned,
    unassigned,
    totalScans: totalScans[0]?.total || 0
  };
};

module.exports = mongoose.model('QRCode', qrCodeSchema);