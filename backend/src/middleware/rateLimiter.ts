import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/index.js';

const isDev = process.env.NODE_ENV !== 'production';

// Check if rate limiting is enabled (from settings)
function isRateLimitingEnabled(): boolean {
  try {
    const db = getDatabase();
    const result = db.exec("SELECT value FROM site_settings WHERE key = 'rate_limiting_enabled'");
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] === 'true';
    }
    // Default to disabled in development, enabled in production
    return !isDev;
  } catch {
    // If database not ready, default to disabled in dev
    return !isDev;
  }
}

// Wrapper to conditionally apply rate limiting
function conditionalRateLimit(limiter: ReturnType<typeof rateLimit>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const enabled = isRateLimitingEnabled();
    if (!enabled) {
      return next();
    }
    return limiter(req, res, next);
  };
}

// Rate limiter for authentication endpoints (login attempts)
// 20 attempts per 15 minutes (increased from 5)
const authLimiterBase = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  validate: { trustProxy: !isDev },
});

// General API rate limiter
// 1000 requests per minute (increased from 100)
const apiLimiterBase = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: !isDev },
});

// Analytics endpoint rate limiter (public endpoint)
// 100 requests per minute (increased from 30)
const analyticsLimiterBase = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many analytics requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: !isDev },
});

// Upload rate limiter
// 50 uploads per minute (increased from 20)
const uploadLimiterBase = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  message: { error: 'Too many uploads, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: !isDev },
});

// Export conditional rate limiters
export const authLimiter = conditionalRateLimit(authLimiterBase);
export const apiLimiter = conditionalRateLimit(apiLimiterBase);
export const analyticsLimiter = conditionalRateLimit(analyticsLimiterBase);
export const uploadLimiter = conditionalRateLimit(uploadLimiterBase);
