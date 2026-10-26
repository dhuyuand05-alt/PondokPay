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

export const getAssignedCanteens = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT k.id, k.nama, k.lokasi, k.status, k.saldo, k.catalog_enabled
       FROM kantin k
       JOIN kantin_kasir kk ON kk.kantin_id = k.id
       WHERE kk.user_id = ? AND k.status = 'active'
       ORDER BY k.nama`,
      [req.user.id]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get assigned canteens error:', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar kantin kasir.' });
  }
};

export const getAssignedCanteen = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT k.id, k.nama, k.lokasi, k.status, k.saldo, k.catalog_enabled
       FROM kantin k
       JOIN kantin_kasir kk ON kk.kantin_id = k.id
       WHERE kk.user_id = ? AND k.id = ?
       LIMIT 1`,
      [req.user.id, canteenId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Kantin tidak ditemukan atau tidak ditugaskan ke akun ini.' });
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('Get assigned canteen error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kantin.' });
  }
};

export const lookupStudent = async (req, res) => {
  const { rfid_uid: rfidUid, fingerprint_id: fingerprintId, nis } = req.body;
  const inputs = [rfidUid, fingerprintId, nis].filter((value) => value !== undefined);
  if (inputs.length !== 1) {
    return res.status(400).json({ message: 'Kirim tepat satu dari rfid_uid, fingerprint_id, atau nis.' });
  }
  if (rfidUid !== undefined && (typeof rfidUid !== 'string' || !rfidUid.trim() || rfidUid.length > 50)) {
    return res.status(400).json({ message: 'RFID UID tidak valid.' });
  }
  if (nis !== undefined && (typeof nis !== 'string' || !nis.trim() || nis.length > 30)) {
    return res.status(400).json({ message: 'NIS tidak valid.' });
  }
  if (fingerprintId !== undefined && (!Number.isInteger(Number(fingerprintId)) || Number(fingerprintId) < 0)) {
    return res.status(400).json({ message: 'Fingerprint ID harus berupa bilangan bulat positif.' });
  }

  try {
    const credentialValue = rfidUid !== undefined
      ? rfidUid.trim()
      : (fingerprintId !== undefined ? Number(fingerprintId) : nis.trim());
    const isCredentialLookup = rfidUid !== undefined || fingerprintId !== undefined;
    const credentialColumn = rfidUid !== undefined ? 'c.rfid_uid' : 'c.fingerprint_id';
    const [rows] = await pool.query(
      `SELECT s.id, s.nis, s.nama_lengkap, s.asrama, s.saldo, s.limit_harian,
              COALESCE(daily.total, 0) AS belanja_hari_ini
       FROM ${isCredentialLookup ? 'credentials_auth c JOIN santri s ON s.id = c.santri_id' : 'santri s'}
       LEFT JOIN (
         SELECT t.santri_id,
                GREATEST(SUM(CASE
                  WHEN t.tipe_transaksi = 'belanja' THEN t.jumlah
                  WHEN original.created_at >= CURDATE()
                    AND original.created_at < CURDATE() + INTERVAL 1 DAY THEN -t.jumlah
                  ELSE 0 END), 0) AS total
         FROM transaksi t
         LEFT JOIN canteen_sale_refunds cr ON cr.refund_transaksi_id = t.id
         LEFT JOIN transaksi original ON original.id = cr.original_transaksi_id
         WHERE t.tipe_transaksi IN ('belanja', 'refund_belanja')
           AND t.created_at >= CURDATE() AND t.created_at < CURDATE() + INTERVAL 1 DAY
         GROUP BY t.santri_id
       ) daily ON daily.santri_id = s.id
       ${isCredentialLookup
        ? `WHERE ${credentialColumn} = ? AND c.status = 'active' AND s.is_active = TRUE`
        : 'WHERE s.nis = ? AND s.is_active = TRUE'}
       LIMIT 1`,
      [credentialValue]
    );
    if (!rows.length) return res.status(404).json({ message: 'Santri tidak ditemukan atau kartu tidak aktif.' });
    const student = rows[0];
    return res.status(200).json({
      data: {
        id: student.id,
        nis: student.nis,
        nama_lengkap: student.nama_lengkap,
        asrama: student.asrama,
        saldo: student.saldo,
        limit_harian: student.limit_harian,
        belanja_hari_ini: student.belanja_hari_ini,
        sisa_limit_harian: Math.max(0, Number(student.limit_harian) - Number(student.belanja_hari_ini)).toFixed(2),
      },
    });
  } catch (error) {
    console.error('Lookup student for cashier error:', error);
    return res.status(500).json({ message: 'Gagal mencari data santri.' });
  }
};

export const getCanteenTransactions = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const { page, limit } = parsePagination(req.query);
  const offset = (page - 1) * limit;
  const conditions = ['kt.kantin_id = ?'];
  const values = [canteenId];

  if (req.query.tipe_transaksi !== undefined) {
    if (!['penjualan', 'pencairan', 'refund'].includes(req.query.tipe_transaksi)) {
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
      `SELECT kt.id, kt.transaksi_id, kt.tipe_transaksi, kt.jumlah,
              kt.saldo_akhir, kt.keterangan, kt.created_at, t.created_by AS cashier_id,
              s.id AS santri_id, s.nis, s.nama_lengkap,
              ref.original_transaksi_id AS refunded_sale_id,
              ref.reason AS refund_reason, ref.restocked,
              sale_ref.id AS refund_id, sale_ref.cashier_id AS refund_cashier_id
       FROM kantin_transaksi kt
       LEFT JOIN transaksi t ON t.id = kt.transaksi_id
       LEFT JOIN canteen_sale_refunds ref ON ref.refund_transaksi_id = kt.transaksi_id
       LEFT JOIN canteen_sale_refunds sale_ref
         ON sale_ref.original_transaksi_id = COALESCE(ref.original_transaksi_id, kt.transaksi_id)
       LEFT JOIN santri s ON s.id = t.santri_id
       ${where}
       ORDER BY kt.created_at DESC, kt.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    const transactionIds = rows
      .map((row) => row.refunded_sale_id || row.transaksi_id)
      .filter((transactionId) => transactionId !== null);
    if (transactionIds.length) {
      const [items] = await pool.query(
        `SELECT transaksi_id, nama_produk, harga_satuan, quantity, subtotal
         FROM canteen_sale_items
         WHERE transaksi_id IN (?)
         ORDER BY id`,
        [transactionIds]
      );
      const itemsByTransaction = new Map();
      for (const item of items) {
        const key = String(item.transaksi_id);
        if (!itemsByTransaction.has(key)) itemsByTransaction.set(key, []);
        itemsByTransaction.get(key).push(item);
      }
      for (const row of rows) row.items = itemsByTransaction.get(String(row.transaksi_id)) || [];
    }
    return res.status(200).json({
      data: rows,
      pagination: { page, limit, total: count.total },
    });
  } catch (error) {
    console.error('Get canteen transaction history error:', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat transaksi kantin.' });
  }
};
