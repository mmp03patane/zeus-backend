// Load environment variables FIRST
require('dotenv').config();

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Debug: Check if environment variables are loaded
console.log('=== Environment Variables Debug ===');
console.log('Google Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'NOT SET');
console.log('Google Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'NOT SET');
console.log('Google Redirect URI:', process.env.GOOGLE_REDIRECT_URI ? 'Set' : 'NOT SET');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_REDIRECT_URI
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('=== Google OAuth Token Debug ===');
    console.log('Access Token:', accessToken ? 'RECEIVED' : 'MISSING');
    console.log('Refresh Token:', refreshToken ? 'RECEIVED' : 'MISSING');
    console.log('Profile ID:', profile.id);
    console.log('Profile Email:', profile.emails?.[0]?.value);

    // Calculate token expiry (Google access tokens last 1 hour)
    const tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour from now

    // Create user object that includes the OAuth tokens
    const userInfo = {
      googleId: profile.id,
      name: profile.displayName,
      email: profile.emails?.[0]?.value,
      profilePicture: profile.photos?.[0]?.value,
      // CRITICAL: Include the OAuth tokens
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken,
      googleTokenExpiry: tokenExpiry
    };

    console.log('Passing tokens to authController:', {
      hasAccessToken: !!userInfo.googleAccessToken,
      hasRefreshToken: !!userInfo.googleRefreshToken,
      tokenExpiry: userInfo.googleTokenExpiry
    });

    // Pass the complete user info including tokens to authController
    done(null, userInfo);
    
  } catch (error) {
    console.error('Error in Google Strategy:', error);
    done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  // For Google OAuth, we pass the user info object, not a saved user
  done(null, user);
});

passport.deserializeUser(async (user, done) => {
  // For Google OAuth, we just pass through the user info
  done(null, user);
});

module.exports = passport;