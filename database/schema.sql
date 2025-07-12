-- AI YouTube Playlist Curator - Phase 1 Database Schema
-- Core tables for authentication and basic playlist management

-- Users and Authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    subscription_tier TEXT DEFAULT 'free',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    gdpr_consent INTEGER DEFAULT 0
);

-- Playlists
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    youtube_id TEXT,
    title TEXT NOT NULL,
    original_description TEXT,
    ai_description TEXT,
    video_count INTEGER DEFAULT 0,
    source_count INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    thumbnail_url TEXT,
    enhanced BOOLEAN DEFAULT FALSE,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- GDPR compliance tracking
CREATE TABLE IF NOT EXISTS gdpr_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    consent_type TEXT NOT NULL,
    granted INTEGER NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON playlists(created_at);
CREATE INDEX IF NOT EXISTS idx_gdpr_user_id ON gdpr_consents(user_id);