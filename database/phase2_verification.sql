-- Phase 2 Migration Verification Script
-- Run this AFTER the migration to verify everything worked
-- Command: wrangler d1 execute playlist-ai-db --file=database/phase2-verification.sql

-- Check if all tables exist
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

-- Check if all indexes were created
SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY tbl_name, name;

-- Check if triggers were created
SELECT name, tbl_name FROM sqlite_master WHERE type='trigger' ORDER BY tbl_name, name;

-- Check table counts (should be 0 for new tables)
SELECT COUNT(*) as playlist_videos_count FROM playlist_videos;
SELECT COUNT(*) as youtube_cache_count FROM youtube_cache;
SELECT COUNT(*) as youtube_quota_count FROM youtube_quota_usage;
SELECT COUNT(*) as youtube_imports_count FROM youtube_imports;

-- Verify table structure for playlist_videos
PRAGMA table_info(playlist_videos);

-- Test that the trigger works by inserting a test record (optional)
-- INSERT INTO playlist_videos (id, playlist_id, youtube_video_id, title, position) 
-- VALUES ('test-1', 'test-playlist', 'test-video', 'Test Video', 1);
-- SELECT video_count FROM playlists WHERE id = 'test-playlist';
-- DELETE FROM playlist_videos WHERE id = 'test-1';