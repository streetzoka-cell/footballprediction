// src/services/safeWrite.js
import { db } from '../utils/firebase';
import { doc, setDoc } from 'firebase/firestore';

const BACKEND_URL = "https://api.zokascore.xyz";

export async function safeWrite(collectionPath, docId, data, options = { merge: true }) {
  if (!db) throw new Error("Firestore not initialized");
  
  try {
    await setDoc(doc(db, collectionPath, docId), data, options);
    return { success: true, queued: false };
  } catch (err) {
    if (err.code === 'resource-exhausted' || err.message.includes('Quota exceeded') || err.message.includes('resource-exhausted')) {
      console.warn('[SafeWrite] Firebase quota exceeded! Falling back to backend queue...');
      
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/queue/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection: collectionPath, docId, data, options })
        });
        
        if (res.ok) return { success: true, queued: true };
        throw new Error(`Failed to queue write on backend (Status: ${res.status})`, { cause: err });
      } catch (fetchErr) {
        throw new Error('Network error while trying to queue write on backend', { cause: err });
      }
    }
    throw err;
  }
}