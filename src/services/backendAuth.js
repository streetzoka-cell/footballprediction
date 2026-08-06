import { auth } from '../utils/firebase';

// Token cache - prevents calling getIdToken on every request
let cachedToken = null;
let cachedTokenExpiry = 0;
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Returns authentication headers for backend API requests.
 * Uses in-memory token caching to avoid excessive Firebase calls.
 */
export async function getAuthHeaders() {
  if (!auth || !auth.currentUser) {
    return {};
  }

  const now = Date.now();

  // Return cached token if still valid
  if (cachedToken && now < cachedTokenExpiry) {
    return { Authorization: `Bearer ${cachedToken}` };
  }

  try {
    // getIdToken(false) returns cached token from Firebase SDK if still valid
    const token = await auth.currentUser.getIdToken(false);
    cachedToken = token;
    cachedTokenExpiry = now + TOKEN_CACHE_TTL;
    return { Authorization: `Bearer ${token}` };
  } catch (err) {
    console.warn('[backendAuth] Could not fetch Firebase ID token:', err.message);

    // Try force refresh as fallback
    try {
      const token = await auth.currentUser.getIdToken(true);
      cachedToken = token;
      cachedTokenExpiry = now + TOKEN_CACHE_TTL;
      return { Authorization: `Bearer ${token}` };
    } catch {
      return {};
    }
  }
}

/**
 * Clears the cached token. Call this on sign out.
 */
export function clearCachedToken() {
  cachedToken = null;
  cachedTokenExpiry = 0;
}

/**
 * Convenience helper: returns the raw ID token string (or null).
 */
export async function getIdToken() {
  if (!auth || !auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(false);
  } catch {
    return null;
  }
}