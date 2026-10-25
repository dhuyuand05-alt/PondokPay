import bcrypt from 'bcryptjs';
import pool from '../../../config/db.js';
import { validatePassword } from '../../../config/passwords.js';
import { duplicateError, parseId, parseMoney, parsePagination, runInTransaction } from '../shared.js';

export const getWaliById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID wali tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT w.id, w.user_id, u.username, w.santri_id, s.nis, s.nama_lengkap, w.no_whatsapp
       FROM wali_santri w
       LEFT JOIN users u ON u.id = w.user_id
       LEFT JOIN santri s ON s.id = w.santri_id
       WHERE w.id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Data wali tidak ditemukan.' });
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('Get wali by id error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data wali santri.' });
  }
};

export const createWali = async (req, res) => {
  const { username, password, santri_id: santriIdValue, no_whatsapp: whatsapp = null } = req.body;
  const santriId = parseId(santriIdValue);
  if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
    return res.status(400).json({ message: 'Username harus terdiri dari 3 sampai 50 karakter.' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  if (whatsapp !== null && (typeof whatsapp !== 'string' || whatsapp.length > 20)) {
    return res.status(400).json({ message: 'Nomor WhatsApp maksimal 20 karakter.' });
  }
  try {
    const data = await runInTransaction(async (connection) => {
      const [students] = await connection.query('SELECT id FROM santri WHERE id = ?', [santriId]);
      if (!students.length) return null;
      const hash = await bcrypt.hash(password, 12);
      const [user] = await connection.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username.trim(), hash, 'wali']
      );
      const [result] = await connection.query(
        'INSERT INTO wali_santri (user_id, santri_id, no_whatsapp) VALUES (?, ?, ?)',
        [user.insertId, santriId, whatsapp?.trim() || null]
      );
      return {
        id: result.insertId,
        user_id: user.insertId,
        username: username.trim(),
        santri_id: santriId,
        no_whatsapp: whatsapp?.trim() || null,
      };
    });
    if (!data) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(201).json({ message: 'Data wali berhasil dibuat.', data });
  } catch (error) {
    if (duplicateError(error)) return res.status(409).json({ message: 'Username sudah terdaftar.' });
    console.error('Create wali error:', error);
    return res.status(500).json({ message: 'Gagal membuat data wali.' });
  }
};

export const updateWali = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID wali tidak valid.' });
  const { username, password } = req.body;
  const santriId = req.body.santri_id === undefined ? undefined : parseId(req.body.santri_id);
  const whatsapp = req.body.no_whatsapp;

  if (santriId === null) return res.status(400).json({ message: 'ID santri tidak valid.' });
  if (username !== undefined && (
    typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50
  )) {
    return res.status(400).json({ message: 'Username harus terdiri dari 3 sampai 50 karakter.' });
  }
  if (password !== undefined) {
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });
  }
  if (whatsapp !== undefined && whatsapp !== null && (
    typeof whatsapp !== 'string' || whatsapp.length > 20
  )) {
    return res.status(400).json({ message: 'Nomor WhatsApp maksimal 20 karakter.' });
  }
  if ((username === undefined) !== (password === undefined)) {
    return res.status(400).json({ message: 'Username dan password harus diubah bersamaan.' });
  }
  if (username === undefined && santriId === undefined && whatsapp === undefined) {
    return res.status(400).json({ message: 'Tidak ada data yang diubah.' });
  }

  try {
    const data = await runInTransaction(async (connection) => {
      const [waliRows] = await connection.query(
        'SELECT user_id FROM wali_santri WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!waliRows.length) return null;

      if (santriId !== undefined) {
        const [students] = await connection.query('SELECT id FROM santri WHERE id = ?', [santriId]);
        if (!students.length) {
          const error = new Error('Data santri tidak ditemukan.');
          error.code = 'SANTRI_NOT_FOUND';
          throw error;
        }
        await connection.query('UPDATE wali_santri SET santri_id = ? WHERE id = ?', [santriId, id]);
      }
      if (whatsapp !== undefined) {
        await connection.query(
          'UPDATE wali_santri SET no_whatsapp = ? WHERE id = ?',
          [whatsapp?.trim() || null, id]
        );
      }

      let userId = waliRows[0].user_id;
      if (username !== undefined && password !== undefined) {
        const passwordHash = await bcrypt.hash(password, 12);
        if (userId) {
          await connection.query(
            'UPDATE users SET username = ?, password = ?, token_version = token_version + 1 WHERE id = ? AND role = ?',
            [username.trim(), passwordHash, userId, 'wali']
          );
        } else {
          const [userResult] = await connection.query(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            [username.trim(), passwordHash, 'wali']
          );
          userId = userResult.insertId;
          await connection.query('UPDATE wali_santri SET user_id = ? WHERE id = ?', [userId, id]);
        }
      }

      const [rows] = await connection.query(
        `SELECT w.id, w.user_id, u.username, w.santri_id, s.nis, s.nama_lengkap, w.no_whatsapp
         FROM wali_santri w
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN santri s ON s.id = w.santri_id
         WHERE w.id = ?`,
        [id]
      );
      return rows[0];
    });
    if (!data) return res.status(404).json({ message: 'Data wali tidak ditemukan.' });
    return res.status(200).json({ message: 'Data wali berhasil diubah.', data });
  } catch (error) {
    if (duplicateError(error)) return res.status(409).json({ message: 'Username sudah terdaftar.' });
    if (error.code === 'SANTRI_NOT_FOUND') {
      return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    }
    console.error('Update wali error:', error);
    return res.status(500).json({ message: 'Gagal mengubah data wali.' });
  }
};

export const deleteWali = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID wali tidak valid.' });
  try {
    const deleted = await runInTransaction(async (connection) => {
      const [rows] = await connection.query(
        'SELECT user_id FROM wali_santri WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!rows.length) return false;
      await connection.query('DELETE FROM wali_santri WHERE id = ?', [id]);
      if (rows[0].user_id) {
        const [remaining] = await connection.query(
          'SELECT id FROM wali_santri WHERE user_id = ? LIMIT 1',
          [rows[0].user_id]
        );
        if (!remaining.length) {
          await connection.query(
            `UPDATE users SET is_active = FALSE, token_version = token_version + 1
             WHERE id = ? AND role = ? AND is_active = TRUE`,
            [rows[0].user_id, 'wali']
          );
        }
      }
      return true;
    });
    if (!deleted) return res.status(404).json({ message: 'Data wali tidak ditemukan.' });
    return res.status(200).json({ message: 'Data wali berhasil dihapus.' });
  } catch (error) {
    console.error('Delete wali error:', error);
    return res.status(500).json({ message: 'Gagal menghapus data wali.' });
  }
};
