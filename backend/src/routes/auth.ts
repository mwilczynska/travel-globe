import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { get } from '../db/index.js';
import { authorAuth } from '../middleware/authorAuth.js';

const router = Router();

interface User {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  created_at: string;
}

// POST /api/auth/login - Author login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = get<User>(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);

    if (isValid) {
      req.session.isAuthor = true;
      req.session.isViewer = true; // Authors are also viewers
      req.session.userId = user.id;

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        },
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Auth login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout - Author logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    res.json({ success: true, message: 'Logged out' });
  });
});

// GET /api/auth/me - Get current author info
router.get('/me', authorAuth, (req: Request, res: Response) => {
  const user = get<User>(
    'SELECT id, username, display_name, created_at FROM users WHERE id = ?',
    [req.session.userId]
  );

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    created_at: user.created_at,
  });
});

export default router;
