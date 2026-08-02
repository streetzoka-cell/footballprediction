// backend-v1/src/utils/ApiError.js

class ApiError extends Error {
  constructor(status = 500, code = 'INTERNAL_ERROR', message = 'Internal Server Error', details = []) {
    super(message);

    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message = 'Bad request', details = []) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Unauthorized', details = []) {
    return new ApiError(401, 'UNAUTHORIZED', message, details);
  }

  static forbidden(message = 'Forbidden', details = []) {
    return new ApiError(403, 'FORBIDDEN', message, details);
  }

  static notFound(message = 'Not found', details = []) {
    return new ApiError(404, 'NOT_FOUND', message, details);
  }

  static conflict(message = 'Conflict', details = []) {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static tooManyRequests(message = 'Too many requests', details = []) {
    return new ApiError(429, 'TOO_MANY_REQUESTS', message, details);
  }

  static internal(message = 'Internal Server Error', details = []) {
    return new ApiError(500, 'INTERNAL_ERROR', message, details);
  }

  static upstream(message = 'Upstream provider error', details = []) {
    return new ApiError(502, 'UPSTREAM_ERROR', message, details);
  }

  static quota(message = 'Quota exhausted', details = []) {
    return new ApiError(429, 'QUOTA_EXHAUSTED', message, details);
  }
}

module.exports = ApiError;