// src/services/safeWrite.js
import { getAuthHeaders } from "../services/backendAuth";

const BACKEND_URL = "https://api.zokascore.xyz";

/**
 * safeWrite
 * 
 * All frontend writes now go directly to the backend queue.
 * The backend handles saving locally and syncing to Firestore asynchronously.
 */
export async function safeWrite(collectionPath, docId, data, options = { merge: true }) {
  try {
    const authHeaders = await getAuthHeaders();

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
        source: 'frontend'
      }),
    });

    if (res.ok) {
      return {
        success: true,
        queued: true,
      };
    }

    if (res.status === 503) {
      throw new Error('Backend queue endpoint is disabled.');
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error('Backend queue rejected authentication/permissions.');
    }

    throw new Error(`Backend queue failed with status ${res.status}`);
  } catch (err) {
    console.error('[SafeWrite] Backend queue failed:', err.message);
    throw err;
  }
}