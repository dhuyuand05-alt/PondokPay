import pool from '../../../config/db.js';
import { parseId, parsePagination, validTransactionTypes } from '../shared.js';

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
