-- Authors (only 2 accounts, created via setup script)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- All post types stored in one table with JSON content
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  post_type TEXT NOT NULL CHECK (post_type IN ('photo', 'text', 'quote', 'link', 'audio', 'video')),
  content JSON NOT NULL,
  latitude REAL,
  longitude REAL,
  location_name TEXT,
  captured_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Media files (images, audio, video)
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  original_filename TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  exif_data JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tags (many-to-many)
CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);

-- Comments from viewers (moderated)
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  approved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Site settings (viewer password, site title, etc.)
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_captured_at ON posts(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_location ON posts(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);
CREATE INDEX IF NOT EXISTS idx_comments_pending ON comments(approved, created_at) WHERE approved = 0;

-- Analytics/Telemetry events
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  event_data JSON,
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  session_id TEXT,
  user_agent TEXT,
  ip_address TEXT,
  referrer TEXT,
  country TEXT,
  city TEXT,
  country_code TEXT,
  device_type TEXT,
  browser TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_post_id ON analytics_events(post_id);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_country ON analytics_events(country);
CREATE INDEX IF NOT EXISTS idx_analytics_is_bot ON analytics_events(is_bot);
CREATE INDEX IF NOT EXISTS idx_analytics_type_created ON analytics_events(event_type, created_at);

-- Migration: Update posts table CHECK constraint to include all post types
-- This handles existing databases that may have an old constraint
DROP TABLE IF EXISTS posts_new;
CREATE TABLE posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  post_type TEXT NOT NULL CHECK (post_type IN ('photo', 'text', 'quote', 'link', 'audio', 'video')),
  content JSON NOT NULL,
  latitude REAL,
  longitude REAL,
  location_name TEXT,
  captured_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO posts_new SELECT * FROM posts;
DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;
CREATE INDEX IF NOT EXISTS idx_posts_captured_at ON posts(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_location ON posts(latitude, longitude) WHERE latitude IS NOT NULL;

-- Migration: Add geolocation and device columns to analytics_events (for existing databases)
ALTER TABLE analytics_events ADD COLUMN country TEXT;
ALTER TABLE analytics_events ADD COLUMN city TEXT;
ALTER TABLE analytics_events ADD COLUMN country_code TEXT;
ALTER TABLE analytics_events ADD COLUMN device_type TEXT;
ALTER TABLE analytics_events ADD COLUMN browser TEXT;

-- Migration: flag crawler traffic so it can be excluded from reporting
ALTER TABLE analytics_events ADD COLUMN is_bot INTEGER DEFAULT 0;
ALTER TABLE analytics_events ADD COLUMN referrer_host TEXT;
