import { Router, Request, Response } from 'express';
import { viewerAuth } from '../middleware/viewerAuth.js';
import { authorAuth } from '../middleware/authorAuth.js';
import { query, run, get } from '../db/index.js';
import { sanitizeComment } from '../services/sanitizer.js';

// Helper to log analytics event with IP
function logAnalyticsEvent(req: Request, eventType: string, eventData?: Record<string, unknown>, postId?: number) {
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
        postId || null,
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

const router = Router();

interface Comment {
  id: number;
  post_id: number;
  author_name: string;
  content: string;
  approved: number;
  created_at: string;
}

interface Setting {
  key: string;
  value: string;
}

// Helper to check if moderation is enabled
function isModerationEnabled(): boolean {
  const setting = get<Setting>('SELECT * FROM site_settings WHERE key = ?', ['comment_moderation']);
  // Default is 'off' (no moderation), so only return true if explicitly 'on'
  return setting?.value === 'on';
}

// GET /api/comments/post/:postId - Get approved comments for a post
router.get('/post/:postId', viewerAuth, (req: Request, res: Response) => {
  try {
    const postId = parseInt(String(req.params.postId));

    const comments = query<Comment>(
      `SELECT * FROM comments
       WHERE post_id = ? AND approved = 1
       ORDER BY created_at ASC`,
      [postId]
    );

    res.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/comments/post/:postId - Submit a comment (viewers and authors)
router.post('/post/:postId', viewerAuth, (req: Request, res: Response) => {
  try {
    const postId = parseInt(String(req.params.postId));
    const { author_name, content } = req.body;

    if (!author_name || !content) {
      res.status(400).json({ error: 'author_name and content are required' });
      return;
    }

    // Check if post exists
    const post = get<{ id: number }>('SELECT id FROM posts WHERE id = ?', [postId]);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // Sanitize inputs to prevent XSS
    const sanitized = sanitizeComment(author_name, content);

    // Auto-approve if user is an author, or if moderation is disabled
    const isAuthor = req.session.isAuthor === true;
    const moderationEnabled = isModerationEnabled();
    const shouldApprove = isAuthor || !moderationEnabled;

    const result = run(
      `INSERT INTO comments (post_id, author_name, content, approved)
       VALUES (?, ?, ?, ?)`,
      [postId, sanitized.authorName, sanitized.content, shouldApprove ? 1 : 0]
    );

    const comment = get<Comment>(
      'SELECT * FROM comments WHERE id = ?',
      [result.lastInsertRowid]
    );

    let message = 'Comment posted';
    if (!shouldApprove) {
      message = 'Comment submitted for moderation';
    }

    // Log analytics event with IP address
    logAnalyticsEvent(req, 'comment_submit', {
      post_id: postId,
      author_name: sanitized.authorName,
      approved: shouldApprove,
    }, postId);

    res.status(201).json({ comment, message });
  } catch (error) {
    console.error('Submit comment error:', error);
    res.status(500).json({ error: 'Failed to submit comment' });
  }
});

// GET /api/comments/pending - Get pending comments (authors only)
router.get('/pending', authorAuth, (_req: Request, res: Response) => {
  try {
    const comments = query<Comment & { post_id: number }>(
      `SELECT c.*, p.id as post_id
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       WHERE c.approved = 0
       ORDER BY c.created_at DESC`
    );

    res.json({ comments });
  } catch (error) {
    console.error('Get pending comments error:', error);
    res.status(500).json({ error: 'Failed to fetch pending comments' });
  }
});

// PUT /api/comments/:id/approve - Approve a comment (authors only)
router.put('/:id/approve', authorAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));

    const existing = get<Comment>('SELECT * FROM comments WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    run('UPDATE comments SET approved = 1 WHERE id = ?', [id]);

    res.json({ success: true, message: 'Comment approved' });
  } catch (error) {
    console.error('Approve comment error:', error);
    res.status(500).json({ error: 'Failed to approve comment' });
  }
});

// DELETE /api/comments/:id - Delete a comment (authors only)
router.delete('/:id', authorAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));

    const existing = get<Comment>('SELECT * FROM comments WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    run('DELETE FROM comments WHERE id = ?', [id]);

    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// PUT /api/comments/:id - Edit a comment (authors only)
router.put('/:id', authorAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { content, author_name } = req.body;

    const existing = get<Comment>('SELECT * FROM comments WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    // Sanitize inputs to prevent XSS
    const sanitized = sanitizeComment(author_name || existing.author_name, content);

    // Update comment - allow editing content and optionally author_name
    const updates: string[] = ['content = ?'];
    const values: (string | number)[] = [sanitized.content];

    if (author_name !== undefined) {
      updates.push('author_name = ?');
      values.push(sanitized.authorName);
    }

    values.push(id);

    run(`UPDATE comments SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = get<Comment>('SELECT * FROM comments WHERE id = ?', [id]);

    res.json({ success: true, comment: updated });
  } catch (error) {
    console.error('Edit comment error:', error);
    res.status(500).json({ error: 'Failed to edit comment' });
  }
});

// GET /api/comments/all - Get all comments (authors only, for moderation)
router.get('/all', authorAuth, (_req: Request, res: Response) => {
  try {
    const comments = query<Comment & { post_title?: string }>(
      `SELECT c.*,
              CASE
                WHEN p.post_type = 'photo' THEN json_extract(p.content, '$.caption')
                WHEN p.post_type = 'text' THEN json_extract(p.content, '$.title')
                ELSE 'Post #' || p.id
              END as post_title
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       ORDER BY c.created_at DESC`
    );

    res.json({ comments });
  } catch (error) {
    console.error('Get all comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

export default router;
