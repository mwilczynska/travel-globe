import { Request, Response, NextFunction } from 'express';

// Extend session type
declare module 'express-session' {
  interface SessionData {
    isViewer?: boolean;
    isAuthor?: boolean;
    userId?: number;
  }
}

export function viewerAuth(req: Request, res: Response, next: NextFunction): void {
  // Authors are also viewers
  if (req.session.isViewer || req.session.isAuthor) {
    next();
    return;
  }
  res.status(401).json({ error: 'Viewer authentication required' });
}
