// routes/stripe.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// POST /api/stripe/create-checkout-session
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body; // Simplified - we'll calculate everything here
    
    // Validate the request
    if (!amount || amount < 10) { // $10 minimum
      return res.status(400).json({ 
        success: false,
        message: 'Minimum top-up amount is $10.00' 
      });
    }

    const amountInCents = Math.round(amount * 100);
    const smsCredits = Math.round(amount / 0.25); // 25 cents per SMS
    
    console.log(`💰 Creating checkout session: $${amount} (${smsCredits} SMS credits) for user:`, req.user.email);

    // Create Stripe checkout session with clean URLs
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: `SMS Credits - ${smsCredits} messages`,
            description: `Add $${amount} to your SMS balance (${smsCredits} messages at $0.25 each)`,
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: req.user.email,
      metadata: {
        userId: req.user._id.toString(),
        creditAmount: amount.toString(),
        smsCredits: smsCredits.toString()
      },
      // 🚫 HARDCODED BAN: User will NEVER be sent to login after payment
      // ✅ HARDCODED REDIRECT: User will ALWAYS go to dashboard after successful payment
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard?payment=cancelled`,
    });

    console.log('✅ Checkout session created:', session.id);
    
    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('❌ Stripe checkout error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
});

module.exports = router;