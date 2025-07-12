// src/utils/youtube-api.js - YouTube Data API v3 integration utilities

/**
 * YouTube API client with quota management and caching
 */
export class YouTubeAPI {
    constructor(apiKey, db, cache) {
      this.apiKey = apiKey;
      this.db = db;
      this.cache = cache; // KV store for caching
      this.baseURL = 'https://www.googleapis.com/youtube/v3';
      this.quotaCosts = {
        playlists: 1,
        playlistItems: 1,
        videos: 1,
        channels: 1,
        search: 100
      };
    }
  
    /**
     * Extract playlist ID from various YouTube URL formats
     */
    static extractPlaylistId(url) {
      const patterns = [
        /[?&]list=([a-zA-Z0-9_-]+)/,  // Standard playlist URL
        /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/,
        /youtu\.be\/playlist\?list=([a-zA-Z0-9_-]+)/,
        /^([a-zA-Z0-9_-]{34})$/  // Direct playlist ID
      ];
  
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
  
      throw new Error('Invalid YouTube playlist URL or ID');
    }
  
    /**
     * Extract video ID from YouTube URL
     */
    static extractVideoId(url) {
      const patterns = [
        /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
        /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
      ];
  
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
  
      throw new Error('Invalid YouTube video URL or ID');
    }
  
    /**
     * Check and update daily quota usage
     */
    async checkQuota(cost) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      try {
        let quotaRecord = await this.db.prepare('SELECT * FROM youtube_quota_usage WHERE date = ?')
          .bind(today).first();
  
        if (!quotaRecord) {
          // Create new quota record for today
          const id = crypto.randomUUID();
          await this.db.prepare(`
            INSERT INTO youtube_quota_usage (id, date, quota_used, requests_count)
            VALUES (?, ?, 0, 0)
          `).bind(id, today).run();
          
          quotaRecord = { quota_used: 0, requests_count: 0 };
        }
  
        const newQuotaUsed = quotaRecord.quota_used + cost;
        
        // YouTube API free tier limit is 10,000 units per day
        if (newQuotaUsed > 10000) {
          throw new Error('Daily YouTube API quota exceeded');
        }
  
        // Update quota usage
        await this.db.prepare(`
          UPDATE youtube_quota_usage 
          SET quota_used = quota_used + ?, 
              requests_count = requests_count + 1,
              updated_at = strftime('%s', 'now')
          WHERE date = ?
        `).bind(cost, today).run();
  
        return true;
      } catch (error) {
        console.error('Quota check failed:', error);
        throw error;
      }
    }
  
    /**
     * Get cached response or fetch from API
     */
    async getCachedOrFetch(cacheKey, cacheType, apiCall, cacheDuration = 3600) {
      try {
        // Try to get from cache first
        const cached = await this.db.prepare(`
          SELECT data FROM youtube_cache 
          WHERE cache_key = ? AND expires_at > strftime('%s', 'now')
        `).bind(cacheKey).first();
  
        if (cached) {
          // Update access count
          await this.db.prepare(`
            UPDATE youtube_cache 
            SET accessed_count = accessed_count + 1,
                last_accessed = strftime('%s', 'now')
            WHERE cache_key = ?
          `).bind(cacheKey).run();
  
          return JSON.parse(cached.data);
        }
  
        // Not in cache or expired, fetch from API
        const data = await apiCall();
  
        // Store in cache
        const id = crypto.randomUUID();
        const expiresAt = Math.floor(Date.now() / 1000) + cacheDuration;
        
        await this.db.prepare(`
          INSERT OR REPLACE INTO youtube_cache 
          (id, cache_key, cache_type, data, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, cacheKey, cacheType, JSON.stringify(data), expiresAt).run();
  
        return data;
      } catch (error) {
        console.error('Cache operation failed:', error);
        // Fallback to direct API call
        return await apiCall();
      }
    }
  
    /**
     * Make YouTube API request with error handling
     */
    async makeRequest(endpoint, params = {}) {
      const url = new URL(`${this.baseURL}/${endpoint}`);
      url.searchParams.set('key', this.apiKey);
      
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      }
  
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`YouTube API error: ${errorMessage}`);
      }
  
      return await response.json();
    }
  
    /**
     * Get playlist details and metadata
     */
    async getPlaylist(playlistId) {
      const cacheKey = `playlist:${playlistId}`;
      
      return await this.getCachedOrFetch(cacheKey, 'playlist', async () => {
        await this.checkQuota(this.quotaCosts.playlists);
        
        const data = await this.makeRequest('playlists', {
          part: 'snippet,status,contentDetails',
          id: playlistId
        });
  
        if (!data.items || data.items.length === 0) {
          throw new Error('Playlist not found or is private');
        }
  
        const playlist = data.items[0];
        return {
          id: playlist.id,
          title: playlist.snippet.title,
          description: playlist.snippet.description,
          channelTitle: playlist.snippet.channelTitle,
          channelId: playlist.snippet.channelId,
          thumbnails: playlist.snippet.thumbnails,
          publishedAt: playlist.snippet.publishedAt,
          itemCount: playlist.contentDetails.itemCount,
          privacy: playlist.status.privacyStatus
        };
      }, 1800); // Cache for 30 minutes
    }
  
    /**
     * Get all videos from a playlist with batching
     */
    async getPlaylistVideos(playlistId, maxResults = 50) {
      const videos = [];
      let nextPageToken = null;
      let pageCount = 0;
      const maxPages = 10; // Prevent infinite loops
  
      do {
        pageCount++;
        if (pageCount > maxPages) {
          console.warn(`Reached max pages (${maxPages}) for playlist ${playlistId}`);
          break;
        }
  
        const cacheKey = `playlist_items:${playlistId}:${nextPageToken || 'first'}`;
        
        const pageData = await this.getCachedOrFetch(cacheKey, 'playlist_items', async () => {
          await this.checkQuota(this.quotaCosts.playlistItems);
          
          return await this.makeRequest('playlistItems', {
            part: 'snippet,status',
            playlistId: playlistId,
            maxResults: Math.min(maxResults, 50), // YouTube max is 50 per request
            pageToken: nextPageToken
          });
        }, 1800); // Cache for 30 minutes
  
        if (pageData.items) {
          const validVideos = pageData.items
            .filter(item => item.status.privacyStatus === 'public')
            .map(item => ({
              videoId: item.snippet.resourceId.videoId,
              title: item.snippet.title,
              description: item.snippet.description,
              channelTitle: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
              channelId: item.snippet.videoOwnerChannelId || item.snippet.channelId,
              thumbnails: item.snippet.thumbnails,
              publishedAt: item.snippet.publishedAt,
              position: item.snippet.position
            }));
  
          videos.push(...validVideos);
        }
  
        nextPageToken = pageData.nextPageToken;
        
        // Respect rate limits
        if (nextPageToken) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
  
      } while (nextPageToken && videos.length < maxResults);
  
      return videos;
    }
  
    /**
     * Get detailed video information in batches
     */
    async getVideoDetails(videoIds) {
      if (!Array.isArray(videoIds) || videoIds.length === 0) {
        return [];
      }
  
      const videoDetails = [];
      const batchSize = 50; // YouTube allows up to 50 IDs per request
  
      for (let i = 0; i < videoIds.length; i += batchSize) {
        const batch = videoIds.slice(i, i + batchSize);
        const cacheKey = `videos:${batch.sort().join(',')}`;
  
        const batchData = await this.getCachedOrFetch(cacheKey, 'videos', async () => {
          await this.checkQuota(this.quotaCosts.videos);
          
          return await this.makeRequest('videos', {
            part: 'snippet,contentDetails,statistics,status',
            id: batch.join(',')
          });
        }, 3600); // Cache for 1 hour
  
        if (batchData.items) {
          const details = batchData.items.map(video => ({
            id: video.id,
            title: video.snippet.title,
            description: video.snippet.description,
            channelTitle: video.snippet.channelTitle,
            channelId: video.snippet.channelId,
            thumbnails: video.snippet.thumbnails,
            publishedAt: video.snippet.publishedAt,
            duration: this.parseDuration(video.contentDetails.duration),
            viewCount: parseInt(video.statistics.viewCount) || 0,
            likeCount: parseInt(video.statistics.likeCount) || 0,
            commentCount: parseInt(video.statistics.commentCount) || 0,
            privacy: video.status.privacyStatus
          }));
  
          videoDetails.push(...details);
        }
  
        // Rate limiting between batches
        if (i + batchSize < videoIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
  
      return videoDetails;
    }
  
    /**
     * Parse YouTube duration format (PT1H2M3S) to readable format
     */
    parseDuration(duration) {
      if (!duration) return '0:00';
      
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return '0:00';
  
      const hours = parseInt(match[1]) || 0;
      const minutes = parseInt(match[2]) || 0;
      const seconds = parseInt(match[3]) || 0;
  
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }
  
    /**
     * Import full playlist with all video details
     */
    async importPlaylist(playlistId, maxVideos = 100) {
      try {
        // Get playlist metadata
        const playlistData = await this.getPlaylist(playlistId);
        
        // Get playlist videos
        const videos = await this.getPlaylistVideos(playlistId, maxVideos);
        
        if (videos.length === 0) {
          throw new Error('No public videos found in playlist');
        }
  
        // Get detailed video information
        const videoIds = videos.map(v => v.videoId);
        const videoDetails = await this.getVideoDetails(videoIds);
  
        // Merge playlist video data with detailed video data
        const enrichedVideos = videos.map(video => {
          const details = videoDetails.find(d => d.id === video.videoId);
          return {
            ...video,
            ...details,
            // Keep original position from playlist
            position: video.position
          };
        }).filter(video => video.privacy === 'public'); // Only public videos
  
        return {
          playlist: playlistData,
          videos: enrichedVideos,
          importedCount: enrichedVideos.length,
          totalFound: videos.length
        };
  
      } catch (error) {
        console.error('Playlist import failed:', error);
        throw new Error(`Failed to import playlist: ${error.message}`);
      }
    }
  
    /**
     * Get current quota usage for today
     */
    async getQuotaUsage() {
      const today = new Date().toISOString().split('T')[0];
      
      const record = await this.db.prepare('SELECT * FROM youtube_quota_usage WHERE date = ?')
        .bind(today).first();
  
      return {
        date: today,
        quotaUsed: record?.quota_used || 0,
        requestsCount: record?.requests_count || 0,
        quotaLimit: 10000,
        quotaRemaining: 10000 - (record?.quota_used || 0)
      };
    }
  
    /**
     * Clean expired cache entries
     */
    async cleanExpiredCache() {
      try {
        const result = await this.db.prepare(`
          DELETE FROM youtube_cache 
          WHERE expires_at < strftime('%s', 'now')
        `).run();
  
        return result.changes || 0;
      } catch (error) {
        console.error('Cache cleanup failed:', error);
        return 0;
      }
    }
  }
  
  /**
   * Validation utilities
   */
  export const ValidationUtils = {
    /**
     * Validate YouTube playlist URL or ID
     */
    validatePlaylistUrl(url) {
      if (!url || typeof url !== 'string') {
        return { valid: false, error: 'URL is required' };
      }
  
      try {
        const playlistId = YouTubeAPI.extractPlaylistId(url.trim());
        return { valid: true, playlistId };
      } catch (error) {
        return { valid: false, error: error.message };
      }
    },
  
    /**
     * Validate YouTube video URL or ID
     */
    validateVideoUrl(url) {
      if (!url || typeof url !== 'string') {
        return { valid: false, error: 'URL is required' };
      }
  
      try {
        const videoId = YouTubeAPI.extractVideoId(url.trim());
        return { valid: true, videoId };
      } catch (error) {
        return { valid: false, error: error.message };
      }
    },
  
    /**
     * Sanitize playlist data for storage
     */
    sanitizePlaylistData(data) {
      return {
        title: (data.title || '').substring(0, 200).trim(),
        description: (data.description || '').substring(0, 2000).trim(),
        channelTitle: (data.channelTitle || '').substring(0, 100).trim(),
        channelId: (data.channelId || '').trim(),
        thumbnailUrl: this.extractThumbnailUrl(data.thumbnails),
        publishedAt: data.publishedAt || null
      };
    },
  
    /**
     * Sanitize video data for storage
     */
    sanitizeVideoData(data) {
      return {
        title: (data.title || '').substring(0, 200).trim(),
        description: (data.description || '').substring(0, 2000).trim(),
        channelTitle: (data.channelTitle || '').substring(0, 100).trim(),
        channelId: (data.channelId || '').trim(),
        duration: data.duration || '0:00',
        thumbnailUrl: this.extractThumbnailUrl(data.thumbnails),
        publishedAt: data.publishedAt || null,
        viewCount: Math.max(0, parseInt(data.viewCount) || 0),
        likeCount: Math.max(0, parseInt(data.likeCount) || 0),
        position: Math.max(0, parseInt(data.position) || 0)
      };
    },
  
    /**
     * Extract best quality thumbnail URL
     */
    extractThumbnailUrl(thumbnails) {
      if (!thumbnails) return null;
      
      // Prefer higher quality thumbnails
      const qualities = ['maxres', 'standard', 'high', 'medium', 'default'];
      
      for (const quality of qualities) {
        if (thumbnails[quality]?.url) {
          return thumbnails[quality].url;
        }
      }
      
      return null;
    }
  };