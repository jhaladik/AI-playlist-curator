// db-utils.js - Database utilities for AI Playlist Curator

/**
 * User database operations
 */
const UserDB = {
  async create(db, userData) {
    const { id, email, passwordHash, gdprConsent = 0 } = userData;
    
    return await db.prepare(`
      INSERT INTO users (id, email, password_hash, gdpr_consent)
      VALUES (?, ?, ?, ?)
    `).bind(id, email, passwordHash, gdprConsent).run();
  },

  async findByEmail(db, email) {
    return await db.prepare('SELECT * FROM users WHERE email = ?')
      .bind(email).first();
  },

  async findById(db, id) {
    return await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id).first();
  },

  async updateLastLogin(db, userId) {
    return await db.prepare(`
      UPDATE users 
      SET updated_at = strftime('%s', 'now') 
      WHERE id = ?
    `).bind(userId).run();
  },

  async delete(db, userId) {
    return await db.prepare('DELETE FROM users WHERE id = ?')
      .bind(userId).run();
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
    
    return await db.prepare(`
      INSERT INTO playlists (id, user_id, title, original_description, youtube_id, thumbnail_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, userId, title, originalDescription, youtubeId, thumbnailUrl).run();
  },

  async findByUserId(db, userId, limit = 50, offset = 0) {
    return await db.prepare(`
      SELECT * FROM playlists 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).bind(userId, limit, offset).all();
  },

  async findById(db, id) {
    return await db.prepare('SELECT * FROM playlists WHERE id = ?')
      .bind(id).first();
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
      throw new Error('No fields to update');
    }
    
    fields.push('updated_at = strftime(\'%s\', \'now\')');
    values.push(id);
    
    const query = `UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`;
    return await db.prepare(query).bind(...values).run();
  },

  async delete(db, id) {
    return await db.prepare('DELETE FROM playlists WHERE id = ?')
      .bind(id).run();
  },

  async incrementViews(db, id) {
    return await db.prepare(`
      UPDATE playlists 
      SET views = views + 1, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(id).run();
  },

  async getStats(db, userId) {
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
      totalPlaylists: result.total_playlists || 0,
      enhancedCount: result.enhanced_count || 0,
      totalViews: result.total_views || 0,
      totalVideos: result.total_videos || 0
    };
  }
};

/**
 * GDPR consent operations
 */
const GDPRConsentDB = {
  async record(db, consentData) {
    const { userId, consentType, granted, ipAddress } = consentData;
    const id = crypto.randomUUID();
    
    return await db.prepare(`
      INSERT INTO gdpr_consents (id, user_id, consent_type, granted, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, userId, consentType, granted ? 1 : 0, ipAddress).run();
  },

  async getByUser(db, userId) {
    return await db.prepare(`
      SELECT * FROM gdpr_consents 
      WHERE user_id = ? 
      ORDER BY timestamp DESC
    `).bind(userId).all();
  },

  async hasConsent(db, userId, consentType) {
    const result = await db.prepare(`
      SELECT granted FROM gdpr_consents 
      WHERE user_id = ? AND consent_type = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).bind(userId, consentType).first();
    
    return result ? Boolean(result.granted) : false;
  }
};

/**
 * Database health check
 */
async function checkDatabaseHealth(db) {
  try {
    const result = await db.prepare('SELECT 1 as health').first();
    return result.health === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Initialize database with schema
 */
async function initializeDatabase(db) {
  // This would run the schema creation
  // In practice, you'd run migrations separately via wrangler d1 execute
  console.log('Database initialization should be done via migrations');
  return true;
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

/**
 * Transaction wrapper (D1 doesn't support transactions yet, but good for future)
 */
async function withTransaction(db, operations) {
  // D1 doesn't support transactions yet, so we'll just execute operations
  // In the future, this could be enhanced with transaction support
  try {
    const results = [];
    for (const operation of operations) {
      const result = await operation(db);
      results.push(result);
    }
    return { success: true, results };
  } catch (error) {
    return handleDBError(error, 'transaction');
  }
}

export {
  UserDB,
  PlaylistDB,
  GDPRConsentDB,
  checkDatabaseHealth,
  initializeDatabase,
  handleDBError,
  withTransaction
};