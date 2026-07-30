import { db } from '../utils/firebase';
import { doc, setDoc } from 'firebase/firestore';

const BACKEND_URL = "https://api.zokascore.xyz";

export async function safeWrite(collectionPath, docId, data, options = { merge: true }) {
  try {
    // 1. Try writing directly to Firebase
    await setDoc(doc(db, collectionPath, docId), data, options);
    return { success: true, queued: false };
  } catch (err) {
    // 2. If quota exceeded, send to backend queue!
    if (err.code === 'resource-exhausted' || err.message.includes('Quota exceeded') || err.message.includes('resource-exhausted')) {
      console.warn('[SafeWrite] Firebase quota exceeded! Falling back to backend queue...');
      
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/queue/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection: collectionPath, docId, data, options })
        });
        
        if (res.ok) {
          return { success: true, queued: true };
        } else {
          // ★ FIX: Attach the original error as the cause
          throw new Error(`Failed to queue write on backend (Status: ${res.status})`, { cause: err });
        }
      } catch (fetchErr) {
        // If the fetch itself fails, attach the original Firebase error
        throw new Error('Network error while trying to queue write on backend', { cause: err });
      }
    }
    // If it's a different error, throw it normally
    throw err;
  }
}