// src/services/adminApi.js

import { getAuthHeaders } from './backendAuth';

const BACKEND_URL = 'https://api.zokascore.xyz';

export async function adminFetchJSON(path, options = {}) {
  const authHeaders = await getAuthHeaders();

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...authHeaders,
    },
  });

  if (!res.ok) {
    const err = new Error(`Admin API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}