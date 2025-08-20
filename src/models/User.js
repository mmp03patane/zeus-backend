const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  firebaseUid: {
    type: String,
    sparse: true // Allow null values, temporarily removed unique to fix Google OAuth
  },
  // Google OAuth fields
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values while maintaining uniqueness
  },
  profilePicture: {
    type: String,
    default: null
  },
  authProvider: {
    type: String,
    enum: ['email', 'google'],
    default: 'email'
  },
  googlePlaceId: {
    type: String,
    default: null
    // REMOVED: Don't make this unique since multiple users can have null during onboarding
  },
  businessName: {
    type: String,
    default: null
  },
  googleReviewUrl: {
    type: String,
    default: null
  },
  businessAddress: {
    type: String,
    default: null
  },
  googleRating: {
    type: Number,
    default: null
  },
  totalReviews: {
    type: Number,
    default: null
  },
  isOnboardingComplete: {
    type: Boolean,
    default: false
  },
  registrationComplete: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  smsTemplate: {
    message: {
      type: String,
      default: 'Hi {customerName}! Thank you for choosing {businessName}. We\'d love to hear about your experience. Please leave us a review: {reviewUrl}'
    },
    isEnabled: {
      type: Boolean,
      default: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }, // Added missing comma here
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ firebaseUid: 1 });
userSchema.index({ googleId: 1 });
// REMOVED: googlePlaceId index since it shouldn't be unique

module.exports = mongoose.model('User', userSchema);