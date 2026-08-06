import { getAuthHeaders } from "../services/backendAuth";

const BACKEND_URL = "https://api.zokascore.xyz";

/**
 * safeWrite - All frontend writes go to the backend queue.
 * The backend handles saving locally and syncing to Firestore asynchronously.
 *
 * Includes retry logic for network resilience.
 */
export async function safeWrite(collectionPath, docId, data, options = { merge: true }) {
  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const authHeaders = await getAuthHeaders();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${BACKEND_URL}/api/v1/queue/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          collection: collectionPath,
          docId,
          data,
          options,
          priority: 'high',
          source: 'frontend',
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        return { success: true, queued: true };
      }

      if (res.status === 503) {
        throw new Error('Backend queue endpoint is disabled.');
      }

      if (res.status === 401 || res.status === 403) {
        throw new Error('Backend queue rejected authentication/permissions.');
      }

      throw new Error(`Backend queue failed with status ${res.status}`);
    } catch (err) {
      lastError = err;

      if (err.message.includes('authentication') || err.message.includes('disabled')) {
        throw err;
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      console.error('[SafeWrite] Backend queue failed after retries:', err.message);
      throw err;
    }
  }

  throw lastError || new Error('Unknown safeWrite error');
}