// footballprediction/src/services/backendAuth.js
import { auth } from '../utils/firebase';

/**
 * Returns authentication headers for backend API requests.
 *
 * The backend verifies the Firebase ID token (sent as a Bearer token)
 * and checks the user's role (admin/staff) for protected endpoints
 * like /queue/add, /featured/admin/*, /zoka-picks/admin/*, etc.
 *
 * @returns {Promise<Object>} { Authorization: 'Bearer <token>' } or {} if no user.
 */
export async function getAuthHeaders() {
  if (!auth || !auth.currentUser) {
    return {};
  }

  try {
    const token = await auth.currentUser.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
    };
  } catch (err) {
    console.warn('[backendAuth] Could not fetch Firebase ID token:', err.message);
    return {};
  }
}

/**
 * Convenience helper: returns the raw ID token string (or null).
 */
export async function getIdToken() {
  if (!auth || !auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}