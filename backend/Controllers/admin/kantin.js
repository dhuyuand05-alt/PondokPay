import pool from '../../config/db.js';
import { duplicateError, parseId, parsePagination } from './shared.js';

export const getKantin = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nama, lokasi, status, saldo, created_at FROM kantin ORDER BY id DESC');
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get kantin error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kantin.' });
  }
};

export const getKantinById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [rows] = await pool.query(
      'SELECT id, nama, lokasi, status, saldo, created_at FROM kantin WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('Get kantin by id error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kantin.' });
  }
};

export const createKantin = async (req, res) => {
  const { nama, lokasi = null, status = 'active' } = req.body;
  if (typeof nama !== 'string' || !nama.trim() || nama.trim().length > 100) {
    return res.status(400).json({ message: 'Nama kantin wajib diisi dan maksimal 100 karakter.' });
  }
  if (lokasi !== null && (typeof lokasi !== 'string' || lokasi.length > 255)) {
    return res.status(400).json({ message: 'Lokasi harus berupa teks maksimal 255 karakter.' });
  }
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ message: 'Status kantin harus active atau inactive.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO kantin (nama, lokasi, status) VALUES (?, ?, ?)',
      [nama.trim(), lokasi?.trim() || null, status]
    );
    const [rows] = await pool.query(
      'SELECT id, nama, lokasi, status, saldo, created_at FROM kantin WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json({ message: 'Data kantin berhasil dibuat.', data: rows[0] });
  } catch (error) {
    console.error('Create kantin error:', error);
    return res.status(500).json({ message: 'Gagal membuat data kantin.' });
  }
};

export const updateKantin = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const { nama, lokasi, status } = req.body;
  const fields = [];
  const values = [];
  if (nama !== undefined) {
    if (typeof nama !== 'string' || !nama.trim() || nama.trim().length > 100) {
      return res.status(400).json({ message: 'Nama kantin wajib diisi dan maksimal 100 karakter.' });
    }
    fields.push('nama = ?');
    values.push(nama.trim());
  }
  if (lokasi !== undefined) {
    if (lokasi !== null && (typeof lokasi !== 'string' || lokasi.length > 255)) {
      return res.status(400).json({ message: 'Lokasi harus berupa teks maksimal 255 karakter.' });
    }
    fields.push('lokasi = ?');
    values.push(lokasi?.trim() || null);
  }
  if (status !== undefined) {
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Status kantin harus active atau inactive.' });
    }
    fields.push('status = ?');
    values.push(status);
  }
  if (!fields.length) return res.status(400).json({ message: 'Tidak ada data yang diubah.' });

  try {
    const [result] = await pool.query(`UPDATE kantin SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    if (!result.affectedRows) {
      const [rows] = await pool.query('SELECT id FROM kantin WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    }
    const [rows] = await pool.query(
      'SELECT id, nama, lokasi, status, saldo, created_at FROM kantin WHERE id = ?',
      [id]
    );
    return res.status(200).json({ message: 'Data kantin berhasil diubah.', data: rows[0] });
  } catch (error) {
    console.error('Update kantin error:', error);
    return res.status(500).json({ message: 'Gagal mengubah data kantin.' });
  }
};

export const deleteKantin = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [result] = await pool.query(
      `UPDATE kantin SET status = 'inactive' WHERE id = ? AND status <> 'inactive'`,
      [id]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.query('SELECT id FROM kantin WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    }
    return res.status(200).json({ message: 'Kantin dinonaktifkan; saldo dan riwayat tetap disimpan.' });
  } catch (error) {
    console.error('Delete kantin error:', error);
    return res.status(500).json({ message: 'Gagal menghapus data kantin.' });
  }
};

export const getCanteenCashiers = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.created_at
       FROM kantin_kasir kk
       JOIN users u ON u.id = kk.user_id
       WHERE kk.kantin_id = ? AND u.role = 'kasir'
       ORDER BY u.username`,
      [canteenId]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get canteen cashiers error:', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar kasir kantin.' });
  }
};

export const assignCanteenCashier = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const userId = parseId(req.body.user_id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  if (!userId) return res.status(400).json({ message: 'ID user kasir tidak valid.' });
  try {
    const [canteens] = await pool.query('SELECT id FROM kantin WHERE id = ? LIMIT 1', [canteenId]);
    if (!canteens.length) return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    const [cashiers] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND role = ? AND is_active = TRUE LIMIT 1',
      [userId, 'kasir']
    );
    if (!cashiers.length) return res.status(404).json({ message: 'Akun kasir tidak ditemukan.' });
    await pool.query('INSERT INTO kantin_kasir (kantin_id, user_id) VALUES (?, ?)', [canteenId, userId]);
    return res.status(201).json({
      message: 'Kasir berhasil ditugaskan ke kantin.',
      data: { kantin_id: canteenId, user_id: userId },
    });
  } catch (error) {
    if (duplicateError(error)) return res.status(409).json({ message: 'Kasir sudah ditugaskan ke kantin ini.' });
    console.error('Assign canteen cashier error:', error);
    return res.status(500).json({ message: 'Gagal menugaskan kasir ke kantin.' });
  }
};

export const removeCanteenCashier = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  if (!userId) return res.status(400).json({ message: 'ID user kasir tidak valid.' });
  try {
    const [result] = await pool.query(
      'DELETE FROM kantin_kasir WHERE kantin_id = ? AND user_id = ?',
      [canteenId, userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Penugasan kasir tidak ditemukan.' });
    return res.status(200).json({ message: 'Penugasan kasir berhasil dihapus.' });
  } catch (error) {
    console.error('Remove canteen cashier error:', error);
    return res.status(500).json({ message: 'Gagal menghapus penugasan kasir.' });
  }
};
