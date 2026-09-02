import { Request, Response, NextFunction } from 'express';

export function authorAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.isAuthor && req.session.userId) {
    next();
    return;
  }
  res.status(401).json({ error: 'Author authentication required' });
}
