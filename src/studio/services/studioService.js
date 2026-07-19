const STORAGE_KEY = 'zokascore_studio_projects';

export function fetchUserProjects() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function saveProject(project) {
  try {
    const projects = fetchUserProjects();
    const existingIndex = projects.findIndex(p => p.id === project.id);
    const updatedProject = { ...project, updatedAt: Date.now() };
    
    if (existingIndex >= 0) {
      projects[existingIndex] = updatedProject;
    } else {
      projects.push(updatedProject);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    return updatedProject;
  } catch (e) {
    return null;
  }
}

export function deleteProject(projectId) {
  try {
    const projects = fetchUserProjects();
    const filtered = projects.filter(p => p.id !== projectId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {}
}