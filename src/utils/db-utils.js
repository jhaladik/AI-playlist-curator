// db-utils.js - Corrected Database utilities for AI Playlist Curator

/**
 * User database operations
 */
const UserDB = {
  async create(db, userData) {
    const { id, email, passwordHash, gdprConsent = 0 } = userData;
    
    try {
      const result = await db.prepare(`
        INSERT INTO users (id, email, password_hash, gdpr_consent)
        VALUES (?, ?, ?, ?)
      `).bind(id, email, passwordHash, gdprConsent).run();
      
      return { success: result.success || true, meta: result.meta };
    } catch (error) {
      console.error('UserDB.create error:', error);
      return { success: false, error: error.message };
    }
  },

  async findByEmail(db, email) {
    try {
      const result = await db.prepare('SELECT * FROM users WHERE email = ?')
        .bind(email).first();
      return result;
    } catch (error) {
      console.error('UserDB.findByEmail error:', error);
      return null;
    }
  },

  async findById(db, id) {
    try {
      const result = await db.prepare('SELECT * FROM users WHERE id = ?')
        .bind(id).first();
      return result;
    } catch (error) {
      console.error('UserDB.findById error:', error);
      return null;
    }
  },

  async updateLastLogin(db, userId) {
    try {
      const result = await db.prepare(`
        UPDATE users 
        SET updated_at = strftime('%s', 'now') 
        WHERE id = ?
      `).bind(userId).run();
      
      return { success: result.success || true };
    } catch (error) {
      console.error('UserDB.updateLastLogin error:', error);
      return { success: false, error: error.message };
    }
  },

  async delete(db, userId) {
    try {
      const result = await db.prepare('DELETE FROM users WHERE id = ?')
        .bind(userId).run();
      
      return { success: result.success || true };
    } catch (error) {
      console.error('UserDB.delete error:', error);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Playlist database operations
 */
const PlaylistDB = {
  async create(db, playlistData) {
    const {
      id,
      userId,
      title,
      originalDescription = '',
      youtubeId = null,
      thumbnailUrl = null
    } = playlistData;
    
    try {
      const result = await db.prepare(`
        INSERT INTO playlists (id, user_id, title, original_description, youtube_id, thumbnail_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, userId, title, originalDescription, youtubeId, thumbnailUrl).run();
      
      return { success: result.success || true, meta: result.meta };
    } catch (error) {
      console.error('PlaylistDB.create error:', error);
      return { success: false, error: error.message };
    }
  },

  async findByUserId(db, userId, limit = 50, offset = 0) {
    try {
      const result = await db.prepare(`
        SELECT * FROM playlists 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all();
      
      return { success: true, results: result.results || [] };
    } catch (error) {
      console.error('PlaylistDB.findByUserId error:', error);
      return { success: false, results: [], error: error.message };
    }
  },

  async findById(db, id) {
    try {
      const result = await db.prepare('SELECT * FROM playlists WHERE id = ?')
        .bind(id).first();
      return result;
    } catch (error) {
      console.error('PlaylistDB.findById error:', error);
      return null;
    }
  },

  async update(db, id, updates) {
    const { title, originalDescription, aiDescription, enhanced } = updates;
    const fields = [];
    const values = [];
    
    if (title !== undefined) {
      fields.push('title = ?');
      values.push(title);
    }
    if (originalDescription !== undefined) {
      fields.push('original_description = ?');
      values.push(originalDescription);
    }
    if (aiDescription !== undefined) {
      fields.push('ai_description = ?');
      values.push(aiDescription);
    }
    if (enhanced !== undefined) {
      fields.push('enhanced = ?');
      values.push(enhanced ? 1 : 0);
    }
    
    if (fields.length === 0) {
      return { success: false, error: 'No fields to update' };
    }
    
    fields.push('updated_at = strftime(\'%s\', \'now\')');
    values.push(id);
    
    try {
      const query = `UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`;
      const result = await db.prepare(query).bind(...values).run();
      
      return { success: result.success || true };
    } catch (error) {
      console.error('PlaylistDB.update error:', error);
      return { success: false, error: error.message };
    }
  },

  async delete(db, id) {
    try {
      const result = await db.prepare('DELETE FROM playlists WHERE id = ?')
        .bind(id).run();
      
      return { success: result.success || true };
    } catch (error) {
      console.error('PlaylistDB.delete error:', error);
      return { success: false, error: error.message };
    }
  },

  async incrementViews(db, id) {
    try {
      const result = await db.prepare(`
        UPDATE playlists 
        SET views = views + 1, updated_at = strftime('%s', 'now')
        WHERE id = ?
      `).bind(id).run();
      
      return { success: result.success || true };
    } catch (error) {
      console.error('PlaylistDB.incrementViews error:', error);
      return { success: false, error: error.message };
    }
  },

  async getStats(db, userId) {
    try {
      const result = await db.prepare(`
        SELECT 
          COUNT(*) as total_playlists,
          SUM(CASE WHEN enhanced = 1 THEN 1 ELSE 0 END) as enhanced_count,
          SUM(views) as total_views,
          SUM(video_count) as total_videos
        FROM playlists 
        WHERE user_id = ?
      `).bind(userId).first();
      
      return {
        totalPlaylists: result?.total_playlists || 0,
        enhancedCount: result?.enhanced_count || 0,
        totalViews: result?.total_views || 0,
        totalVideos: result?.total_videos || 0
      };
    } catch (error) {
      console.error('PlaylistDB.getStats error:', error);
      return {
        totalPlaylists: 0,
        enhancedCount: 0,
        totalViews: 0,
        totalVideos: 0
      };
    }
  }
};

/**
 * GDPR consent operations
 */
const GDPRConsentDB = {
  async record(db, consentData) {
    const { userId, consentType, granted, ipAddress } = consentData;
    const id = crypto.randomUUID();
    
    try {
      const result = await db.prepare(`
        INSERT INTO gdpr_consents (id, user_id, consent_type, granted, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `).bind(id, userId, consentType, granted ? 1 : 0, ipAddress).run();
      
      return { success: result.success || true };
    } catch (error) {
      console.error('GDPRConsentDB.record error:', error);
      return { success: false, error: error.message };
    }
  },

  async getByUser(db, userId) {
    try {
      const result = await db.prepare(`
        SELECT * FROM gdpr_consents 
        WHERE user_id = ? 
        ORDER BY timestamp DESC
      `).bind(userId).all();
      
      return result.results || [];
    } catch (error) {
      console.error('GDPRConsentDB.getByUser error:', error);
      return [];
    }
  },

  async hasConsent(db, userId, consentType) {
    try {
      const result = await db.prepare(`
        SELECT granted FROM gdpr_consents 
        WHERE user_id = ? AND consent_type = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
      `).bind(userId, consentType).first();
      
      return result ? Boolean(result.granted) : false;
    } catch (error) {
      console.error('GDPRConsentDB.hasConsent error:', error);
      return false;
    }
  }
};

/**
 * Database health check
 */
async function checkDatabaseHealth(db) {
  try {
    const result = await db.prepare('SELECT 1 as health').first();
    return result?.health === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Generic error handler for database operations
 */
function handleDBError(error, operation) {
  console.error(`Database error in ${operation}:`, error);
  
  if (error.message.includes('UNIQUE constraint')) {
    return { success: false, error: 'Record already exists' };
  }
  
  if (error.message.includes('FOREIGN KEY constraint')) {
    return { success: false, error: 'Referenced record not found' };
  }
  
  return { success: false, error: 'Database operation failed' };
}

export {
  UserDB,
  PlaylistDB,
  GDPRConsentDB,
  checkDatabaseHealth,
  handleDBError
};