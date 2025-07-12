// auth-utils.js - JWT and password utilities for AI Playlist Curator

/**
 * Create a JWT token with user data
 */
async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return `${data}.${encodedSignature}`;
}

/**
 * Verify and decode a JWT token
 */
async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  
  const signature = new Uint8Array(atob(encodedSignature).split('').map(c => c.charCodeAt(0)));
  const isValid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(data));
  
  if (!isValid) throw new Error('Invalid token signature');
  
  return JSON.parse(atob(encodedPayload));
}

/**
 * Hash password using bcrypt-like approach with Web Crypto API
 */
async function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const saltData = typeof salt === 'string' ? encoder.encode(salt) : salt;
  
  const key = await crypto.subtle.importKey('raw', data, { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations: 100000,
      hash: 'SHA-256'
    },
    key,
    256
  );
  
  const hashArray = new Uint8Array(derivedBits);
  const saltArray = new Uint8Array(saltData);
  
  // Combine salt and hash
  const combined = new Uint8Array(saltArray.length + hashArray.length);
  combined.set(saltArray);
  combined.set(hashArray, saltArray.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify password against hash
 */
async function verifyPassword(password, hashedPassword) {
  try {
    const combined = new Uint8Array(atob(hashedPassword).split('').map(c => c.charCodeAt(0)));
    const salt = combined.slice(0, 16);
    const hash = combined.slice(16);
    
    const newHash = await hashPassword(password, salt);
    const newHashArray = new Uint8Array(atob(newHash).split('').map(c => c.charCodeAt(0)));
    const newHashOnly = newHashArray.slice(16);
    
    // Constant-time comparison
    let isMatch = true;
    for (let i = 0; i < hash.length; i++) {
      if (hash[i] !== newHashOnly[i]) isMatch = false;
    }
    
    return isMatch;
  } catch (error) {
    return false;
  }
}

/**
 * Generate a secure random user ID
 */
function generateUserId() {
  return crypto.randomUUID();
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
function isValidPassword(password) {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  return password.length >= 8 && 
         /[A-Z]/.test(password) && 
         /[a-z]/.test(password) && 
         /\d/.test(password);
}

/**
 * Extract user info from request headers
 */
function extractUserFromToken(request, secret) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No authentication token provided');
  }
  
  const token = authHeader.replace('Bearer ', '');
  return verifyJWT(token, secret);
}

export {
  createJWT,
  verifyJWT,
  hashPassword,
  verifyPassword,
  generateUserId,
  isValidEmail,
  isValidPassword,
  extractUserFromToken
};