const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('../config/passport'); // Import our passport config
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
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// In-memory store to track active Google auth sessions
const activeGoogleAuthSessions = new Map();

// Clean up old auth sessions every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of activeGoogleAuthSessions.entries()) {
    if (now - timestamp > 30000) { // Remove entries older than 30 seconds
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
router.get('/me', authMiddleware, getCurrentUser); // Get current user endpoint

// NEW: Account deactivation/reactivation routes
router.post('/deactivate', authMiddleware, deactivationValidation, deactivateAccount);
router.post('/reactivate', reactivationValidation, reactivateAccount);

// NEW: Google OAuth routes (these will be /api/auth/google and /api/auth/google/callback)
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    accessType: 'offline',    // ADD THIS
    prompt: 'consent'         // ADD THIS
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
    
    // Check if we've processed this user recently (within 5 seconds)
    if (activeGoogleAuthSessions.has(userId)) {
      const lastAuth = activeGoogleAuthSessions.get(userId);
      const timeDiff = now - lastAuth;
      
      if (timeDiff < 5000) {
        console.log(`=== DUPLICATE GOOGLE AUTH BLOCKED ===`);
        console.log(`User: ${userId}`);
        console.log(`Time since last auth: ${timeDiff}ms`);
        console.log(`Blocking duplicate request`);
        
        return res.status(429).json({ 
          error: 'Authentication request too recent. Please wait a moment.',
          retryAfter: Math.ceil((5000 - timeDiff) / 1000)
        });
      }
    }
    
    // Record this auth attempt
    activeGoogleAuthSessions.set(userId, now);
    console.log(`=== GOOGLE AUTH SESSION TRACKED ===`);
    console.log(`User: ${userId}`);
    console.log(`Timestamp: ${now}`);
    console.log(`Active sessions: ${activeGoogleAuthSessions.size}`);
    
    // Continue to googleAuth controller
    next();
  },
  googleAuth
);

// NEW: Payment verification endpoint - NOW WITH TOKEN REFRESH MIDDLEWARE
router.get('/verify-payment-session/:sessionId', authMiddleware, ensureValidTokens, async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log('🔍 Verifying payment session:', sessionId, 'for user:', req.user.email);
    
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('💳 Stripe session retrieved:', {
      id: session.id,
      status: session.payment_status,
      customer_email: session.customer_details?.email
    });
    
    // Verify this session belongs to the authenticated user
    const sessionEmail = session.customer_details?.email;
    const userEmail = req.user.email;
    
    if (sessionEmail !== userEmail) {
      console.log('❌ Email mismatch:', { sessionEmail, userEmail });
      return res.status(403).json({ 
        success: false, 
        message: 'Payment session does not belong to current user' 
      });
    }
    
    // Check payment was successful
    if (session.payment_status !== 'paid') {
      console.log('❌ Payment not completed:', session.payment_status);
      return res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }
    
    // Generate a fresh token
    const token = generateToken(req.user._id);
    console.log('✅ Fresh token generated for user:', req.user.email);
    
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
        amountPaid: session.amount_total / 100, // Convert from cents
        currency: session.currency
      }
    });
    
  } catch (error) {
    console.error('❌ Payment session verification error:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Failed to verify payment session',
      error: error.message 
    });
  }
});

// Complete registration route (MOVED BEFORE module.exports)
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

    // Validate all required fields are present
    if (!email || !password || !businessName || !googlePlaceId || !googleReviewUrl) {
      return res.status(400).json({ 
        error: 'All registration steps must be completed' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with ALL data at once
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

    // Generate JWT token
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