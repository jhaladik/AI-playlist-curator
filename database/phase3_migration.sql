-- Phase 3 Migration Script - AI Enhancement Engine
-- Run this after Phase 2 is deployed
-- Command: wrangler d1 execute playlist-ai-db --file=database/phase3-migration.sql

-- ===== PHASE 3 NEW TABLES =====

-- Enhancement history and tracking
CREATE TABLE IF NOT EXISTS enhancement_history (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    enhancement_type TEXT NOT NULL, -- 'description', 'title', 'categorization'
    original_content TEXT,
    enhanced_content TEXT,
    prompt_used TEXT,
    ai_model TEXT DEFAULT 'gpt-4',
    tokens_used INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    quality_score REAL, -- 0-1 quality rating
    user_rating INTEGER, -- 1-5 user feedback
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'reverted'
    error_message TEXT,
    processing_time_ms INTEGER,
    started_at INTEGER DEFAULT (strftime('%s', 'now')),
    completed_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- AI processing queue for batch operations
CREATE TABLE IF NOT EXISTS ai_processing_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    playlist_id TEXT NOT NULL,
    enhancement_type TEXT NOT NULL,
    priority INTEGER DEFAULT 5, -- 1-10 priority level
    status TEXT DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at INTEGER DEFAULT (strftime('%s', 'now')),
    started_at INTEGER,
    completed_at INTEGER,
    error_message TEXT,
    metadata TEXT, -- JSON with additional processing info
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Content analysis cache
CREATE TABLE IF NOT EXISTS content_analysis (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    analysis_type TEXT NOT NULL, -- 'topics', 'themes', 'difficulty', 'keywords'
    analysis_data TEXT NOT NULL, -- JSON with analysis results
    confidence_score REAL DEFAULT 0.0,
    video_count INTEGER DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, analysis_type)
);

-- AI usage tracking for cost management
CREATE TABLE IF NOT EXISTS ai_usage_tracking (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    model_name TEXT NOT NULL,
    requests_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date, model_name)
);

-- User AI preferences and settings
CREATE TABLE IF NOT EXISTS user_ai_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    enhancement_style TEXT DEFAULT 'educational', -- 'educational', 'concise', 'detailed', 'creative'
    auto_enhance BOOLEAN DEFAULT FALSE,
    max_monthly_cost REAL DEFAULT 10.0, -- USD
    preferred_ai_model TEXT DEFAULT 'gpt-4o-mini',
    language_preference TEXT DEFAULT 'en',
    content_level TEXT DEFAULT 'intermediate', -- 'beginner', 'intermediate', 'advanced'
    include_keywords BOOLEAN DEFAULT TRUE,
    include_learning_objectives BOOLEAN DEFAULT TRUE,
    include_difficulty_assessment BOOLEAN DEFAULT FALSE,
    custom_prompt_additions TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===== INDEXES FOR PERFORMANCE =====

CREATE INDEX IF NOT EXISTS idx_enhancement_history_playlist ON enhancement_history(playlist_id);
CREATE INDEX IF NOT EXISTS idx_enhancement_history_user ON enhancement_history(user_id);
CREATE INDEX IF NOT EXISTS idx_enhancement_history_type ON enhancement_history(enhancement_type);
CREATE INDEX IF NOT EXISTS idx_enhancement_history_status ON enhancement_history(status);
CREATE INDEX IF NOT EXISTS idx_enhancement_history_created ON enhancement_history(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_ai_queue_user ON ai_processing_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_queue_scheduled ON ai_processing_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ai_queue_priority ON ai_processing_queue(priority, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_content_analysis_playlist ON content_analysis(playlist_id);
CREATE INDEX IF NOT EXISTS idx_content_analysis_type ON content_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS idx_content_analysis_expires ON content_analysis(expires_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage_tracking(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage_tracking(date);

-- ===== UPDATE EXISTING TABLES =====

-- Add enhancement-related fields to playlists table if not exists
-- Note: ai_description already exists from Phase 1, so we'll add more fields
ALTER TABLE playlists ADD COLUMN enhancement_status TEXT DEFAULT 'none'; -- 'none', 'pending', 'processing', 'completed', 'failed'
ALTER TABLE playlists ADD COLUMN last_enhanced_at INTEGER;
ALTER TABLE playlists ADD COLUMN enhancement_version INTEGER DEFAULT 0;
ALTER TABLE playlists ADD COLUMN auto_enhance_enabled BOOLEAN DEFAULT FALSE;

-- ===== TRIGGERS FOR AUTO-UPDATING =====

-- Update playlist enhancement status when enhancement completes
CREATE TRIGGER IF NOT EXISTS update_playlist_enhancement_status
AFTER UPDATE ON enhancement_history
WHEN NEW.status = 'completed' AND OLD.status != 'completed'
BEGIN
    UPDATE playlists 
    SET 
        enhancement_status = 'completed',
        last_enhanced_at = NEW.completed_at,
        enhancement_version = enhancement_version + 1,
        updated_at = strftime('%s', 'now')
    WHERE id = NEW.playlist_id;
END;

-- Update AI usage tracking when enhancement completes
CREATE TRIGGER IF NOT EXISTS update_ai_usage_tracking
AFTER INSERT ON enhancement_history
WHEN NEW.status = 'completed'
BEGIN
    INSERT OR REPLACE INTO ai_usage_tracking 
    (id, user_id, date, model_name, requests_count, tokens_used, cost_usd, success_count, error_count, updated_at)
    VALUES (
        COALESCE(
            (SELECT id FROM ai_usage_tracking 
             WHERE user_id = NEW.user_id 
             AND date = date('now') 
             AND model_name = NEW.ai_model),
            lower(hex(randomblob(16)))
        ),
        NEW.user_id,
        date('now'),
        NEW.ai_model,
        COALESCE(
            (SELECT requests_count FROM ai_usage_tracking 
             WHERE user_id = NEW.user_id 
             AND date = date('now') 
             AND model_name = NEW.ai_model), 0
        ) + 1,
        COALESCE(
            (SELECT tokens_used FROM ai_usage_tracking 
             WHERE user_id = NEW.user_id 
             AND date = date('now') 
             AND model_name = NEW.ai_model), 0
        ) + NEW.tokens_used,
        COALESCE(
            (SELECT cost_usd FROM ai_usage_tracking 
             WHERE user_id = NEW.user_id 
             AND date = date('now') 
             AND model_name = NEW.ai_model), 0.0
        ) + NEW.cost_usd,
        COALESCE(
            (SELECT success_count FROM ai_usage_tracking 
             WHERE user_id = NEW.user_id 
             AND date = date('now') 
             AND model_name = NEW.ai_model), 0
        ) + 1,
        COALESCE(
            (SELECT error_count FROM ai_usage_tracking 
             WHERE user_id = NEW.user_id 
             AND date = date('now') 
             AND model_name = NEW.ai_model), 0
        ),
        strftime('%s', 'now')
    );
END;