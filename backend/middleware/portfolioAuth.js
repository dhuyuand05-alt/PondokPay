import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { getJwtSecret } from '../config/security.js';

export const authenticatePortfolioAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'Silakan masuk ke pengaturan portofolio.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'pondokpay',
      audience: 'portfolio-admin',
    });
  } catch (error) {
    if (error.message?.startsWith('JWT_SECRET')) {
      console.error('Portfolio authentication configuration error:', error);
      return res.status(503).json({ message: 'Autentikasi belum dikonfigurasi dengan aman.' });
    }
    return res.status(401).json({ message: 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.' });
  }

  if (decoded.type !== 'portfolio-admin' || !Number.isSafeInteger(decoded.token_version)) {
    return res.status(401).json({ message: 'Sesi pengaturan portofolio tidak valid.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT token_version FROM portfolio_admin WHERE id = 1 LIMIT 1'
    );
    if (!rows.length || Number(rows[0].token_version) !== decoded.token_version) {
      return res.status(401).json({ message: 'Sesi telah dicabut. Silakan masuk kembali.' });
    }
    req.portfolioAdmin = { tokenVersion: decoded.token_version };
    return next();
  } catch (error) {
    console.error('Portfolio admin session verification failed:', error);
    return res.status(500).json({ message: 'Gagal memverifikasi sesi portofolio.' });
  }
};
