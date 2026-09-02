import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { get, run } from '../db/index.js';

const router = Router();

// Helper to log analytics event with IP
function logAnalyticsEvent(req: Request, eventType: string, eventData?: Record<string, unknown>) {
  try {
    const sessionId = req.cookies?.analytics_session || null;
    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const referrer = req.headers['referer'] || req.headers['referrer'] || null;

    run(
      `INSERT INTO analytics_events (event_type, event_data, post_id, session_id, user_agent, ip_address, referrer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        eventType,
        eventData ? JSON.stringify(eventData) : null,
        null,
        sessionId,
        userAgent,
        ipAddress,
        referrer,
      ]
    );
  } catch (error) {
    console.debug('Analytics logging failed:', error);
  }
}

interface SiteSetting {
  key: string;
  value: string;
}

// POST /api/viewer/login - Verify viewer password
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const setting = get<SiteSetting>(
      'SELECT value FROM site_settings WHERE key = ?',
      ['viewer_password_hash']
    );

    if (!setting) {
      // No viewer password set - allow access (for initial setup)
      req.session.isViewer = true;
      res.json({ success: true, message: 'Access granted' });
      return;
    }

    const isValid = bcrypt.compareSync(password, setting.value);

    if (isValid) {
      req.session.isViewer = true;
      // Log successful viewer login with IP
      logAnalyticsEvent(req, 'viewer_login', { success: true });
      res.json({ success: true, message: 'Access granted' });
    } else {
      // Log failed login attempt with IP
      logAnalyticsEvent(req, 'viewer_login', { success: false });
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (error) {
    console.error('Viewer login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/viewer/check - Check if viewer session is valid
router.get('/check', (req: Request, res: Response) => {
  // Check if viewer password is even set
  const setting = get<SiteSetting>(
    'SELECT value FROM site_settings WHERE key = ?',
    ['viewer_password_hash']
  );

  res.json({
    isViewer: req.session.isViewer || req.session.isAuthor || false,
    isAuthor: req.session.isAuthor || false,
    passwordRequired: !!setting,
  });
});

export default router;
