const DB_NAME = 'ZokaStudioDB';
const STORE_MEDIA = 'media_blobs';
const STORAGE_KEY_PROJECTS = 'zokascore_studio_projects';

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = (e) => {
    if (!e.target.result.objectStoreNames.contains(STORE_MEDIA)) {
      e.target.result.createObjectStore(STORE_MEDIA);
    }
  };
  req.onsuccess = (e) => resolve(e.target.result);
  req.onerror = (e) => reject(e.target.error);
});

export async function saveMediaBlob(id, blob) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).put(blob, id);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) { console.error('IDB save failed', e); }
}

export async function getMediaBlob(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const req = tx.objectStore(STORE_MEDIA).get(id);
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
  } catch (e) { return null; }
}

export async function deleteMediaBlob(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).delete(id);
  } catch (e) {}
}

export function fetchUserProjects() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PROJECTS);
    return data ? JSON.parse(data) : [];
  } catch (e) { return []; }
}

export function saveProject(project) {
  try {
    const projects = fetchUserProjects();
    const existingIndex = projects.findIndex(p => p.id === project.id);
    const updatedProject = { ...project, updatedAt: Date.now() };
    
    if (existingIndex >= 0) projects[existingIndex] = updatedProject;
    else projects.push(updatedProject);
    
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
    return updatedProject;
  } catch (e) { return null; }
}

export function deleteProject(projectId) {
  try {
    const projects = fetchUserProjects();
    const filtered = projects.filter(p => p.id !== projectId);
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(filtered));
    deleteMediaBlob(projectId);
  } catch (e) {}
}