import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { validatePassword } from '../config/passwords.js';
import { getJwtSecret } from '../config/security.js';

const defaultContent = {
  name: 'Rubaya',
  role: 'Full-Stack Developer',
  location: 'Indonesia',
  headline: 'Membangun pengalaman digital yang terasa sederhana, bekerja dengan fondasi yang kuat.',
  about: 'Saya mengembangkan aplikasi web dari antarmuka hingga API dan database. Saya tertarik mengubah kebutuhan nyata menjadi produk yang mudah digunakan, dapat diandalkan, dan siap berkembang.',
  email: '',
  phone: '',
  github: '',
  linkedin: '',
  website: '',
  photo: '/portfolio-photo.jpeg',
  availability: 'Terbuka untuk peluang yang tepat',
  skills: ['React', 'Node.js', 'Express', 'MySQL', 'JavaScript', 'REST API', 'Git'],
  projects: [{
    id: 'pondokpay',
    name: 'PondokPay',
    category: 'Fintech · Education',
    description: 'Platform pembayaran nontunai untuk menghubungkan pondok, santri, orang tua, dan kantin. Dilengkapi dashboard berbasis peran, ledger transaksi, kontrol uang saku, katalog, dan integrasi pembayaran.',
    role: 'Full-stack development',
    year: '2026',
    stack: ['React', 'Node.js', 'Express', 'MySQL', 'JWT'],
    liveUrl: 'https://pondokpay.rubaya.tech',
    repositoryUrl: '',
    featured: true,
  }],
  experience: [],
  services: ['Full-stack web development', 'REST API & backend', 'Database design', 'Responsive UI'],
};

const fields = {
  name: 80,
  role: 100,
  location: 120,
  headline: 240,
  about: 1800,
  email: 254,
  phone: 40,
  github: 300,
  linkedin: 300,
  website: 300,
  photo: 500,
  availability: 120,
};

const isSafeUrl = (value, { allowMailto = false, allowRelative = false } = {}) => {
  if (!value) return true;
  if (allowRelative && value.startsWith('/') && !value.startsWith('//') &&
      !value.includes('..') && !value.includes('\\')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ||
      (allowMailto && url.protocol === 'mailto:');
  } catch {
    return false;
  }
};

const validateItems = (items, type) => {
  if (!Array.isArray(items) || items.length > 30) return false;
  const itemFields = type === 'project'
    ? { id: 64, name: 100, category: 100, description: 1200, role: 120, year: 20, liveUrl: 300, repositoryUrl: 300 }
    : { id: 64, title: 100, organization: 120, period: 60, description: 1000 };
  const itemKeys = new Set([...Object.keys(itemFields), ...(type === 'project' ? ['stack', 'featured'] : [])]);
  const requiredFields = type === 'project'
    ? ['id', 'name', 'description']
    : ['id', 'title', 'organization'];
  const identifiers = new Set();
  return items.every((item) => item && typeof item === 'object' && !Array.isArray(item) &&
    Object.keys(item).every((key) => itemKeys.has(key)) &&
    Object.entries(itemFields).every(([key, max]) =>
      typeof item[key] === 'string' && item[key].trim().length <= max) &&
    requiredFields.every((key) => item[key].trim().length > 0) &&
    !identifiers.has(item.id) && identifiers.add(item.id) &&
    (type !== 'project' ||
      (Array.isArray(item.stack) && item.stack.length <= 20 &&
        item.stack.every((entry) => typeof entry === 'string' && entry.trim().length <= 50) &&
        typeof item.featured === 'boolean' &&
        isSafeUrl(item.liveUrl) && isSafeUrl(item.repositoryUrl))));
};

export const validatePortfolioContent = (content) => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return 'Data portofolio tidak valid.';
  }
  const allowedFields = new Set([...Object.keys(fields), 'skills', 'projects', 'experience', 'services']);
  if (Object.keys(content).some((key) => !allowedFields.has(key))) {
    return 'Data portofolio mengandung kolom yang tidak dikenal.';
  }
  for (const [field, max] of Object.entries(fields)) {
    if (typeof content[field] !== 'string' || content[field].trim().length > max) {
      return `Kolom ${field} wajib berupa teks dengan panjang maksimal ${max} karakter.`;
    }
  }
  if (!content.name.trim() || !content.role.trim() || !content.headline.trim()) {
    return 'Nama, peran profesional, dan headline wajib diisi.';
  }
  for (const field of ['skills', 'services']) {
    if (!Array.isArray(content[field]) || content[field].length > 40 ||
        content[field].some((value) => typeof value !== 'string' || value.trim().length > 80)) {
      return `Daftar ${field} tidak valid.`;
    }
  }
  if (!validateItems(content.projects, 'project') || !validateItems(content.experience, 'experience')) {
    return 'Daftar proyek atau pengalaman tidak valid.';
  }
  if (!isSafeUrl(content.github) || !isSafeUrl(content.linkedin) ||
      !isSafeUrl(content.website) || !isSafeUrl(content.photo, { allowRelative: true }) ||
      (content.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.email))) {
    return 'Alamat tautan atau email tidak valid.';
  }
  return null;
};

const getSetupSecret = () => {
  const secret = process.env.PORTFOLIO_SETUP_TOKEN;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return null;
  return secret;
};

const matchesSetupSecret = (provided) => {
  const expected = getSetupSecret();
  if (!expected || typeof provided !== 'string') return false;
  const expectedHash = createHash('sha256').update(expected).digest();
  const providedHash = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
};

const issuePortfolioToken = (tokenVersion) => jwt.sign(
  { type: 'portfolio-admin', token_version: tokenVersion },
  getJwtSecret(),
  {
    expiresIn: '30m',
    algorithm: 'HS256',
    issuer: 'pondokpay',
    audience: 'portfolio-admin',
  },
);

const readStoredContent = async () => {
  const [rows] = await pool.query('SELECT content FROM portfolio_content WHERE id = 1 LIMIT 1');
  if (!rows.length) return defaultContent;
  const value = rows[0].content;
  return typeof value === 'string' ? JSON.parse(value) : value;
};

export const getPortfolioStatus = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id FROM portfolio_admin WHERE id = 1 LIMIT 1');
    return res.status(200).json({
      configured: Boolean(rows.length),
      setupAvailable: !rows.length && Boolean(getSetupSecret()),
    });
  } catch (error) {
    console.error('Get portfolio setup status failed:', error);
    return res.status(500).json({ message: 'Gagal memeriksa status pengaturan portofolio.' });
  }
};

export const getPortfolioContent = async (req, res) => {
  try {
    return res.status(200).json({ data: await readStoredContent() });
  } catch (error) {
    console.error('Get public portfolio failed:', error);
    return res.status(500).json({ message: 'Gagal memuat data portofolio.' });
  }
};

export const setupPortfolioAdmin = async (req, res) => {
  const { setupToken, password } = req.body ?? {};
  const validationError = validatePassword(password);
  if (validationError) return res.status(400).json({ message: validationError });
  if (!matchesSetupSecret(setupToken)) {
    return res.status(getSetupSecret() ? 401 : 503).json({
      message: getSetupSecret()
        ? 'Token aktivasi tidak valid.'
        : 'Aktivasi awal belum disiapkan oleh administrator server.',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      `INSERT IGNORE INTO portfolio_admin (id, password_hash, token_version)
       VALUES (1, ?, 0)`,
      [passwordHash],
    );
    if (!result.affectedRows) {
      return res.status(409).json({ message: 'Pengaturan portofolio sudah diinisialisasi. Silakan masuk.' });
    }
    return res.status(201).json({ message: 'Kata sandi pengelola berhasil dibuat. Silakan masuk.' });
  } catch (error) {
    console.error('Setup portfolio admin failed:', error);
    return res.status(500).json({ message: 'Gagal mengaktifkan pengaturan portofolio.' });
  }
};

export const loginPortfolioAdmin = async (req, res) => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || !password ||
      Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Masukkan kata sandi yang valid.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT password_hash, token_version FROM portfolio_admin WHERE id = 1 LIMIT 1',
    );
    const passwordHash = rows[0]?.password_hash ||
      '$2b$12$4G4/vh4au06q.YKMUnJ5u.HAujIgRgZy/7h5phTnDYFQduPk7mQfK';
    const passwordMatches = await bcrypt.compare(password, passwordHash);
    if (!rows.length || !passwordMatches) {
      return res.status(401).json({ message: 'Kata sandi tidak sesuai.' });
    }
    return res.status(200).json({
      token: issuePortfolioToken(Number(rows[0].token_version)),
      expiresIn: 1800,
    });
  } catch (error) {
    console.error('Portfolio admin login failed:', error);
    return res.status(500).json({ message: 'Tidak dapat memverifikasi kata sandi.' });
  }
};

export const logoutPortfolioAdmin = async (req, res) => {
  try {
    await pool.query(
      'UPDATE portfolio_admin SET token_version = token_version + 1 WHERE id = 1 AND token_version = ?',
      [req.portfolioAdmin.tokenVersion],
    );
    return res.status(200).json({ message: 'Sesi pengaturan portofolio telah diakhiri.' });
  } catch (error) {
    console.error('Portfolio admin logout failed:', error);
    return res.status(500).json({ message: 'Gagal mengakhiri sesi pengaturan portofolio.' });
  }
};

export const changePortfolioPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  const validationError = validatePassword(newPassword);
  if (validationError) return res.status(400).json({ message: validationError });
  if (typeof currentPassword !== 'string' ||
      Buffer.byteLength(currentPassword, 'utf8') > 72) {
    return res.status(400).json({ message: 'Kata sandi saat ini wajib diisi.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT password_hash FROM portfolio_admin WHERE id = 1 LIMIT 1',
    );
    if (!rows.length || !await bcrypt.compare(currentPassword, rows[0].password_hash)) {
      return res.status(401).json({ message: 'Kata sandi saat ini tidak sesuai.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const [result] = await pool.query(
      `UPDATE portfolio_admin
       SET password_hash = ?, token_version = token_version + 1
       WHERE id = 1 AND token_version = ?`,
      [passwordHash, req.portfolioAdmin.tokenVersion],
    );
    if (!result.affectedRows) {
      return res.status(401).json({ message: 'Sesi telah berakhir. Silakan masuk kembali.' });
    }
    return res.status(200).json({ message: 'Kata sandi diperbarui. Silakan masuk kembali.' });
  } catch (error) {
    console.error('Portfolio admin password change failed:', error);
    return res.status(500).json({ message: 'Gagal memperbarui kata sandi.' });
  }
};

export const savePortfolioContent = async (req, res) => {
  const validationError = validatePortfolioContent(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    const content = JSON.stringify(req.body);
    await pool.query(
      `INSERT INTO portfolio_content (id, content)
       VALUES (1, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content)`,
      [content],
    );
    return res.status(200).json({ message: 'Perubahan portofolio berhasil disimpan.' });
  } catch (error) {
    console.error('Save portfolio content failed:', error);
    return res.status(500).json({ message: 'Gagal menyimpan perubahan portofolio.' });
  }
};
