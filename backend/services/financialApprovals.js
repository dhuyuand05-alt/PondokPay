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
const approvalScopes = new Set(['inbox', 'mine', 'history', 'all']);
const approvalStatuses = new Set(['pending', 'approved', 'rejected', 'consumed', 'expired']);

const approvalSelect = `
  SELECT fa.id, fa.action, fa.resource_id, fa.amount, fa.keterangan,
         CASE
           WHEN fa.status IN ('pending', 'approved') AND fa.expires_at <= CURRENT_TIMESTAMP THEN 'expired'
           ELSE fa.status
         END AS status,
         fa.requester_id, requester.username AS requester_username,
         fa.approver_id, approver.username AS approver_username,
         CASE WHEN fa.action = 'canteen_withdrawal' THEN k.nama ELSE s.nama_lengkap END AS resource_name,
         CASE
           WHEN fa.action = 'canteen_withdrawal' THEN k.lokasi
           ELSE CONCAT('NIS ', s.nis, IF(s.asrama IS NULL OR s.asrama = '', '', CONCAT(' · ', s.asrama)))
         END AS resource_detail,
         fa.created_at, fa.expires_at, fa.decided_at, fa.consumed_at,
         (fa.status = 'pending' AND fa.expires_at > CURRENT_TIMESTAMP
           AND fa.requester_id <> ?) AS can_decide,
         (fa.status = 'approved' AND fa.action <> 'canteen_withdrawal'
           AND fa.expires_at > CURRENT_TIMESTAMP
           AND fa.requester_id = ?) AS can_execute
  FROM financial_approvals fa
  JOIN users requester ON requester.id = fa.requester_id
  LEFT JOIN users approver ON approver.id = fa.approver_id
  LEFT JOIN santri s ON fa.action <> 'canteen_withdrawal' AND s.id = fa.resource_id
  LEFT JOIN kantin k ON fa.action = 'canteen_withdrawal' AND k.id = fa.resource_id`;

const parseApprovalId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const parseApprovalPagination = (query) => {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100)
    : 20;
  return { page, limit };
};

const approvalFilter = (req) => {
  const scope = req.query.scope ?? 'all';
  const status = req.query.status;
  if (!approvalScopes.has(scope)) return { error: 'Filter cakupan persetujuan tidak valid.' };
  if (status !== undefined && !approvalStatuses.has(status)) {
    return { error: 'Filter status persetujuan tidak valid.' };
  }

  const conditions = [];
  const values = [];
  if (scope === 'inbox') {
    conditions.push(`fa.status = 'pending' AND fa.expires_at > CURRENT_TIMESTAMP AND fa.requester_id <> ?`);
    values.push(req.user.id);
  } else if (scope === 'mine') {
    conditions.push('fa.requester_id = ?');
    values.push(req.user.id);
  } else if (scope === 'history') {
    conditions.push(`(fa.status <> 'pending' OR fa.expires_at <= CURRENT_TIMESTAMP)`);
  }

  if (status === 'expired') {
    conditions.push(`fa.status IN ('pending', 'approved') AND fa.expires_at <= CURRENT_TIMESTAMP`);
  } else if (status === 'pending') {
    conditions.push(`fa.status = 'pending' AND fa.expires_at > CURRENT_TIMESTAMP`);
  } else if (status) {
    conditions.push('fa.status = ?');
    values.push(status);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
};

export const getFinancialApprovals = async (req, res) => {
  const filter = approvalFilter(req);
  if (filter.error) return res.status(400).json({ message: filter.error });
  const { page, limit } = parseApprovalPagination(req.query);
  const offset = (page - 1) * limit;
  try {
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM financial_approvals fa ${filter.where}`,
      filter.values
    );
    const [rows] = await pool.query(
      `${approvalSelect} ${filter.where}
       ORDER BY fa.created_at DESC, fa.id DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, req.user.id, ...filter.values, limit, offset]
    );
    return res.status(200).json({
      data: rows.map((row) => ({
        ...row,
        can_decide: Boolean(row.can_decide),
        can_execute: Boolean(row.can_execute),
      })),
      pagination: { page, limit, total: count.total },
    });
  } catch (error) {
    console.error('Get financial approvals error:', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar persetujuan finansial.' });
  }
};

export const getFinancialApprovalById = async (req, res) => {
  const approvalId = parseApprovalId(req.params.id);
  if (!approvalId) return res.status(400).json({ message: 'ID persetujuan tidak valid.' });
  try {
    const [rows] = await pool.query(
      `${approvalSelect} WHERE fa.id = ? LIMIT 1`,
      [req.user.id, req.user.id, approvalId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Permintaan persetujuan tidak ditemukan.' });
    }
    return res.status(200).json({
      data: {
        ...rows[0],
        can_decide: Boolean(rows[0].can_decide),
        can_execute: Boolean(rows[0].can_execute),
      },
    });
  } catch (error) {
    console.error('Get financial approval detail error:', error);
    return res.status(500).json({ message: 'Gagal mengambil detail persetujuan finansial.' });
  }
};

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
