import { auth } from '../utils/firebase';

let cachedToken = null;
let cachedTokenExpiry = 0;
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getAuthHeaders() {
  if (!auth || !auth.currentUser) return {};

  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiry) {
    return { Authorization: `Bearer ${cachedToken}` };
  }

  try {
    const token = await auth.currentUser.getIdToken(false);
    cachedToken = token;
    cachedTokenExpiry = now + TOKEN_CACHE_TTL;
    return { Authorization: `Bearer ${token}` };
  } catch (err) {
    console.warn('[backendAuth] Could not fetch Firebase ID token:', err.message);
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

export function clearCachedToken() {
  cachedToken = null;
  cachedTokenExpiry = 0;
}

export async function getIdToken() {
  if (!auth || !auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(false);
  } catch {
    return null;
  }
}