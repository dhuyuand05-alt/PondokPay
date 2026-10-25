import bcrypt from 'bcryptjs';
import pool from '../../../config/db.js';
import { validatePassword } from '../../../config/passwords.js';
import { duplicateError, parseId, parseMoney, parsePagination, runInTransaction } from '../shared.js';

export const getWali = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.id, w.user_id, u.username, w.santri_id, s.nis, s.nama_lengkap, w.no_whatsapp
       FROM wali_santri w
       LEFT JOIN users u ON u.id = w.user_id
       LEFT JOIN santri s ON s.id = w.santri_id
       ORDER BY w.id DESC`
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get wali error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data wali santri.' });
  }
};

export const getWaliAccounts = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id AS user_id, u.username, u.created_at,
              w.id AS relasi_id, w.santri_id, s.nis, s.nama_lengkap, w.no_whatsapp
       FROM users u
       LEFT JOIN wali_santri w ON w.user_id = u.id
       LEFT JOIN santri s ON s.id = w.santri_id
       WHERE u.role = 'wali'
       ORDER BY u.id DESC, w.id`
    );
    const accounts = new Map();
    for (const row of rows) {
      if (!accounts.has(row.user_id)) {
        accounts.set(row.user_id, {
          id: row.user_id,
          username: row.username,
          created_at: row.created_at,
          children: [],
        });
      }
      if (row.relasi_id) {
        accounts.get(row.user_id).children.push({
          relasi_id: row.relasi_id,
          santri_id: row.santri_id,
          nis: row.nis,
          nama_lengkap: row.nama_lengkap,
          no_whatsapp: row.no_whatsapp,
        });
      }
    }
    return res.status(200).json({ data: [...accounts.values()] });
  } catch (error) {
    console.error('Get wali accounts error:', error);
    return res.status(500).json({ message: 'Gagal mengambil akun orang tua.' });
  }
};

export const getWaliAccountById = async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ message: 'ID akun wali tidak valid.' });
  try {
    const [accounts] = await pool.query(
      'SELECT id, username, created_at FROM users WHERE id = ? AND role = ? LIMIT 1',
      [userId, 'wali']
    );
    if (!accounts.length) return res.status(404).json({ message: 'Akun orang tua tidak ditemukan.' });
    const [children] = await pool.query(
      `SELECT w.id AS relasi_id, w.santri_id, s.nis, s.nama_lengkap, w.no_whatsapp
       FROM wali_santri w LEFT JOIN santri s ON s.id = w.santri_id
       WHERE w.user_id = ? ORDER BY w.id`,
      [userId]
    );
    return res.status(200).json({
      data: { ...accounts[0], children },
    });
  } catch (error) {
    console.error('Get wali account by id error:', error);
    return res.status(500).json({ message: 'Gagal mengambil akun orang tua.' });
  }
};

export const createWaliAccount = async (req, res) => {
  const { username, password } = req.body;
  const santriIds = req.body.santri_ids ?? (req.body.santri_id !== undefined ? [req.body.santri_id] : []);
  const whatsapp = req.body.no_whatsapp ?? null;
  if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
    return res.status(400).json({ message: 'Username harus terdiri dari 3 sampai 50 karakter.' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });
  if (!Array.isArray(santriIds) || santriIds.length === 0) {
    return res.status(400).json({ message: 'Minimal satu ID santri harus dihubungkan.' });
  }
  const parsedSantriIds = santriIds.map(parseId);
  if (parsedSantriIds.some((id) => !id) || new Set(parsedSantriIds).size !== parsedSantriIds.length) {
    return res.status(400).json({ message: 'Daftar ID santri tidak valid atau berisi duplikat.' });
  }
  if (whatsapp !== null && (typeof whatsapp !== 'string' || whatsapp.length > 20)) {
    return res.status(400).json({ message: 'Nomor WhatsApp maksimal 20 karakter.' });
  }
  try {
    const data = await runInTransaction(async (connection) => {
      const [students] = await connection.query(
        'SELECT id FROM santri WHERE id IN (?)',
        [parsedSantriIds]
      );
      if (students.length !== parsedSantriIds.length) {
        const error = new Error('Santri tidak ditemukan.');
        error.code = 'SANTRI_NOT_FOUND';
        throw error;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const [user] = await connection.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username.trim(), passwordHash, 'wali']
      );
      const values = parsedSantriIds.map((santriId) => [user.insertId, santriId, whatsapp?.trim() || null]);
      await connection.query(
        'INSERT INTO wali_santri (user_id, santri_id, no_whatsapp) VALUES ?',
        [values]
      );
      return { id: user.insertId, username: username.trim(), santri_ids: parsedSantriIds };
    });
    return res.status(201).json({ message: 'Akun orang tua berhasil dibuat dan dihubungkan.', data });
  } catch (error) {
    if (duplicateError(error)) return res.status(409).json({ message: 'Username sudah terdaftar.' });
    if (error.code === 'SANTRI_NOT_FOUND') {
      return res.status(404).json({ message: 'Satu atau beberapa data santri tidak ditemukan.' });
    }
    console.error('Create wali account error:', error);
    return res.status(500).json({ message: 'Gagal membuat akun orang tua.' });
  }
};

export const updateWaliAccount = async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ message: 'ID akun wali tidak valid.' });
  const { username, password, no_whatsapp: whatsapp } = req.body;
  const fields = [];
  const values = [];
  if (username !== undefined) {
    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
      return res.status(400).json({ message: 'Username harus terdiri dari 3 sampai 50 karakter.' });
    }
    fields.push('username = ?');
    values.push(username.trim());
  }
  if (password !== undefined) {
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });
    fields.push('password = ?');
    values.push(await bcrypt.hash(password, 12));
  }
  if (whatsapp !== undefined && whatsapp !== null && (
    typeof whatsapp !== 'string' || whatsapp.length > 20
  )) {
    return res.status(400).json({ message: 'Nomor WhatsApp maksimal 20 karakter.' });
  }
  if (!fields.length && whatsapp === undefined) {
    return res.status(400).json({ message: 'Tidak ada data yang diubah.' });
  }
  try {
    const found = await runInTransaction(async (connection) => {
      const [accounts] = await connection.query(
        'SELECT id FROM users WHERE id = ? AND role = ? FOR UPDATE',
        [userId, 'wali']
      );
      if (!accounts.length) return false;
      if (fields.length) {
        if (password !== undefined) fields.push('token_version = token_version + 1');
        await connection.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, userId]);
      }
      if (whatsapp !== undefined) {
        await connection.query(
          'UPDATE wali_santri SET no_whatsapp = ? WHERE user_id = ?',
          [whatsapp?.trim() || null, userId]
        );
      }
      return true;
    });
    if (!found) return res.status(404).json({ message: 'Akun orang tua tidak ditemukan.' });
    return getWaliAccountById(req, res);
  } catch (error) {
    if (duplicateError(error)) return res.status(409).json({ message: 'Username sudah terdaftar.' });
    console.error('Update wali account error:', error);
    return res.status(500).json({ message: 'Gagal mengubah akun orang tua.' });
  }
};

export const deleteWaliAccount = async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ message: 'ID akun wali tidak valid.' });
  try {
    const [result] = await pool.query(
      'UPDATE users SET is_active = FALSE, token_version = token_version + 1 WHERE id = ? AND role = ? AND is_active = TRUE',
      [userId, 'wali']
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Akun orang tua tidak ditemukan.' });
    return res.status(200).json({ message: 'Akun orang tua dinonaktifkan; data relasi dan riwayat tetap disimpan.' });
  } catch (error) {
    console.error('Delete wali account error:', error);
    return res.status(500).json({ message: 'Gagal menghapus akun orang tua.' });
  }
};

export const linkWaliChild = async (req, res) => {
  const userId = parseId(req.params.id);
  const santriId = parseId(req.body.santri_id);
  const whatsapp = req.body.no_whatsapp ?? null;
  if (!userId) return res.status(400).json({ message: 'ID akun wali tidak valid.' });
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  if (whatsapp !== null && (typeof whatsapp !== 'string' || whatsapp.length > 20)) {
    return res.status(400).json({ message: 'Nomor WhatsApp maksimal 20 karakter.' });
  }
  try {
    const data = await runInTransaction(async (connection) => {
      const [accounts] = await connection.query(
        'SELECT id FROM users WHERE id = ? AND role = ? FOR UPDATE',
        [userId, 'wali']
      );
      if (!accounts.length) return { notFound: 'wali' };
      const [students] = await connection.query('SELECT id FROM santri WHERE id = ?', [santriId]);
      if (!students.length) return { notFound: 'santri' };
      const [existing] = await connection.query(
        'SELECT id FROM wali_santri WHERE user_id = ? AND santri_id = ? LIMIT 1',
        [userId, santriId]
      );
      if (existing.length) {
        const error = new Error('Relasi sudah terdaftar.');
        error.code = 'WALI_CHILD_EXISTS';
        throw error;
      }
      const [result] = await connection.query(
        'INSERT INTO wali_santri (user_id, santri_id, no_whatsapp) VALUES (?, ?, ?)',
        [userId, santriId, whatsapp?.trim() || null]
      );
      return { id: result.insertId, user_id: userId, santri_id: santriId, no_whatsapp: whatsapp?.trim() || null };
    });
    if (data.notFound === 'wali') return res.status(404).json({ message: 'Akun orang tua tidak ditemukan.' });
    if (data.notFound === 'santri') return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(201).json({ message: 'Santri berhasil dihubungkan ke akun orang tua.', data });
  } catch (error) {
    if (error.code === 'WALI_CHILD_EXISTS' || duplicateError(error)) {
      return res.status(409).json({ message: 'Santri sudah terhubung ke akun orang tua ini.' });
    }
    console.error('Link wali child error:', error);
    return res.status(500).json({ message: 'Gagal menghubungkan santri ke akun orang tua.' });
  }
};

export const unlinkWaliChild = async (req, res) => {
  const userId = parseId(req.params.id);
  const santriId = parseId(req.params.santriId);
  if (!userId) return res.status(400).json({ message: 'ID akun wali tidak valid.' });
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  try {
    const [accounts] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND role = ? LIMIT 1',
      [userId, 'wali']
    );
    if (!accounts.length) return res.status(404).json({ message: 'Akun orang tua tidak ditemukan.' });
    const [result] = await pool.query(
      'DELETE FROM wali_santri WHERE user_id = ? AND santri_id = ?',
      [userId, santriId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Relasi akun dan santri tidak ditemukan.' });
    return res.status(200).json({ message: 'Relasi santri dari akun orang tua berhasil dilepas.' });
  } catch (error) {
    console.error('Unlink wali child error:', error);
    return res.status(500).json({ message: 'Gagal melepas relasi santri dari akun orang tua.' });
  }
};
