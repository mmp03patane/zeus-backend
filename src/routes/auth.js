const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('../config/passport');
const User = require('../models/User');
const { 
  register, 
  login, 
  updateProfile, 
  googleAuth, 
  getCurrentUser, 
  generateToken,
  deactivateAccount,
  reactivateAccount 
} = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { ensureValidTokens } = require('../middleware/tokenRefresh');
// Choose keys based on environment
const isProduction = process.env.NODE_ENV === 'production';
const stripeSecretKey = isProduction 
  ? process.env.STRIPE_SECRET_KEY_LIVE 
  : process.env.STRIPE_SECRET_KEY;

const stripe = require('stripe')(stripeSecretKey);

const router = express.Router();

// In-memory store to track active Google auth sessions
const activeGoogleAuthSessions = new Map();

// Clean up old auth sessions every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of activeGoogleAuthSessions.entries()) {
    if (now - timestamp > 30000) {
      activeGoogleAuthSessions.delete(key);
    }
  }
}, 30000);

// Registration validation
const registerValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('firebaseUid').notEmpty().withMessage('Firebase UID is required')
];

// Login validation
const loginValidation = [
  body('firebaseUid').notEmpty().withMessage('Firebase UID is required')
];

// Deactivation validation
const deactivationValidation = [
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters')
];

// Reactivation validation
const reactivationValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
];

// Existing routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.put('/profile', authMiddleware, updateProfile);

// FIXED: Enhanced /auth/me endpoint for session recovery
router.get('/me', authMiddleware, async (req, res) => {
  try {
    console.log('Session verification request from user:', req.user.email);
    
    // Fetch fresh user data from database
    const user = await User.findById(req.user._id).select('-password -__v');
    
    if (!user) {
      console.log('User not found in database:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // FIXED: Check if account is active using the correct field name
    if (!user.isActive) {
      console.log('User account is deactivated:', user.email);
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
        isDeactivated: true
      });
    }

    console.log('Session verification successful for user:', user.email);
    
    // Return in the expected format for frontend compatibility
    res.json({
      success: true,
      data: { 
        user: {
          _id: user._id,
          id: user._id,
          name: user.name,
          email: user.email,
          businessName: user.businessName,
          smsBalance: user.smsBalance || 0,
          googlePlaceId: user.googlePlaceId,
          googleReviewUrl: user.googleReviewUrl,
          businessAddress: user.businessAddress,
          googleRating: user.googleRating,
          totalReviews: user.totalReviews,
          registrationComplete: user.registrationComplete,
          isOnboardingComplete: user.isOnboardingComplete,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });
    
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Session verification failed'
    });
  }
});

// FIXED: verify-session endpoint with correct field name
router.get('/verify-session', authMiddleware, async (req, res) => {
  try {
    console.log('Explicit session verification request from user:', req.user.email);
    
    const user = await User.findById(req.user._id).select('-password -__v');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // FIXED: Check if account is active using the correct field name
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
        isDeactivated: true
      });
    }

    console.log('Explicit session verification successful for user:', user.email);
    
    res.json({
      success: true,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        smsBalance: user.smsBalance || 0,
        googlePlaceId: user.googlePlaceId,
        googleReviewUrl: user.googleReviewUrl,
        businessAddress: user.businessAddress,
        googleRating: user.googleRating,
        totalReviews: user.totalReviews,
        registrationComplete: user.registrationComplete,
        isOnboardingComplete: user.isOnboardingComplete,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
    
  } catch (error) {
    console.error('Explicit session verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Session verification failed'
    });
  }
});

// Account deactivation/reactivation routes
router.post('/deactivate', authMiddleware, deactivationValidation, deactivateAccount);
router.post('/reactivate', reactivationValidation, reactivateAccount);

// Google OAuth routes
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    accessType: 'offline',
    prompt: 'consent'
  })
);

// Google callback with deduplication
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res, next) => {
    // Deduplication middleware
    const userId = req.user?.googleId || req.user?.id;
    const now = Date.now();
    
    if (!userId) {
      console.log('No user ID found in request, proceeding...');
      return next();
    }
    
    if (activeGoogleAuthSessions.has(userId)) {
      const lastAuth = activeGoogleAuthSessions.get(userId);
      const timeDiff = now - lastAuth;
      
      if (timeDiff < 5000) {
        console.log('=== DUPLICATE GOOGLE AUTH BLOCKED ===');
        console.log('User:', userId);
        console.log('Time since last auth:', timeDiff, 'ms');
        console.log('Blocking duplicate request');
        
        return res.status(429).json({ 
          error: 'Authentication request too recent. Please wait a moment.',
          retryAfter: Math.ceil((5000 - timeDiff) / 1000)
        });
      }
    }
    
    activeGoogleAuthSessions.set(userId, now);
    console.log('=== GOOGLE AUTH SESSION TRACKED ===');
    console.log('User:', userId);
    console.log('Timestamp:', now);
    console.log('Active sessions:', activeGoogleAuthSessions.size);
    
    next();
  },
  googleAuth
);

// Payment verification endpoint
router.get('/verify-payment-session/:sessionId', authMiddleware, ensureValidTokens, async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log('Verifying payment session:', sessionId, 'for user:', req.user.email);
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('Stripe session retrieved:', {
      id: session.id,
      status: session.payment_status,
      customer_email: session.customer_details?.email
    });
    
    const sessionEmail = session.customer_details?.email;
    const userEmail = req.user.email;
    
    if (sessionEmail !== userEmail) {
      console.log('Email mismatch:', { sessionEmail, userEmail });
      return res.status(403).json({ 
        success: false, 
        message: 'Payment session does not belong to current user' 
      });
    }
    
    if (session.payment_status !== 'paid') {
      console.log('Payment not completed:', session.payment_status);
      return res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }
    
    const token = generateToken(req.user._id);
    console.log('Fresh token generated for user:', req.user.email);
    
    res.json({
      success: true,
      token,
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        smsBalance: req.user.smsBalance
      },
      paymentDetails: {
        sessionId: session.id,
        amountPaid: session.amount_total / 100,
        currency: session.currency
      }
    });
    
  } catch (error) {
    console.error('Payment session verification error:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Failed to verify payment session',
      error: error.message 
    });
  }
});

// Complete registration route
router.post('/complete-registration', async (req, res) => {
  try {
    const {
      email,
      password,
      businessName,
      googlePlaceId,
      googleReviewUrl,
      selectedPlace
    } = req.body;

    if (!email || !password || !businessName || !googlePlaceId || !googleReviewUrl) {
      return res.status(400).json({ 
        error: 'All registration steps must be completed' 
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = new User({
      email,
      password: hashedPassword,
      businessName,
      googlePlaceId,
      googleReviewUrl,
      businessAddress: selectedPlace.address,
      googleRating: selectedPlace.rating,
      totalReviews: selectedPlace.userRatingsTotal,
      registrationComplete: true
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          businessName: user.businessName
        }
      }
    });

  } catch (error) {
    console.error('Registration completion error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

module.exports = router;