const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// User registration validation
const registerValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

// User login validation
const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Profile update validation
const profileUpdateValidation = [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
];

// Review request validation
const reviewRequestValidation = [
  body('clientName').notEmpty().withMessage('Client name is required'),
  body('clientEmail').isEmail().withMessage('Valid client email is required'),
  body('servicePerformed').notEmpty().withMessage('Service performed is required'),
];

// Xero webhook validation
const webhookValidation = [
  body('events').isArray().withMessage('Events must be an array'),
  body('events.*.eventType')
    .notEmpty()
    .withMessage('Event type is required for each event'),
  body('events.*.resourceId')
    .notEmpty()
    .withMessage('Resource ID is required for each event'),
];

// URL param validation (e.g., /:id)
const idParamValidation = [
  param('id').isMongoId().withMessage('Invalid ID format'),
];

// Google Place ID validation
const placeIdValidation = [
  query('placeId').notEmpty().withMessage('Place ID is required'),
];

// Pagination validation
const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
];

// Date range validation
const dateRangeValidation = [
  query('startDate').isISO8601().withMessage('Start date must be in ISO 8601 format'),
  query('endDate').isISO8601().withMessage('End date must be in ISO 8601 format'),
];

// Generic error handler for validations
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    logger.warn('Validation errors:', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  next();
};

module.exports = {
  registerValidation,
  loginValidation,
  profileUpdateValidation,
  reviewRequestValidation,
  webhookValidation,
  idParamValidation,
  placeIdValidation,
  paginationValidation,
  dateRangeValidation,
  handleValidationErrors,
};