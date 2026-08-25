export const ERROR_TYPES = Object.freeze({
  OFFLINE: 'offline',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  NOT_FOUND: 'not_found',
  UNKNOWN: 'unknown',
});

export function handleApiError(err) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { type: ERROR_TYPES.OFFLINE, message: 'You are offline. Showing cached data.', status: 0 };
  }
  if (err?.name === 'AbortError') {
    return { type: ERROR_TYPES.TIMEOUT, message: 'Request timed out.', status: 408 };
  }
  const status = err?.status || err?.statusCode || 0;
  if (status === 404) return { type: ERROR_TYPES.NOT_FOUND, message: 'Not found.', status };
  if (status === 429) return { type: ERROR_TYPES.RATE_LIMIT, message: 'Too many requests.', status };
  if (status >= 500) return { type: ERROR_TYPES.SERVER_ERROR, message: 'Server error.', status };
  return { type: ERROR_TYPES.UNKNOWN, message: err?.message || 'Unexpected error.', status };
}
