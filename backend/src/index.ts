import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import path from 'path';
import dotenv from 'dotenv';
import { initializeDatabase } from './db/index.js';
import authRoutes from './routes/auth.js';
import viewerRoutes from './routes/viewer.js';
import postsRoutes from './routes/posts.js';
import uploadRoutes from './routes/upload.js';
import geocodingRoutes from './routes/geocoding.js';
import commentsRoutes from './routes/comments.js';
import analyticsRoutes from './routes/analytics.js';
import settingsRoutes from './routes/settings.js';
import cookieParser from 'cookie-parser';
import { apiLimiter, authLimiter, analyticsLimiter, uploadLimiter } from './middleware/rateLimiter.js';
import { csrfProtection, csrfTokenEndpoint } from './middleware/csrf.js';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for getting real client IP behind reverse proxy
// In production (behind nginx/reverse proxy), trust 1 hop
// In development, disable to avoid rate limiter validation errors
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Cookie parsing (for analytics sessions)
app.use(cookieParser());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// Serve uploaded files
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// CSRF token endpoint (must be before CSRF protection)
app.get('/api/csrf-token', csrfTokenEndpoint);

// Apply CSRF protection to all state-changing requests
app.use(csrfProtection);

// Apply general API rate limiter
app.use('/api', apiLimiter);

// Routes with specific rate limiters
// Note: authLimiter only applies to login endpoints, not session checks
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/viewer/login', authLimiter);
app.use('/api/viewer', viewerRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/geocoding', geocodingRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/analytics', analyticsLimiter, analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// Custom error class for application errors
class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Error handling middleware
app.use((err: Error & { statusCode?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Log error details (but not in production for security)
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error:', err);
  } else {
    console.error('Error:', err.message);
  }

  // Handle CSRF errors
  if (err.code === 'EBADCSRFTOKEN' || err.message.includes('csrf')) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    res.status(400).json({ error: err.message });
    return;
  }

  // Handle known application errors
  if (err instanceof AppError || err.statusCode) {
    res.status(err.statusCode || 500).json({ error: err.message });
    return;
  }

  // Handle file size errors from multer
  if (err.message.includes('File too large')) {
    res.status(413).json({ error: 'File size exceeds the limit' });
    return;
  }

  // Default error response
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

export { AppError };

// Start server after database initialization
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
