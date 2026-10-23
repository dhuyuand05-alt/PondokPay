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
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
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
  download: async (path, token, fallbackFilename) => {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      throw new ApiError('Tidak dapat menghubungi server. Periksa koneksi dan alamat API.', 0);
    }
    if (!response.ok) {
      const raw = await response.text();
      let message = `Permintaan gagal (${response.status}).`;
      if (raw) {
        try {
          message = JSON.parse(raw).message || message;
        } catch {
          message = 'Server mengirim respons yang tidak dapat dibaca.';
        }
      }
      throw new ApiError(message, response.status);
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || fallbackFilename;
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  },
};

export const resolveAssetUrl = (path) => {
  if (!path) return null;
  try {
    const apiUrl = new URL(API_BASE, window.location.origin);
    return new URL(path, apiUrl.origin).toString();
  } catch {
    return path;
  }
};

export const resolveApiUrl = (path) => {
  const baseUrl = new URL(API_BASE, window.location.origin);
  return new URL(path, baseUrl).toString();
};

export const idempotencyKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pp-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
};
