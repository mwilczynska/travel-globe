import { Router, Request, Response } from 'express';
import { viewerAuth } from '../middleware/viewerAuth.js';
import { authorAuth } from '../middleware/authorAuth.js';
import { query, run, get } from '../db/index.js';

const router = Router();

interface Post {
  id: number;
  author_id: number;
  post_type: string;
  content: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  captured_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Media {
  id: number;
  post_id: number;
  file_path: string;
  file_type: string;
  original_filename: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  exif_data: string | null;
}

// GET /api/posts - List posts (paginated)
router.get('/', viewerAuth, (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;
    const tag = req.query.tag as string | undefined;
    const type = req.query.type as string | undefined;

    let sql = `
      SELECT p.*, u.display_name as author_name
      FROM posts p
      JOIN users u ON p.author_id = u.id
    `;
    const params: unknown[] = [];

    const conditions: string[] = [];

    if (tag) {
      conditions.push('p.id IN (SELECT post_id FROM post_tags WHERE tag = ?)');
      params.push(tag);
    }

    if (type) {
      conditions.push('p.post_type = ?');
      params.push(type);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY COALESCE(p.captured_at, p.created_at) DESC, p.id DESC';
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const posts = query<Post & { author_name: string }>(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM posts p';
    const countParams: unknown[] = [];

    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
      if (tag) countParams.push(tag);
      if (type) countParams.push(type);
    }

    const countResult = get<{ count: number }>(countSql, countParams);
    const total = countResult?.count || 0;

    // Get media and tags for each post
    const postsWithDetails = posts.map(post => {
      const media = query<Media>(
        'SELECT * FROM media WHERE post_id = ? ORDER BY id',
        [post.id]
      );

      const tags = query<{ tag: string }>(
        'SELECT tag FROM post_tags WHERE post_id = ?',
        [post.id]
      );

      return {
        ...post,
        content: JSON.parse(post.content),
        media: media.map(m => ({
          ...m,
          exif_data: m.exif_data ? JSON.parse(m.exif_data) : null,
        })),
        tags: tags.map(t => t.tag),
      };
    });

    res.json({
      posts: postsWithDetails,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// GET /api/posts/:id - Get single post
router.get('/:id', viewerAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));

    const post = get<Post & { author_name: string }>(
      `SELECT p.*, u.display_name as author_name
       FROM posts p
       JOIN users u ON p.author_id = u.id
       WHERE p.id = ?`,
      [id]
    );

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const media = query<Media>(
      'SELECT * FROM media WHERE post_id = ? ORDER BY id',
      [id]
    );

    const tags = query<{ tag: string }>(
      'SELECT tag FROM post_tags WHERE post_id = ?',
      [id]
    );

    res.json({
      ...post,
      content: JSON.parse(post.content),
      media: media.map(m => ({
        ...m,
        exif_data: m.exif_data ? JSON.parse(m.exif_data) : null,
      })),
      tags: tags.map(t => t.tag),
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// POST /api/posts - Create post
router.post('/', authorAuth, (req: Request, res: Response) => {
  try {
    const {
      post_type,
      content,
      latitude,
      longitude,
      location_name,
      captured_at,
      media,
      tags,
    } = req.body;

    if (!post_type || !content) {
      res.status(400).json({ error: 'post_type and content are required' });
      return;
    }

    const validTypes = ['photo', 'text', 'quote', 'link', 'audio', 'video'];
    if (!validTypes.includes(post_type)) {
      res.status(400).json({ error: 'Invalid post type' });
      return;
    }

    // Insert post
    const result = run(
      `INSERT INTO posts (author_id, post_type, content, latitude, longitude, location_name, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.userId,
        post_type,
        JSON.stringify(content),
        latitude || null,
        longitude || null,
        location_name || null,
        captured_at || null,
      ]
    );

    const postId = result.lastInsertRowid;

    // Insert media files
    if (media && Array.isArray(media)) {
      for (const m of media) {
        run(
          `INSERT INTO media (post_id, file_path, file_type, original_filename, size_bytes, width, height, exif_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            postId,
            m.file_path,
            m.file_type,
            m.original_filename || null,
            m.size_bytes || null,
            m.width || null,
            m.height || null,
            m.exif_data ? JSON.stringify(m.exif_data) : null,
          ]
        );
      }
    }

    // Insert tags
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        if (tag && typeof tag === 'string') {
          run(
            'INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)',
            [postId, tag.toLowerCase().trim()]
          );
        }
      }
    }

    res.status(201).json({ id: postId, message: 'Post created' });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// PUT /api/posts/:id - Update post
router.put('/:id', authorAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const {
      content,
      latitude,
      longitude,
      location_name,
      captured_at,
      tags,
      media,
    } = req.body;

    // Check post exists
    const existing = get<Post>('SELECT * FROM posts WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // Update post
    run(
      `UPDATE posts SET
        content = COALESCE(?, content),
        latitude = ?,
        longitude = ?,
        location_name = ?,
        captured_at = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        content ? JSON.stringify(content) : null,
        latitude !== undefined ? latitude : existing.latitude,
        longitude !== undefined ? longitude : existing.longitude,
        location_name !== undefined ? location_name : existing.location_name,
        captured_at !== undefined ? captured_at : existing.captured_at,
        id,
      ]
    );

    // Update tags if provided
    if (tags && Array.isArray(tags)) {
      run('DELETE FROM post_tags WHERE post_id = ?', [id]);
      for (const tag of tags) {
        if (tag && typeof tag === 'string') {
          run(
            'INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)',
            [id, tag.toLowerCase().trim()]
          );
        }
      }
    }

    // Update media if provided (replace all)
    if (media && Array.isArray(media)) {
      run('DELETE FROM media WHERE post_id = ?', [id]);
      for (const m of media) {
        run(
          `INSERT INTO media (post_id, file_path, file_type, original_filename, size_bytes, width, height, exif_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            m.file_path,
            m.file_type,
            m.original_filename || null,
            m.size_bytes || null,
            m.width || null,
            m.height || null,
            m.exif_data ? JSON.stringify(m.exif_data) : null,
          ]
        );
      }
    }

    res.json({ message: 'Post updated' });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE /api/posts/:id - Delete post
router.delete('/:id', authorAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));

    const existing = get<Post>('SELECT * FROM posts WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // Delete post (cascade will handle media, tags, comments)
    run('DELETE FROM posts WHERE id = ?', [id]);

    res.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// GET /api/tags - List all tags with counts
router.get('/tags/all', viewerAuth, (_req: Request, res: Response) => {
  try {
    const tags = query<{ tag: string; count: number }>(
      `SELECT tag, COUNT(*) as count
       FROM post_tags
       GROUP BY tag
       ORDER BY count DESC, tag ASC`
    );

    res.json({ tags });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// GET /api/globe-data - Get data for the globe visualization
router.get('/globe/data', viewerAuth, (_req: Request, res: Response) => {
  try {
    const posts = query<{
      id: number;
      latitude: number;
      longitude: number;
      location_name: string | null;
      captured_at: string | null;
      created_at: string;
    }>(
      `SELECT id, latitude, longitude, location_name, captured_at, created_at
       FROM posts
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY COALESCE(captured_at, created_at) ASC, id ASC`
    );

    const points = posts.map(p => ({
      id: p.id,
      lat: p.latitude,
      lng: p.longitude,
      label: p.location_name || 'Unknown location',
    }));

    // Create route as array of [lat, lng] pairs in chronological order
    const route = posts.map(p => [p.latitude, p.longitude] as [number, number]);

    res.json({ points, route });
  } catch (error) {
    console.error('Get globe data error:', error);
    res.status(500).json({ error: 'Failed to fetch globe data' });
  }
});

export default router;
