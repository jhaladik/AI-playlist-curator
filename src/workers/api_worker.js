// api-worker.js - Main API router for AI Playlist Curator

import { extractUserFromToken } from '../utils/auth-utils.js';
import { PlaylistDB, handleDBError } from '../utils/db-utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    
    try {
      // Health check endpoint
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse({ status: 'healthy', timestamp: Date.now() });
      }
      
      // Playlist endpoints
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
      
      return new Response('Not found', { status: 404 });
      
    } catch (error) {
      console.error('API worker error:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }
};

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
    
    // Delete playlist
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

/**
 * Helper function to create JSON responses with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}