// footballprediction/src/services/searchService.js
import { monitorApiCall } from '../utils/performanceMonitor';
import { handleApiError } from '../utils/errorHandler';

/**
 * Calls the backend search proxy. 
 * The backend handles Algolia API keys securely.
 */
export async function searchMatches(query) {
  if (!query || query.length < 2) return [];
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000); // 8s timeout for search

  try {
    const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();
    return data.hits || [];
  } catch (err) {
    clearTimeout(timer);
    const parsed = handleApiError(err);
    err.type = parsed.type;
    throw err;
  }
}

// Wrap with monitor for observability
export const monitoredSearchMatches = (query) => monitorApiCall(`GET /search?q=${query}`, () => searchMatches(query));
