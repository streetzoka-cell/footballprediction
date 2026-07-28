// src/utils/errorHandler.js

export const ERROR_TYPES = Object.freeze({
  OFFLINE: 'offline',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  NOT_FOUND: 'not_found',
  UNKNOWN: 'unknown',
});

/**
 * Parses a fetch error and returns a standardized error object.
 * @param {Error} err 
 * @returns {object} { type: string, message: string, status: number }
 */
export function handleApiError(err) {
  if (!navigator.onLine) {
    return { type: ERROR_TYPES.OFFLINE, message: 'You are offline. Please check your connection.', status: 0 };
  }

  if (err.name === 'AbortError') {
    return { type: ERROR_TYPES.TIMEOUT, message: 'Request timed out. The server took too long to respond.', status: 408 };
  }

  const status = err.status || err.statusCode || 0;
  let type = ERROR_TYPES.UNKNOWN;
  let message = err.message || 'An unexpected error occurred.';

  if (status === 404) {
    type = ERROR_TYPES.NOT_FOUND;
    message = 'The requested resource was not found.';
  } else if (status === 429) {
    type = ERROR_TYPES.RATE_LIMIT;
    message = 'Too many requests. Please slow down.';
  } else if (status >= 500) {
    type = ERROR_TYPES.SERVER_ERROR;
    message = 'A server error occurred. We are working on it.';
  }

  return { type, message, status };
}