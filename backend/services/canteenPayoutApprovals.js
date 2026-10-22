import pool from '../config/db.js';

const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const parseAmount = (value) => {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !/^\d+(\.\d{1,2})?$/.test(String(value))
  )
    return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 99999999.99 ? amount.toFixed(2) : null;
};

const toCents = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

export const requestCanteenPayoutApproval = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const amount = parseAmount(req.body.jumlah);
  const keterangan = req.body.keterangan ?? null;
  if (
    !canteenId ||
    !amount ||
    (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 1000))
  ) {
    return res.status(400).json({
      message: 'ID kantin, jumlah, atau keterangan pencairan tidak valid.',
    });
  }
  try {
    const [canteens] = await pool.query(
      `SELECT k.id FROM kantin k WHERE k.id = ? AND k.status = 'active' LIMIT 1`,
      [canteenId]
    );
    if (!canteens.length) {
      return res.status(404).json({ message: 'Kantin tidak ditemukan atau tidak aktif.' });
    }
    const [cashiers] = await pool.query(
      `SELECT 1 FROM kantin_kasir kk
       JOIN users u ON u.id = kk.user_id
       WHERE kk.kantin_id = ? AND u.role = 'kasir'
         AND u.is_active = TRUE AND u.mfa_enabled = TRUE
       LIMIT 1`,
      [canteenId]
    );
    if (!cashiers.length) {
      return res.status(409).json({
        message:
          'Kantin harus memiliki minimal satu kasir aktif dengan MFA untuk menyetujui pencairan.',
      });
    }
    const [result] = await pool.query(
      `INSERT INTO canteen_payout_approvals
         (kantin_id, amount, keterangan, requester_id, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR))`,
      [canteenId, amount, keterangan, req.user.id]
    );
    return res.status(201).json({
      message: 'Permintaan pencairan dikirim ke kasir yang ditugaskan.',
      data: {
        id: result.insertId,
        kantin_id: canteenId,
        amount,
        keterangan,
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('Request canteen payout approval error:', error);
    return res.status(500).json({ message: 'Gagal membuat permintaan konfirmasi kasir.' });
  }
};

export const getCanteenPayoutApprovalsForAdmin = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT cpa.id, cpa.kantin_id, cpa.amount, cpa.keterangan,
              cpa.requester_id, requester.username AS requester_username,
              cpa.cashier_id, cashier.username AS cashier_username,
              CASE
                WHEN cpa.status IN ('pending', 'approved')
                  AND cpa.expires_at <= CURRENT_TIMESTAMP THEN 'expired'
                ELSE cpa.status
              END AS status,
              cpa.expires_at, cpa.decided_at, cpa.consumed_at, cpa.created_at
       FROM canteen_payout_approvals cpa
       JOIN users requester ON requester.id = cpa.requester_id
       LEFT JOIN users cashier ON cashier.id = cpa.cashier_id
       WHERE cpa.kantin_id = ? AND cpa.requester_id = ?
       ORDER BY cpa.created_at DESC, cpa.id DESC
       LIMIT 20`,
      [canteenId, req.user.id]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get canteen payout approvals for admin error:', error);
    return res.status(500).json({ message: 'Gagal mengambil status konfirmasi pencairan.' });
  }
};

export const getCanteenPayoutApprovalsForCashier = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT cpa.id, cpa.kantin_id, k.nama AS kantin_nama,
              cpa.amount, cpa.keterangan, cpa.requester_id,
              requester.username AS requester_username,
              cpa.expires_at, cpa.created_at
       FROM canteen_payout_approvals cpa
       JOIN kantin k ON k.id = cpa.kantin_id
       JOIN users requester ON requester.id = cpa.requester_id
       JOIN kantin_kasir kk ON kk.kantin_id = cpa.kantin_id AND kk.user_id = ?
       WHERE cpa.status = 'pending' AND cpa.expires_at > CURRENT_TIMESTAMP
       ORDER BY cpa.created_at ASC, cpa.id ASC`,
      [req.user.id]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get canteen payout approvals for cashier error:', error);
    return res.status(500).json({ message: 'Gagal mengambil permintaan konfirmasi pencairan.' });
  }
};

export const decideCanteenPayoutApproval = async (req, res, decision) => {
  const approvalId = parseId(req.params.id);
  if (!approvalId) return res.status(400).json({ message: 'ID permintaan pencairan tidak valid.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT kantin_id, status, expires_at
       FROM canteen_payout_approvals WHERE id = ? FOR UPDATE`,
      [approvalId]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Permintaan pencairan tidak ditemukan.' });
    }
    const approval = rows[0];
    if (approval.status !== 'pending' || new Date(approval.expires_at).getTime() <= Date.now()) {
      await connection.rollback();
      return res.status(409).json({
        message: 'Permintaan pencairan tidak lagi menunggu konfirmasi atau sudah kedaluwarsa.',
      });
    }
    const [assignments] = await connection.query(
      `SELECT 1 FROM kantin_kasir kk
       JOIN users u ON u.id = kk.user_id
       WHERE kk.kantin_id = ? AND kk.user_id = ?
         AND u.role = 'kasir' AND u.is_active = TRUE AND u.mfa_enabled = TRUE
       LIMIT 1`,
      [approval.kantin_id, req.user.id]
    );
    if (!assignments.length) {
      await connection.rollback();
      return res.status(403).json({
        message:
          'Kasir aktif yang ditugaskan harus login dengan MFA untuk mengonfirmasi pencairan.',
      });
    }
    await connection.query(
      `UPDATE canteen_payout_approvals
       SET status = ?, cashier_id = ?, decided_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [decision, req.user.id, approvalId]
    );
    await connection.commit();
    return res.status(200).json({
      message:
        decision === 'approved'
          ? 'Pencairan berhasil dikonfirmasi.'
          : 'Permintaan pencairan ditolak.',
      data: { id: approvalId, status: decision },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Decide canteen payout approval error:', error);
    return res.status(500).json({ message: 'Gagal memproses konfirmasi pencairan.' });
  } finally {
    connection.release();
  }
};

export const approveCanteenPayout = (req, res) => decideCanteenPayoutApproval(req, res, 'approved');

export const rejectCanteenPayout = (req, res) => decideCanteenPayoutApproval(req, res, 'rejected');

export const consumeCanteenPayoutApproval = async (
  connection,
  req,
  canteenId,
  amount,
  keterangan
) => {
  const approvalId = parseId(req.body?.cashier_approval_id);
  const error = new Error('Konfirmasi kasir diperlukan untuk pencairan saldo kantin.');
  error.code = 'CANTEEN_CASHIER_APPROVAL_REQUIRED';
  if (!approvalId) throw error;

  const [rows] = await connection.query(
    `SELECT kantin_id, amount, keterangan, requester_id, cashier_id, status, expires_at
     FROM canteen_payout_approvals WHERE id = ? FOR UPDATE`,
    [approvalId]
  );
  const approval = rows[0];
  if (
    !approval ||
    approval.status !== 'approved' ||
    Number(approval.kantin_id) !== canteenId ||
    Number(approval.requester_id) !== req.user.id ||
    Number(approval.cashier_id) === req.user.id ||
    toCents(approval.amount) !== toCents(amount) ||
    (approval.keterangan ?? null) !== (keterangan ?? null) ||
    new Date(approval.expires_at).getTime() <= Date.now()
  ) {
    const invalid = new Error('Konfirmasi kasir tidak cocok, sudah digunakan, atau kedaluwarsa.');
    invalid.code = 'CANTEEN_CASHIER_APPROVAL_INVALID';
    throw invalid;
  }
  const [assignments] = await connection.query(
    `SELECT 1 FROM kantin_kasir kk
     JOIN users u ON u.id = kk.user_id
     WHERE kk.kantin_id = ? AND kk.user_id = ?
       AND u.role = 'kasir' AND u.is_active = TRUE AND u.mfa_enabled = TRUE
     LIMIT 1`,
    [canteenId, approval.cashier_id]
  );
  if (!assignments.length) {
    const invalid = new Error(
      'Kasir pemberi konfirmasi sudah tidak aktif atau tidak lagi ditugaskan ke kantin ini.'
    );
    invalid.code = 'CANTEEN_CASHIER_APPROVAL_INVALID';
    throw invalid;
  }
  await connection.query(
    `UPDATE canteen_payout_approvals
     SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'approved'`,
    [approvalId]
  );
};
