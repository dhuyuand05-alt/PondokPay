import { createHmac, randomUUID } from 'node:crypto';
import pool from '../config/db.js';
import { getJwtSecret } from '../config/security.js';

const apiRequests = new Map();
const apiWindowMs = 60 * 1000;

const checkRateLimit = (store, key, limit, windowMs) => {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.expiresAt <= now) {
    store.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, retryAfter: Math.ceil(windowMs / 1000) };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    retryAfter: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
  };
};

const pruneRateLimitMaps = () => {
  const now = Date.now();
  for (const store of [apiRequests]) {
    for (const [key, value] of store) {
      if (value.expiresAt <= now) store.delete(key);
    }
  }
};
const cleanupTimer = setInterval(pruneRateLimitMaps, 5 * 60 * 1000);
cleanupTimer.unref();
const dbCleanupTimer = setInterval(() => {
  pool.query(
    'DELETE FROM security_rate_limits WHERE window_started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)'
  ).catch((error) => console.error('Security rate-limit cleanup failed:', error));
}, 60 * 60 * 1000);
dbCleanupTimer.unref();

export const securityHeaders = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

export const requireHttpsInProduction = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.status(400).json({ message: 'Koneksi HTTPS wajib digunakan.' });
  }
  next();
};

export const rateLimitApi = (req, res, next) => {
  const result = checkRateLimit(apiRequests, req.ip, 300, apiWindowMs);
  res.set('RateLimit-Limit', '300');
  res.set('RateLimit-Remaining', String(Math.max(0, 300 - (apiRequests.get(req.ip)?.count ?? 0))));
  if (!result.allowed) {
    res.set('Retry-After', String(result.retryAfter));
    return res.status(429).json({ message: 'Terlalu banyak permintaan. Coba lagi nanti.' });
  }
  next();
};

const hashedBucket = (value) =>
  createHmac('sha256', getJwtSecret()).update(value).digest('hex');

const hitPersistentRateLimit = async (key, limit) => {
  const bucketKey = hashedBucket(key);
  await pool.query(
    `INSERT INTO security_rate_limits (bucket_key, attempts, window_started_at)
     VALUES (?, 1, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       attempts = IF(window_started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE), 1, attempts + 1),
       window_started_at = IF(window_started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE),
         CURRENT_TIMESTAMP, window_started_at)`,
    [bucketKey]
  );
  const [[bucket]] = await pool.query(
    `SELECT attempts, GREATEST(1, 900 - TIMESTAMPDIFF(SECOND, window_started_at, CURRENT_TIMESTAMP)) AS retry_after
     FROM security_rate_limits WHERE bucket_key = ?`,
    [bucketKey]
  );
  return {
    allowed: bucket.attempts <= limit,
    retryAfter: Number(bucket.retry_after),
  };
};

export const rateLimitLogin = async (req, res, next) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  try {
    const checks = await Promise.all([
      hitPersistentRateLimit(`login-ip:${req.ip}`, 30),
      ...(username ? [hitPersistentRateLimit(`login-user:${req.ip}:${username}`, 5)] : []),
    ]);
    const blocked = checks.filter((check) => !check.allowed);
    if (blocked.length) {
      res.set('Retry-After', String(Math.max(...blocked.map((check) => check.retryAfter))));
      return res.status(429).json({ message: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
    }
    next();
  } catch (error) {
    console.error('Login rate-limit check failed; login request was denied:', error);
    return res.status(503).json({ message: 'Proteksi percobaan login tidak tersedia.' });
  }
};

export const rateLimitMfa = async (req, res, next) => {
  try {
    const result = await hitPersistentRateLimit(`mfa-ip:${req.ip}`, 10);
    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfter));
      return res.status(429).json({ message: 'Terlalu banyak percobaan MFA. Coba lagi nanti.' });
    }
    next();
  } catch (error) {
    console.error('MFA rate-limit check failed; MFA request was denied:', error);
    return res.status(503).json({ message: 'Proteksi percobaan MFA tidak tersedia.' });
  }
};

export const clearLoginRateLimit = async (req) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  if (username) {
    await pool.query(
      'DELETE FROM security_rate_limits WHERE bucket_key = ?',
      [hashedBucket(`login-user:${req.ip}:${username}`)]
    );
  }
};

export const recordSecurityEvent = async (req, event) => {
  await pool.query(
    `INSERT INTO audit_logs
       (request_id, actor_user_id, action, resource, source_ip, user_agent, status_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      event.actorUserId ?? null,
      event.action,
      event.resource,
      req.ip ?? null,
      String(req.get('user-agent') ?? '').slice(0, 255),
      event.statusCode,
    ]
  );
};

export const auditMutation = async (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const requestId = randomUUID();
  res.set('X-Request-Id', requestId);
  let auditId;
  try {
    const [result] = await pool.query(
      `INSERT INTO audit_logs (request_id, actor_user_id, action, resource, source_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        requestId,
        req.user?.id ?? null,
        req.method,
        req.baseUrl + req.path,
        req.ip ?? null,
        String(req.get('user-agent') ?? '').slice(0, 255),
      ]
    );
    auditId = result.insertId;
  } catch (error) {
    console.error('Audit log write failed; mutation request was not executed:', error);
    return res.status(503).json({ message: 'Audit log tidak tersedia; perubahan ditolak.' });
  }

  res.once('finish', () => {
    pool.query(
      'UPDATE audit_logs SET status_code = ? WHERE id = ?',
      [res.statusCode, auditId]
    ).catch((error) => console.error(`Audit log completion failed for ${requestId}:`, error));
  });
  next();
};
