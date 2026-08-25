const DB_NAME = 'ZokaUltraDB';
const DB_VERSION = 2;
const STORES = { PROJECTS: 'projects', MEDIA: 'media_blobs', EXPORTS: 'exports' };
const STORAGE_KEY = 'zoka_ultra_projects_fallback';

let dbPromise = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.MEDIA)) db.createObjectStore(STORES.MEDIA);
        if (!db.objectStoreNames.contains(STORES.EXPORTS)) db.createObjectStore(STORES.EXPORTS);
        if (!db.objectStoreNames.contains(STORES.PROJECTS)) db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
};

export const saveMediaBlob = async (id, blob) => {
  try {
    const db = await getDB();
    const tx = db.transaction(STORES.MEDIA, 'readwrite');
    tx.objectStore(STORES.MEDIA).put(blob, id);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) { console.warn('IndexedDB save failed, falling back to memory', e); }
};

export const getMediaBlob = async (id) => {
  try {
    const db = await getDB();
    const tx = db.transaction(STORES.MEDIA, 'readonly');
    const req = tx.objectStore(STORES.MEDIA).get(id);
    return await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
  } catch (e) { return null; }
};

export const saveProject = async (project) => {
  const data = { ...project, updatedAt: Date.now() };
  try {
    const db = await getDB();
    const tx = db.transaction(STORES.PROJECTS, 'readwrite');
    tx.objectStore(STORES.PROJECTS).put(data);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) {
    // LocalStorage Fallback
    const projects = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx >= 0) projects[idx] = data; else projects.push(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }
  return data;
};

export const fetchUserProjects = async () => {
  try {
    const db = await getDB();
    const tx = db.transaction(STORES.PROJECTS, 'readonly');
    const req = tx.objectStore(STORES.PROJECTS).getAll();
    const projects = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').sort((a, b) => b.updatedAt - a.updatedAt);
  }
};

export const deleteProject = async (id) => {
  try {
    const db = await getDB();
    const tx = db.transaction(STORES.PROJECTS, 'readwrite');
    tx.objectStore(STORES.PROJECTS).delete(id);
  } catch (e) {
    const projects = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }
};