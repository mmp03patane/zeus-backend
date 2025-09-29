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
  // NEW: Google OAuth Token fields
  googleAccessToken: {
    type: String,
    default: null
  },
  googleRefreshToken: {
    type: String,
    default: null
  },
  googleTokenExpiry: {
    type: Date,
    default: null
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
  // NEW: Account Deactivation fields
  isActive: {
    type: Boolean,
    default: true
  },
  deactivatedAt: {
    type: Date,
    default: null
  },
  deactivationReason: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // NEW: SMS Balance fields
  smsBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalSMSCredits: {
    type: Number,
    default: 0,
    min: 0
  },
  smsTemplate: {
    message: {
      type: String,
      default: 'Hi {customerName}! Thanks for choosing {businessName}. We\'d love your feedback, please feel free to leave us a {reviewUrl}'
    },
    isEnabled: {
      type: Boolean,
      default: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// NEW: Method to calculate available SMS messages
userSchema.methods.getAvailableSMS = function() {
  return Math.floor(this.smsBalance / 0.25);
};

// NEW: Method to deduct SMS cost
userSchema.methods.deductSMSCost = async function() {
  if (this.smsBalance >= 0.25) {
    this.smsBalance -= 0.25;
    await this.save();
    return true;
  }
  return false;
};

// NEW: Method to check if user has sufficient SMS balance
userSchema.methods.hasSufficientSMSBalance = function() {
  return this.smsBalance >= 0.25;
};

// NEW: Method to check if Google token needs refresh
userSchema.methods.needsGoogleTokenRefresh = function() {
  if (!this.googleTokenExpiry) return false;
  // Refresh if token expires in less than 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return this.googleTokenExpiry <= fiveMinutesFromNow;
};

// NEW: Method to update Google tokens
userSchema.methods.updateGoogleTokens = function(accessToken, refreshToken, expiryDate) {
  this.googleAccessToken = accessToken;
  if (refreshToken) {
    this.googleRefreshToken = refreshToken;
  }
  this.googleTokenExpiry = expiryDate;
  return this.save();
};

// NEW: Method to deactivate user account
userSchema.methods.deactivateAccount = async function(reason = null) {
  this.isActive = false;
  this.deactivatedAt = new Date();
  this.deactivationReason = reason;
  // Clear sensitive tokens but keep the data
  this.googleAccessToken = null;
  this.googleRefreshToken = null;
  this.googleTokenExpiry = null;
  await this.save();
  return this;
};

// NEW: Method to reactivate user account
userSchema.methods.reactivateAccount = async function() {
  this.isActive = true;
  this.deactivatedAt = null;
  this.deactivationReason = null;
  await this.save();
  return this;
};

// NEW: Method to check if account is deactivated
userSchema.methods.isDeactivated = function() {
  return !this.isActive;
};

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ firebaseUid: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ isActive: 1 }); // NEW: Index for active status checks
// REMOVED: googlePlaceId index since it shouldn't be unique

module.exports = mongoose.model('User', userSchema);