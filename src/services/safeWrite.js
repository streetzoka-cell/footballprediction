// src/services/safeWrite.js

import { db } from '../utils/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getAuthHeaders } from './backendAuth';

const BACKEND_URL = "https://api.zokascore.xyz";

/**
 * safeWrite
 *
 * Primary:
 *   Direct Firestore write
 *
 * Fallback:
 *   If Firebase quota is exceeded, queue the write through backend.
 *
 * The backend queue now requires authentication.
 * This version sends the Firebase ID token automatically.
 */
export async function safeWrite(collectionPath, docId, data, options = { merge: true }) {
  if (!db) {
    throw new Error("Firestore not initialized");
  }

  try {
    await setDoc(doc(db, collectionPath, docId), data, options);

    return {
      success: true,
      queued: false,
    };
  } catch (err) {
    const isQuotaError =
      err.code === 'resource-exhausted' ||
      err.message?.includes('Quota exceeded') ||
      err.message?.includes('resource-exhausted');

    if (!isQuotaError) {
      throw err;
    }

    console.warn('[SafeWrite] Firebase quota exceeded. Trying backend queue fallback...');

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
        }),
      });

      if (res.ok) {
        console.info('[SafeWrite] Write successfully queued on backend.');

        return {
          success: true,
          queued: true,
        };
      }

      if (res.status === 503) {
        console.warn('[SafeWrite] Backend queue endpoint is disabled.');
        throw err;
      }

      if (res.status === 401 || res.status === 403) {
        console.warn('[SafeWrite] Backend queue rejected authentication/permissions.');
        throw err;
      }

      throw new Error(`Backend queue fallback failed with status ${res.status}`, {
        cause: err,
      });
    } catch (fetchErr) {
      console.error('[SafeWrite] Backend queue fallback failed:', fetchErr.message);

      throw new Error('Network error while trying to queue write on backend', {
        cause: err,
      });
    }
  }
}