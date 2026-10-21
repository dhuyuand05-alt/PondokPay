import pool from '../config/db.js';
import { getFinancialApprovalThreshold } from '../config/security.js';

const toCents = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

const amountToFixed = (value) => {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      !/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 99999999.99
    ? amount.toFixed(2)
    : null;
};

const validActions = new Set(['santri_topup', 'santri_withdrawal', 'canteen_withdrawal']);

export const requiresFinancialApproval = (amount) =>
  toCents(amount) >= toCents(getFinancialApprovalThreshold());

export const requestFinancialApproval = async (req, res) => {
  const { action, resource_id: resourceId, jumlah, keterangan = null } = req.body ?? {};
  const parsedResourceId = Number(resourceId);
  const amount = amountToFixed(jumlah);
  if (!validActions.has(action) || !Number.isSafeInteger(parsedResourceId) || parsedResourceId < 1 ||
      !amount || (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 1000))) {
    return res.status(400).json({ message: 'Jenis, ID, jumlah, atau keterangan permintaan persetujuan tidak valid.' });
  }
  if (!requiresFinancialApproval(amount)) {
    return res.status(400).json({
      message: 'Jumlah di bawah ambang persetujuan; gunakan endpoint transaksi biasa.',
    });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO financial_approvals
         (action, resource_id, amount, keterangan, requester_id, expires_at)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR))`,
      [action, parsedResourceId, amount, keterangan, req.user.id]
    );
    return res.status(201).json({
      message: 'Permintaan tercatat dan menunggu persetujuan admin lain.',
      data: {
        id: result.insertId,
        action,
        resource_id: parsedResourceId,
        jumlah: amount,
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('Request financial approval error:', error);
    return res.status(500).json({ message: 'Gagal membuat permintaan persetujuan.' });
  }
};

const decideFinancialApproval = async (req, res, decision) => {
  const approvalId = Number(req.params.id);
  if (!Number.isSafeInteger(approvalId) || approvalId < 1) {
    return res.status(400).json({ message: 'ID persetujuan tidak valid.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT requester_id, status, expires_at
       FROM financial_approvals WHERE id = ? FOR UPDATE`,
      [approvalId]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Permintaan persetujuan tidak ditemukan.' });
    }
    const approval = rows[0];
    if (Number(approval.requester_id) === req.user.id) {
      await connection.rollback();
      return res.status(403).json({ message: 'Admin yang meminta tidak boleh menyetujui atau menolak permintaannya sendiri.' });
    }
    if (approval.status !== 'pending' || new Date(approval.expires_at).getTime() <= Date.now()) {
      await connection.rollback();
      return res.status(409).json({ message: 'Permintaan persetujuan tidak lagi menunggu keputusan atau sudah kadaluarsa.' });
    }
    await connection.query(
      `UPDATE financial_approvals
       SET status = ?, approver_id = ?, decided_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [decision, req.user.id, approvalId]
    );
    await connection.commit();
    return res.status(200).json({
      message: decision === 'approved' ? 'Permintaan disetujui.' : 'Permintaan ditolak.',
      data: { id: approvalId, status: decision },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Decide financial approval error:', error);
    return res.status(500).json({ message: 'Gagal memproses keputusan persetujuan.' });
  } finally {
    connection.release();
  }
};

export const approveFinancialApproval = (req, res) =>
  decideFinancialApproval(req, res, 'approved');

export const rejectFinancialApproval = (req, res) =>
  decideFinancialApproval(req, res, 'rejected');

export const consumeFinancialApproval = async (
  connection,
  req,
  action,
  resourceId,
  amount,
  keterangan
) => {
  if (!requiresFinancialApproval(amount)) return;
  const approvalId = Number(req.body?.approval_id);
  if (!Number.isSafeInteger(approvalId) || approvalId < 1) {
    const error = new Error('Persetujuan admin kedua wajib diberikan.');
    error.code = 'FINANCIAL_APPROVAL_REQUIRED';
    throw error;
  }
  const [rows] = await connection.query(
    `SELECT action, resource_id, amount, keterangan, requester_id, approver_id, status, expires_at
     FROM financial_approvals WHERE id = ? FOR UPDATE`,
    [approvalId]
  );
  const approval = rows[0];
  if (!approval || approval.status !== 'approved' ||
      approval.action !== action || Number(approval.resource_id) !== resourceId ||
      toCents(approval.amount) !== toCents(amount) ||
      (approval.keterangan ?? null) !== (keterangan ?? null) ||
      Number(approval.requester_id) !== req.user.id ||
      Number(approval.approver_id) === req.user.id ||
      new Date(approval.expires_at).getTime() <= Date.now()) {
    const error = new Error('Persetujuan tidak cocok, sudah digunakan, atau sudah kadaluarsa.');
    error.code = 'FINANCIAL_APPROVAL_INVALID';
    throw error;
  }
  await connection.query(
    `UPDATE financial_approvals
     SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'approved'`,
    [approvalId]
  );
};
