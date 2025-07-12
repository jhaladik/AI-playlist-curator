// src/workers/youtube-worker.js - YouTube integration and video management worker

import { YouTubeAPI, ValidationUtils } from '../utils/youtube-api.js';
import { 
  YouTubeValidator, 
  PlaylistValidator, 
  VideoValidator,
  RequestValidator,
  Sanitizer 
} from '../utils/validation.js';
import { extractUserFromToken } from '../utils/auth-utils.js';
import { PlaylistDB, handleDBError } from '../utils/db-utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS handling
    if (request.method === 'OPTIONS') {
      return jsonResponse(null, 200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Max-Age': '86400'
      });
    }
    
    try {
      // Initialize YouTube API client
      if (!env.YOUTUBE_API_KEY) {
        return jsonResponse({ error: 'YouTube API not configured' }, 503);
      }
      
      const youtubeAPI = new YouTubeAPI(env.YOUTUBE_API_KEY, env.DB, env.CACHE);
      
      // Import playlist endpoint
      if (url.pathname === '/api/import' && request.method === 'POST') {
        return await handleImportPlaylist(request, env, youtubeAPI);
      }
      
      // Get playlist videos
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos$/) && request.method === 'GET') {
        const playlistId = url.pathname.split('/')[3];
        return await handleGetPlaylistVideos(request, env, playlistId);
      }
      
      // Add video to playlist
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos$/) && request.method === 'POST') {
        const playlistId = url.pathname.split('/')[3];
        return await handleAddVideoToPlaylist(request, env, youtubeAPI, playlistId);
      }
      
      // Remove video from playlist
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos\/[^\/]+$/) && request.method === 'DELETE') {
        const parts = url.pathname.split('/');
        const playlistId = parts[3];
        const videoId = parts[5];
        return await handleRemoveVideoFromPlaylist(request, env, playlistId, videoId);
      }
      
      // Update video position in playlist
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos\/[^\/]+\/position$/) && request.method === 'PUT') {
        const parts = url.pathname.split('/');
        const playlistId = parts[3];
        const videoId = parts[5];
        return await handleUpdateVideoPosition(request, env, playlistId, videoId);
      }
      
      // Get YouTube quota usage
      if (url.pathname === '/api/youtube/quota' && request.method === 'GET') {
        return await handleGetQuotaUsage(request, env, youtubeAPI);
      }
      
      // Import status check
      if (url.pathname.match(/^\/api\/imports\/[^\/]+$/) && request.method === 'GET') {
        const importId = url.pathname.split('/')[3];
        return await handleGetImportStatus(request, env, importId);
      }
      
      return jsonResponse({ error: 'Not found' }, 404);
      
    } catch (error) {
      console.error('YouTube worker error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  }
};

/**
 * Handle playlist import from YouTube
 */
async function handleImportPlaylist(request, env, youtubeAPI) {
  try {
    // Authenticate user
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Validate request
    const validation = await RequestValidator.validateImportRequest(request);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400);
    }
    
    const { playlistId, originalUrl, options } = validation.data;
    
    // Create import record
    const importId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO youtube_imports 
      (id, user_id, youtube_playlist_id, youtube_playlist_url, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(importId, userData.userId, playlistId, originalUrl).run();
    
    try {
      // Import playlist data
      const importResult = await youtubeAPI.importPlaylist(playlistId, options.maxVideos);
      
      // Sanitize playlist data
      const sanitizedPlaylist = ValidationUtils.sanitizePlaylistData(importResult.playlist);
      
      // Use custom title/description if provided
      if (options.customTitle) {
        sanitizedPlaylist.title = options.customTitle;
      }
      if (options.customDescription) {
        sanitizedPlaylist.description = options.customDescription;
      }
      
      // Create playlist record
      const newPlaylistId = crypto.randomUUID();
      const playlistCreateResult = await PlaylistDB.create(env.DB, {
        id: newPlaylistId,
        userId: userData.userId,
        title: sanitizedPlaylist.title,
        originalDescription: sanitizedPlaylist.description,
        youtubeId: playlistId,
        thumbnailUrl: sanitizedPlaylist.thumbnailUrl
      });
      
      if (!playlistCreateResult.success) {
        throw new Error('Failed to create playlist record');
      }
      
      // Insert videos
      let importedCount = 0;
      for (const video of importResult.videos) {
        try {
          const sanitizedVideo = ValidationUtils.sanitizeVideoData(video);
          const videoRecordId = crypto.randomUUID();
          
          await env.DB.prepare(`
            INSERT INTO playlist_videos 
            (id, playlist_id, youtube_video_id, title, channel_name, channel_id, 
             duration, thumbnail_url, description, published_at, view_count, 
             like_count, position)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            videoRecordId, newPlaylistId, video.id, sanitizedVideo.title,
            sanitizedVideo.channelTitle, sanitizedVideo.channelId,
            sanitizedVideo.duration, sanitizedVideo.thumbnailUrl,
            sanitizedVideo.description, sanitizedVideo.publishedAt,
            sanitizedVideo.viewCount, sanitizedVideo.likeCount,
            sanitizedVideo.position
          ).run();
          
          importedCount++;
        } catch (videoError) {
          console.error(`Failed to import video ${video.id}:`, videoError);
          // Continue with other videos
        }
      }
      
      // Update import record
      await env.DB.prepare(`
        UPDATE youtube_imports 
        SET playlist_id = ?, status = 'completed', videos_imported = ?, 
            total_videos = ?, completed_at = strftime('%s', 'now')
        WHERE id = ?
      `).bind(newPlaylistId, importedCount, importResult.videos.length, importId).run();
      
      // Get the created playlist
      const createdPlaylist = await PlaylistDB.findById(env.DB, newPlaylistId);
      
      return jsonResponse({
        success: true,
        import: {
          id: importId,
          status: 'completed',
          videosImported: importedCount,
          totalVideos: importResult.videos.length
        },
        playlist: {
          id: createdPlaylist.id,
          title: createdPlaylist.title,
          originalDescription: createdPlaylist.original_description,
          videoCount: importedCount,
          youtubeId: createdPlaylist.youtube_id,
          thumbnailUrl: createdPlaylist.thumbnail_url,
          createdAt: createdPlaylist.created_at
        }
      }, 201);
      
    } catch (importError) {
      // Update import record with error
      await env.DB.prepare(`
        UPDATE youtube_imports 
        SET status = 'failed', error_message = ?, completed_at = strftime('%s', 'now')
        WHERE id = ?
      `).bind(importError.message, importId).run();
      
      throw importError;
    }
    
  } catch (error) {
    console.error('Import error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ 
      error: `Import failed: ${error.message}` 
    }, 500);
  }
}

/**
 * Get videos for a specific playlist
 */
async function handleGetPlaylistVideos(request, env, playlistId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const url = new URL(request.url);
    
    // Validate playlist ownership
    const playlist = await PlaylistDB.findById(env.DB, playlistId);
    if (!playlist) {
      return jsonResponse({ error: 'Playlist not found' }, 404);
    }
    
    if (playlist.user_id !== userData.userId) {
      return jsonResponse({ error: 'Access denied' }, 403);
    }
    
    // Pagination
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset')) || 0, 0);
    const sortBy = url.searchParams.get('sortBy') || 'position'; // position, title, published_at
    const sortOrder = url.searchParams.get('sortOrder') || 'asc'; // asc, desc
    
    // Validate sort parameters
    const validSortFields = ['position', 'title', 'published_at', 'added_at', 'view_count'];
    const validSortOrders = ['asc', 'desc'];
    
    const orderBy = validSortFields.includes(sortBy) ? sortBy : 'position';
    const order = validSortOrders.includes(sortOrder) ? sortOrder : 'asc';
    
    // Get videos
    const videos = await env.DB.prepare(`
      SELECT * FROM playlist_videos 
      WHERE playlist_id = ? 
      ORDER BY ${orderBy} ${order.toUpperCase()}
      LIMIT ? OFFSET ?
    `).bind(playlistId, limit, offset).all();
    
    // Get total count
    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM playlist_videos WHERE playlist_id = ?
    `).bind(playlistId).first();
    
    const transformedVideos = (videos.results || []).map(video => ({
      id: video.id,
      videoId: video.youtube_video_id,
      title: video.title,
      channelName: video.channel_name,
      channelId: video.channel_id,
      duration: video.duration,
      thumbnailUrl: video.thumbnail_url,
      description: video.description,
      publishedAt: video.published_at,
      viewCount: video.view_count,
      likeCount: video.like_count,
      position: video.position,
      addedAt: video.added_at,
      url: `https://youtube.com/watch?v=${video.youtube_video_id}`
    }));
    
    return jsonResponse({
      success: true,
      videos: transformedVideos,
      pagination: {
        limit,
        offset,
        total: countResult?.total || 0,
        hasMore: (offset + limit) < (countResult?.total || 0)
      },
      sort: {
        sortBy: orderBy,
        sortOrder: order
      }
    });
    
  } catch (error) {
    console.error('Get playlist videos error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to fetch videos' }, 500);
  }
}

/**
 * Add individual video to playlist
 */
async function handleAddVideoToPlaylist(request, env, youtubeAPI, playlistId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Validate request body
    const bodyResult = await RequestValidator.validateJsonBody(request, ['videoUrl']);
    if (!bodyResult.valid) {
      return jsonResponse({ error: bodyResult.error }, 400);
    }
    
    const { videoUrl, position } = bodyResult.data;
    
    // Validate video URL
    const videoValidation = YouTubeValidator.validateVideoUrl(videoUrl);
    if (!videoValidation.valid) {
      return jsonResponse({ error: videoValidation.error }, 400);
    }
    
    // Validate playlist ownership
    const playlist = await PlaylistDB.findById(env.DB, playlistId);
    if (!playlist) {
      return jsonResponse({ error: 'Playlist not found' }, 404);
    }
    
    if (playlist.user_id !== userData.userId) {
      return jsonResponse({ error: 'Access denied' }, 403);
    }
    
    // Check if video already exists in playlist
    const existingVideo = await env.DB.prepare(`
      SELECT id FROM playlist_videos 
      WHERE playlist_id = ? AND youtube_video_id = ?
    `).bind(playlistId, videoValidation.videoId).first();
    
    if (existingVideo) {
      return jsonResponse({ error: 'Video already exists in playlist' }, 409);
    }
    
    // Get video details from YouTube
    const videoDetails = await youtubeAPI.getVideoDetails([videoValidation.videoId]);
    if (!videoDetails || videoDetails.length === 0) {
      return jsonResponse({ error: 'Video not found or is private' }, 404);
    }
    
    const videoData = videoDetails[0];
    const sanitizedVideo = ValidationUtils.sanitizeVideoData(videoData);
    
    // Determine position
    let videoPosition = position;
    if (!videoPosition) {
      const maxPosResult = await env.DB.prepare(`
        SELECT MAX(position) as max_pos FROM playlist_videos WHERE playlist_id = ?
      `).bind(playlistId).first();
      videoPosition = (maxPosResult?.max_pos || 0) + 1;
    }
    
    // Insert video
    const videoRecordId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO playlist_videos 
      (id, playlist_id, youtube_video_id, title, channel_name, channel_id, 
       duration, thumbnail_url, description, published_at, view_count, 
       like_count, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      videoRecordId, playlistId, videoData.id, sanitizedVideo.title,
      sanitizedVideo.channelTitle, sanitizedVideo.channelId,
      sanitizedVideo.duration, sanitizedVideo.thumbnailUrl,
      sanitizedVideo.description, sanitizedVideo.publishedAt,
      sanitizedVideo.viewCount, sanitizedVideo.likeCount, videoPosition
    ).run();
    
    return jsonResponse({
      success: true,
      video: {
        id: videoRecordId,
        videoId: videoData.id,
        title: sanitizedVideo.title,
        channelName: sanitizedVideo.channelTitle,
        duration: sanitizedVideo.duration,
        thumbnailUrl: sanitizedVideo.thumbnailUrl,
        position: videoPosition,
        url: `https://youtube.com/watch?v=${videoData.id}`
      }
    }, 201);
    
  } catch (error) {
    console.error('Add video error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: `Failed to add video: ${error.message}` }, 500);
  }
}

/**
 * Remove video from playlist
 */
async function handleRemoveVideoFromPlaylist(request, env, playlistId, videoId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Validate playlist ownership
    const playlist = await PlaylistDB.findById(env.DB, playlistId);
    if (!playlist) {
      return jsonResponse({ error: 'Playlist not found' }, 404);
    }
    
    if (playlist.user_id !== userData.userId) {
      return jsonResponse({ error: 'Access denied' }, 403);
    }
    
    // Check if video exists in playlist
    const video = await env.DB.prepare(`
      SELECT id FROM playlist_videos 
      WHERE playlist_id = ? AND (id = ? OR youtube_video_id = ?)
    `).bind(playlistId, videoId, videoId).first();
    
    if (!video) {
      return jsonResponse({ error: 'Video not found in playlist' }, 404);
    }
    
    // Remove video
    await env.DB.prepare(`
      DELETE FROM playlist_videos 
      WHERE playlist_id = ? AND (id = ? OR youtube_video_id = ?)
    `).bind(playlistId, videoId, videoId).run();
    
    return jsonResponse({
      success: true,
      message: 'Video removed from playlist'
    });
    
  } catch (error) {
    console.error('Remove video error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to remove video' }, 500);
  }
}

/**
 * Update video position in playlist
 */
async function handleUpdateVideoPosition(request, env, playlistId, videoId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Validate request body
    const bodyResult = await RequestValidator.validateJsonBody(request, ['position']);
    if (!bodyResult.valid) {
      return jsonResponse({ error: bodyResult.error }, 400);
    }
    
    const { position } = bodyResult.data;
    
    // Validate position
    const positionValidation = VideoValidator.validatePositionUpdate(position);
    if (!positionValidation.valid) {
      return jsonResponse({ error: positionValidation.error }, 400);
    }
    
    // Validate playlist ownership
    const playlist = await PlaylistDB.findById(env.DB, playlistId);
    if (!playlist) {
      return jsonResponse({ error: 'Playlist not found' }, 404);
    }
    
    if (playlist.user_id !== userData.userId) {
      return jsonResponse({ error: 'Access denied' }, 403);
    }
    
    // Update video position
    const result = await env.DB.prepare(`
      UPDATE playlist_videos 
      SET position = ?, updated_at = strftime('%s', 'now')
      WHERE playlist_id = ? AND (id = ? OR youtube_video_id = ?)
    `).bind(positionValidation.value, playlistId, videoId, videoId).run();
    
    if (!result.success || result.changes === 0) {
      return jsonResponse({ error: 'Video not found in playlist' }, 404);
    }
    
    return jsonResponse({
      success: true,
      message: 'Video position updated',
      position: positionValidation.value
    });
    
  } catch (error) {
    console.error('Update video position error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to update video position' }, 500);
  }
}

/**
 * Get YouTube API quota usage
 */
async function handleGetQuotaUsage(request, env, youtubeAPI) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    const quotaUsage = await youtubeAPI.getQuotaUsage();
    
    return jsonResponse({
      success: true,
      quota: quotaUsage
    });
    
  } catch (error) {
    console.error('Get quota usage error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to get quota usage' }, 500);
  }
}

/**
 * Get import status
 */
async function handleGetImportStatus(request, env, importId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    const importRecord = await env.DB.prepare(`
      SELECT * FROM youtube_imports 
      WHERE id = ? AND user_id = ?
    `).bind(importId, userData.userId).first();
    
    if (!importRecord) {
      return jsonResponse({ error: 'Import not found' }, 404);
    }
    
    return jsonResponse({
      success: true,
      import: {
        id: importRecord.id,
        playlistId: importRecord.playlist_id,
        youtubePlaylistId: importRecord.youtube_playlist_id,
        status: importRecord.status,
        videosImported: importRecord.videos_imported,
        totalVideos: importRecord.total_videos,
        errorMessage: importRecord.error_message,
        startedAt: importRecord.started_at,
        completedAt: importRecord.completed_at
      }
    });
    
  } catch (error) {
    console.error('Get import status error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to get import status' }, 500);
  }
}

/**
 * Helper function to create JSON responses
 */
function jsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      ...additionalHeaders
    }
  });
}