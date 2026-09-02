import { Router, Request, Response } from 'express';
import { authorAuth } from '../middleware/authorAuth.js';
import { get, run } from '../db/index.js';

const router = Router();

interface Setting {
  key: string;
  value: string;
}

// GET /api/settings/:key - Get a setting value
router.get('/:key', authorAuth, (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);

    const setting = get<Setting>('SELECT * FROM site_settings WHERE key = ?', [key]);

    if (!setting) {
      // Return default values for known settings
      const defaults: Record<string, string> = {
        'comment_moderation': 'off', // off = no pre-approval required
      };

      res.json({ key, value: defaults[key] || null });
      return;
    }

    res.json({ key: setting.key, value: setting.value });
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// PUT /api/settings/:key - Update a setting value
router.put('/:key', authorAuth, (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    const { value } = req.body;

    if (value === undefined) {
      res.status(400).json({ error: 'value is required' });
      return;
    }

    // Validate known settings
    const validSettings: Record<string, string[]> = {
      'comment_moderation': ['on', 'off'],
    };

    if (validSettings[key] && !validSettings[key].includes(value)) {
      res.status(400).json({ error: `Invalid value for ${key}. Must be one of: ${validSettings[key].join(', ')}` });
      return;
    }

    // Upsert the setting
    const existing = get<Setting>('SELECT * FROM site_settings WHERE key = ?', [key]);

    if (existing) {
      run('UPDATE site_settings SET value = ? WHERE key = ?', [value, key]);
    } else {
      run('INSERT INTO site_settings (key, value) VALUES (?, ?)', [key, value]);
    }

    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

export default router;
