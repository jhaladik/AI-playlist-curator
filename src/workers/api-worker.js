// src/workers/api-worker.js - Enhanced API worker combining Phase 1 + Phase 2

import { extractUserFromToken } from '../utils/auth-utils.js';
import { PlaylistDB, handleDBError } from '../utils/db-utils.js';
import { YouTubeAPI, ValidationUtils } from '../utils/youtube-api.js';
import { 
  YouTubeValidator, 
  PlaylistValidator, 
  VideoValidator,
  RequestValidator,
  Sanitizer 
} from '../utils/validation.js';

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
    // In your existing health check endpoint
    if (url.pathname === '/api/health' && request.method === 'GET') {
      const features = ['auth', 'playlists'];
      
      // Add Phase 2 features if available
      if (env.YOUTUBE_API_KEY) {
        features.push('youtube-import', 'video-management');
      }
      
      // Add Phase 3 features if available ✨
      if (env.OPENAI_API_KEY) {
        features.push('ai-enhancement', 'content-analysis');
      }
      
      return jsonResponse({ 
        status: 'healthy', 
        timestamp: Date.now(),
        phase: env.OPENAI_API_KEY ? 'Phase 3 - AI Enhancement' : 
              env.YOUTUBE_API_KEY ? 'Phase 2 - YouTube Integration' : 
              'Phase 1 - Basic Features',
        features
      });
    }
      
      // === PHASE 1 ENDPOINTS (Auth & Basic Playlists) ===
      
      // Auth endpoints
      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        return await handleRegister(request, env);
      }
      
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        return await handleLogin(request, env);
      }
      
      if (url.pathname === '/api/auth/profile' && request.method === 'GET') {
        return await handleGetProfile(request, env);
      }
      
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        return await handleLogout(request, env);
      }
      
      // Basic playlist endpoints
      if (url.pathname === '/api/playlists' && request.method === 'GET') {
        return await handleGetPlaylists(request, env);
      }
      
      if (url.pathname === '/api/playlists' && request.method === 'POST') {
        return await handleCreatePlaylist(request, env);
      }
      
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+$/) && request.method === 'GET') {
        const playlistId = url.pathname.split('/').pop();
        return await handleGetPlaylist(request, env, playlistId);
      }
      
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+$/) && request.method === 'PUT') {
        const playlistId = url.pathname.split('/').pop();
        return await handleUpdatePlaylist(request, env, playlistId);
      }
      
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+$/) && request.method === 'DELETE') {
        const playlistId = url.pathname.split('/').pop();
        return await handleDeletePlaylist(request, env, playlistId);
      }
      
      // Stats endpoint
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        return await handleGetStats(request, env);
      }
      
      // === PHASE 2 ENDPOINTS (YouTube Integration) ===
      
      // Initialize YouTube API for Phase 2 endpoints
      let youtubeAPI = null;
      if (env.YOUTUBE_API_KEY) {
        youtubeAPI = new YouTubeAPI(env.YOUTUBE_API_KEY, env.DB, env.CACHE || env.SESSIONS);
      }
      
      // Import playlist from YouTube
      if (url.pathname === '/api/import' && request.method === 'POST') {
        if (!youtubeAPI) {
          return jsonResponse({ error: 'YouTube API not configured' }, 503);
        }
        return await handleImportPlaylist(request, env, youtubeAPI);
      }
      
      // Get playlist videos
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos$/) && request.method === 'GET') {
        const playlistId = url.pathname.split('/')[3];
        return await handleGetPlaylistVideos(request, env, playlistId);
      }
      
      // Add video to playlist
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos$/) && request.method === 'POST') {
        if (!youtubeAPI) {
          return jsonResponse({ error: 'YouTube API not configured' }, 503);
        }
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
      
      // Update video position
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos\/[^\/]+\/position$/) && request.method === 'PUT') {
        const parts = url.pathname.split('/');
        const playlistId = parts[3];
        const videoId = parts[5];
        return await handleUpdateVideoPosition(request, env, playlistId, videoId);
      }
      
      // YouTube quota usage
      if (url.pathname === '/api/youtube/quota' && request.method === 'GET') {
        if (!youtubeAPI) {
          return jsonResponse({ error: 'YouTube API not configured' }, 503);
        }
        return await handleGetQuotaUsage(request, env, youtubeAPI);
      }
      
      // Import status
      if (url.pathname.match(/^\/api\/imports\/[^\/]+$/) && request.method === 'GET') {
        const importId = url.pathname.split('/')[3];
        return await handleGetImportStatus(request, env, importId);
      }
      
      return jsonResponse({ error: 'Not found' }, 404);
      
    } catch (error) {
      console.error('API worker error:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }
};

// === PHASE 1 IMPLEMENTATION (Auth & Basic Playlists) ===

// Import auth functions
import {
  createJWT,
  verifyJWT,
  hashPassword,
  verifyPassword,
  generateUserId,
  isValidEmail,
  isValidPassword
} from '../utils/auth-utils.js';

import { UserDB, GDPRConsentDB } from '../utils/db-utils.js';

/**
 * Handle user registration
 */
async function handleRegister(request, env) {
  const data = await request.json();
  const { email, password, gdprConsent = false } = data;
  
  // Validation
  if (!email || !password) {
    return jsonResponse({ error: 'Email and password are required' }, 400);
  }
  
  if (!isValidEmail(email)) {
    return jsonResponse({ error: 'Invalid email format' }, 400);
  }
  
  if (!isValidPassword(password)) {
    return jsonResponse({
      error: 'Password must be at least 8 characters with uppercase, lowercase, and number'
    }, 400);
  }
  
  if (!gdprConsent) {
    return jsonResponse({ error: 'GDPR consent is required' }, 400);
  }
  
  try {
    // Check if user already exists
    const existingUser = await UserDB.findByEmail(env.DB, email.toLowerCase());
    if (existingUser) {
      return jsonResponse({ error: 'User already exists' }, 409);
    }
    
    // Create new user
    const userId = generateUserId();
    const passwordHash = await hashPassword(password);
    
    const result = await UserDB.create(env.DB, {
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      gdprConsent: gdprConsent ? 1 : 0
    });
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to create user' }, 500);
    }
    
    // Record GDPR consent
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    await GDPRConsentDB.record(env.DB, {
      userId,
      consentType: 'registration',
      granted: true,
      ipAddress: clientIP
    });
    
    // Create JWT token
    const tokenPayload = {
      userId,
      email: email.toLowerCase(),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    
    const token = await createJWT(tokenPayload, env.JWT_SECRET);
    
    // Store session in KV
    const sessionId = crypto.randomUUID();
    await env.SESSIONS.put(sessionId, JSON.stringify({
      userId,
      email: email.toLowerCase(),
      createdAt: Date.now()
    }), { expirationTtl: 86400 }); // 24 hours
    
    return jsonResponse({
      success: true,
      user: {
        id: userId,
        email: email.toLowerCase(),
        subscriptionTier: 'free'
      },
      token,
      sessionId
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    return jsonResponse({ error: 'Registration failed' }, 500);
  }
}

/**
 * Handle user login
 */
async function handleLogin(request, env) {
  const data = await request.json();
  const { email, password } = data;
  
  if (!email || !password) {
    return jsonResponse({ error: 'Email and password are required' }, 400);
  }
  
  try {
    // Find user
    const user = await UserDB.findByEmail(env.DB, email.toLowerCase());
    if (!user) {
      return jsonResponse({ error: 'Invalid credentials' }, 401);
    }
    
    // Verify password
    const isValidPass = await verifyPassword(password, user.password_hash);
    if (!isValidPass) {
      return jsonResponse({ error: 'Invalid credentials' }, 401);
    }
    
    // Update last login
    await UserDB.updateLastLogin(env.DB, user.id);
    
    // Create JWT token
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    
    const token = await createJWT(tokenPayload, env.JWT_SECRET);
    
    // Store session in KV
    const sessionId = crypto.randomUUID();
    await env.SESSIONS.put(sessionId, JSON.stringify({
      userId: user.id,
      email: user.email,
      createdAt: Date.now()
    }), { expirationTtl: 86400 }); // 24 hours
    
    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier
      },
      token,
      sessionId
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse({ error: 'Login failed' }, 500);
  }
}

/**
 * Handle get user profile
 */
async function handleGetProfile(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    const user = await UserDB.findById(env.DB, userData.userId);
    if (!user) {
      return jsonResponse({ error: 'User not found' }, 404);
    }
    
    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier,
        createdAt: user.created_at,
        gdprConsent: Boolean(user.gdpr_consent)
      }
    });
    
  } catch (error) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
}

/**
 * Handle logout
 */
async function handleLogout(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    return jsonResponse({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
}

/**
 * Get user's playlists
 */
async function handleGetPlaylists(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const url = new URL(request.url);
    
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset')) || 0, 0);
    
    const result = await PlaylistDB.findByUserId(env.DB, userData.userId, limit, offset);
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to fetch playlists' }, 500);
    }
    
    const playlists = result.results || [];
    
    // Transform data for response
    const transformedPlaylists = playlists.map(playlist => ({
      id: playlist.id,
      title: playlist.title,
      originalDescription: playlist.original_description,
      aiDescription: playlist.ai_description,
      videoCount: playlist.video_count,
      sourceCount: playlist.source_count,
      views: playlist.views,
      enhanced: Boolean(playlist.enhanced),
      thumbnailUrl: playlist.thumbnail_url,
      youtubeId: playlist.youtube_id,
      createdAt: playlist.created_at,
      updatedAt: playlist.updated_at
    }));
    
    return jsonResponse({
      success: true,
      playlists: transformedPlaylists,
      pagination: {
        limit,
        offset,
        total: transformedPlaylists.length
      }
    });
    
  } catch (error) {
    console.error('Get playlists error:', error);
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
}

/**
 * Create new playlist
 */
async function handleCreatePlaylist(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const data = await request.json();
    
    const { title, originalDescription, youtubeId, thumbnailUrl } = data;
    
    // Validation
    if (!title || title.trim().length === 0) {
      return jsonResponse({ error: 'Title is required' }, 400);
    }
    
    if (title.length > 200) {
      return jsonResponse({ error: 'Title too long (max 200 characters)' }, 400);
    }
    
    // Create playlist
    const playlistId = crypto.randomUUID();
    
    const result = await PlaylistDB.create(env.DB, {
      id: playlistId,
      userId: userData.userId,
      title: title.trim(),
      originalDescription: originalDescription?.trim() || '',
      youtubeId: youtubeId || null,
      thumbnailUrl: thumbnailUrl || null
    });
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to create playlist' }, 500);
    }
    
    // Fetch the created playlist
    const createdPlaylist = await PlaylistDB.findById(env.DB, playlistId);
    
    return jsonResponse({
      success: true,
      playlist: {
        id: createdPlaylist.id,
        title: createdPlaylist.title,
        originalDescription: createdPlaylist.original_description,
        aiDescription: createdPlaylist.ai_description,
        videoCount: createdPlaylist.video_count,
        sourceCount: createdPlaylist.source_count,
        views: createdPlaylist.views,
        enhanced: Boolean(createdPlaylist.enhanced),
        thumbnailUrl: createdPlaylist.thumbnail_url,
        youtubeId: createdPlaylist.youtube_id,
        createdAt: createdPlaylist.created_at,
        updatedAt: createdPlaylist.updated_at
      }
    }, 201);
    
  } catch (error) {
    console.error('Create playlist error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to create playlist' }, 500);
  }
}

/**
 * Get single playlist
 */
async function handleGetPlaylist(request, env, playlistId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    const playlist = await PlaylistDB.findById(env.DB, playlistId);
    
    if (!playlist) {
      return jsonResponse({ error: 'Playlist not found' }, 404);
    }
    
    // Check ownership
    if (playlist.user_id !== userData.userId) {
      return jsonResponse({ error: 'Access denied' }, 403);
    }
    
    // Increment view count
    await PlaylistDB.incrementViews(env.DB, playlistId);
    
    return jsonResponse({
      success: true,
      playlist: {
        id: playlist.id,
        title: playlist.title,
        originalDescription: playlist.original_description,
        aiDescription: playlist.ai_description,
        videoCount: playlist.video_count,
        sourceCount: playlist.source_count,
        views: playlist.views + 1, // Include the increment
        enhanced: Boolean(playlist.enhanced),
        thumbnailUrl: playlist.thumbnail_url,
        youtubeId: playlist.youtube_id,
        createdAt: playlist.created_at,
        updatedAt: playlist.updated_at
      }
    });
    
  } catch (error) {
    console.error('Get playlist error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to fetch playlist' }, 500);
  }
}

/**
 * Update playlist
 */
async function handleUpdatePlaylist(request, env, playlistId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const data = await request.json();
    
    // Check if playlist exists and user owns it
    const playlist = await PlaylistDB.findById(env.DB, playlistId);
    
    if (!playlist) {
      return jsonResponse({ error: 'Playlist not found' }, 404);
    }
    
    if (playlist.user_id !== userData.userId) {
      return jsonResponse({ error: 'Access denied' }, 403);
    }
    
    // Validate updates
    const updates = {};
    
    if (data.title !== undefined) {
      if (!data.title || data.title.trim().length === 0) {
        return jsonResponse({ error: 'Title cannot be empty' }, 400);
      }
      if (data.title.length > 200) {
        return jsonResponse({ error: 'Title too long (max 200 characters)' }, 400);
      }
      updates.title = data.title.trim();
    }
    
    if (data.originalDescription !== undefined) {
      updates.originalDescription = data.originalDescription?.trim() || '';
    }
    
    if (data.aiDescription !== undefined) {
      updates.aiDescription = data.aiDescription?.trim() || null;
    }
    
    if (data.enhanced !== undefined) {
      updates.enhanced = Boolean(data.enhanced);
    }
    
    if (Object.keys(updates).length === 0) {
      return jsonResponse({ error: 'No valid fields to update' }, 400);
    }
    
    // Update playlist
    const result = await PlaylistDB.update(env.DB, playlistId, updates);
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to update playlist' }, 500);
    }
    
    // Fetch updated playlist
    const updatedPlaylist = await PlaylistDB.findById(env.DB, playlistId);
    
    return jsonResponse({
      success: true,
      playlist: {
        id: updatedPlaylist.id,
        title: updatedPlaylist.title,
        originalDescription: updatedPlaylist.original_description,
        aiDescription: updatedPlaylist.ai_description,
        videoCount: updatedPlaylist.video_count,
        sourceCount: updatedPlaylist.source_count,
        views: updatedPlaylist.views,
        enhanced: Boolean(updatedPlaylist.enhanced),
        thumbnailUrl: updatedPlaylist.thumbnail_url,
        youtubeId: updatedPlaylist.youtube_id,
        createdAt: updatedPlaylist.created_at,
        updatedAt: updatedPlaylist.updated_at
      }
    });
    
  } catch (error) {
    console.error('Update playlist error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to update playlist' }, 500);
  }
}

/**
 * Delete playlist
 */
async function handleDeletePlaylist(request, env, playlistId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Check if playlist exists and user owns it
    const playlist = await PlaylistDB.findById(env.DB, playlistId);
    
    if (!playlist) {
      return jsonResponse({ error: 'Playlist not found' }, 404);
    }
    
    if (playlist.user_id !== userData.userId) {
      return jsonResponse({ error: 'Access denied' }, 403);
    }
    
    // Delete playlist (cascade will handle videos)
    const result = await PlaylistDB.delete(env.DB, playlistId);
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to delete playlist' }, 500);
    }
    
    return jsonResponse({
      success: true,
      message: 'Playlist deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete playlist error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to delete playlist' }, 500);
  }
}

/**
 * Get user stats
 */
async function handleGetStats(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    const stats = await PlaylistDB.getStats(env.DB, userData.userId);
    
    return jsonResponse({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('Get stats error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to fetch stats' }, 500);
  }
}

// === PHASE 2 IMPLEMENTATION (YouTube Integration) ===

/**
 * Import playlist from YouTube
 */
async function handleImportPlaylist(request, env, youtubeAPI) {
  try {
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
    const sortBy = url.searchParams.get('sortBy') || 'position';
    const sortOrder = url.searchParams.get('sortOrder') || 'asc';
    
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