import pool from '../../config/db.js';
import { parsePagination } from './shared.js';

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
