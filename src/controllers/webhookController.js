const { sendReviewRequestSMS } = require('../services/twilioService');
const User = require('../models/User');
const XeroConnection = require('../models/XeroConnection');
const ReviewRequest = require('../models/ReviewRequest');
const { getValidXeroConnection } = require('../services/xeroTokenService');
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const handleXeroWebhook = async (req, res) => {
  try {
    console.log('📞 Xero webhook received:', JSON.stringify(req.body, null, 2));
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));

    const { events } = req.body;
    const signature = req.headers['x-xero-signature'];
    
    // Get webhook key from environment variables
    const webhookKey = process.env.XERO_WEBHOOK_KEY;
    
    if (!webhookKey) {
      console.error('❌ XERO_WEBHOOK_KEY not configured');
      return res.status(500).json({ error: 'Webhook key not configured' });
    }

    // VERIFY SIGNATURE FIRST (required for all requests)
    const isValidSignature = verifyXeroSignature(req, signature, webhookKey);
    
    if (!isValidSignature) {
      console.log('❌ Invalid signature - returning 401');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    console.log('✅ Signature verified successfully');

    // HANDLE XERO WEBHOOK VERIFICATION ("Intent to receive")
    if (!events || events.length === 0) {
      console.log('🔐 Xero webhook verification request detected (empty events)');
      console.log('✅ Returning 200 OK for verification');
      return res.status(200).json({
        message: 'Webhook endpoint verified successfully',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📦 Processing ${events.length} event(s)`);

    for (const event of events) {
      console.log(`🔍 Processing event: ${event.eventCategory} - ${event.eventType}`);

      // We only care about invoice updates
      if (event.eventCategory === 'INVOICE' && event.eventType === 'UPDATE') {
        
        const tenantId = event.tenantId;
        const resourceId = event.resourceId; // This is the invoice ID
        
        console.log(`📋 Processing invoice update for tenant: ${tenantId}, invoice: ${resourceId}`);
        
        // Find the connection by tenant ID first
        const connection = await XeroConnection.findOne({
          tenantId,
          isActive: true
        });
        
        if (!connection) {
          console.log('❌ No active connection found for tenant:', tenantId);
          continue;
        }
        
        console.log('✅ Found active connection for tenant');
        
        // Find the user and get valid Xero connection
        const user = await User.findById(connection.userId);
        const validConnection = await getValidXeroConnection(connection.userId);
        
        if (!user || !validConnection) {
          console.log('❌ User or valid connection not found for tenant:', tenantId);
          continue;
        }

        console.log(`✅ Found user: ${user.businessName || user.email}`);

        // Get the updated invoice details from Xero
        await processInvoiceUpdate(user, validConnection, resourceId);
      } else {
        console.log(`⏭️ Skipping event: ${event.eventCategory} - ${event.eventType}`);
      }
    }

    res.status(200).json({ message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// NEW: Stripe webhook handler
const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Stripe webhook signature verified:', event.type);
  } catch (err) {
    console.error('❌ Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('💰 Stripe checkout session completed:', session.id);
        await handleSuccessfulPayment(session);
        break;
      
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('✅ Stripe payment succeeded:', paymentIntent.id);
        break;
      
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('❌ Stripe payment failed:', failedPayment.id);
        break;
      
      default:
        console.log(`⏭️ Unhandled Stripe event type: ${event.type}`);
    }

    res.json({received: true});
  } catch (error) {
    console.error('❌ Stripe webhook handler error:', error);
    res.status(500).json({error: 'Webhook handler failed'});
  }
};

// Function to handle successful Stripe payments
async function handleSuccessfulPayment(session) {
  try {
    const { metadata, amount_total } = session;
    
    // 🔧 FIX: Use correct metadata key names
    const userId = metadata.userId;  // Changed from metadata.user_id
    const smsCredits = parseInt(metadata.smsCredits) || 0;  // Changed from smsCount
    const creditAmount = parseFloat(metadata.creditAmount) || 0;  // Use creditAmount from metadata
    const dollarAmount = amount_total / 100; // Convert cents to dollars

    console.log(`💰 Processing successful payment: ${dollarAmount} for user ${userId}`);
    console.log(`🔍 Metadata debug:`, JSON.stringify(metadata, null, 2));

    // Validate userId exists
    if (!userId) {
      throw new Error('No userId found in metadata');
    }

    // Update user's SMS balance in your database
    const updatedUser = await User.findByIdAndUpdate(
      userId, 
      {
        $inc: { 
          smsBalance: dollarAmount,
        }
      },
      { new: true }
    );
    
    if (!updatedUser) {
      throw new Error(`User not found: ${userId}`);
    }

    console.log(`✅ Successfully added ${dollarAmount} (${smsCredits} SMS credits) to user ${userId}`);
    console.log(`📊 User's new SMS balance: ${updatedUser.smsBalance}`);
    
  } catch (error) {
    console.error('❌ Error handling successful payment:', error);
    throw error;
  }
}

// Function to verify Xero webhook signature
const verifyXeroSignature = (req, signature, webhookKey) => {
  try {
    if (!signature || !webhookKey) {
      console.log('❌ Missing signature or webhook key');
      return false;
    }

    // Use the RAW body string, not the parsed JSON object
    // This is crucial for signature verification
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookKey)
      .update(rawBody, 'utf8')
      .digest('base64');

    console.log('🔐 Signature verification:');
    console.log('   Raw body length:', rawBody.length);
    console.log('   Raw body:', rawBody);
    console.log('   Received:', signature);
    console.log('   Expected:', expectedSignature);

    // Compare signatures using crypto.timingSafeEqual to prevent timing attacks
    const receivedBuffer = Buffer.from(signature, 'base64');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64');

    if (receivedBuffer.length !== expectedBuffer.length) {
      console.log('❌ Signature length mismatch');
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch (error) {
    console.error('❌ Error verifying signature:', error);
    return false;
  }
};

const processInvoiceUpdate = async (user, connection, invoiceId) => {
  try {
    console.log(`🔍 Fetching invoice details for: ${invoiceId}`);

    // Fetch the invoice details from Xero using the valid connection
    const response = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`, {
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'xero-tenant-id': connection.tenantId,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('❌ Failed to fetch invoice:', response.status, response.statusText);
      return;
    }

    const data = await response.json();
    const invoice = data.Invoices[0];

    console.log(`📋 Invoice Status: ${invoice.Status}, Amount Due: ${invoice.AmountDue}`);

    // Check if invoice is paid (Status = 'PAID' and AmountDue = 0)
    if (invoice.Status === 'PAID' && invoice.AmountDue === 0) {
      console.log('💰 Invoice is PAID! Processing review request...');

      // Extract customer phone from invoice
      let customerPhone = extractPhoneFromInvoice(invoice);

      // FALLBACK: Use test phone number if none found
      if (!customerPhone) {
        console.log('📱 No phone found in invoice, using test number...');
        customerPhone = '+61400803880'; // Your test number
      }

      if (customerPhone) {
        console.log(`📱 Sending SMS to: ${customerPhone}`);

        // Extract customer name
        const customerName = invoice.Contact?.Name || 'Valued Customer';

        // Send the SMS with userId parameter for custom template
        const smsResult = await sendReviewRequestSMS(
          customerPhone,
          customerName,
          user.businessName || 'this business',
          user.googleReviewUrl,
          user._id  // 👈 ADD THIS - the userId parameter for custom SMS template
        );

        console.log('✅ SMS sent successfully:', smsResult.sid);

        // 📊 Log this activity in database for Zeus timeline
        const reviewRequest = new ReviewRequest({
          userId: user._id,
          xeroInvoiceId: invoiceId,
          invoiceNumber: invoice.InvoiceNumber,
          customerName: customerName,
          customerEmail: invoice.Contact?.EmailAddress || '',
          customerPhone: customerPhone,
          smsStatus: 'sent',
          emailStatus: 'pending', // Set to pending for now
          twilioSid: smsResult.sid,
          sentAt: new Date()
        });

        await reviewRequest.save();
        console.log('📊 Review request logged to database:', reviewRequest._id);

        // TODO: Implement email sending and update emailStatus

      } else {
        console.log('❌ No phone number found in invoice');
      }
    } else {
      console.log('⏳ Invoice not fully paid yet, skipping SMS');
    }

  } catch (error) {
    console.error('❌ Error processing invoice:', error);

    // 📊 Log failed attempt if we have basic info
    if (invoiceId && user) {
      try {
        const failedRequest = new ReviewRequest({
          userId: user._id,
          xeroInvoiceId: invoiceId,
          invoiceNumber: invoice.InvoiceNumber || 'Unknown',
          customerName: 'Unknown Customer',
          customerEmail: '',
          customerPhone: null,
          smsStatus: 'failed',
          emailStatus: 'pending',
          sentAt: new Date()
        });

        await failedRequest.save();
        console.log('📊 Failed request logged to database');
      } catch (dbError) {
        console.error('❌ Failed to log error to database:', dbError);
      }
    }
  }
};

const extractPhoneFromInvoice = (invoice) => {
  // Try different places where phone might be stored
  const contact = invoice.Contact;

  if (!contact) return null;

  console.log('🔍 Full invoice contact data:', JSON.stringify(contact, null, 2));

  // Check contact phones array
  if (contact.Phones && contact.Phones.length > 0) {
    console.log('📞 Found phones array:', contact.Phones);

    // Look for mobile first, then any phone with proper number construction
    for (const phone of contact.Phones) {
      if (phone.PhoneNumber) {
        console.log('📞 Found phone with components:', phone);

        // Build full international number from components
        let fullNumber = buildFullPhoneNumber(phone);

        if (fullNumber) {
          console.log('📱 Built full number:', fullNumber);
          return fullNumber;
        }
      }
    }
  }

  // Check for direct phone properties (fallback)
  if (contact.Phone) {
    console.log('📞 Found direct phone:', contact.Phone);
    return formatPhoneNumber(contact.Phone);
  }

  if (contact.MobilePhone) {
    console.log('📱 Found mobile phone:', contact.MobilePhone);
    return formatPhoneNumber(contact.MobilePhone);
  }

  // Check addresses for phone numbers
  if (contact.Addresses && contact.Addresses.length > 0) {
    console.log('🏠 Checking addresses for phone numbers...');
    for (const address of contact.Addresses) {
      if (address.Phone) {
        console.log('🏠 Found phone in address:', address.Phone);
        return formatPhoneNumber(address.Phone);
      }
    }
  }

  console.log('❌ No phone number found in any location');
  return null;
};

// Helper function to build full phone number from Xero phone components
const buildFullPhoneNumber = (phone) => {
  if (!phone.PhoneNumber) return null;

  let fullNumber = '';

  // Add country code with + prefix
  if (phone.PhoneCountryCode) {
    fullNumber += `+${phone.PhoneCountryCode}`;
  } else {
    // Default to Australia if no country code
    fullNumber += '+61';
  }

  // Add area code
  if (phone.PhoneAreaCode) {
    fullNumber += phone.PhoneAreaCode;
  }

  // Add the main number
  fullNumber += phone.PhoneNumber;

  console.log(`🔧 Built number: Country(${phone.PhoneCountryCode}) + Area(${phone.PhoneAreaCode}) + Number(${phone.PhoneNumber}) = ${fullNumber}`);

  return fullNumber;
};

// Helper function to format phone numbers that come as single strings
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null;

  // If already has international prefix, return as-is
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }

  // If starts with 0, assume Australian mobile/landline
  if (phoneNumber.startsWith('0')) {
    return `+61${phoneNumber.substring(1)}`;
  }

  // Otherwise assume it's already in national format, add +61
  return `+61${phoneNumber}`;
};

module.exports = {
  handleXeroWebhook,
  handleStripeWebhook  // NEW: Export the Stripe webhook handler
};