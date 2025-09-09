const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { name, email, password, firebaseUid } = req.body;

    // Check if user already exists
    let user = await User.findOne({ $or: [{ email }, { firebaseUid }] });
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Hash password if provided (for email/password registration)
    let hashedPassword;
    if (password) {
      const saltRounds = 12;
      hashedPassword = await bcrypt.hash(password, saltRounds);
    }

    // Create new user
    user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      firebaseUid,
      authProvider: password ? 'email' : 'firebase'
    });

    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isOnboardingComplete: user.isOnboardingComplete,
          authProvider: user.authProvider
        },
        token
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
};

const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { email, password, firebaseUid } = req.body;

    let user;

    if (firebaseUid) {
      // Firebase/Google authentication
      console.log('Attempting Firebase auth with UID:', firebaseUid);
      user = await User.findOne({ firebaseUid });
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found. Please register first.'
        });
      }
      
      console.log('Firebase user found:', user.email);
      
    } else if (email && password) {
      // Email/password authentication
      console.log('Attempting email/password auth for:', email);
      
      user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if user registered with email/password
      if (!user.password) {
        return res.status(401).json({
          success: false,
          message: 'Please login with Google or reset your password'
        });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
      console.log('Email/password auth successful for:', user.email);
      
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either email/password or firebaseUid is required'
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isOnboardingComplete: user.isOnboardingComplete,
          businessName: user.businessName,
          googleReviewUrl: user.googleReviewUrl,
          profilePicture: user.profilePicture,
          authProvider: user.authProvider
        },
        token
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

const googleAuth = async (req, res) => {
  try {
    console.log('=== Google Auth Controller ===');
    console.log('req.user:', req.user);
    
    const { 
      googleId, 
      email, 
      name, 
      profilePicture, 
      googleAccessToken, 
      googleRefreshToken, 
      googleTokenExpiry 
    } = req.user;
    
    console.log('Extracted data:', { 
      googleId, 
      email, 
      name, 
      profilePicture,
      hasAccessToken: !!googleAccessToken,
      hasRefreshToken: !!googleRefreshToken,
      tokenExpiry: googleTokenExpiry
    });

    // Check if user already exists
    let user = await User.findOne({ 
      $or: [
        { googleId },
        { email }
      ]
    });
    console.log('Found existing user:', user ? 'YES' : 'NO');

    if (user) {
      console.log('Existing user found, updating Google info and tokens');
      
      // Update Google info if user exists but doesn't have googleId
      if (!user.googleId) {
        user.googleId = googleId;
        user.profilePicture = profilePicture;
        // Update auth provider if it was email-only before
        if (user.authProvider === 'email') {
          user.authProvider = 'both';
        } else if (!user.authProvider) {
          user.authProvider = 'google';
        }
      }

      // CRITICAL: Always update the OAuth tokens
      user.googleAccessToken = googleAccessToken;
      if (googleRefreshToken) {
        user.googleRefreshToken = googleRefreshToken;
      }
      user.googleTokenExpiry = googleTokenExpiry;

      await user.save();
      console.log('Updated existing user with Google tokens');
      
    } else {
      console.log('Creating new user with Google tokens');
      
      // Create new user with OAuth tokens
      user = new User({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        googleId,
        profilePicture,
        authProvider: 'google',
        isOnboardingComplete: false,
        // CRITICAL: Store the OAuth tokens
        googleAccessToken,
        googleRefreshToken,
        googleTokenExpiry
      });
      
      await user.save();
      console.log('New user created with Google tokens:', user._id);
    }

    const token = generateToken(user._id);
    console.log('JWT token generated:', token ? 'SUCCESS' : 'FAILED');

    // Redirect to frontend with token
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5173';
    console.log('Frontend URL:', frontendURL);
    
    const redirectUrl = user.isOnboardingComplete 
      ? `${frontendURL}/auth/callback?token=${token}&redirect=dashboard`
      : `${frontendURL}/auth/callback?token=${token}&redirect=onboarding`;
    
    console.log('Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('Google auth error:', error);
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const errorUrl = `${frontendURL}/auth/callback?error=auth_failed`;
    console.log('Redirecting to error URL:', errorUrl);
    res.redirect(errorUrl);
  }
};

// Get current user info (for OAuth callback)
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isOnboardingComplete: user.isOnboardingComplete,
          businessName: user.businessName,
          googleReviewUrl: user.googleReviewUrl,
          profilePicture: user.profilePicture,
          authProvider: user.authProvider
        }
      }
    });

  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user data'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { googlePlaceId, businessName, googleReviewUrl } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        googlePlaceId,
        businessName,
        googleReviewUrl,
        isOnboardingComplete: true
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          businessName: user.businessName,
          googleReviewUrl: user.googleReviewUrl,
          isOnboardingComplete: user.isOnboardingComplete,
          authProvider: user.authProvider
        }
      }
    });

  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Profile update failed'
    });
  }
};

module.exports = {
  register,
  login,
  googleAuth,
  getCurrentUser,
  updateProfile,
  generateToken
};