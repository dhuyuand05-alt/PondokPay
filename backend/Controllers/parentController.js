import pool from '../config/db.js';

const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const parsePagination = (query) => {
  const requestedPage = Number.parseInt(query.page, 10) || 1;
  const requestedLimit = Number.parseInt(query.limit, 10) || 20;
  return {
    page: Math.max(1, requestedPage),
    limit: Math.min(100, Math.max(1, requestedLimit)),
  };
};

const getLinkedChild = async (userId, santriId) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.nis, s.nama_lengkap, s.asrama, s.saldo, s.limit_harian
     FROM wali_santri w
     JOIN santri s ON s.id = w.santri_id
     WHERE w.user_id = ? AND w.santri_id = ?
     LIMIT 1`,
    [userId, santriId]
  );
  return rows[0] ?? null;
};

export const getParentProfile = async (req, res) => {
  try {
    const [accounts] = await pool.query(
      'SELECT id, username, created_at FROM users WHERE id = ? AND role = ? LIMIT 1',
      [req.user.id, 'wali']
    );
    if (!accounts.length) return res.status(404).json({ message: 'Akun orang tua tidak ditemukan.' });
    const [children] = await pool.query(
      `SELECT s.id, s.nis, s.nama_lengkap, s.asrama, s.saldo, s.limit_harian, w.no_whatsapp,
              COALESCE(daily.total, 0) AS belanja_hari_ini,
              GREATEST(s.limit_harian - COALESCE(daily.total, 0), 0) AS sisa_limit_harian
       FROM wali_santri w
       JOIN santri s ON s.id = w.santri_id
       LEFT JOIN (
         SELECT santri_id, SUM(jumlah) AS total
         FROM transaksi
         WHERE tipe_transaksi = 'belanja'
           AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY
         GROUP BY santri_id
       ) daily ON daily.santri_id = s.id
       WHERE w.user_id = ?
       ORDER BY s.nama_lengkap`,
      [req.user.id]
    );
    return res.status(200).json({ data: { ...accounts[0], children } });
  } catch (error) {
    console.error('Get parent profile error:', error);
    return res.status(500).json({ message: 'Gagal mengambil profil orang tua.' });
  }
};

export const getChildren = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.nis, s.nama_lengkap, s.asrama, s.saldo, s.limit_harian,
              w.no_whatsapp,
              COALESCE(daily.total, 0) AS belanja_hari_ini,
              GREATEST(s.limit_harian - COALESCE(daily.total, 0), 0) AS sisa_limit_harian
       FROM wali_santri w
       JOIN santri s ON s.id = w.santri_id
       LEFT JOIN (
         SELECT santri_id, SUM(jumlah) AS total
         FROM transaksi
         WHERE tipe_transaksi = 'belanja'
           AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY
         GROUP BY santri_id
       ) daily ON daily.santri_id = s.id
       WHERE w.user_id = ?
       ORDER BY s.nama_lengkap`,
      [req.user.id]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get children error:', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar anak.' });
  }
};

export const getChildDetails = async (req, res) => {
  const santriId = parseId(req.params.santriId);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  try {
    const child = await getLinkedChild(req.user.id, santriId);
    if (!child) return res.status(404).json({ message: 'Santri tidak terhubung ke akun orang tua ini.' });
    const [[daily]] = await pool.query(
      `SELECT COALESCE(SUM(jumlah), 0) AS total
       FROM transaksi
       WHERE santri_id = ? AND tipe_transaksi = 'belanja'
         AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY`,
      [santriId]
    );
    const dailySpend = Number(daily.total ?? 0);
    return res.status(200).json({
      data: {
        ...child,
        belanja_hari_ini: daily.total,
        sisa_limit_harian: Math.max(0, Number(child.limit_harian) - dailySpend).toFixed(2),
      },
    });
  } catch (error) {
    console.error('Get child details error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data anak.' });
  }
};

export const getChildTransactions = async (req, res) => {
  const santriId = parseId(req.params.santriId);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  const { page, limit } = parsePagination(req.query);
  const offset = (page - 1) * limit;
  const transactionType = req.query.tipe_transaksi;
  if (transactionType !== undefined && !['belanja', 'topup', 'tarik'].includes(transactionType)) {
    return res.status(400).json({ message: 'Tipe transaksi tidak valid.' });
  }
  const filter = transactionType ? 'AND tipe_transaksi = ?' : '';
  try {
    const child = await getLinkedChild(req.user.id, santriId);
    if (!child) return res.status(404).json({ message: 'Santri tidak terhubung ke akun orang tua ini.' });
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM transaksi WHERE santri_id = ? ${filter}`,
      transactionType ? [santriId, transactionType] : [santriId]
    );
    const [rows] = await pool.query(
      `SELECT t.id, t.tipe_transaksi, t.jumlah, t.saldo_akhir,
              t.keterangan, t.created_at, k.nama AS nama_kantin
       FROM transaksi t
       LEFT JOIN kantin k ON k.id = t.kantin_id
       WHERE t.santri_id = ? ${transactionType ? 'AND t.tipe_transaksi = ?' : ''}
       ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
      transactionType
        ? [santriId, transactionType, limit, offset]
        : [santriId, limit, offset]
    );
    return res.status(200).json({
      santri: { id: child.id, nis: child.nis, nama_lengkap: child.nama_lengkap },
      data: rows,
      pagination: { page, limit, total: count.total },
    });
  } catch (error) {
    console.error('Get child transactions error:', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat transaksi anak.' });
  }
};

export const updateChildDailyLimit = async (req, res) => {
  const santriId = parseId(req.params.santriId);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  const amount = req.body.limit_harian;
  if ((typeof amount !== 'number' && typeof amount !== 'string') ||
      !/^\d+(\.\d{1,2})?$/.test(String(amount))) {
    return res.status(400).json({ message: 'limit_harian harus berupa angka positif dengan maksimal 2 angka desimal.' });
  }
  const limit = Number(amount);
  if (!Number.isFinite(limit) || limit < 0 || limit > 99999999.99) {
    return res.status(400).json({ message: 'limit_harian berada di luar batas yang diizinkan.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [children] = await connection.query(
      `SELECT s.id FROM santri s
       JOIN wali_santri w ON w.santri_id = s.id
       WHERE w.user_id = ? AND s.id = ?
       FOR UPDATE`,
      [req.user.id, santriId]
    );
    if (!children.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Santri tidak terhubung ke akun orang tua ini.' });
    }
    await connection.query('UPDATE santri SET limit_harian = ? WHERE id = ?', [limit.toFixed(2), santriId]);
    const [[daily]] = await connection.query(
      `SELECT COALESCE(SUM(jumlah), 0) AS total
       FROM transaksi
       WHERE santri_id = ? AND tipe_transaksi = 'belanja'
         AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY`,
      [santriId]
    );
    await connection.commit();
    return res.status(200).json({
      message: 'Limit belanja harian berhasil diperbarui.',
      data: {
        santri_id: santriId,
        limit_harian: limit.toFixed(2),
        belanja_hari_ini: daily.total,
        sisa_limit_harian: Math.max(0, limit - Number(daily.total)).toFixed(2),
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update child daily limit error:', error);
    return res.status(500).json({ message: 'Gagal mengubah limit belanja harian.' });
  } finally {
    connection.release();
  }
};
