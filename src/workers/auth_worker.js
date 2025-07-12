// auth-worker.js - Authentication endpoints for AI Playlist Curator

import {
  createJWT,
  verifyJWT,
  hashPassword,
  verifyPassword,
  generateUserId,
  isValidEmail,
  isValidPassword,
  extractUserFromToken
} from '../utils/auth-utils.js';

import {
  UserDB,
  GDPRConsentDB,
  handleDBError
} from '../utils/db-utils.js';

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
      // Route handling
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
      
      return new Response('Not found', { status: 404 });
      
    } catch (error) {
      console.error('Auth worker error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
};

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
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
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
    
    // In a more complex setup, you'd invalidate the specific session
    // For now, we'll just return success since JWTs are stateless
    
    return jsonResponse({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
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