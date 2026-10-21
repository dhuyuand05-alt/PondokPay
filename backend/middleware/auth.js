import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { getJwtSecret } from '../config/security.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token autentikasi diperlukan.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch (error) {
    if (error.message?.startsWith('JWT_SECRET')) {
      console.error('Authentication configuration error:', error);
      return res.status(503).json({ message: 'Autentikasi belum dikonfigurasi dengan aman.' });
    }
    return res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa.' });
  }

  if (decoded.type !== 'access' || !Number.isSafeInteger(decoded.id)) {
    return res.status(401).json({ message: 'Token akses tidak valid.' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT id, username, role, created_at, is_active, token_version, mfa_enabled
       FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (!rows.length || !rows[0].is_active ||
        Number(rows[0].token_version) !== Number(decoded.token_version)) {
      return res.status(401).json({ message: 'Sesi tidak berlaku; silakan login kembali.' });
    }
    if (['admin', 'kasir'].includes(rows[0].role) && !rows[0].mfa_enabled) {
      return res.status(403).json({ message: 'Aktivasi MFA diwajibkan untuk akun ini.' });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    console.error('Authenticate request error:', error);
    return res.status(500).json({ message: 'Gagal memverifikasi sesi user.' });
  }
};

export const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Anda tidak memiliki izin untuk akses ini.' });
  }

  next();
};
