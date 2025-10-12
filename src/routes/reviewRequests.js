const express = require('express');
const ReviewRequest = require('../models/ReviewRequest');
const authMiddleware = require('../middleware/auth');
const { paginationValidation, handleValidationErrors } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Get all review requests for the authenticated user
router.get('/', 
  authMiddleware, 
  paginationValidation, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const reviewRequests = await ReviewRequest.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await ReviewRequest.countDocuments({ userId: req.user._id });

      res.json({
        success: true,
        data: reviewRequests,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      logger.error('Get review requests error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch review requests'
      });
    }
  }
);

// Get a specific review request
router.get('/:id', 
  authMiddleware, 
  async (req, res) => {
    try {
      const reviewRequest = await ReviewRequest.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!reviewRequest) {
        return res.status(404).json({
          success: false,
          message: 'Review request not found'
        });
      }

      res.json({
        success: true,
        data: reviewRequest
      });

    } catch (error) {
      logger.error('Get review request error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch review request'
      });
    }
  }
);

// Update review request status (for manual testing)
router.patch('/:id/status', 
  authMiddleware, 
  async (req, res) => {
    try {
      const { smsStatus, emailStatus } = req.body;
      
      const reviewRequest = await ReviewRequest.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { 
          ...(smsStatus && { smsStatus }),
          ...(emailStatus && { emailStatus })
        },
        { new: true }
      );

      if (!reviewRequest) {
        return res.status(404).json({
          success: false,
          message: 'Review request not found'
        });
      }

      res.json({
        success: true,
        data: reviewRequest,
        message: 'Status updated successfully'
      });

    } catch (error) {
      logger.error('Update review request status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update status'
      });
    }
  }
);

// Delete a review request
router.delete('/:id', 
  authMiddleware, 
  async (req, res) => {
    try {
      const reviewRequest = await ReviewRequest.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!reviewRequest) {
        return res.status(404).json({
          success: false,
          message: 'Review request not found'
        });
      }

      res.json({
        success: true,
        message: 'Review request deleted successfully'
      });

    } catch (error) {
      logger.error('Delete review request error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete review request'
      });
    }
  }
);

// Get review request statistics
router.get('/stats/summary', 
  authMiddleware, 
  async (req, res) => {
    try {
      const stats = await ReviewRequest.aggregate([
        { $match: { userId: req.user._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            smsSent: { $sum: { $cond: [{ $eq: ['$smsStatus', 'sent'] }, 1, 0] } },
            smsDelivered: { $sum: { $cond: [{ $eq: ['$smsStatus', 'delivered'] }, 1, 0] } },
            smsFailed: { $sum: { $cond: [{ $eq: ['$smsStatus', 'failed'] }, 1, 0] } },
            emailSent: { $sum: { $cond: [{ $eq: ['$emailStatus', 'sent'] }, 1, 0] } },
            emailDelivered: { $sum: { $cond: [{ $eq: ['$emailStatus', 'delivered'] }, 1, 0] } },
            emailFailed: { $sum: { $cond: [{ $eq: ['$emailStatus', 'failed'] }, 1, 0] } }
          }
        }
      ]);

      const result = stats[0] || {
        total: 0,
        smsSent: 0,
        smsDelivered: 0,
        smsFailed: 0,
        emailSent: 0,
        emailDelivered: 0,
        emailFailed: 0
      };

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Get review request stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics'
      });
    }
  }
);

module.exports = router;