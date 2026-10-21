const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function request(path, { method = 'GET', body, token, idempotencyKey, signal } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Tidak dapat menghubungi server. Periksa koneksi dan alamat API.', 0);
  }

  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ApiError('Server mengirim respons yang tidak dapat dibaca.', response.status);
    }
  }
  if (!response.ok) {
    throw new ApiError(data.message || `Permintaan gagal (${response.status}).`, response.status, data);
  }
  return data;
}

export const api = {
  get: (path, token, options) => request(path, { token, ...options }),
  post: (path, body, token, options) => request(path, { method: 'POST', body, token, ...options }),
  put: (path, body, token, options) => request(path, { method: 'PUT', body, token, ...options }),
  patch: (path, body, token, options) => request(path, { method: 'PATCH', body, token, ...options }),
  delete: (path, token, options) => request(path, { method: 'DELETE', token, ...options }),
};

export const idempotencyKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pp-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
};
