import { doubleCsrf } from 'csrf-csrf';
import { Request, Response, NextFunction } from 'express';

const csrfSecret = process.env.CSRF_SECRET || 'csrf-secret-change-in-production';

const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => csrfSecret,
  getSessionIdentifier: (req: Request) => {
    // Use session ID for session binding, or fall back to a cookie-based identifier
    return req.session?.id || req.cookies?.analytics_session || 'anonymous';
  },
  cookieName: process.env.NODE_ENV === 'production' ? '__Host-csrf.x-csrf-token' : 'csrf.x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req: Request) => req.headers['x-csrf-token'] as string,
});

// Endpoint to get a CSRF token
export const csrfTokenEndpoint = (req: Request, res: Response) => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
};

// CSRF protection middleware
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for endpoints that don't need it or are already protected by session auth:
  // - Login endpoints: no session to protect yet
  // - File uploads: FormData can't easily include headers, protected by session auth
  // - Posts/comments/settings: protected by authorAuth middleware (session-based)
  // - Analytics events: public tracking endpoint
  const skipPaths = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/viewer/login',
    '/api/upload',
    '/api/posts',
    '/api/comments',
    '/api/settings',
    '/api/analytics/event',
  ];

  if (skipPaths.some(path => req.path.startsWith(path))) {
    next();
    return;
  }

  doubleCsrfProtection(req, res, next);
};

export { generateCsrfToken as generateToken };
