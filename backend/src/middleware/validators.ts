import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

// Middleware to check validation results
export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return;
  }
  next();
};

// Valid post types
const validPostTypes = ['photo', 'text', 'quote', 'link', 'audio', 'video'];

// Valid analytics event types
const validEventTypes = [
  'page_view',
  'post_view',
  'comment_submit',
  'viewer_login',
  'globe_interaction',
  'tag_filter',
];

// Post creation/update validators
export const validateCreatePost = [
  body('post_type')
    .isIn(validPostTypes)
    .withMessage(`post_type must be one of: ${validPostTypes.join(', ')}`),
  body('content')
    .isObject()
    .withMessage('content must be an object'),
  body('latitude')
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('latitude must be between -90 and 90'),
  body('longitude')
    .optional({ nullable: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('longitude must be between -180 and 180'),
  body('location_name')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 500 })
    .withMessage('location_name must be at most 500 characters'),
  body('captured_at')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('captured_at must be a valid ISO 8601 date'),
  body('tags')
    .optional()
    .isArray({ max: 20 })
    .withMessage('tags must be an array with at most 20 items'),
  body('tags.*')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('each tag must be 1-50 characters'),
  body('media')
    .optional()
    .isArray({ max: 50 })
    .withMessage('media must be an array with at most 50 items'),
  validate,
];

export const validateUpdatePost = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid post ID'),
  body('content')
    .optional()
    .isObject()
    .withMessage('content must be an object'),
  body('latitude')
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('latitude must be between -90 and 90'),
  body('longitude')
    .optional({ nullable: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('longitude must be between -180 and 180'),
  body('location_name')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 500 })
    .withMessage('location_name must be at most 500 characters'),
  body('captured_at')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('captured_at must be a valid ISO 8601 date'),
  body('tags')
    .optional()
    .isArray({ max: 20 })
    .withMessage('tags must be an array with at most 20 items'),
  validate,
];

// Comment validators
export const validateCreateComment = [
  param('postId')
    .isInt({ min: 1 })
    .withMessage('Invalid post ID'),
  body('author_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('author_name must be 1-100 characters'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('content must be 1-10000 characters'),
  validate,
];

export const validateEditComment = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid comment ID'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('content must be 1-10000 characters'),
  body('author_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('author_name must be 1-100 characters'),
  validate,
];

// Analytics validators
export const validateAnalyticsEvent = [
  body('event_type')
    .isIn(validEventTypes)
    .withMessage(`event_type must be one of: ${validEventTypes.join(', ')}`),
  body('event_data')
    .optional({ nullable: true })
    .isObject()
    .withMessage('event_data must be an object'),
  body('post_id')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('post_id must be a positive integer'),
  validate,
];

// Auth validators
export const validateViewerLogin = [
  body('password')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Password is required'),
  validate,
];

export const validateAuthorLogin = [
  body('username')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Username is required'),
  body('password')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Password is required'),
  validate,
];

// Settings validators
export const validateUpdateSetting = [
  param('key')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Invalid setting key'),
  body('value')
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Setting value must be at most 1000 characters'),
  validate,
];

// Query validators for pagination
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  validate,
];
