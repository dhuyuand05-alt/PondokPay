import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { validatePassword } from '../config/passwords.js';
import { consumeCanteenPayoutApproval } from '../services/canteenPayoutApprovals.js';
import { consumeFinancialApproval } from '../services/financialApprovals.js';
import { collectCurrentServiceFeeDebt } from '../services/monthlyServiceFees.js';
import { enqueueParentTransactionNotifications } from '../services/whatsappNotifications.js';

const validCredentialStatuses = ['active', 'blocked'];
const validTransactionTypes = ['belanja', 'topup', 'tarik', 'biaya_layanan'];
const maxPageSize = 100;

const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const parseMoney = (value, field, { required = false, max = 99999999.99 } = {}) => {
  if (value === undefined && !required) return { value: undefined };
  if (value === null && !required) return { value: null };
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { error: `${field} harus berupa angka.` };
  }

  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { error: `${field} harus berupa angka positif dengan maksimal 2 angka desimal.` };
  }

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > max) {
    return { error: `${field} berada di luar batas yang diizinkan.` };
  }

  return { value: amount.toFixed(2) };
};

const moneyToCents = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

const centsToMoney = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

const normalizeSaleItems = (value) => {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    return { error: 'Keranjang harus berisi 1 sampai 100 produk.' };
  }
  const items = new Map();
  for (const row of value) {
    const productId = parseId(row?.product_id);
    const quantity = Number(row?.quantity);
    if (
      !productId ||
      (typeof row?.quantity !== 'number' && typeof row?.quantity !== 'string') ||
      !/^\d+$/.test(String(row.quantity)) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    ) {
      return { error: 'Produk atau jumlah pada keranjang tidak valid.' };
    }
    items.set(productId, (items.get(productId) || 0) + quantity);
    if (items.get(productId) > 999) return { error: 'Jumlah setiap produk maksimal 999.' };
  }
  return { items: [...items].map(([product_id, quantity]) => ({ product_id, quantity })).sort((a, b) => a.product_id - b.product_id) };
};

const getIdempotencyKey = (req) => {
  const key = req.get('Idempotency-Key')?.trim();
  return key && key.length >= 8 && key.length <= 64 &&
    /^[A-Za-z0-9._:-]+$/.test(key) ? key : null;
};

const idempotencyConflict = () => {
  const error = new Error('Idempotency key is already used by another operation.');
  error.code = 'IDEMPOTENCY_KEY_CONFLICT';
  return error;
};

const duplicateError = (error) => error.code === 'ER_DUP_ENTRY';

const runInTransaction = async (callback) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const parsePagination = (query) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 20;
  return {
    page: Math.max(1, page),
    limit: Math.min(maxPageSize, Math.max(1, limit)),
  };
};

export const getDashboard = async (req, res) => {
  try {
    const [[summary]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM santri) AS total_santri,
        (SELECT COUNT(*) FROM users WHERE role = 'wali') AS total_wali,
        (SELECT COUNT(*) FROM users WHERE role = 'kasir') AS total_kasir,
        (SELECT COUNT(*) FROM kantin) AS total_kantin,
        (SELECT COALESCE(SUM(saldo), 0) FROM kantin) AS total_saldo_kantin,
        (SELECT COALESCE(SUM(saldo), 0) FROM santri) AS total_saldo,
        (SELECT COUNT(*) FROM transaksi) AS total_transaksi,
        (SELECT COALESCE(SUM(jumlah), 0) FROM transaksi
          WHERE tipe_transaksi = 'belanja' AND DATE(created_at) = CURDATE()) AS belanja_hari_ini,
        (SELECT COALESCE(SUM(jumlah), 0) FROM transaksi
          WHERE tipe_transaksi = 'topup' AND DATE(created_at) = CURDATE()) AS topup_hari_ini,
        (SELECT COALESCE(SUM(jumlah), 0) FROM transaksi
          WHERE tipe_transaksi = 'tarik' AND DATE(created_at) = CURDATE()) AS tarik_hari_ini
    `);
    const [recentTransactions] = await pool.query(`
      SELECT t.id, t.santri_id, t.kantin_id, k.nama AS nama_kantin,
             s.nis, s.nama_lengkap, t.tipe_transaksi,
             t.jumlah, t.saldo_akhir, t.keterangan, t.created_at
      FROM transaksi t
      LEFT JOIN santri s ON s.id = t.santri_id
      LEFT JOIN kantin k ON k.id = t.kantin_id
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 10
    `);

    return res.status(200).json({ summary, recent_transactions: recentTransactions });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data dashboard.' });
  }
};

export const getAuditLogs = async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [];
  const actorId = req.query.actor_user_id;
  if (actorId !== undefined && typeof actorId !== 'string') {
    return res.status(400).json({ message: 'Filter aktor tidak valid.' });
  }
  if (req.query.method !== undefined && typeof req.query.method !== 'string') {
    return res.status(400).json({ message: 'Filter jenis aksi tidak valid.' });
  }
  if ((req.query.from !== undefined && typeof req.query.from !== 'string') ||
      (req.query.to !== undefined && typeof req.query.to !== 'string')) {
    return res.status(400).json({ message: 'Filter tanggal tidak valid.' });
  }
  const method = typeof req.query.method === 'string' ? req.query.method.toUpperCase() : '';
  const dateFrom = typeof req.query.from === 'string' ? req.query.from : '';
  const dateTo = typeof req.query.to === 'string' ? req.query.to : '';
  const isIsoDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (actorId !== undefined) {
    if (!/^\d+$/.test(String(actorId)) || Number(actorId) < 1 || !Number.isSafeInteger(Number(actorId))) {
      return res.status(400).json({ message: 'Filter aktor tidak valid.' });
    }
    conditions.push('l.actor_user_id = ?');
    values.push(Number(actorId));
  }
  if (method && !['POST', 'PUT', 'PATCH', 'DELETE', 'LOGIN_OK', 'LOGIN_MFA', 'LOGIN_FAIL'].includes(method)) {
    return res.status(400).json({ message: 'Filter jenis aksi tidak valid.' });
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    conditions.push('l.action = ?');
    values.push(method);
  } else if (method.startsWith('LOGIN_')) {
    conditions.push('l.action = ?');
    values.push(method);
  }
  if (dateFrom && !isIsoDate(dateFrom)) {
    return res.status(400).json({ message: 'Tanggal awal tidak valid.' });
  }
  if (dateTo && !isIsoDate(dateTo)) {
    return res.status(400).json({ message: 'Tanggal akhir tidak valid.' });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return res.status(400).json({ message: 'Tanggal awal tidak boleh melewati tanggal akhir.' });
  }
  if (dateFrom) {
    conditions.push('l.created_at >= ?');
    values.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    conditions.push('l.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs l ${where}`,
      values,
    );
    const [rows] = await pool.query(
      `SELECT l.id, l.request_id, l.actor_user_id, u.username AS actor_username,
              u.role AS actor_role, l.action, l.resource, l.details, l.source_ip,
              l.user_agent, l.status_code, l.created_at
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       ${where}
       ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );
    const [actors] = await pool.query(
      `SELECT DISTINCT u.id, u.username, u.role
       FROM audit_logs l
       INNER JOIN users u ON u.id = l.actor_user_id
       ORDER BY u.username ASC`,
    );
    return res.status(200).json({
      data: rows,
      pagination: { page, limit, total: count.total },
      filters: { actors },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return res.status(500).json({ message: 'Gagal mengambil audit log.' });
  }
};

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

export const getTransactions = async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [];
  const santriId = req.query.santri_id === undefined ? null : parseId(req.query.santri_id);
  if (req.query.santri_id !== undefined && !santriId) {
    return res.status(400).json({ message: 'ID santri tidak valid.' });
  }
  if (santriId) {
    conditions.push('t.santri_id = ?');
    values.push(santriId);
  }
  if (req.query.tipe_transaksi !== undefined) {
    if (!validTransactionTypes.includes(req.query.tipe_transaksi)) {
      return res.status(400).json({ message: 'Tipe transaksi tidak valid.' });
    }
    conditions.push('t.tipe_transaksi = ?');
    values.push(req.query.tipe_transaksi);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM transaksi t ${where}`,
      values
    );
    const [rows] = await pool.query(
      `SELECT t.id, t.santri_id, t.kantin_id, k.nama AS nama_kantin,
              s.nis, s.nama_lengkap, t.tipe_transaksi,
              t.jumlah, t.saldo_akhir, t.keterangan, t.created_at
       FROM transaksi t LEFT JOIN santri s ON s.id = t.santri_id
       LEFT JOIN kantin k ON k.id = t.kantin_id
       ${where}
       ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return res.status(200).json({ data: rows, pagination: { page, limit, total: count.total } });
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat transaksi.' });
  }
};

export const createTopup = async (req, res) => {
  const santriId = parseId(req.params.id);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  }
  const amount = parseMoney(req.body.jumlah, 'jumlah');
  if (amount.error || !amount.value || Number(amount.value) <= 0) {
    return res.status(400).json({ message: amount.error || 'Jumlah top-up harus lebih dari 0.' });
  }
  const keterangan = req.body.keterangan ?? null;
  if (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 65535)) {
    return res.status(400).json({ message: 'Keterangan transaksi tidak valid.' });
  }

  try {
    const transaction = await runInTransaction(async (connection) => {
      const [students] = await connection.query(
        'SELECT saldo, is_active FROM santri WHERE id = ? FOR UPDATE',
        [santriId]
      );
      if (!students.length) return null;
      const [previous] = await connection.query(
        `SELECT id, santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
         FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (previous.length) {
        const transaction = previous[0];
        if (Number(transaction.created_by) !== req.user.id ||
            Number(transaction.santri_id) !== santriId ||
            transaction.tipe_transaksi !== 'topup' ||
            moneyToCents(transaction.jumlah) !== moneyToCents(amount.value) ||
            (transaction.keterangan ?? null) !== keterangan) {
          throw idempotencyConflict();
        }
        return {
          id: transaction.id,
          santri_id: santriId,
          tipe_transaksi: 'topup',
          jumlah: amount.value,
          saldo_akhir: transaction.saldo_akhir,
          keterangan,
          duplicate: true,
        };
      }
      if (!students[0].is_active) return null;
      await consumeFinancialApproval(
        connection, req, 'santri_topup', santriId, amount.value, keterangan
      );

      const currentBalance = String(students[0].saldo ?? '0.00');
      const updatedCents = moneyToCents(currentBalance) + moneyToCents(amount.value);
      if (updatedCents > 999999999999n) {
        const error = new Error('Saldo melebihi kapasitas kolom.');
        error.code = 'SALDO_LIMIT_EXCEEDED';
        throw error;
      }
      const updatedBalance = centsToMoney(updatedCents);
      await connection.query('UPDATE santri SET saldo = ? WHERE id = ?', [updatedBalance, santriId]);
      const [result] = await connection.query(
        `INSERT INTO transaksi
           (santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
         VALUES (?, 'topup', ?, ?, ?, ?, ?)`,
        [santriId, amount.value, updatedBalance, keterangan, idempotencyKey, req.user.id]
      );
      await enqueueParentTransactionNotifications(connection, result.insertId);
      const serviceFee = await collectCurrentServiceFeeDebt(connection, {
        santriId,
        balance: updatedBalance,
        createdBy: req.user.id,
      });
      return {
        id: result.insertId,
        santri_id: santriId,
        tipe_transaksi: 'topup',
        jumlah: amount.value,
        saldo_akhir: updatedBalance,
        keterangan,
        service_fee_collected: serviceFee?.amount ?? '0.00',
      };
    });
    if (!transaction) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(transaction.duplicate ? 200 : 201).json({
      message: transaction.duplicate ? 'Top-up sudah diproses sebelumnya.' : 'Top-up berhasil.',
      data: transaction,
    });
  } catch (error) {
    if (duplicateError(error)) {
      try {
        const [previous] = await pool.query(
          `SELECT id, santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
           FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
          [idempotencyKey]
        );
        if (previous.length) {
          const existing = previous[0];
          if (Number(existing.created_by) === req.user.id &&
              Number(existing.santri_id) === santriId &&
              existing.tipe_transaksi === 'topup' &&
              moneyToCents(existing.jumlah) === moneyToCents(amount.value) &&
              (existing.keterangan ?? null) === keterangan) {
            return res.status(200).json({
              message: 'Top-up sudah diproses sebelumnya.',
              data: { id: existing.id, santri_id: santriId, tipe_transaksi: 'topup',
                jumlah: amount.value, saldo_akhir: existing.saldo_akhir, keterangan, duplicate: true },
            });
          }
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
        }
      } catch (lookupError) {
        console.error('Lookup idempotent topup error:', lookupError);
        return res.status(500).json({ message: 'Gagal memverifikasi status top-up.' });
      }
    }
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
    }
    if (error.code === 'FINANCIAL_APPROVAL_REQUIRED') {
      return res.status(403).json({ message: 'Top-up di atas ambang memerlukan persetujuan admin kedua.', approval_required: true });
    }
    if (error.code === 'FINANCIAL_APPROVAL_INVALID') {
      return res.status(409).json({ message: 'Persetujuan top-up tidak cocok atau sudah digunakan.' });
    }
    if (error.code === 'SALDO_LIMIT_EXCEEDED') {
      return res.status(400).json({ message: 'Saldo melebihi batas maksimum.' });
    }
    console.error('Create topup error:', error);
    return res.status(500).json({ message: 'Gagal melakukan top-up.' });
  }
};

export const createWithdrawal = async (req, res) => {
  const santriId = parseId(req.params.id);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  }
  const amount = parseMoney(req.body.jumlah, 'jumlah');
  if (amount.error || !amount.value || Number(amount.value) <= 0) {
    return res.status(400).json({ message: amount.error || 'Jumlah penarikan harus lebih dari 0.' });
  }
  const keterangan = req.body.keterangan ?? null;
  if (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 65535)) {
    return res.status(400).json({ message: 'Keterangan transaksi tidak valid.' });
  }

  try {
    const transaction = await runInTransaction(async (connection) => {
      const [students] = await connection.query(
        'SELECT saldo, is_active FROM santri WHERE id = ? FOR UPDATE',
        [santriId]
      );
      if (!students.length) return null;
      const [previous] = await connection.query(
        `SELECT id, santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
         FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (previous.length) {
        const existing = previous[0];
        if (Number(existing.created_by) !== req.user.id ||
            Number(existing.santri_id) !== santriId ||
            existing.tipe_transaksi !== 'tarik' ||
            moneyToCents(existing.jumlah) !== moneyToCents(amount.value) ||
            (existing.keterangan ?? null) !== keterangan) {
          throw idempotencyConflict();
        }
        return {
          id: existing.id,
          santri_id: santriId,
          tipe_transaksi: 'tarik',
          jumlah: amount.value,
          saldo_akhir: existing.saldo_akhir,
          keterangan,
          duplicate: true,
        };
      }
      if (!students[0].is_active) return null;
      await consumeFinancialApproval(
        connection, req, 'santri_withdrawal', santriId, amount.value, keterangan
      );
      const currentCents = moneyToCents(students[0].saldo ?? '0.00');
      const amountCents = moneyToCents(amount.value);
      if (amountCents > currentCents) {
        const error = new Error('Saldo santri tidak mencukupi.');
        error.code = 'INSUFFICIENT_STUDENT_BALANCE';
        throw error;
      }

      const updatedBalance = centsToMoney(currentCents - amountCents);
      await connection.query('UPDATE santri SET saldo = ? WHERE id = ?', [updatedBalance, santriId]);
      const [result] = await connection.query(
        `INSERT INTO transaksi
           (santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
         VALUES (?, 'tarik', ?, ?, ?, ?, ?)`,
        [santriId, amount.value, updatedBalance, keterangan, idempotencyKey, req.user.id]
      );
      await enqueueParentTransactionNotifications(connection, result.insertId);
      return {
        id: result.insertId,
        santri_id: santriId,
        tipe_transaksi: 'tarik',
        jumlah: amount.value,
        saldo_akhir: updatedBalance,
        keterangan,
      };
    });
    if (!transaction) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(transaction.duplicate ? 200 : 201).json({
      message: transaction.duplicate ? 'Penarikan sudah diproses sebelumnya.' : 'Penarikan saldo santri berhasil.',
      data: transaction,
    });
  } catch (error) {
    if (duplicateError(error)) {
      try {
        const [previous] = await pool.query(
          `SELECT id, santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
           FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
          [idempotencyKey]
        );
        if (previous.length) {
          const existing = previous[0];
          if (Number(existing.created_by) === req.user.id &&
              Number(existing.santri_id) === santriId &&
              existing.tipe_transaksi === 'tarik' &&
              moneyToCents(existing.jumlah) === moneyToCents(amount.value) &&
              (existing.keterangan ?? null) === keterangan) {
            return res.status(200).json({
              message: 'Penarikan sudah diproses sebelumnya.',
              data: { id: existing.id, santri_id: santriId, tipe_transaksi: 'tarik',
                jumlah: amount.value, saldo_akhir: existing.saldo_akhir, keterangan, duplicate: true },
            });
          }
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
        }
      } catch (lookupError) {
        console.error('Lookup idempotent withdrawal error:', lookupError);
        return res.status(500).json({ message: 'Gagal memverifikasi status penarikan.' });
      }
    }
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
    }
    if (error.code === 'FINANCIAL_APPROVAL_REQUIRED') {
      return res.status(403).json({ message: 'Penarikan di atas ambang memerlukan persetujuan admin kedua.', approval_required: true });
    }
    if (error.code === 'FINANCIAL_APPROVAL_INVALID') {
      return res.status(409).json({ message: 'Persetujuan penarikan tidak cocok atau sudah digunakan.' });
    }
    if (error.code === 'INSUFFICIENT_STUDENT_BALANCE') {
      return res.status(409).json({ message: 'Saldo santri tidak mencukupi untuk penarikan ini.' });
    }
    console.error('Create withdrawal error:', error);
    return res.status(500).json({ message: 'Gagal menarik saldo santri.' });
  }
};

export const createCanteenSale = async (req, res) => {
  const kantinId = parseId(req.params.id);
  const santriId = parseId(req.body.santri_id);
  const catalogRequest = req.body.items !== undefined;
  const normalizedItems = catalogRequest ? normalizeSaleItems(req.body.items) : null;
  const amount = catalogRequest ? { value: undefined } : parseMoney(req.body.jumlah, 'jumlah');
  const expectedCatalogAmount = catalogRequest && req.body.jumlah !== undefined
    ? parseMoney(req.body.jumlah, 'jumlah')
    : null;
  if (!kantinId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  if (catalogRequest && req.user.role !== 'kasir') {
    return res.status(403).json({ message: 'Rincian produk hanya dapat dicatat oleh petugas kantin.' });
  }
  if (normalizedItems?.error) return res.status(400).json({ message: normalizedItems.error });
  if (expectedCatalogAmount?.error) return res.status(400).json({ message: expectedCatalogAmount.error });
  if (!catalogRequest && (amount.error || !amount.value || Number(amount.value) <= 0)) {
    return res.status(400).json({ message: amount.error || 'Jumlah belanja harus lebih dari 0.' });
  }
  const keterangan = req.body.keterangan ?? null;
  if (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 65535)) {
    return res.status(400).json({ message: 'Keterangan transaksi tidak valid.' });
  }
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  }

  try {
    const sale = await runInTransaction(async (connection) => {
      const [canteens] = await connection.query(
        'SELECT saldo, status, catalog_enabled FROM kantin WHERE id = ? FOR UPDATE',
        [kantinId]
      );
      if (!canteens.length) return { notFound: 'kantin' };
      const [previous] = await connection.query(
        `SELECT id, santri_id, kantin_id, jumlah, saldo_akhir, keterangan, created_by
         FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (previous.length) {
        const transaction = previous[0];
        const [previousItems] = await connection.query(
          'SELECT product_id, quantity FROM canteen_sale_items WHERE transaksi_id = ? ORDER BY product_id',
          [transaction.id]
        );
        const sameItems = catalogRequest &&
          previousItems.length === normalizedItems.items.length &&
          previousItems.every((row, index) =>
            Number(row.product_id) === normalizedItems.items[index].product_id &&
            Number(row.quantity) === normalizedItems.items[index].quantity) &&
          (!expectedCatalogAmount?.value ||
            moneyToCents(transaction.jumlah) === moneyToCents(expectedCatalogAmount.value));
        const sameManualAmount = !catalogRequest && !previousItems.length &&
          moneyToCents(transaction.jumlah) === moneyToCents(amount.value);
        if (
          Number(transaction.created_by) !== req.user.id ||
          Number(transaction.santri_id) !== santriId ||
          Number(transaction.kantin_id) !== kantinId ||
          !(sameItems || sameManualAmount) ||
          (transaction.keterangan ?? null) !== keterangan
        ) {
          throw idempotencyConflict();
        }
        const [[currentCanteen]] = await connection.query(
          'SELECT saldo FROM kantin WHERE id = ?',
          [kantinId]
        );
        return {
          duplicate: true,
          santri: { id: santriId, saldo: transaction.saldo_akhir },
          kantin: { id: kantinId, saldo: currentCanteen.saldo },
          transaksi_id: transaction.id,
          jumlah: transaction.jumlah,
        };
      }
      if (canteens[0].status !== 'active') {
        const error = new Error('Kantin tidak aktif.');
        error.code = 'CANTEEN_INACTIVE';
        throw error;
      }
      let saleItems = [];
      let amountCents;
      if (catalogRequest) {
        if (!canteens[0].catalog_enabled) {
          const error = new Error('Mode kasir produk tidak aktif untuk kantin ini.');
          error.code = 'CATALOG_DISABLED';
          throw error;
        }
        const productIds = normalizedItems.items.map((item) => item.product_id);
        const [products] = await connection.query(
          `SELECT id, nama, sku, harga, stok
           FROM canteen_products
           WHERE kantin_id = ? AND is_active = TRUE AND id IN (?)
           ORDER BY id FOR UPDATE`,
          [kantinId, productIds]
        );
        if (products.length !== normalizedItems.items.length) {
          const error = new Error('Satu atau beberapa produk sudah tidak tersedia.');
          error.code = 'PRODUCT_UNAVAILABLE';
          throw error;
        }
        const productMap = new Map(products.map((product) => [Number(product.id), product]));
        amountCents = 0n;
        saleItems = normalizedItems.items.map((item) => {
          const product = productMap.get(item.product_id);
          if (Number(product.stok) < item.quantity) {
            const error = new Error(`Stok ${product.nama} tidak mencukupi.`);
            error.code = 'INSUFFICIENT_PRODUCT_STOCK';
            throw error;
          }
          const subtotalCents = moneyToCents(product.harga) * BigInt(item.quantity);
          amountCents += subtotalCents;
          return {
            ...item,
            product,
            unitPrice: product.harga,
            subtotal: centsToMoney(subtotalCents),
            remainingStock: Number(product.stok) - item.quantity,
          };
        });
        if (amountCents <= 0n || amountCents > 9999999999n) {
          const error = new Error('Total transaksi melebihi batas yang diizinkan.');
          error.code = 'SALE_AMOUNT_LIMIT';
          throw error;
        }
        if (expectedCatalogAmount?.value &&
            moneyToCents(expectedCatalogAmount.value) !== amountCents) {
          const error = new Error('Harga produk berubah. Muat ulang katalog dan periksa keranjang.');
          error.code = 'CATALOG_PRICE_CHANGED';
          throw error;
        }
      } else {
        amountCents = moneyToCents(amount.value);
      }
      const [students] = await connection.query(
        'SELECT saldo, limit_harian, is_active FROM santri WHERE id = ? FOR UPDATE',
        [santriId]
      );
      if (!students.length || !students[0].is_active) return { notFound: 'santri' };

      const studentBalanceCents = moneyToCents(students[0].saldo ?? '0.00');
      if (amountCents > studentBalanceCents) {
        const error = new Error('Saldo santri tidak mencukupi.');
        error.code = 'INSUFFICIENT_STUDENT_BALANCE';
        throw error;
      }

      const [dailyRows] = await connection.query(
        `SELECT COALESCE(SUM(jumlah), 0) AS total
         FROM transaksi
         WHERE santri_id = ? AND tipe_transaksi = 'belanja'
           AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY`,
        [santriId]
      );
      const spentCents = moneyToCents(dailyRows[0].total ?? '0.00');
      const limitCents = moneyToCents(students[0].limit_harian ?? '0.00');
      if (spentCents + amountCents > limitCents) {
        const error = new Error('Batas belanja harian terlampaui.');
        error.code = 'DAILY_LIMIT_EXCEEDED';
        throw error;
      }

      const canteenBalanceCents = moneyToCents(canteens[0].saldo ?? '0.00');
      if (canteenBalanceCents + amountCents > 999999999999n) {
        const error = new Error('Saldo kantin melebihi batas maksimum.');
        error.code = 'CANTEEN_BALANCE_LIMIT';
        throw error;
      }
      const studentBalance = centsToMoney(studentBalanceCents - amountCents);
      const canteenBalance = centsToMoney(canteenBalanceCents + amountCents);

      await connection.query('UPDATE santri SET saldo = ? WHERE id = ?', [studentBalance, santriId]);
      await connection.query('UPDATE kantin SET saldo = ? WHERE id = ?', [canteenBalance, kantinId]);
      const [transaction] = await connection.query(
        `INSERT INTO transaksi
           (santri_id, kantin_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
         VALUES (?, ?, 'belanja', ?, ?, ?, ?, ?)`,
        [santriId, kantinId, centsToMoney(amountCents), studentBalance, keterangan, idempotencyKey, req.user.id]
      );
      for (const item of saleItems) {
        await connection.query(
          `INSERT INTO canteen_sale_items
             (transaksi_id, product_id, nama_produk, sku, harga_satuan, quantity, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [transaction.insertId, item.product.id, item.product.nama, item.product.sku,
            item.unitPrice, item.quantity, item.subtotal]
        );
        await connection.query(
          'UPDATE canteen_products SET stok = ? WHERE id = ?',
          [item.remainingStock, item.product.id]
        );
        await connection.query(
          `INSERT INTO canteen_stock_movements
             (product_id, transaksi_id, user_id, movement_type, quantity_change, stock_after, note)
           VALUES (?, ?, ?, 'sale', ?, ?, 'Penjualan melalui kasir')`,
          [item.product.id, transaction.insertId, req.user.id, -item.quantity, item.remainingStock]
        );
      }
      await enqueueParentTransactionNotifications(connection, transaction.insertId);
      await connection.query(
        `INSERT INTO kantin_transaksi
           (kantin_id, transaksi_id, tipe_transaksi, jumlah, saldo_akhir, keterangan)
         VALUES (?, ?, 'penjualan', ?, ?, ?)`,
        [kantinId, transaction.insertId, centsToMoney(amountCents), canteenBalance, keterangan]
      );
      return {
        santri: { id: santriId, saldo: studentBalance },
        kantin: { id: kantinId, saldo: canteenBalance },
        transaksi_id: transaction.insertId,
        jumlah: centsToMoney(amountCents),
      };
    });
    if (sale.notFound === 'kantin') return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    if (sale.notFound === 'santri') return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(sale.duplicate ? 200 : 201).json({
      message: sale.duplicate ? 'Transaksi sudah diproses sebelumnya.' : 'Transaksi belanja berhasil.',
      data: sale,
    });
  } catch (error) {
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
    }
    if (duplicateError(error) && idempotencyKey) {
      try {
        const [previous] = await pool.query(
          `SELECT id, santri_id, kantin_id, jumlah, saldo_akhir, keterangan, created_by
           FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
          [idempotencyKey]
        );
        if (
          previous.length &&
          Number(previous[0].created_by) === req.user.id &&
          Number(previous[0].santri_id) === santriId &&
          Number(previous[0].kantin_id) === kantinId &&
          (previous[0].keterangan ?? null) === keterangan
        ) {
          const [previousItems] = await pool.query(
            'SELECT product_id, quantity FROM canteen_sale_items WHERE transaksi_id = ? ORDER BY product_id',
            [previous[0].id]
          );
          const sameItems = catalogRequest &&
            previousItems.length === normalizedItems.items.length &&
            previousItems.every((row, index) =>
              Number(row.product_id) === normalizedItems.items[index].product_id &&
              Number(row.quantity) === normalizedItems.items[index].quantity) &&
            (!expectedCatalogAmount?.value ||
              moneyToCents(previous[0].jumlah) === moneyToCents(expectedCatalogAmount.value));
          const sameManualAmount = !catalogRequest && !previousItems.length &&
            moneyToCents(previous[0].jumlah) === moneyToCents(amount.value);
          if (sameItems || sameManualAmount) {
            return res.status(200).json({
              message: 'Transaksi sudah diproses sebelumnya.',
              data: {
                duplicate: true,
                transaksi_id: previous[0].id,
                santri: { id: santriId, saldo: previous[0].saldo_akhir },
                kantin: { id: kantinId },
                jumlah: previous[0].jumlah,
              },
            });
          }
        }
        if (previous.length) {
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
        }
      } catch (lookupError) {
        console.error('Lookup idempotent canteen transaction error:', lookupError);
        return res.status(500).json({ message: 'Gagal memverifikasi status transaksi.' });
      }
    }
    if (error.code === 'CANTEEN_INACTIVE') {
      return res.status(409).json({ message: 'Kantin tidak aktif dan tidak dapat menerima transaksi.' });
    }
    if (error.code === 'INSUFFICIENT_STUDENT_BALANCE') {
      return res.status(409).json({ message: 'Saldo santri tidak mencukupi.' });
    }
    if (error.code === 'DAILY_LIMIT_EXCEEDED') {
      return res.status(409).json({ message: 'Transaksi melebihi limit belanja harian santri.' });
    }
    if (error.code === 'CANTEEN_BALANCE_LIMIT') {
      return res.status(400).json({ message: 'Saldo kantin melebihi batas maksimum.' });
    }
    if (['CATALOG_ITEMS_REQUIRED', 'CATALOG_DISABLED', 'PRODUCT_UNAVAILABLE', 'INSUFFICIENT_PRODUCT_STOCK', 'CATALOG_PRICE_CHANGED'].includes(error.code)) {
      return res.status(409).json({ message: error.message });
    }
    if (error.code === 'SALE_AMOUNT_LIMIT') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Create canteen sale error:', error);
    return res.status(500).json({ message: 'Gagal mencatat transaksi kantin.' });
  }
};

export const createCanteenWithdrawal = async (req, res) => {
  const kantinId = parseId(req.params.id);
  if (!kantinId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  }
  const amount = parseMoney(req.body.jumlah, 'jumlah');
  if (amount.error || !amount.value || Number(amount.value) <= 0) {
    return res.status(400).json({ message: amount.error || 'Jumlah pencairan harus lebih dari 0.' });
  }
  const keterangan = req.body.keterangan ?? null;
  if (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 65535)) {
    return res.status(400).json({ message: 'Keterangan pencairan tidak valid.' });
  }

  try {
    const payout = await runInTransaction(async (connection) => {
      const [canteens] = await connection.query('SELECT saldo FROM kantin WHERE id = ? FOR UPDATE', [kantinId]);
      if (!canteens.length) return null;
      const [previous] = await connection.query(
        `SELECT id, kantin_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
         FROM kantin_transaksi WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (previous.length) {
        const existing = previous[0];
        if (Number(existing.created_by) !== req.user.id ||
            Number(existing.kantin_id) !== kantinId ||
            existing.tipe_transaksi !== 'pencairan' ||
            moneyToCents(existing.jumlah) !== moneyToCents(amount.value) ||
            (existing.keterangan ?? null) !== keterangan) {
          throw idempotencyConflict();
        }
        return {
          id: existing.id,
          kantin_id: kantinId,
          tipe_transaksi: 'pencairan',
          jumlah: amount.value,
          saldo_akhir: existing.saldo_akhir,
          keterangan,
          duplicate: true,
        };
      }
      await consumeCanteenPayoutApproval(
        connection, req, kantinId, amount.value, keterangan
      );
      await consumeFinancialApproval(
        connection, req, 'canteen_withdrawal', kantinId, amount.value, keterangan
      );
      const currentCents = moneyToCents(canteens[0].saldo ?? '0.00');
      const amountCents = moneyToCents(amount.value);
      if (amountCents > currentCents) {
        const error = new Error('Saldo kantin tidak mencukupi.');
        error.code = 'INSUFFICIENT_CANTEEN_BALANCE';
        throw error;
      }
      const updatedBalance = centsToMoney(currentCents - amountCents);
      await connection.query('UPDATE kantin SET saldo = ? WHERE id = ?', [updatedBalance, kantinId]);
      const [result] = await connection.query(
        `INSERT INTO kantin_transaksi
           (kantin_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
         VALUES (?, 'pencairan', ?, ?, ?, ?, ?)`,
        [kantinId, amount.value, updatedBalance, keterangan, idempotencyKey, req.user.id]
      );
      return {
        id: result.insertId,
        kantin_id: kantinId,
        tipe_transaksi: 'pencairan',
        jumlah: amount.value,
        saldo_akhir: updatedBalance,
        keterangan,
      };
    });
    if (!payout) return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    return res.status(payout.duplicate ? 200 : 201).json({
      message: payout.duplicate ? 'Pencairan sudah diproses sebelumnya.' : 'Pencairan saldo kantin berhasil.',
      data: payout,
    });
  } catch (error) {
    if (duplicateError(error)) {
      try {
        const [previous] = await pool.query(
          `SELECT id, kantin_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
           FROM kantin_transaksi WHERE idempotency_key = ? LIMIT 1`,
          [idempotencyKey]
        );
        if (previous.length) {
          const existing = previous[0];
          if (Number(existing.created_by) === req.user.id &&
              Number(existing.kantin_id) === kantinId &&
              existing.tipe_transaksi === 'pencairan' &&
              moneyToCents(existing.jumlah) === moneyToCents(amount.value) &&
              (existing.keterangan ?? null) === keterangan) {
            return res.status(200).json({
              message: 'Pencairan sudah diproses sebelumnya.',
              data: { id: existing.id, kantin_id: kantinId, tipe_transaksi: 'pencairan',
                jumlah: amount.value, saldo_akhir: existing.saldo_akhir, keterangan, duplicate: true },
            });
          }
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
        }
      } catch (lookupError) {
        console.error('Lookup idempotent canteen withdrawal error:', lookupError);
        return res.status(500).json({ message: 'Gagal memverifikasi status pencairan.' });
      }
    }
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
    }
    if (error.code === 'FINANCIAL_APPROVAL_REQUIRED') {
      return res.status(403).json({ message: 'Pencairan di atas ambang memerlukan persetujuan admin kedua.', approval_required: true });
    }
    if (error.code === 'FINANCIAL_APPROVAL_INVALID') {
      return res.status(409).json({ message: 'Persetujuan pencairan tidak cocok atau sudah digunakan.' });
    }
    if (error.code === 'CANTEEN_CASHIER_APPROVAL_REQUIRED') {
      return res.status(403).json({ message: error.message, cashier_approval_required: true });
    }
    if (error.code === 'CANTEEN_CASHIER_APPROVAL_INVALID') {
      return res.status(409).json({ message: error.message });
    }
    if (error.code === 'INSUFFICIENT_CANTEEN_BALANCE') {
      return res.status(409).json({ message: 'Saldo kantin tidak mencukupi untuk pencairan ini.' });
    }
    console.error('Create canteen withdrawal error:', error);
    return res.status(500).json({ message: 'Gagal mencairkan saldo kantin.' });
  }
};

export const getCanteenTransactions = async (req, res) => {
  const kantinId = parseId(req.params.id);
  if (!kantinId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const { page, limit } = parsePagination(req.query);
  const offset = (page - 1) * limit;
  const conditions = ['kt.kantin_id = ?'];
  const values = [kantinId];
  if (req.query.tipe_transaksi !== undefined) {
    if (!['penjualan', 'pencairan'].includes(req.query.tipe_transaksi)) {
      return res.status(400).json({ message: 'Jenis transaksi kantin tidak valid.' });
    }
    conditions.push('kt.tipe_transaksi = ?');
    values.push(req.query.tipe_transaksi);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  try {
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM kantin_transaksi kt ${where}`,
      values
    );
    const [rows] = await pool.query(
      `SELECT kt.id, kt.kantin_id, kt.transaksi_id, kt.tipe_transaksi,
              kt.jumlah, kt.saldo_akhir, kt.keterangan, kt.created_at,
              t.santri_id, s.nis, s.nama_lengkap
       FROM kantin_transaksi kt
       LEFT JOIN transaksi t ON t.id = kt.transaksi_id
       LEFT JOIN santri s ON s.id = t.santri_id
       ${where}
       ORDER BY kt.created_at DESC, kt.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return res.status(200).json({ data: rows, pagination: { page, limit, total: count.total } });
  } catch (error) {
    console.error('Get canteen transactions error:', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat saldo kantin.' });
  }
};

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

export const getCredentials = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.santri_id, s.nis, s.nama_lengkap, c.rfid_uid,
              c.fingerprint_id, c.status
       FROM credentials_auth c LEFT JOIN santri s ON s.id = c.santri_id
       ORDER BY c.id DESC`
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get credentials error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kredensial.' });
  }
};

export const getCredentialById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kredensial tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.santri_id, s.nis, s.nama_lengkap, c.rfid_uid,
              c.fingerprint_id, c.status
       FROM credentials_auth c LEFT JOIN santri s ON s.id = c.santri_id
       WHERE c.id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Kredensial tidak ditemukan.' });
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('Get credential by id error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kredensial.' });
  }
};

const registerCredentialValue = async (req, res, type) => {
  const santriId = parseId(req.params.id);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  const isCard = type === 'kartu';
  const column = isCard ? 'rfid_uid' : 'fingerprint_id';
  const inputKey = isCard ? 'rfid_uid' : 'fingerprint_id';
  let value = req.body[inputKey];
  if (isCard) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 50) {
      return res.status(400).json({ message: 'RFID UID wajib diisi dan maksimal 50 karakter.' });
    }
    value = value.trim();
  } else {
    value = Number(value);
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ message: 'Fingerprint ID harus berupa bilangan bulat positif.' });
    }
  }

  try {
    const result = await runInTransaction(async (connection) => {
      const [students] = await connection.query('SELECT id FROM santri WHERE id = ? FOR UPDATE', [santriId]);
      if (!students.length) return { notFound: true };
      const [duplicates] = await connection.query(
        `SELECT id, santri_id FROM credentials_auth WHERE ${column} = ? LIMIT 1 FOR UPDATE`,
        [value]
      );
      if (duplicates.length) {
        let duplicate;
        if (duplicates[0].santri_id === santriId) {
          duplicate = new Error('Kredensial sudah terdaftar untuk santri ini.');
          duplicate.code = 'CREDENTIAL_ALREADY_REGISTERED';
        } else {
          duplicate = new Error('Kredensial sudah digunakan santri lain.');
          duplicate.code = 'CREDENTIAL_IN_USE';
        }
        throw duplicate;
      }
      const [insert] = await connection.query(
        `INSERT INTO credentials_auth (santri_id, ${column}, status)
         VALUES (?, ?, 'active')`,
        [santriId, value]
      );
      return { id: insert.insertId, santri_id: santriId, [inputKey]: value, status: 'active' };
    });
    if (result.notFound) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(201).json({ message: `${isCard ? 'Kartu' : 'Sidik jari'} berhasil didaftarkan.`, data: result });
  } catch (error) {
    if (error.code === 'CREDENTIAL_ALREADY_REGISTERED') {
      return res.status(409).json({ message: 'Kredensial tersebut sudah terdaftar untuk santri ini.' });
    }
    if (error.code === 'CREDENTIAL_IN_USE' || duplicateError(error)) {
      return res.status(409).json({ message: 'Kredensial tersebut sudah digunakan oleh santri lain.' });
    }
    console.error(`Register ${type} error:`, error);
    return res.status(500).json({ message: `Gagal mendaftarkan ${isCard ? 'kartu' : 'sidik jari'}.` });
  }
};

export const registerStudentCard = (req, res) => registerCredentialValue(req, res, 'kartu');
export const registerStudentFingerprint = (req, res) => registerCredentialValue(req, res, 'sidik-jari');

export const createCredential = async (req, res) => {
  const santriId = parseId(req.body.santri_id);
  const { rfid_uid: rfidUid = null, fingerprint_id: fingerprintValue = null, status = 'active' } = req.body;
  const fingerprintId = fingerprintValue === null ? null : Number(fingerprintValue);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  if (rfidUid !== null && (typeof rfidUid !== 'string' || rfidUid.length > 50)) {
    return res.status(400).json({ message: 'RFID UID maksimal 50 karakter.' });
  }
  if (fingerprintId !== null && (!Number.isInteger(fingerprintId) || fingerprintId < 0)) {
    return res.status(400).json({ message: 'Fingerprint ID harus berupa bilangan bulat positif.' });
  }
  if (!rfidUid && fingerprintId === null) {
    return res.status(400).json({ message: 'RFID UID atau fingerprint ID wajib diisi.' });
  }
  if (!validCredentialStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status kredensial harus active atau blocked.' });
  }
  try {
    const [students] = await pool.query('SELECT id FROM santri WHERE id = ? LIMIT 1', [santriId]);
    if (!students.length) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    const normalizedRfid = rfidUid?.trim() || null;
    if (normalizedRfid) {
      const [existing] = await pool.query(
        'SELECT id FROM credentials_auth WHERE rfid_uid = ? LIMIT 1',
        [normalizedRfid]
      );
      if (existing.length) return res.status(409).json({ message: 'RFID UID sudah terdaftar.' });
    }
    if (fingerprintId !== null) {
      const [existing] = await pool.query(
        'SELECT id FROM credentials_auth WHERE fingerprint_id = ? LIMIT 1',
        [fingerprintId]
      );
      if (existing.length) return res.status(409).json({ message: 'Fingerprint ID sudah terdaftar.' });
    }
    const [result] = await pool.query(
      `INSERT INTO credentials_auth (santri_id, rfid_uid, fingerprint_id, status)
       VALUES (?, ?, ?, ?)`,
      [santriId, normalizedRfid, fingerprintId, status]
    );
    const [rows] = await pool.query(
      'SELECT id, santri_id, rfid_uid, fingerprint_id, status FROM credentials_auth WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json({ message: 'Kredensial berhasil dibuat.', data: rows[0] });
  } catch (error) {
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'RFID UID atau fingerprint ID sudah terdaftar.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    }
    console.error('Create credential error:', error);
    return res.status(500).json({ message: 'Gagal membuat data kredensial.' });
  }
};

export const updateCredential = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kredensial tidak valid.' });
  const fields = [];
  const values = [];
  if (req.body.santri_id !== undefined) {
    const santriId = parseId(req.body.santri_id);
    if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
    fields.push('santri_id = ?');
    values.push(santriId);
  }
  if (req.body.rfid_uid !== undefined) {
    const value = req.body.rfid_uid;
    if (value !== null && (typeof value !== 'string' || value.length > 50)) {
      return res.status(400).json({ message: 'RFID UID maksimal 50 karakter.' });
    }
    fields.push('rfid_uid = ?');
    values.push(value?.trim() || null);
  }
  if (req.body.fingerprint_id !== undefined) {
    const value = req.body.fingerprint_id;
    const fingerprintId = value === null ? null : Number(value);
    if (fingerprintId !== null && (!Number.isInteger(fingerprintId) || fingerprintId < 0)) {
      return res.status(400).json({ message: 'Fingerprint ID harus berupa bilangan bulat positif.' });
    }
    fields.push('fingerprint_id = ?');
    values.push(fingerprintId);
  }
  if (req.body.status !== undefined) {
    if (!validCredentialStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Status kredensial harus active atau blocked.' });
    }
    fields.push('status = ?');
    values.push(req.body.status);
  }
  if (!fields.length) return res.status(400).json({ message: 'Tidak ada data yang diubah.' });
  try {
    const [currentRows] = await pool.query(
      'SELECT rfid_uid, fingerprint_id FROM credentials_auth WHERE id = ? LIMIT 1',
      [id]
    );
    if (!currentRows.length) return res.status(404).json({ message: 'Kredensial tidak ditemukan.' });
    const nextRfid = req.body.rfid_uid === undefined
      ? currentRows[0].rfid_uid
      : (req.body.rfid_uid?.trim() || null);
    const nextFingerprint = req.body.fingerprint_id === undefined
      ? currentRows[0].fingerprint_id
      : (req.body.fingerprint_id === null ? null : Number(req.body.fingerprint_id));
    if (!nextRfid && nextFingerprint === null) {
      return res.status(400).json({ message: 'Minimal RFID UID atau fingerprint ID harus tetap terdaftar.' });
    }
    if (nextRfid) {
      const [duplicates] = await pool.query(
        'SELECT id FROM credentials_auth WHERE rfid_uid = ? AND id <> ? LIMIT 1',
        [nextRfid, id]
      );
      if (duplicates.length) return res.status(409).json({ message: 'RFID UID sudah terdaftar.' });
    }
    if (nextFingerprint !== null) {
      const [duplicates] = await pool.query(
        'SELECT id FROM credentials_auth WHERE fingerprint_id = ? AND id <> ? LIMIT 1',
        [nextFingerprint, id]
      );
      if (duplicates.length) return res.status(409).json({ message: 'Fingerprint ID sudah terdaftar.' });
    }
    const [result] = await pool.query(
      `UPDATE credentials_auth SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.query('SELECT id FROM credentials_auth WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Kredensial tidak ditemukan.' });
    }
    const [rows] = await pool.query(
      'SELECT id, santri_id, rfid_uid, fingerprint_id, status FROM credentials_auth WHERE id = ?',
      [id]
    );
    return res.status(200).json({ message: 'Kredensial berhasil diubah.', data: rows[0] });
  } catch (error) {
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'RFID UID atau fingerprint ID sudah terdaftar.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    }
    console.error('Update credential error:', error);
    return res.status(500).json({ message: 'Gagal mengubah data kredensial.' });
  }
};

export const deleteCredential = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kredensial tidak valid.' });
  try {
    const [result] = await pool.query(
      `UPDATE credentials_auth SET status = 'blocked'
       WHERE id = ? AND status <> 'blocked'`,
      [id]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.query('SELECT id FROM credentials_auth WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Kredensial tidak ditemukan.' });
    }
    return res.status(200).json({ message: 'Kredensial diblokir; data dipertahankan untuk audit.' });
  } catch (error) {
    console.error('Delete credential error:', error);
    return res.status(500).json({ message: 'Gagal menghapus data kredensial.' });
  }
};
