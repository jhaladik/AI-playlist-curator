// src/utils/validation.js - Input validation utilities for Phase 2

/**
 * General validation utilities
 */
export const Validator = {
    /**
     * Validate required string field
     */
    validateRequired(value, fieldName, maxLength = null) {
      if (!value || typeof value !== 'string' || value.trim().length === 0) {
        return { valid: false, error: `${fieldName} is required` };
      }
      
      if (maxLength && value.trim().length > maxLength) {
        return { valid: false, error: `${fieldName} must be less than ${maxLength} characters` };
      }
      
      return { valid: true, value: value.trim() };
    },
  
    /**
     * Validate optional string field
     */
    validateOptional(value, fieldName, maxLength = null) {
      if (!value) return { valid: true, value: null };
      
      if (typeof value !== 'string') {
        return { valid: false, error: `${fieldName} must be a string` };
      }
      
      if (maxLength && value.trim().length > maxLength) {
        return { valid: false, error: `${fieldName} must be less than ${maxLength} characters` };
      }
      
      return { valid: true, value: value.trim() };
    },
  
    /**
     * Validate integer field
     */
    validateInteger(value, fieldName, min = null, max = null) {
      if (value === null || value === undefined) {
        return { valid: true, value: null };
      }
      
      const intValue = parseInt(value);
      if (isNaN(intValue)) {
        return { valid: false, error: `${fieldName} must be a valid integer` };
      }
      
      if (min !== null && intValue < min) {
        return { valid: false, error: `${fieldName} must be at least ${min}` };
      }
      
      if (max !== null && intValue > max) {
        return { valid: false, error: `${fieldName} must be no more than ${max}` };
      }
      
      return { valid: true, value: intValue };
    },
  
    /**
     * Validate UUID
     */
    validateUUID(value, fieldName) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!value || !uuidRegex.test(value)) {
        return { valid: false, error: `${fieldName} must be a valid UUID` };
      }
      
      return { valid: true, value: value.toLowerCase() };
    },
  
    /**
     * Validate pagination parameters
     */
    validatePagination(limit, offset) {
      const limitResult = this.validateInteger(limit, 'limit', 1, 100);
      if (!limitResult.valid) return limitResult;
      
      const offsetResult = this.validateInteger(offset, 'offset', 0);
      if (!offsetResult.valid) return offsetResult;
      
      return {
        valid: true,
        value: {
          limit: limitResult.value || 50,
          offset: offsetResult.value || 0
        }
      };
    }
  };
  
  /**
   * YouTube-specific validation utilities
   */
  export const YouTubeValidator = {
    /**
     * Validate YouTube playlist URL formats
     */
    validatePlaylistUrl(url) {
      const patterns = [
        {
          regex: /(?:youtube\.com\/playlist\?list=|youtu\.be\/playlist\?list=)([a-zA-Z0-9_-]+)/,
          description: 'YouTube playlist URL'
        },
        {
          regex: /^[a-zA-Z0-9_-]{34}$/,
          description: 'YouTube playlist ID'
        },
        {
          regex: /[?&]list=([a-zA-Z0-9_-]+)/,
          description: 'URL with playlist parameter'
        }
      ];
  
      if (!url || typeof url !== 'string') {
        return { valid: false, error: 'URL is required' };
      }
  
      const cleanUrl = url.trim();
      
      for (const pattern of patterns) {
        const match = cleanUrl.match(pattern.regex);
        if (match) {
          const playlistId = match[1] || match[0];
          
          // Validate playlist ID format
          if (!/^[a-zA-Z0-9_-]{34}$/.test(playlistId)) {
            return { valid: false, error: 'Invalid playlist ID format' };
          }
          
          return { 
            valid: true, 
            playlistId,
            originalUrl: cleanUrl,
            extractedFrom: pattern.description
          };
        }
      }
  
      return { 
        valid: false, 
        error: 'Invalid YouTube playlist URL. Supported formats: youtube.com/playlist?list=..., youtu.be/playlist?list=..., or direct playlist ID' 
      };
    },
  
    /**
     * Validate YouTube video URL formats
     */
    validateVideoUrl(url) {
      const patterns = [
        {
          regex: /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
          description: 'YouTube video URL'
        },
        {
          regex: /^[a-zA-Z0-9_-]{11}$/,
          description: 'YouTube video ID'
        }
      ];
  
      if (!url || typeof url !== 'string') {
        return { valid: false, error: 'Video URL is required' };
      }
  
      const cleanUrl = url.trim();
      
      for (const pattern of patterns) {
        const match = cleanUrl.match(pattern.regex);
        if (match) {
          const videoId = match[1] || match[0];
          
          // Validate video ID format
          if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return { valid: false, error: 'Invalid video ID format' };
          }
          
          return { 
            valid: true, 
            videoId,
            originalUrl: cleanUrl,
            extractedFrom: pattern.description
          };
        }
      }
  
      return { 
        valid: false, 
        error: 'Invalid YouTube video URL. Supported formats: youtube.com/watch?v=..., youtu.be/..., or direct video ID' 
      };
    },
  
    /**
     * Validate import options
     */
    validateImportOptions(options = {}) {
      const errors = [];
      const validated = {};
  
      // Max videos to import
      const maxVideosResult = Validator.validateInteger(options.maxVideos, 'maxVideos', 1, 500);
      if (!maxVideosResult.valid) {
        errors.push(maxVideosResult.error);
      } else {
        validated.maxVideos = maxVideosResult.value || 100;
      }
  
      // Include video details
      validated.includeDetails = Boolean(options.includeDetails !== false); // Default true
  
      // Include private videos (for owned playlists)
      validated.includePrivate = Boolean(options.includePrivate);
  
      // Custom title override
      const titleResult = Validator.validateOptional(options.customTitle, 'customTitle', 200);
      if (!titleResult.valid) {
        errors.push(titleResult.error);
      } else {
        validated.customTitle = titleResult.value;
      }
  
      // Custom description override
      const descResult = Validator.validateOptional(options.customDescription, 'customDescription', 2000);
      if (!descResult.valid) {
        errors.push(descResult.error);
      } else {
        validated.customDescription = descResult.value;
      }
  
      return {
        valid: errors.length === 0,
        errors,
        options: validated
      };
    }
  };
  
  /**
   * Playlist validation utilities
   */
  export const PlaylistValidator = {
    /**
     * Validate playlist creation data
     */
    validateCreateData(data) {
      const errors = [];
      const validated = {};
  
      // Title validation
      const titleResult = Validator.validateRequired(data.title, 'title', 200);
      if (!titleResult.valid) {
        errors.push(titleResult.error);
      } else {
        validated.title = titleResult.value;
      }
  
      // Description validation
      const descResult = Validator.validateOptional(data.originalDescription, 'description', 2000);
      if (!descResult.valid) {
        errors.push(descResult.error);
      } else {
        validated.originalDescription = descResult.value;
      }
  
      // YouTube ID validation (optional)
      if (data.youtubeId) {
        const youtubeResult = YouTubeValidator.validatePlaylistUrl(data.youtubeId);
        if (!youtubeResult.valid) {
          errors.push(`YouTube ID: ${youtubeResult.error}`);
        } else {
          validated.youtubeId = youtubeResult.playlistId;
        }
      }
  
      // Thumbnail URL validation (optional)
      const thumbnailResult = Validator.validateOptional(data.thumbnailUrl, 'thumbnailUrl', 500);
      if (!thumbnailResult.valid) {
        errors.push(thumbnailResult.error);
      } else {
        validated.thumbnailUrl = thumbnailResult.value;
      }
  
      return {
        valid: errors.length === 0,
        errors,
        data: validated
      };
    },
  
    /**
     * Validate playlist update data
     */
    validateUpdateData(data) {
      const errors = [];
      const validated = {};
  
      // Only validate provided fields
      if (data.title !== undefined) {
        const titleResult = Validator.validateRequired(data.title, 'title', 200);
        if (!titleResult.valid) {
          errors.push(titleResult.error);
        } else {
          validated.title = titleResult.value;
        }
      }
  
      if (data.originalDescription !== undefined) {
        const descResult = Validator.validateOptional(data.originalDescription, 'description', 2000);
        if (!descResult.valid) {
          errors.push(descResult.error);
        } else {
          validated.originalDescription = descResult.value;
        }
      }
  
      if (data.aiDescription !== undefined) {
        const aiDescResult = Validator.validateOptional(data.aiDescription, 'AI description', 5000);
        if (!aiDescResult.valid) {
          errors.push(aiDescResult.error);
        } else {
          validated.aiDescription = aiDescResult.value;
        }
      }
  
      if (data.enhanced !== undefined) {
        validated.enhanced = Boolean(data.enhanced);
      }
  
      return {
        valid: errors.length === 0,
        errors,
        data: validated
      };
    }
  };
  
  /**
   * Video validation utilities  
   */
  export const VideoValidator = {
    /**
     * Validate video data for storage
     */
    validateVideoData(data) {
      const errors = [];
      const validated = {};
  
      // Video ID (required)
      const videoIdResult = Validator.validateRequired(data.videoId, 'videoId', 11);
      if (!videoIdResult.valid) {
        errors.push(videoIdResult.error);
      } else {
        // Additional validation for YouTube video ID format
        if (!/^[a-zA-Z0-9_-]{11}$/.test(data.videoId)) {
          errors.push('Invalid YouTube video ID format');
        } else {
          validated.videoId = data.videoId;
        }
      }
  
      // Title (required)
      const titleResult = Validator.validateRequired(data.title, 'title', 200);
      if (!titleResult.valid) {
        errors.push(titleResult.error);
      } else {
        validated.title = titleResult.value;
      }
  
      // Optional fields
      validated.description = Validator.validateOptional(data.description, 'description', 2000).value;
      validated.channelTitle = Validator.validateOptional(data.channelTitle, 'channelTitle', 100).value;
      validated.channelId = Validator.validateOptional(data.channelId, 'channelId', 50).value;
      validated.duration = Validator.validateOptional(data.duration, 'duration', 20).value || '0:00';
      validated.thumbnailUrl = Validator.validateOptional(data.thumbnailUrl, 'thumbnailUrl', 500).value;
      validated.publishedAt = Validator.validateOptional(data.publishedAt, 'publishedAt', 50).value;
  
      // Integer fields
      const viewCountResult = Validator.validateInteger(data.viewCount, 'viewCount', 0);
      validated.viewCount = viewCountResult.valid ? viewCountResult.value : 0;
  
      const likeCountResult = Validator.validateInteger(data.likeCount, 'likeCount', 0);
      validated.likeCount = likeCountResult.valid ? likeCountResult.value : 0;
  
      const positionResult = Validator.validateInteger(data.position, 'position', 0);
      validated.position = positionResult.valid ? positionResult.value : 0;
  
      return {
        valid: errors.length === 0,
        errors,
        data: validated
      };
    },
  
    /**
     * Validate video position update
     */
    validatePositionUpdate(position) {
      return Validator.validateInteger(position, 'position', 0, 10000);
    }
  };
  
  /**
   * Request validation utilities
   */
  export const RequestValidator = {
    /**
     * Validate request body JSON
     */
    async validateJsonBody(request, requiredFields = []) {
      try {
        const data = await request.json();
        
        if (!data || typeof data !== 'object') {
          return { valid: false, error: 'Invalid JSON body' };
        }
  
        const missing = requiredFields.filter(field => !(field in data));
        if (missing.length > 0) {
          return { 
            valid: false, 
            error: `Missing required fields: ${missing.join(', ')}` 
          };
        }
  
        return { valid: true, data };
      } catch (error) {
        return { valid: false, error: 'Invalid JSON format' };
      }
    },
  
    /**
     * Validate URL parameters
     */
    validateUrlParams(url, requiredParams = []) {
      const params = {};
      const missing = [];
  
      for (const param of requiredParams) {
        const value = url.searchParams.get(param);
        if (!value) {
          missing.push(param);
        } else {
          params[param] = value;
        }
      }
  
      return {
        valid: missing.length === 0,
        error: missing.length > 0 ? `Missing required parameters: ${missing.join(', ')}` : null,
        params
      };
    },
  
    /**
     * Validate import request
     */
    async validateImportRequest(request) {
      const bodyResult = await this.validateJsonBody(request, ['url']);
      if (!bodyResult.valid) return bodyResult;
  
      const { url, options = {} } = bodyResult.data;
  
      // Validate YouTube URL
      const urlResult = YouTubeValidator.validatePlaylistUrl(url);
      if (!urlResult.valid) {
        return { valid: false, error: urlResult.error };
      }
  
      // Validate options
      const optionsResult = YouTubeValidator.validateImportOptions(options);
      if (!optionsResult.valid) {
        return { valid: false, error: optionsResult.errors.join(', ') };
      }
  
      return {
        valid: true,
        data: {
          playlistId: urlResult.playlistId,
          originalUrl: url,
          options: optionsResult.options
        }
      };
    }
  };
  
  /**
   * Sanitization utilities
   */
  export const Sanitizer = {
    /**
     * Remove potentially harmful HTML tags and scripts
     */
    sanitizeText(text) {
      if (!text || typeof text !== 'string') return '';
      
      return text
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    },
  
    /**
     * Sanitize URL to prevent XSS
     */
    sanitizeUrl(url) {
      if (!url || typeof url !== 'string') return null;
      
      // Only allow HTTP/HTTPS URLs
      if (!/^https?:\/\//i.test(url)) return null;
      
      // Basic URL validation
      try {
        new URL(url);
        return url;
      } catch {
        return null;
      }
    },
  
    /**
     * Sanitize filename for storage
     */
    sanitizeFilename(filename) {
      if (!filename || typeof filename !== 'string') return 'untitled';
      
      return filename
        .replace(/[^a-zA-Z0-9\s\-_\.]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100)
        .trim() || 'untitled';
    }
  };