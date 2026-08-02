// backend-v1/src/utils/ApiResponse.js

function buildMeta(res, meta = {}) {
  const finalMeta = {
    requestId: res?.locals?.requestId || null,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  delete finalMeta.status;

  return finalMeta;
}

function success(res, data = null, meta = {}) {
  const status = meta.status || 200;

  return res.status(status).json({
    success: true,
    data,
    meta: buildMeta(res, meta),
  });
}

function created(res, data = null, meta = {}) {
  return success(res, data, { ...meta, status: 201 });
}

function accepted(res, data = null, meta = {}) {
  return success(res, data, { ...meta, status: 202 });
}

function fail(res, err = {}, fallbackStatus = 500) {
  const status = err.status || fallbackStatus;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');

  const message =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Request failed';

  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details: err.details || [],
    },
    meta: buildMeta(res),

    // Legacy compatibility for older frontend code expecting { error: "..." }
    error: message,
  });
}

module.exports = {
  buildMeta,
  success,
  created,
  accepted,
  fail,
};