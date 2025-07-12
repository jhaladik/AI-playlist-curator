-- Phase 2 Migration Script - FIXED VERSION
-- Run this after Phase 1 is deployed
-- Command: wrangler d1 execute playlist-ai-db --file=database/phase2-migration-fixed.sql

-- ===== PHASE 2 NEW TABLES =====

-- Videos within playlists
CREATE TABLE IF NOT EXISTS playlist_videos (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_name TEXT,
    channel_id TEXT,
    duration TEXT,
    thumbnail_url TEXT,
    description TEXT,
    published_at TEXT,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    added_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, youtube_video_id)
);

-- YouTube API response cache
CREATE TABLE IF NOT EXISTS youtube_cache (
    id TEXT PRIMARY KEY,
    cache_key TEXT UNIQUE NOT NULL,
    cache_type TEXT NOT NULL,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    accessed_count INTEGER DEFAULT 0,
    last_accessed INTEGER DEFAULT (strftime('%s', 'now'))
);

-- YouTube API quota tracking
CREATE TABLE IF NOT EXISTS youtube_quota_usage (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    quota_used INTEGER DEFAULT 0,
    requests_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(date)
);

-- YouTube import history
CREATE TABLE IF NOT EXISTS youtube_imports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    playlist_id TEXT,
    youtube_playlist_id TEXT,
    youtube_playlist_url TEXT,
    status TEXT NOT NULL,
    videos_imported INTEGER DEFAULT 0,
    total_videos INTEGER DEFAULT 0,
    error_message TEXT,
    started_at INTEGER DEFAULT (strftime('%s', 'now')),
    completed_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
);

-- ===== INDEXES FOR PERFORMANCE =====

CREATE INDEX IF NOT EXISTS idx_playlist_videos_playlist_id ON playlist_videos(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_videos_youtube_id ON playlist_videos(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_playlist_videos_position ON playlist_videos(playlist_id, position);

CREATE INDEX IF NOT EXISTS idx_youtube_cache_key ON youtube_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_youtube_cache_type ON youtube_cache(cache_type);
CREATE INDEX IF NOT EXISTS idx_youtube_cache_expires ON youtube_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_youtube_quota_date ON youtube_quota_usage(date);

CREATE INDEX IF NOT EXISTS idx_youtube_imports_user ON youtube_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_imports_status ON youtube_imports(status);
CREATE INDEX IF NOT EXISTS idx_youtube_imports_started ON youtube_imports(started_at);

-- ===== TRIGGERS FOR AUTO-UPDATING COUNTS =====

CREATE TRIGGER IF NOT EXISTS update_playlist_video_count_insert
AFTER INSERT ON playlist_videos
BEGIN
    UPDATE playlists 
    SET video_count = (
        SELECT COUNT(*) FROM playlist_videos WHERE playlist_id = NEW.playlist_id
    ),
    updated_at = strftime('%s', 'now')
    WHERE id = NEW.playlist_id;
END;

CREATE TRIGGER IF NOT EXISTS update_playlist_video_count_delete
AFTER DELETE ON playlist_videos
BEGIN
    UPDATE playlists 
    SET video_count = (
        SELECT COUNT(*) FROM playlist_videos WHERE playlist_id = OLD.playlist_id
    ),
    updated_at = strftime('%s', 'now')
    WHERE id = OLD.playlist_id;
END;