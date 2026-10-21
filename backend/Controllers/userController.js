import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { validatePassword } from '../config/passwords.js';

const validRoles = ['santri', 'kasir', 'wali', 'admin'];

const parseUserId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const userColumns = 'id, username, role, is_active, mfa_enabled, created_at';

export const getAllUsers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${userColumns} FROM users ORDER BY created_at DESC`
    );
    return res.status(200).json({ users: rows });
  } catch (error) {
    console.error('Get all users error:', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar user.' });
  }
};

export const getUserById = async (req, res) => {
  const userId = parseUserId(req.params.id);
  if (!userId) return res.status(400).json({ message: 'ID user tidak valid.' });
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ message: 'Anda tidak memiliki izin melihat data user ini.' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT ${userColumns} FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'User tidak ditemukan.' });
    return res.status(200).json({ user: rows[0] });
  } catch (error) {
    console.error('Get user by id error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data user.' });
  }
};

export const createUser = async (req, res) => {
  const { username, password, role } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !role) {
    return res.status(400).json({ message: 'Username, password, dan role wajib diisi.' });
  }
  const trimmedUsername = username.trim();
  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(trimmedUsername)) {
    return res.status(400).json({ message: 'Username harus terdiri dari 3-50 karakter alfanumerik, titik, garis bawah, atau tanda hubung.' });
  }
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Role tidak valid. Pilihan: santri, kasir, wali, admin.' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [trimmedUsername, hashedPassword, role]
    );
    const [rows] = await pool.query(
      `SELECT ${userColumns} FROM users WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return res.status(201).json({ message: 'User berhasil dibuat.', user: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Username sudah terdaftar.' });
    }
    console.error('Create user error:', error);
    return res.status(500).json({ message: 'Gagal membuat user.' });
  }
};

export const updateUser = async (req, res) => {
  const userId = parseUserId(req.params.id);
  if (!userId) return res.status(400).json({ message: 'ID user tidak valid.' });
  const { username, password, role, is_active: isActive } = req.body ?? {};
  const updates = [];
  const values = [];

  if (username !== undefined) {
    if (typeof username !== 'string' || !/^[A-Za-z0-9_.-]{3,50}$/.test(username.trim())) {
      return res.status(400).json({ message: 'Username harus terdiri dari 3-50 karakter alfanumerik, titik, garis bawah, atau tanda hubung.' });
    }
    updates.push('username = ?');
    values.push(username.trim());
  }
  if (password !== undefined) {
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });
    updates.push('password = ?');
    values.push(await bcrypt.hash(password, 12));
  }
  if (role !== undefined) {
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Role tidak valid. Pilihan: santri, kasir, wali, admin.' });
    }
    updates.push('role = ?');
    values.push(role);
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'is_active harus berupa boolean.' });
    }
    if (userId === req.user.id && !isActive) {
      return res.status(400).json({ message: 'Anda tidak dapat menonaktifkan akun sendiri.' });
    }
    updates.push('is_active = ?');
    values.push(isActive);
  }
  if (!updates.length) return res.status(400).json({ message: 'Tidak ada data yang diubah.' });

  const sessionChange = password !== undefined || role !== undefined || isActive !== undefined;
  if (sessionChange) updates.push('token_version = token_version + 1');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      'SELECT role, is_active FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }
    if (isActive === true && !existing[0].is_active && password === undefined) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Pengaktifan ulang akun wajib disertai password baru; MFA akan didaftarkan ulang.',
      });
    }
    if (isActive === true && !existing[0].is_active) {
      updates.push(
        'mfa_enabled = FALSE',
        'mfa_secret_enc = NULL',
        'mfa_pending_secret_enc = NULL',
        'mfa_last_step = -1'
      );
    }
    const removingActiveAdmin = existing[0].role === 'admin' && existing[0].is_active &&
      ((role !== undefined && role !== 'admin') || isActive === false);
    if (removingActiveAdmin) {
      const [admins] = await connection.query(
        'SELECT id FROM users WHERE role = ? AND is_active = TRUE FOR UPDATE',
        ['admin']
      );
      if (admins.length <= 1) {
        await connection.rollback();
        return res.status(409).json({ message: 'Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan rolenya.' });
      }
    }
    await connection.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      [...values, userId]
    );
    await connection.commit();
    const [rows] = await pool.query(
      `SELECT ${userColumns} FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    return res.status(200).json({ message: 'User berhasil diubah.', user: rows[0] });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Username sudah terdaftar.' });
    }
    console.error('Update user error:', error);
    return res.status(500).json({ message: 'Gagal mengubah user.' });
  } finally {
    connection.release();
  }
};

export const deleteUser = async (req, res) => {
  const userId = parseUserId(req.params.id);
  if (!userId) return res.status(400).json({ message: 'ID user tidak valid.' });
  if (req.user.id === userId) {
    return res.status(400).json({ message: 'Anda tidak dapat menonaktifkan akun sendiri.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      'SELECT role, is_active FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }
    if (existing[0].role === 'admin' && existing[0].is_active) {
      const [admins] = await connection.query(
        'SELECT id FROM users WHERE role = ? AND is_active = TRUE FOR UPDATE',
        ['admin']
      );
      if (admins.length <= 1) {
        await connection.rollback();
        return res.status(409).json({ message: 'Admin aktif terakhir tidak dapat dinonaktifkan.' });
      }
    }
    await connection.query(
      'UPDATE users SET is_active = FALSE, token_version = token_version + 1 WHERE id = ?',
      [userId]
    );
    await connection.commit();
    return res.status(200).json({
      message: 'Akun dinonaktifkan; data dan riwayat keuangan tetap disimpan.',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Deactivate user error:', error);
    return res.status(500).json({ message: 'Gagal menonaktifkan user.' });
  } finally {
    connection.release();
  }
};
