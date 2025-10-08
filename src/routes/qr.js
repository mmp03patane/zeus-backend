// src/routes/qr.js
const express = require('express');
const router = express.Router();
const QRCode = require('../models/QRCode');
const { authenticate } = require('../middleware/auth');

// ============================================
// PUBLIC ROUTES (No authentication needed)
// ============================================

// Main QR redirect route - This is what the QR code points to
router.get('/r/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const qrCode = await QRCode.findOne({ slug });
    
    if (!qrCode) {
      return res.status(404).send('QR code not found. Please contact Zeus Reviews.');
    }
    
    // Record the scan (async, don't wait)
    qrCode.recordScan().catch(err => console.error('Error recording scan:', err));
    
    if (qrCode.status === 'unassigned') {
      // First time scan - redirect to claim page
      return res.redirect(`/claim/${slug}`);
    } else {
      // Already assigned - redirect to Google review page
      return res.redirect(qrCode.reviewUrl);
    }
    
  } catch (error) {
    console.error('QR redirect error:', error);
    res.status(500).send('Server error. Please try again.');
  }
});

// Claim page route - Shows the React component
router.get('/claim/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const qrCode = await QRCode.findOne({ slug });
    
    if (!qrCode) {
      return res.status(404).send('QR code not found.');
    }
    
    if (qrCode.status === 'assigned') {
      // Already claimed, redirect to review page
      return res.redirect(qrCode.reviewUrl);
    }
    
    // In production, you'd render your React claim page here
    // For now, send the slug so frontend knows what to claim
    res.json({
      slug,
      message: 'QR code is available to claim',
      url: qrCode.url
    });
    
    // OR if you're serving the React app from Express:
    // res.sendFile(path.join(__dirname, '../../client/build/index.html'));
    
  } catch (error) {
    console.error('Claim page error:', error);
    res.status(500).send('Server error.');
  }
});

// Process claim - Business claims the QR code
router.post('/api/claim/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { businessName, placeId, reviewUrl, address } = req.body;
    
    // Validate required fields
    if (!businessName || !reviewUrl) {
      return res.status(400).json({ 
        error: 'Business name and review URL are required' 
      });
    }
    
    // Find QR code
    const qrCode = await QRCode.findOne({ slug });
    
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    if (qrCode.status === 'assigned') {
      return res.status(400).json({ 
        error: 'QR code already claimed by another business' 
      });
    }
    
    // Claim the QR code
    await qrCode.claim({
      businessName,
      placeId,
      reviewUrl,
      address
    });
    
    res.json({
      success: true,
      message: 'QR code claimed successfully',
      qrCode: {
        slug: qrCode.slug,
        businessName: qrCode.businessName,
        reviewUrl: qrCode.reviewUrl
      }
    });
    
  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({ error: 'Server error during claim process' });
  }
});

// Get QR status (public - useful for checking before claim)
router.get('/api/qr/:slug/status', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const qrCode = await QRCode.findOne({ slug }).select('slug status businessName');
    
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    res.json({
      slug: qrCode.slug,
      status: qrCode.status,
      businessName: qrCode.businessName || null
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// ADMIN ROUTES (Authentication required)
// ============================================

// Bulk import QR codes from JSON
router.post('/api/admin/qr/import', authenticate, async (req, res) => {
  try {
    const { qrCodes } = req.body;
    
    if (!Array.isArray(qrCodes)) {
      return res.status(400).json({ error: 'qrCodes must be an array' });
    }
    
    // Insert all QR codes (ignore duplicates)
    const result = await QRCode.insertMany(qrCodes, { ordered: false })
      .catch(err => {
        // Some might be duplicates, that's okay
        if (err.code === 11000) {
          return { insertedCount: err.result.nInserted };
        }
        throw err;
      });
    
    res.json({
      success: true,
      imported: result.insertedCount || qrCodes.length,
      message: `Successfully imported ${result.insertedCount || qrCodes.length} QR codes`
    });
    
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Server error during import' });
  }
});

// Get analytics
router.get('/api/admin/qr/analytics', authenticate, async (req, res) => {
  try {
    const analytics = await QRCode.getAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// List all QR codes (with pagination)
router.get('/api/admin/qr', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status; // Filter by status if provided
    
    const query = status ? { status } : {};
    
    const qrCodes = await QRCode.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select('-__v');
    
    const total = await QRCode.countDocuments(query);
    
    res.json({
      qrCodes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unclaim a QR code (for testing)
router.delete('/api/admin/qr/:slug/claim', authenticate, async (req, res) => {
  try {
    const { slug } = req.params;
    
    const qrCode = await QRCode.findOne({ slug });
    
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    await qrCode.unclaim();
    
    res.json({
      success: true,
      message: 'QR code unclaimed successfully',
      slug: qrCode.slug
    });
    
  } catch (error) {
    console.error('Unclaim error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific QR code details
router.get('/api/admin/qr/:slug', authenticate, async (req, res) => {
  try {
    const { slug } = req.params;
    
    const qrCode = await QRCode.findOne({ slug }).select('-__v');
    
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    res.json(qrCode);
    
  } catch (error) {
    console.error('Get QR error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;