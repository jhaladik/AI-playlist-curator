// src/workers/api-worker.js - Complete Enhanced API Worker (Phases 1 + 2 + Enhancements)

import { extractUserFromToken } from '../utils/auth-utils.js';
import { PlaylistDB, UserDB, GDPRConsentDB, handleDBError } from '../utils/db-utils.js';
import { YouTubeAPI, ValidationUtils } from '../utils/youtube-api.js';
import { 
  YouTubeValidator, 
  PlaylistValidator, 
  VideoValidator,
  RequestValidator,
  Sanitizer 
} from '../utils/validation.js';

import {
  createJWT,
  verifyJWT,
  hashPassword,
  verifyPassword,
  generateUserId,
  isValidEmail,
  isValidPassword
} from '../utils/auth-utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS handling for all requests
    if (request.method === 'OPTIONS') {
      return jsonResponse(null, 200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
        'Access-Control-Max-Age': '86400'
      });
    }
    
    try {
      // Health check endpoint
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse({ 
          status: 'healthy', 
          timestamp: Date.now(),
          version: '2.0.0',
          phase: 'Complete - Auth + YouTube Integration + Enhancements',
          features: [
            'user-authentication',
            'playlist-management', 
            'youtube-import',
            'video-management',
            'analytics-tracking',
            'quota-monitoring',
            'enhanced-validation',
            'gdpr-compliance'
          ]
        });
      }
      
      // === AUTHENTICATION ENDPOINTS ===
      
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
      
      if (url.pathname === '/api/auth/refresh' && request.method === 'POST') {
        return await handleRefreshToken(request, env);
      }
      
      // === PLAYLIST MANAGEMENT ENDPOINTS ===
      
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
      
      // === VIDEO MANAGEMENT ENDPOINTS ===
      
      // Get playlist videos
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos$/) && request.method === 'GET') {
        const playlistId = url.pathname.split('/')[3];
        return await handleGetPlaylistVideos(request, env, playlistId);
      }
      
      // Add video to playlist
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos$/) && request.method === 'POST') {
        const playlistId = url.pathname.split('/')[3];
        return await handleAddVideoToPlaylist(request, env, playlistId);
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
      
      // Batch update video positions
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/videos\/reorder$/) && request.method === 'PUT') {
        const playlistId = url.pathname.split('/')[3];
        return await handleReorderVideos(request, env, playlistId);
      }
      
      // === YOUTUBE INTEGRATION ENDPOINTS ===
      
      // Import playlist from YouTube
      if (url.pathname === '/api/import' && request.method === 'POST') {
        return await handleImportPlaylist(request, env);
      }
      
      // Get import status
      if (url.pathname.match(/^\/api\/imports\/[^\/]+$/) && request.method === 'GET') {
        const importId = url.pathname.split('/')[3];
        return await handleGetImportStatus(request, env, importId);
      }
      
      // Get user's import history
      if (url.pathname === '/api/imports' && request.method === 'GET') {
        return await handleGetImportHistory(request, env);
      }
      
      // YouTube quota usage
      if (url.pathname === '/api/youtube/quota' && request.method === 'GET') {
        return await handleGetQuotaUsage(request, env);
      }
      
      // === ANALYTICS ENDPOINTS ===
      
      // Get user stats
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        return await handleGetStats(request, env);
      }
      
      // Track analytics event
      if (url.pathname === '/api/analytics/track' && request.method === 'POST') {
        return await handleTrackAnalytics(request, env);
      }
      
      // Get playlist analytics
      if (url.pathname.match(/^\/api\/playlists\/[^\/]+\/analytics$/) && request.method === 'GET') {
        const playlistId = url.pathname.split('/')[3];
        return await handleGetPlaylistAnalytics(request, env, playlistId);
      }
      
      // === SEARCH ENDPOINTS ===
      
      // Search user's playlists
      if (url.pathname === '/api/search/playlists' && request.method === 'GET') {
        return await handleSearchPlaylists(request, env);
      }
      
      // Search YouTube videos for adding to playlist
      if (url.pathname === '/api/search/youtube' && request.method === 'GET') {
        return await handleSearchYouTube(request, env);
      }
      
      // === GDPR COMPLIANCE ENDPOINTS ===
      
      // Export user data
      if (url.pathname === '/api/gdpr/export' && request.method === 'POST') {
        return await handleExportUserData(request, env);
      }
      
      // Delete user data
      if (url.pathname === '/api/gdpr/delete' && request.method === 'DELETE') {
        return await handleDeleteUserData(request, env);
      }
      
      return jsonResponse({ error: 'Endpoint not found' }, 404);
      
    } catch (error) {
      console.error('API worker error:', error);
      
      // Enhanced error logging
      await logError(env, request, error);
      
      return jsonResponse({ 
        error: 'Internal server error',
        message: env.ENVIRONMENT === 'development' ? error.message : 'Something went wrong'
      }, 500);
    }
  }
};

// === AUTHENTICATION HANDLERS ===

/**
 * Handle user registration with enhanced validation
 */
async function handleRegister(request, env) {
  try {
    const data = await request.json();
    const { email, password, gdprConsent = false, subscriptionTier = 'free' } = data;
    
    // Enhanced validation
    const validation = await RequestValidator.validateRegistration(data);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400);
    }
    
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
      subscriptionTier,
      gdprConsent: gdprConsent ? 1 : 0
    });
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to create user' }, 500);
    }
    
    // Record GDPR consent
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Forwarded-For') || 'unknown';
    await GDPRConsentDB.record(env.DB, {
      userId,
      consentType: 'registration',
      granted: true,
      ipAddress: clientIP
    });
    
    // Create JWT tokens
    const accessToken = await createJWT({
      userId,
      email: email.toLowerCase(),
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutes
    }, env.JWT_SECRET);
    
    const refreshToken = await createJWT({
      userId,
      email: email.toLowerCase(),
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    }, env.JWT_SECRET);
    
    // Store session in KV
    const sessionId = crypto.randomUUID();
    await env.SESSIONS.put(sessionId, JSON.stringify({
      userId,
      email: email.toLowerCase(),
      createdAt: Date.now(),
      refreshToken
    }), { expirationTtl: 7 * 24 * 60 * 60 }); // 7 days
    
    return jsonResponse({
      success: true,
      user: {
        id: userId,
        email: email.toLowerCase(),
        subscriptionTier
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 15 * 60
      },
      sessionId
    }, 201);
    
  } catch (error) {
    console.error('Registration error:', error);
    return jsonResponse({ error: 'Registration failed' }, 500);
  }
}

/**
 * Handle user login with enhanced security
 */
async function handleLogin(request, env) {
  try {
    const data = await request.json();
    const { email, password, rememberMe = false } = data;
    
    // Rate limiting check
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitKey = `login_attempts:${clientIP}`;
    const attempts = await env.SESSIONS.get(rateLimitKey);
    
    if (attempts && parseInt(attempts) >= 5) {
      return jsonResponse({ error: 'Too many login attempts. Please try again later.' }, 429);
    }
    
    // Validation
    if (!email || !password) {
      return jsonResponse({ error: 'Email and password are required' }, 400);
    }
    
    // Find user
    const user = await UserDB.findByEmail(env.DB, email.toLowerCase());
    if (!user) {
      await incrementLoginAttempts(env, clientIP);
      return jsonResponse({ error: 'Invalid credentials' }, 401);
    }
    
    // Verify password
    const isValidPass = await verifyPassword(password, user.password_hash);
    if (!isValidPass) {
      await incrementLoginAttempts(env, clientIP);
      return jsonResponse({ error: 'Invalid credentials' }, 401);
    }
    
    // Clear login attempts on successful login
    await env.SESSIONS.delete(rateLimitKey);
    
    // Update last login
    await UserDB.updateLastLogin(env.DB, user.id);
    
    // Create JWT tokens
    const accessTokenExpiry = rememberMe ? (24 * 60 * 60) : (15 * 60);
    const refreshTokenExpiry = rememberMe ? (30 * 24 * 60 * 60) : (7 * 24 * 60 * 60);
    
    const accessToken = await createJWT({
      userId: user.id,
      email: user.email,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + accessTokenExpiry
    }, env.JWT_SECRET);
    
    const refreshToken = await createJWT({
      userId: user.id,
      email: user.email,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + refreshTokenExpiry
    }, env.JWT_SECRET);
    
    // Store session in KV
    const sessionId = crypto.randomUUID();
    await env.SESSIONS.put(sessionId, JSON.stringify({
      userId: user.id,
      email: user.email,
      createdAt: Date.now(),
      refreshToken,
      rememberMe
    }), { expirationTtl: refreshTokenExpiry });
    
    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: accessTokenExpiry
      },
      sessionId
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse({ error: 'Login failed' }, 500);
  }
}

/**
 * Handle token refresh
 */
async function handleRefreshToken(request, env) {
  try {
    const data = await request.json();
    const { refreshToken } = data;
    
    if (!refreshToken) {
      return jsonResponse({ error: 'Refresh token required' }, 400);
    }
    
    // Verify refresh token
    const payload = await verifyJWT(refreshToken, env.JWT_SECRET);
    if (!payload || payload.type !== 'refresh') {
      return jsonResponse({ error: 'Invalid refresh token' }, 401);
    }
    
    // Create new access token
    const accessToken = await createJWT({
      userId: payload.userId,
      email: payload.email,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60)
    }, env.JWT_SECRET);
    
    return jsonResponse({
      success: true,
      tokens: {
        accessToken,
        expiresIn: 15 * 60
      }
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    return jsonResponse({ error: 'Token refresh failed' }, 401);
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
    
    // Get user stats
    const stats = await PlaylistDB.getStats(env.DB, userData.userId);
    
    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        gdprConsent: Boolean(user.gdpr_consent)
      },
      stats
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
    
    // Could implement token blacklisting here if needed
    
    return jsonResponse({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
}

// === PLAYLIST MANAGEMENT HANDLERS ===

/**
 * Get user's playlists with enhanced filtering and pagination
 */
async function handleGetPlaylists(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const url = new URL(request.url);
    
    // Enhanced pagination and filtering
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset')) || 0, 0);
    const sortBy = url.searchParams.get('sortBy') || 'created_at';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';
    const filter = url.searchParams.get('filter'); // 'enhanced', 'basic', 'recent'
    const search = url.searchParams.get('search');
    
    const result = await PlaylistDB.findByUserId(env.DB, userData.userId, {
      limit,
      offset,
      sortBy,
      sortOrder,
      filter,
      search
    });
    
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
      updatedAt: playlist.updated_at,
      lastViewedAt: playlist.last_viewed_at
    }));
    
    return jsonResponse({
      success: true,
      playlists: transformedPlaylists,
      pagination: {
        limit,
        offset,
        total: result.total || 0,
        hasMore: (offset + limit) < (result.total || 0)
      },
      filters: {
        sortBy,
        sortOrder,
        filter,
        search
      }
    });
    
  } catch (error) {
    console.error('Get playlists error:', error);
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
}

/**
 * Create new playlist with enhanced validation
 */
async function handleCreatePlaylist(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const data = await request.json();
    
    // Enhanced validation
    const validation = await PlaylistValidator.validateCreation(data);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400);
    }
    
    const { title, originalDescription, youtubeId, thumbnailUrl, tags } = validation.data;
    
    // Check playlist limits based on subscription
    const user = await UserDB.findById(env.DB, userData.userId);
    const playlistCount = await PlaylistDB.getCount(env.DB, userData.userId);
    
    const limits = {
      free: 5,
      pro: 50,
      enterprise: 1000
    };
    
    if (playlistCount >= (limits[user.subscription_tier] || limits.free)) {
      return jsonResponse({ 
        error: `Playlist limit reached for ${user.subscription_tier} subscription` 
      }, 403);
    }
    
    // Create playlist
    const playlistId = crypto.randomUUID();
    
    const result = await PlaylistDB.create(env.DB, {
      id: playlistId,
      userId: userData.userId,
      title: title.trim(),
      originalDescription: originalDescription?.trim() || '',
      youtubeId: youtubeId || null,
      thumbnailUrl: thumbnailUrl || null,
      tags: tags || []
    });
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to create playlist' }, 500);
    }
    
    // Track analytics
    await trackEvent(env, userData.userId, 'playlist_created', {
      playlistId,
      source: youtubeId ? 'youtube_import' : 'manual'
    });
    
    // Fetch the created playlist
    const createdPlaylist = await PlaylistDB.findById(env.DB, playlistId);
    
    return jsonResponse({
      success: true,
      playlist: transformPlaylistForResponse(createdPlaylist)
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
 * Get single playlist with enhanced data
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
    
    // Increment view count and update last viewed
    await PlaylistDB.incrementViews(env.DB, playlistId);
    await PlaylistDB.updateLastViewed(env.DB, playlistId);
    
    // Get recent analytics
    const analytics = await getPlaylistAnalytics(env.DB, playlistId, 30); // Last 30 days
    
    return jsonResponse({
      success: true,
      playlist: {
        ...transformPlaylistForResponse(playlist),
        views: playlist.views + 1,
        analytics
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
 * Update playlist with enhanced validation
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
    
    // Enhanced validation
    const validation = await PlaylistValidator.validateUpdate(data);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400);
    }
    
    // Update playlist
    const result = await PlaylistDB.update(env.DB, playlistId, validation.data);
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to update playlist' }, 500);
    }
    
    // Track analytics
    await trackEvent(env, userData.userId, 'playlist_updated', {
      playlistId,
      fields: Object.keys(validation.data)
    });
    
    // Fetch updated playlist
    const updatedPlaylist = await PlaylistDB.findById(env.DB, playlistId);
    
    return jsonResponse({
      success: true,
      playlist: transformPlaylistForResponse(updatedPlaylist)
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
 * Delete playlist with cascade cleanup
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
    
    // Delete playlist (cascade will handle videos and analytics)
    const result = await PlaylistDB.delete(env.DB, playlistId);
    
    if (!result.success) {
      return jsonResponse({ error: 'Failed to delete playlist' }, 500);
    }
    
    // Track analytics
    await trackEvent(env, userData.userId, 'playlist_deleted', {
      playlistId,
      videoCount: playlist.video_count
    });
    
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

// === VIDEO MANAGEMENT HANDLERS ===

/**
 * Get videos for a specific playlist with enhanced features
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
    
    // Enhanced pagination and sorting
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset')) || 0, 0);
    const sortBy = url.searchParams.get('sortBy') || 'position';
    const sortOrder = url.searchParams.get('sortOrder') || 'asc';
    const search = url.searchParams.get('search');
    
    // Validate sort parameters
    const validSortFields = ['position', 'title', 'published_at', 'added_at', 'view_count', 'duration'];
    const validSortOrders = ['asc', 'desc'];
    
    const orderBy = validSortFields.includes(sortBy) ? sortBy : 'position';
    const order = validSortOrders.includes(sortOrder) ? sortOrder : 'asc';
    
    // Build query with optional search
    let query = `
      SELECT * FROM playlist_videos 
      WHERE playlist_id = ?
    `;
    const params = [playlistId];
    
    if (search) {
      query += ` AND (title LIKE ? OR channel_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY ${orderBy} ${order.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    // Get videos
    const videos = await env.DB.prepare(query).bind(...params).all();
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM playlist_videos WHERE playlist_id = ?`;
    const countParams = [playlistId];
    
    if (search) {
      countQuery += ` AND (title LIKE ? OR channel_name LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();
    
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
      url: `https://youtube.com/watch?v=${video.youtube_video_id}`,
      embedUrl: `https://youtube.com/embed/${video.youtube_video_id}`
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
      },
      search
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
 * Add individual video to playlist with enhanced validation
 */
async function handleAddVideoToPlaylist(request, env, playlistId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Validate request body
    const bodyResult = await RequestValidator.validateJsonBody(request, ['videoUrl']);
    if (!bodyResult.valid) {
      return jsonResponse({ error: bodyResult.error }, 400);
    }
    
    const { videoUrl, position, customTitle } = bodyResult.data;
    
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
    
    // Initialize YouTube API
    const youtubeAPI = new YouTubeAPI(env.YOUTUBE_API_KEY, env.DB, env.SESSIONS);
    
    // Get video details from YouTube
    const videoDetails = await youtubeAPI.getVideoDetails([videoValidation.videoId]);
    if (!videoDetails || videoDetails.length === 0) {
      return jsonResponse({ error: 'Video not found or is private' }, 404);
    }
    
    const videoData = videoDetails[0];
    const sanitizedVideo = ValidationUtils.sanitizeVideoData(videoData);
    
    // Use custom title if provided
    if (customTitle) {
      sanitizedVideo.title = customTitle.trim();
    }
    
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
    
    // Update playlist video count
    await PlaylistDB.updateVideoCount(env.DB, playlistId);
    
    // Track analytics
    await trackEvent(env, userData.userId, 'video_added', {
      playlistId,
      videoId: videoData.id,
      position: videoPosition
    });
    
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
        url: `https://youtube.com/watch?v=${videoData.id}`,
        embedUrl: `https://youtube.com/embed/${videoData.id}`
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
      SELECT id, position FROM playlist_videos 
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
    
    // Update positions of subsequent videos
    await env.DB.prepare(`
      UPDATE playlist_videos 
      SET position = position - 1
      WHERE playlist_id = ? AND position > ?
    `).bind(playlistId, video.position).run();
    
    // Update playlist video count
    await PlaylistDB.updateVideoCount(env.DB, playlistId);
    
    // Track analytics
    await trackEvent(env, userData.userId, 'video_removed', {
      playlistId,
      videoId,
      position: video.position
    });
    
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
    
    // Update video position with transaction-like behavior
    const result = await updateVideoPosition(env.DB, playlistId, videoId, positionValidation.value);
    
    if (!result.success) {
      return jsonResponse({ error: result.error || 'Video not found in playlist' }, 404);
    }
    
    // Track analytics
    await trackEvent(env, userData.userId, 'video_position_updated', {
      playlistId,
      videoId,
      newPosition: positionValidation.value
    });
    
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
 * Batch reorder videos in playlist
 */
async function handleReorderVideos(request, env, playlistId) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Validate request body
    const bodyResult = await RequestValidator.validateJsonBody(request, ['videoOrder']);
    if (!bodyResult.valid) {
      return jsonResponse({ error: bodyResult.error }, 400);
    }
    
    const { videoOrder } = bodyResult.data; // Array of {videoId, position}
    
    // Validate playlist ownership
    const playlist = await PlaylistDB.findById(env.DB, playlistId);
    if (!playlist) {
      return jsonResponse({ error: 'Playlist not found' }, 404);
    }
    
    if (playlist.user_id !== userData.userId) {
      return jsonResponse({ error: 'Access denied' }, 403);
    }
    
    // Validate video order array
    if (!Array.isArray(videoOrder) || videoOrder.length === 0) {
      return jsonResponse({ error: 'Invalid video order array' }, 400);
    }
    
    // Batch update positions
    const updatePromises = videoOrder.map(async (item, index) => {
      const { videoId } = item;
      const position = index + 1;
      
      return env.DB.prepare(`
        UPDATE playlist_videos 
        SET position = ?, updated_at = strftime('%s', 'now')
        WHERE playlist_id = ? AND (id = ? OR youtube_video_id = ?)
      `).bind(position, playlistId, videoId, videoId).run();
    });
    
    await Promise.all(updatePromises);
    
    // Track analytics
    await trackEvent(env, userData.userId, 'videos_reordered', {
      playlistId,
      videoCount: videoOrder.length
    });
    
    return jsonResponse({
      success: true,
      message: 'Videos reordered successfully',
      updatedCount: videoOrder.length
    });
    
  } catch (error) {
    console.error('Reorder videos error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to reorder videos' }, 500);
  }
}

// === YOUTUBE INTEGRATION HANDLERS ===

/**
 * Import playlist from YouTube with enhanced features
 */
async function handleImportPlaylist(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Validate request
    const validation = await RequestValidator.validateImportRequest(request);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400);
    }
    
    const { playlistId, originalUrl, options } = validation.data;
    
    // Check import limits based on subscription
    const user = await UserDB.findById(env.DB, userData.userId);
    const todayImports = await getImportCountToday(env.DB, userData.userId);
    
    const importLimits = {
      free: 2,
      pro: 20,
      enterprise: 100
    };
    
    if (todayImports >= (importLimits[user.subscription_tier] || importLimits.free)) {
      return jsonResponse({ 
        error: `Daily import limit reached for ${user.subscription_tier} subscription` 
      }, 403);
    }
    
    // Create import record
    const importId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO youtube_imports 
      (id, user_id, youtube_playlist_id, youtube_playlist_url, status, options)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).bind(importId, userData.userId, playlistId, originalUrl, JSON.stringify(options)).run();
    
    try {
      // Initialize YouTube API
      const youtubeAPI = new YouTubeAPI(env.YOUTUBE_API_KEY, env.DB, env.SESSIONS);
      
      // Import playlist data
      const importResult = await youtubeAPI.importPlaylist(playlistId, options.maxVideos || 50);
      
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
        thumbnailUrl: sanitizedPlaylist.thumbnailUrl,
        tags: options.tags || []
      });
      
      if (!playlistCreateResult.success) {
        throw new Error('Failed to create playlist record');
      }
      
      // Insert videos in batches
      let importedCount = 0;
      const batchSize = 10;
      
      for (let i = 0; i < importResult.videos.length; i += batchSize) {
        const batch = importResult.videos.slice(i, i + batchSize);
        
        for (const video of batch) {
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
        
        // Update progress
        await env.DB.prepare(`
          UPDATE youtube_imports 
          SET videos_imported = ?, progress_percentage = ?
          WHERE id = ?
        `).bind(importedCount, Math.round((importedCount / importResult.videos.length) * 100), importId).run();
      }
      
      // Update import record
      await env.DB.prepare(`
        UPDATE youtube_imports 
        SET playlist_id = ?, status = 'completed', videos_imported = ?, 
            total_videos = ?, completed_at = strftime('%s', 'now'),
            progress_percentage = 100
        WHERE id = ?
      `).bind(newPlaylistId, importedCount, importResult.videos.length, importId).run();
      
      // Track analytics
      await trackEvent(env, userData.userId, 'playlist_imported', {
        playlistId: newPlaylistId,
        youtubePlaylistId: playlistId,
        videosImported: importedCount,
        totalVideos: importResult.videos.length
      });
      
      // Get the created playlist
      const createdPlaylist = await PlaylistDB.findById(env.DB, newPlaylistId);
      
      return jsonResponse({
        success: true,
        import: {
          id: importId,
          status: 'completed',
          videosImported: importedCount,
          totalVideos: importResult.videos.length,
          progressPercentage: 100
        },
        playlist: transformPlaylistForResponse(createdPlaylist)
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
 * Get import status with enhanced details
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
        youtubePlaylistUrl: importRecord.youtube_playlist_url,
        status: importRecord.status,
        videosImported: importRecord.videos_imported || 0,
        totalVideos: importRecord.total_videos || 0,
        progressPercentage: importRecord.progress_percentage || 0,
        errorMessage: importRecord.error_message,
        options: importRecord.options ? JSON.parse(importRecord.options) : {},
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
 * Get user's import history
 */
async function handleGetImportHistory(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const url = new URL(request.url);
    
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset')) || 0, 0);
    
    const imports = await env.DB.prepare(`
      SELECT * FROM youtube_imports 
      WHERE user_id = ? 
      ORDER BY started_at DESC 
      LIMIT ? OFFSET ?
    `).bind(userData.userId, limit, offset).all();
    
    const total = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM youtube_imports WHERE user_id = ?
    `).bind(userData.userId).first();
    
    const transformedImports = (imports.results || []).map(imp => ({
      id: imp.id,
      playlistId: imp.playlist_id,
      youtubePlaylistId: imp.youtube_playlist_id,
      status: imp.status,
      videosImported: imp.videos_imported || 0,
      totalVideos: imp.total_videos || 0,
      startedAt: imp.started_at,
      completedAt: imp.completed_at
    }));
    
    return jsonResponse({
      success: true,
      imports: transformedImports,
      pagination: {
        limit,
        offset,
        total: total?.total || 0,
        hasMore: (offset + limit) < (total?.total || 0)
      }
    });
    
  } catch (error) {
    console.error('Get import history error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to get import history' }, 500);
  }
}

/**
 * Get YouTube API quota usage
 */
async function handleGetQuotaUsage(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    if (!env.YOUTUBE_API_KEY) {
      return jsonResponse({ error: 'YouTube API not configured' }, 503);
    }
    
    const youtubeAPI = new YouTubeAPI(env.YOUTUBE_API_KEY, env.DB, env.SESSIONS);
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

// === ANALYTICS HANDLERS ===

/**
 * Get user stats with enhanced metrics
 */
async function handleGetStats(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    const stats = await PlaylistDB.getStats(env.DB, userData.userId);
    const recentActivity = await getRecentActivity(env.DB, userData.userId, 7); // Last 7 days
    
    return jsonResponse({
      success: true,
      stats: {
        ...stats,
        recentActivity
      }
    });
    
  } catch (error) {
    console.error('Get stats error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to fetch stats' }, 500);
  }
}

/**
 * Track analytics event
 */
async function handleTrackAnalytics(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const data = await request.json();
    
    const { eventType, metadata } = data;
    
    // Validate event type
    const validEvents = [
      'playlist_viewed', 'video_watched', 'export_generated', 
      'share_link_created', 'search_performed'
    ];
    
    if (!validEvents.includes(eventType)) {
      return jsonResponse({ error: 'Invalid event type' }, 400);
    }
    
    await trackEvent(env, userData.userId, eventType, metadata);
    
    return jsonResponse({
      success: true,
      message: 'Event tracked successfully'
    });
    
  } catch (error) {
    console.error('Track analytics error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to track event' }, 500);
  }
}

/**
 * Get playlist analytics
 */
async function handleGetPlaylistAnalytics(request, env, playlistId) {
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
    
    const url = new URL(request.url);
    const days = Math.min(parseInt(url.searchParams.get('days')) || 30, 365);
    
    const analytics = await getPlaylistAnalytics(env.DB, playlistId, days);
    
    return jsonResponse({
      success: true,
      analytics
    });
    
  } catch (error) {
    console.error('Get playlist analytics error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to get playlist analytics' }, 500);
  }
}

// === SEARCH HANDLERS ===

/**
 * Search user's playlists
 */
async function handleSearchPlaylists(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const url = new URL(request.url);
    
    const query = url.searchParams.get('q');
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
    
    if (!query || query.trim().length < 2) {
      return jsonResponse({ error: 'Search query must be at least 2 characters' }, 400);
    }
    
    const results = await env.DB.prepare(`
      SELECT * FROM playlists 
      WHERE user_id = ? AND (
        title LIKE ? OR 
        original_description LIKE ? OR 
        ai_description LIKE ?
      )
      ORDER BY 
        CASE 
          WHEN title LIKE ? THEN 1
          WHEN original_description LIKE ? THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT ?
    `).bind(
      userData.userId,
      `%${query}%`, `%${query}%`, `%${query}%`,
      `%${query}%`, `%${query}%`,
      limit
    ).all();
    
    const transformedResults = (results.results || []).map(transformPlaylistForResponse);
    
    return jsonResponse({
      success: true,
      results: transformedResults,
      query,
      total: transformedResults.length
    });
    
  } catch (error) {
    console.error('Search playlists error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to search playlists' }, 500);
  }
}

/**
 * Search YouTube videos
 */
async function handleSearchYouTube(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    const url = new URL(request.url);
    
    const query = url.searchParams.get('q');
    const maxResults = Math.min(parseInt(url.searchParams.get('maxResults')) || 10, 25);
    
    if (!query || query.trim().length < 2) {
      return jsonResponse({ error: 'Search query must be at least 2 characters' }, 400);
    }
    
    if (!env.YOUTUBE_API_KEY) {
      return jsonResponse({ error: 'YouTube API not configured' }, 503);
    }
    
    const youtubeAPI = new YouTubeAPI(env.YOUTUBE_API_KEY, env.DB, env.SESSIONS);
    const searchResults = await youtubeAPI.searchVideos(query, maxResults);
    
    return jsonResponse({
      success: true,
      results: searchResults,
      query,
      total: searchResults.length
    });
    
  } catch (error) {
    console.error('Search YouTube error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to search YouTube' }, 500);
  }
}

// === GDPR COMPLIANCE HANDLERS ===

/**
 * Export user data for GDPR compliance
 */
async function handleExportUserData(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    // Get all user data
    const user = await UserDB.findById(env.DB, userData.userId);
    const playlists = await PlaylistDB.findByUserId(env.DB, userData.userId, { limit: 1000, offset: 0 });
    const imports = await env.DB.prepare(`
      SELECT * FROM youtube_imports WHERE user_id = ?
    `).bind(userData.userId).all();
    const analytics = await env.DB.prepare(`
      SELECT * FROM playlist_analytics 
      WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)
    `).bind(userData.userId).all();
    
    const exportData = {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        subscriptionTier: user.subscription_tier
      },
      playlists: playlists.results || [],
      imports: imports.results || [],
      analytics: analytics.results || [],
      exportedAt: new Date().toISOString()
    };
    
    // Track the export
    await trackEvent(env, userData.userId, 'data_exported', {
      playlistCount: (playlists.results || []).length,
      importCount: (imports.results || []).length
    });
    
    return jsonResponse({
      success: true,
      data: exportData
    });
    
  } catch (error) {
    console.error('Export user data error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to export user data' }, 500);
  }
}

/**
 * Delete user data for GDPR compliance
 */
async function handleDeleteUserData(request, env) {
  try {
    const userData = await extractUserFromToken(request, env.JWT_SECRET);
    
    const data = await request.json();
    const { confirmation } = data;
    
    if (confirmation !== 'DELETE_ALL_MY_DATA') {
      return jsonResponse({ 
        error: 'Confirmation phrase required: DELETE_ALL_MY_DATA' 
      }, 400);
    }
    
    // Delete all user data in the correct order (respecting foreign keys)
    await env.DB.prepare('DELETE FROM playlist_analytics WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)').bind(userData.userId).run();
    await env.DB.prepare('DELETE FROM playlist_videos WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)').bind(userData.userId).run();
    await env.DB.prepare('DELETE FROM youtube_imports WHERE user_id = ?').bind(userData.userId).run();
    await env.DB.prepare('DELETE FROM playlists WHERE user_id = ?').bind(userData.userId).run();
    await env.DB.prepare('DELETE FROM gdpr_consents WHERE user_id = ?').bind(userData.userId).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userData.userId).run();
    
    // Delete from KV store
    const sessions = await env.SESSIONS.list({ prefix: userData.userId });
    for (const key of sessions.keys) {
      await env.SESSIONS.delete(key.name);
    }
    
    return jsonResponse({
      success: true,
      message: 'All user data has been permanently deleted'
    });
    
  } catch (error) {
    console.error('Delete user data error:', error);
    if (error.message.includes('Unauthorized')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Failed to delete user data' }, 500);
  }
}

// === HELPER FUNCTIONS ===

/**
 * Transform playlist for API response
 */
function transformPlaylistForResponse(playlist) {
  return {
    id: playlist.id,
    title: playlist.title,
    originalDescription: playlist.original_description,
    aiDescription: playlist.ai_description,
    videoCount: playlist.video_count || 0,
    sourceCount: playlist.source_count || 0,
    views: playlist.views || 0,
    enhanced: Boolean(playlist.enhanced),
    thumbnailUrl: playlist.thumbnail_url,
    youtubeId: playlist.youtube_id,
    tags: playlist.tags ? JSON.parse(playlist.tags) : [],
    createdAt: playlist.created_at,
    updatedAt: playlist.updated_at,
    lastViewedAt: playlist.last_viewed_at
  };
}

/**
 * Track analytics event
 */
async function trackEvent(env, userId, eventType, metadata = {}) {
  try {
    await env.DB.prepare(`
      INSERT INTO playlist_analytics 
      (id, user_id, event_type, metadata, timestamp)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    `).bind(
      crypto.randomUUID(),
      userId,
      eventType,
      JSON.stringify(metadata)
    ).run();
  } catch (error) {
    console.error('Failed to track event:', error);
  }
}

/**
 * Get playlist analytics
 */
async function getPlaylistAnalytics(db, playlistId, days) {
  const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  
  const analytics = await db.prepare(`
    SELECT event_type, COUNT(*) as count, 
           DATE(timestamp, 'unixepoch') as date
    FROM playlist_analytics 
    WHERE playlist_id = ? AND timestamp > ?
    GROUP BY event_type, date
    ORDER BY date DESC
  `).bind(playlistId, since).all();
  
  return analytics.results || [];
}

/**
 * Get recent activity
 */
async function getRecentActivity(db, userId, days) {
  const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  
  const activity = await db.prepare(`
    SELECT event_type, COUNT(*) as count,
           DATE(timestamp, 'unixepoch') as date
    FROM playlist_analytics 
    WHERE user_id = ? AND timestamp > ?
    GROUP BY event_type, date
    ORDER BY date DESC
    LIMIT 50
  `).bind(userId, since).all();
  
  return activity.results || [];
}

/**
 * Get import count for today
 */
async function getImportCountToday(db, userId) {
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM youtube_imports 
    WHERE user_id = ? AND started_at >= ?
  `).bind(userId, todayStart).first();
  
  return result?.count || 0;
}

/**
 * Update video position with proper reordering
 */
async function updateVideoPosition(db, playlistId, videoId, newPosition) {
  try {
    // Get current video
    const currentVideo = await db.prepare(`
      SELECT id, position FROM playlist_videos 
      WHERE playlist_id = ? AND (id = ? OR youtube_video_id = ?)
    `).bind(playlistId, videoId, videoId).first();
    
    if (!currentVideo) {
      return { success: false, error: 'Video not found' };
    }
    
    const oldPosition = currentVideo.position;
    
    if (oldPosition === newPosition) {
      return { success: true };
    }
    
    // Update positions of other videos
    if (newPosition > oldPosition) {
      // Moving down: decrease positions of videos between old and new position
      await db.prepare(`
        UPDATE playlist_videos 
        SET position = position - 1
        WHERE playlist_id = ? AND position > ? AND position <= ?
      `).bind(playlistId, oldPosition, newPosition).run();
    } else {
      // Moving up: increase positions of videos between new and old position
      await db.prepare(`
        UPDATE playlist_videos 
        SET position = position + 1
        WHERE playlist_id = ? AND position >= ? AND position < ?
      `).bind(playlistId, newPosition, oldPosition).run();
    }
    
    // Update the target video's position
    await db.prepare(`
      UPDATE playlist_videos 
      SET position = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(newPosition, currentVideo.id).run();
    
    return { success: true };
    
  } catch (error) {
    console.error('Update video position error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Increment login attempts for rate limiting
 */
async function incrementLoginAttempts(env, clientIP) {
  const key = `login_attempts:${clientIP}`;
  const current = await env.SESSIONS.get(key);
  const attempts = current ? parseInt(current) + 1 : 1;
  await env.SESSIONS.put(key, attempts.toString(), { expirationTtl: 15 * 60 }); // 15 minutes
}

/**
 * Log errors for monitoring
 */
async function logError(env, request, error) {
  try {
    const errorLog = {
      timestamp: Date.now(),
      url: request.url,
      method: request.method,
      error: error.message,
      stack: error.stack,
      userAgent: request.headers.get('User-Agent'),
      ip: request.headers.get('CF-Connecting-IP')
    };
    
    // Store in KV for debugging (optional)
    if (env.ERROR_LOGS) {
      const errorId = crypto.randomUUID();
      await env.ERROR_LOGS.put(errorId, JSON.stringify(errorLog), { 
        expirationTtl: 7 * 24 * 60 * 60 // 7 days
      });
    }
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }
}

/**
 * Helper function to create JSON responses with CORS
 */
function jsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': status >= 400 ? 'no-cache' : 'public, max-age=300',
      ...additionalHeaders
    }
  });
}