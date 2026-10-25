import bcrypt from 'bcryptjs';
import pool from '../../config/db.js';
import { validatePassword } from '../../config/passwords.js';
import { duplicateError, parseId, parseMoney, parsePagination, runInTransaction } from './shared.js';

export const getSantri = async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const offset = (page - 1) * limit;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const where = search
    ? 'WHERE s.nis LIKE ? OR s.nama_lengkap LIKE ? OR s.asrama LIKE ? OR u.username LIKE ?'
    : '';
  const searchValues = search ? Array(4).fill(`%${search}%`) : [];

  try {
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM santri s LEFT JOIN users u ON u.id = s.user_id ${where}`,
      searchValues
    );
    const [rows] = await pool.query(
      `SELECT s.id, s.user_id, u.username, s.nis, s.nama_lengkap, s.asrama,
              s.saldo, s.limit_harian, s.is_active
       FROM santri s
       LEFT JOIN users u ON u.id = s.user_id
       ${where}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`,
      [...searchValues, limit, offset]
    );

    return res.status(200).json({
      data: rows,
      pagination: { page, limit, total: count.total },
    });
  } catch (error) {
    console.error('Get santri error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data santri.' });
  }
};

export const exportSantri = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT nis, nama_lengkap, asrama, limit_harian
       FROM santri
       ORDER BY nama_lengkap, nis`
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Export santri error:', error);
    return res.status(500).json({ message: 'Gagal mengekspor data santri.' });
  }
};

export const importSantri = async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 25) {
    return res.status(400).json({ message: 'Impor harus berisi 1 sampai 25 baris per permintaan.' });
  }

  const imported = [];
  const skipped = [];
  const invalid = [];
  const preparedRows = rows.map((row, index) => {
    const rowNumber = Number.isSafeInteger(row?.row_number) && row.row_number >= 2
      ? row.row_number
      : index + 2;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      invalid.push({ row_number: rowNumber, reason: 'Format baris tidak valid.' });
      return null;
    }
    const nis = typeof row.nis === 'string' ? row.nis.trim() : '';
    const namaLengkap = typeof row.nama_lengkap === 'string' ? row.nama_lengkap.trim() : '';
    const asrama = typeof row.asrama === 'string' ? row.asrama.trim() : '';
    const limitInput = typeof row.limit_harian === 'string' && !row.limit_harian.trim()
      ? 50000
      : row.limit_harian ?? 50000;
    const limit = parseMoney(limitInput, 'limit_harian');

    if (!nis || nis.length > 30) {
      invalid.push({ row_number: rowNumber, reason: 'NIS wajib diisi dan maksimal 30 karakter.' });
    } else if (!namaLengkap || namaLengkap.length > 100) {
      invalid.push({ row_number: rowNumber, reason: 'Nama wajib diisi dan maksimal 100 karakter.' });
    } else if (asrama.length > 50) {
      invalid.push({ row_number: rowNumber, reason: 'Asrama maksimal 50 karakter.' });
    } else if (limit.error) {
      invalid.push({ row_number: rowNumber, reason: limit.error });
    } else {
      return { row_number: rowNumber, nis, namaLengkap, asrama, limit: limit.value };
    }
    return null;
  }).filter(Boolean);

  try {
    await runInTransaction(async (connection) => {
      for (const row of preparedRows) {
        try {
          await connection.query(
            `INSERT INTO santri (nis, nama_lengkap, asrama, limit_harian)
             VALUES (?, ?, ?, ?)`,
            [row.nis, row.namaLengkap, row.asrama || null, row.limit]
          );
          imported.push({ row_number: row.row_number, nis: row.nis });
        } catch (error) {
          if (!duplicateError(error)) throw error;
          skipped.push({ row_number: row.row_number, nis: row.nis, reason: 'NIS sudah terdaftar.' });
        }
      }
    });
    return res.status(200).json({
      message: 'Impor data santri selesai.',
      data: { imported, skipped, invalid },
    });
  } catch (error) {
    console.error('Import santri error:', error);
    return res.status(500).json({ message: 'Gagal mengimpor data santri.' });
  }
};

export const getSantriById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID santri tidak valid.' });

  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.user_id, u.username, s.nis, s.nama_lengkap, s.asrama,
              s.saldo, s.limit_harian, s.is_active
       FROM santri s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('Get santri by id error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data santri.' });
  }
};

export const createSantri = async (req, res) => {
  const { username, password, nis, nama_lengkap: namaLengkap, asrama } = req.body;
  const limit = parseMoney(req.body.limit_harian ?? 50000, 'limit_harian');

  if (![username, password, nis, namaLengkap].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ message: 'Username, password, NIS, dan nama lengkap wajib diisi.' });
  }
  if (username.trim().length < 3 || username.trim().length > 50) {
    return res.status(400).json({ message: 'Username harus terdiri dari 3 sampai 50 karakter.' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });
  if (nis.trim().length > 30 || namaLengkap.trim().length > 100) {
    return res.status(400).json({ message: 'NIS atau nama lengkap melebihi batas panjang.' });
  }
  if (asrama != null && (typeof asrama !== 'string' || asrama.length > 50)) {
    return res.status(400).json({ message: 'Asrama harus berupa teks maksimal 50 karakter.' });
  }
  if (limit.error) return res.status(400).json({ message: limit.error });

  try {
    const data = await runInTransaction(async (connection) => {
      const passwordHash = await bcrypt.hash(password, 12);
      const [userResult] = await connection.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username.trim(), passwordHash, 'santri']
      );
      const [santriResult] = await connection.query(
        `INSERT INTO santri (user_id, nis, nama_lengkap, asrama, limit_harian)
         VALUES (?, ?, ?, ?, ?)`,
        [userResult.insertId, nis.trim(), namaLengkap.trim(), asrama?.trim() || null, limit.value]
      );
      const [rows] = await connection.query(
        `SELECT s.id, s.user_id, u.username, s.nis, s.nama_lengkap, s.asrama,
                s.saldo, s.limit_harian, s.is_active
         FROM santri s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
        [santriResult.insertId]
      );
      return rows[0];
    });

    return res.status(201).json({ message: 'Data santri berhasil dibuat.', data });
  } catch (error) {
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'Username atau NIS sudah terdaftar.' });
    }
    console.error('Create santri error:', error);
    return res.status(500).json({ message: 'Gagal membuat data santri.' });
  }
};

export const updateSantri = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID santri tidak valid.' });

  const { username, password, nis, nama_lengkap: namaLengkap, asrama, limit_harian: limitInput } = req.body;
  const fields = [];
  const values = [];
  const userFields = [];
  const userValues = [];

  if (nis !== undefined) {
    if (typeof nis !== 'string' || !nis.trim() || nis.trim().length > 30) {
      return res.status(400).json({ message: 'NIS wajib diisi dan maksimal 30 karakter.' });
    }
    fields.push('nis = ?');
    values.push(nis.trim());
  }
  if (namaLengkap !== undefined) {
    if (typeof namaLengkap !== 'string' || !namaLengkap.trim() || namaLengkap.trim().length > 100) {
      return res.status(400).json({ message: 'Nama lengkap wajib diisi dan maksimal 100 karakter.' });
    }
    fields.push('nama_lengkap = ?');
    values.push(namaLengkap.trim());
  }
  if (asrama !== undefined) {
    if (asrama !== null && (typeof asrama !== 'string' || asrama.length > 50)) {
      return res.status(400).json({ message: 'Asrama harus berupa teks maksimal 50 karakter.' });
    }
    fields.push('asrama = ?');
    values.push(asrama?.trim() || null);
  }
  if (limitInput !== undefined) {
    const limit = parseMoney(limitInput, 'limit_harian');
    if (limit.error) return res.status(400).json({ message: limit.error });
    fields.push('limit_harian = ?');
    values.push(limit.value);
  }
  if (username !== undefined) {
    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
      return res.status(400).json({ message: 'Username harus terdiri dari 3 sampai 50 karakter.' });
    }
    userFields.push('username = ?');
    userValues.push(username.trim());
  }
  if (password !== undefined) {
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });
    userFields.push('password = ?');
    userValues.push(await bcrypt.hash(password, 12));
  }
  if (!fields.length && !userFields.length) {
    return res.status(400).json({ message: 'Tidak ada data yang diubah.' });
  }

  try {
    const data = await runInTransaction(async (connection) => {
      const [existing] = await connection.query('SELECT user_id FROM santri WHERE id = ? FOR UPDATE', [id]);
      if (!existing.length) return null;

      if (fields.length) {
        await connection.query(`UPDATE santri SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
      }
      if (userFields.length && existing[0].user_id) {
        if (password !== undefined) userFields.push('token_version = token_version + 1');
        await connection.query(
          `UPDATE users SET ${userFields.join(', ')} WHERE id = ?`,
          [...userValues, existing[0].user_id]
        );
      }

      const [rows] = await connection.query(
        `SELECT s.id, s.user_id, u.username, s.nis, s.nama_lengkap, s.asrama,
                s.saldo, s.limit_harian
         FROM santri s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
        [id]
      );
      return rows[0];
    });
    if (!data) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(200).json({ message: 'Data santri berhasil diubah.', data });
  } catch (error) {
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'Username atau NIS sudah terdaftar.' });
    }
    console.error('Update santri error:', error);
    return res.status(500).json({ message: 'Gagal mengubah data santri.' });
  }
};

export const deleteSantri = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID santri tidak valid.' });

  try {
    const deactivated = await runInTransaction(async (connection) => {
      const [rows] = await connection.query('SELECT user_id FROM santri WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) return false;
      await connection.query('UPDATE santri SET is_active = FALSE WHERE id = ?', [id]);
      if (rows[0].user_id) {
        await connection.query(
          `UPDATE users SET is_active = FALSE, token_version = token_version + 1
           WHERE id = ? AND role = ? AND is_active = TRUE`,
          [rows[0].user_id, 'santri']
        );
      }
      return true;
    });
    if (!deactivated) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(200).json({ message: 'Akun santri dinonaktifkan; saldo dan seluruh riwayat tetap disimpan.' });
  } catch (error) {
    console.error('Delete santri error:', error);
    return res.status(500).json({ message: 'Gagal menghapus data santri.' });
  }
};
