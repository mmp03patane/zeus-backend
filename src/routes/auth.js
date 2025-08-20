const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('../config/passport'); // Import our passport config
const User = require('../models/User');
const { register, login, updateProfile, googleAuth, getCurrentUser } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

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

// Existing routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.put('/profile', authMiddleware, updateProfile);
router.get('/me', authMiddleware, getCurrentUser); // Get current user endpoint

// NEW: Google OAuth routes (these will be /api/auth/google and /api/auth/google/callback)
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  googleAuth
);

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