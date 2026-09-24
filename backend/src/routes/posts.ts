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

// The feed's sort key. Cursor comparisons must use exactly this expression, or
// a page boundary would skip or repeat posts.
const FEED_KEY = 'COALESCE(p.captured_at, p.created_at)';

type CursorMode = 'at' | 'before' | 'after';

// For each cursor mode: the side of the cursor the page comes from, the scan
// order, and the opposite side (only used to report whether posts exist there).
// `at` includes the cursor post itself, so the feed can start from it.
const CURSOR_MODES: Record<CursorMode, { side: string; order: 'ASC' | 'DESC'; opposite: string }> = {
  at: { side: '<=', order: 'DESC', opposite: '>' },
  before: { side: '<', order: 'DESC', opposite: '>=' },
  after: { side: '>', order: 'ASC', opposite: '<=' },
};

function withDetails(post: Post & { author_name: string }) {
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
}

// GET /api/posts - List posts, newest first.
// Paginate by `page`, or by cursor: `at=<id>` (that post and older), `before=<id>`
// (older than it) or `after=<id>` (newer than it). A cursor lets the feed open at
// any post in one request, however far back it is.
router.get('/', viewerAuth, (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;
    const tag = req.query.tag as string | undefined;
    const type = req.query.type as string | undefined;

    const selectSql = `
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

    const where = (extra: string[] = []) => {
      const all = [...conditions, ...extra];
      return all.length > 0 ? ' WHERE ' + all.join(' AND ') : '';
    };

    const cursorMode = (Object.keys(CURSOR_MODES) as CursorMode[]).find(
      mode => req.query[mode] !== undefined
    );

    if (cursorMode) {
      const cursorId = Number(req.query[cursorMode]);
      if (!Number.isInteger(cursorId)) {
        res.status(400).json({ error: 'Invalid cursor' });
        return;
      }

      const cursor = get<{ sort_key: string }>(
        'SELECT COALESCE(captured_at, created_at) AS sort_key FROM posts WHERE id = ?',
        [cursorId]
      );
      if (!cursor) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      const { side, order, opposite } = CURSOR_MODES[cursorMode];
      const compare = (op: string) => `(${FEED_KEY}, p.id) ${op} (?, ?)`;
      const cursorParams = [cursor.sort_key, cursorId];

      // One extra row says whether there is more beyond this page.
      const rows = query<Post & { author_name: string }>(
        selectSql + where([compare(side)]) +
          ` ORDER BY ${FEED_KEY} ${order}, p.id ${order} LIMIT ?`,
        [...params, ...cursorParams, limit + 1]
      );
      const moreThisWay = rows.length > limit;
      const pagePosts = rows.slice(0, limit);
      if (order === 'ASC') pagePosts.reverse();

      const moreOtherWay = !!get(
        'SELECT 1 AS found FROM posts p' + where([compare(opposite)]) + ' LIMIT 1',
        [...params, ...cursorParams]
      );

      res.json({
        posts: pagePosts.map(withDetails),
        hasOlder: cursorMode === 'after' ? moreOtherWay : moreThisWay,
        hasNewer: cursorMode === 'after' ? moreThisWay : moreOtherWay,
      });
      return;
    }

    const posts = query<Post & { author_name: string }>(
      selectSql + where() + ` ORDER BY ${FEED_KEY} DESC, p.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const countResult = get<{ count: number }>(
      'SELECT COUNT(*) as count FROM posts p' + where(),
      params
    );
    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit);

    res.json({
      posts: posts.map(withDetails),
      total,
      page,
      totalPages,
      hasOlder: page < totalPages,
      hasNewer: page > 1,
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

// Card title for the mobile map-mode carousel, capped so a long caption doesn't
// bloat the globe payload.
function cardTitle(content: Record<string, unknown>): string | null {
  for (const field of [content.title, content.caption]) {
    if (typeof field === 'string' && field.trim()) return field.trim().slice(0, 100);
  }
  return null;
}

// Card image for the carousel: the post's first photo or video, else a link
// post's preview image. Audio files are skipped, as they can't be shown as an image.
// Uploads store images as plain 'image' but video and audio as MIME types.
function cardThumbnail(
  media: { file_path: string; file_type: string } | undefined,
  content: Record<string, unknown>
): { thumbnail: string | null; thumbnail_is_video: boolean } {
  if (media && !media.file_type.startsWith('audio')) {
    return {
      thumbnail: `/uploads/${media.file_path}`,
      thumbnail_is_video: media.file_type.startsWith('video'),
    };
  }
  const thumb = content.thumbnail;
  if (typeof thumb === 'string' && thumb) {
    const url = thumb.startsWith('http') || thumb.startsWith('/uploads/') ? thumb : `/uploads/${thumb}`;
    return { thumbnail: url, thumbnail_is_video: false };
  }
  return { thumbnail: null, thumbnail_is_video: false };
}

// GET /api/globe-data - Get data for the globe visualization
// Every located post is listed, with enough to draw its carousel card, so map
// mode needs no posts requests of its own.
router.get('/globe/data', viewerAuth, (_req: Request, res: Response) => {
  try {
    const posts = query<{
      id: number;
      latitude: number;
      longitude: number;
      location_name: string | null;
      post_type: string;
      content: string;
    }>(
      `SELECT id, latitude, longitude, location_name, post_type, content
       FROM posts
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY COALESCE(captured_at, created_at) ASC, id ASC`
    );

    // First media item per post, in one query rather than one per post.
    const firstMedia = new Map(
      query<{ post_id: number; file_path: string; file_type: string }>(
        `SELECT post_id, file_path, file_type FROM media
         WHERE id IN (SELECT MIN(id) FROM media GROUP BY post_id)`
      ).map(m => [m.post_id, m])
    );

    const points = posts.map(p => {
      let content: Record<string, unknown> = {};
      try {
        content = JSON.parse(p.content);
      } catch {
        // A malformed post shouldn't take the whole globe down.
      }
      return {
        id: p.id,
        lat: p.latitude,
        lng: p.longitude,
        label: p.location_name || 'Unknown location',
        post_type: p.post_type,
        title: cardTitle(content),
        ...cardThumbnail(firstMedia.get(p.id), content),
      };
    });

    // Create route as array of [lat, lng] pairs in chronological order
    const route = posts.map(p => [p.latitude, p.longitude] as [number, number]);

    res.json({ points, route });
  } catch (error) {
    console.error('Get globe data error:', error);
    res.status(500).json({ error: 'Failed to fetch globe data' });
  }
});

export default router;
