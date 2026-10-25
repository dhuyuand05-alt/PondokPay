import pool from '../../config/db.js';
import { collectCurrentServiceFeeDebt } from '../../services/monthlyServiceFees.js';
import { enqueueParentTransactionNotifications } from '../../services/whatsappNotifications.js';
import {
  getMidtransTransactionStatus,
  MidtransError,
  midtransConfigurationFromPayment,
  normalizeMidtransStatus,
  readMidtransConfiguration,
  validateMidtransTransaction,
} from '../../services/midtrans.js';
import { findParentPayment, moneyToCents, toPaymentResponse } from './parentPayments.js';

const centsToMoney = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

export const applyProviderPaymentStatus = async (orderId, providerStatus) => {
  const nextStatus = normalizeMidtransStatus(providerStatus);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.query(
      `SELECT id, user_id, santri_id, amount, status
       FROM midtrans_topup_payments WHERE order_id = ? FOR UPDATE`,
      [orderId],
    );
    if (!payments.length) {
      await connection.rollback();
      return null;
    }
    const payment = payments[0];
    validateMidtransTransaction(providerStatus, { orderId, amount: String(payment.amount) });
    if (payment.status === 'paid') {
      await connection.commit();
      return { order_id: orderId, status: 'paid' };
    }
    if (nextStatus !== 'paid') {
      await connection.query(
        `UPDATE midtrans_topup_payments
         SET status = ?, provider_transaction_id = ?, status_checked_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextStatus, providerStatus.transaction_id || null, payment.id],
      );
      await connection.commit();
      return { order_id: orderId, status: nextStatus };
    }

    const [students] = await connection.query(
      'SELECT saldo FROM santri WHERE id = ? FOR UPDATE',
      [payment.santri_id],
    );
    if (!students.length) throw new MidtransError('Data santri penerima tidak ditemukan.', 409);
    const updatedBalanceCents = moneyToCents(students[0].saldo || '0.00') + moneyToCents(payment.amount);
    if (updatedBalanceCents > 999999999999n) {
      throw new MidtransError('Saldo santri melewati batas penyimpanan. Hubungi admin untuk meninjau pembayaran ini.', 409);
    }
    const updatedBalance = centsToMoney(updatedBalanceCents);
    const [transactions] = await connection.query(
      `INSERT INTO transaksi
         (santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
       VALUES (?, 'topup', ?, ?, ?, ?, NULL)`,
      [
        payment.santri_id,
        payment.amount,
        updatedBalance,
        `Top-up QRIS Midtrans (${orderId})`,
        `midtrans:${orderId}`,
      ],
    );
    await connection.query('UPDATE santri SET saldo = ? WHERE id = ?', [updatedBalance, payment.santri_id]);
    await enqueueParentTransactionNotifications(connection, transactions.insertId);
    await collectCurrentServiceFeeDebt(connection, {
      santriId: payment.santri_id,
      balance: updatedBalance,
      createdBy: null,
    });
    await connection.query(
      `UPDATE midtrans_topup_payments
       SET status = 'paid', provider_transaction_id = ?,
           ledger_transaction_id = ?, paid_at = CURRENT_TIMESTAMP,
           status_checked_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [providerStatus.transaction_id || null, transactions.insertId, payment.id],
    );
    await connection.commit();
    return { order_id: orderId, status: 'paid' };
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) {
      console.error('Rollback Midtrans payment update failed:', rollbackError);
    }
    throw error;
  } finally {
    connection.release();
  }
};

const refreshPaymentStatus = async (payment) => {
  if (payment.status !== 'pending') return payment;
  const [claim] = await pool.query(
    `UPDATE midtrans_topup_payments
     SET status_checked_at = CURRENT_TIMESTAMP
     WHERE order_id = ? AND status = 'pending'
       AND (status_checked_at IS NULL OR status_checked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 SECOND))`,
    [payment.order_id],
  );
  if (!claim.affectedRows) return payment;
  const [configurationRows] = await pool.query(
    `SELECT midtrans_client_key, midtrans_server_key_enc, midtrans_environment
     FROM midtrans_topup_payments WHERE order_id = ? LIMIT 1`,
    [payment.order_id],
  );
  const snapshot = configurationRows[0];
  const configuration = snapshot?.midtrans_server_key_enc
    ? midtransConfigurationFromPayment(snapshot)
    : await readMidtransConfiguration();
  const providerStatus = await getMidtransTransactionStatus(configuration, payment.order_id);
  validateMidtransTransaction(providerStatus, {
    orderId: payment.order_id,
    amount: String(payment.amount),
  });
  await applyProviderPaymentStatus(payment.order_id, providerStatus);
  return findParentPayment(payment.user_id, payment.order_id);
};

export const getParentTopupHistory = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.order_id, p.santri_id, s.nama_lengkap AS nama_santri,
              p.amount, p.status, p.expires_at, p.created_at, p.paid_at
       FROM midtrans_topup_payments p
       JOIN santri s ON s.id = p.santri_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC, p.id DESC LIMIT 20`,
      [req.user.id],
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get parent top-up history error:', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat pembayaran.' });
  }
};

export const getParentTopupPaymentStatus = async (req, res) => {
  if (typeof req.params.orderId !== 'string' || !/^PP-[0-9a-f-]{36}$/i.test(req.params.orderId)) {
    return res.status(400).json({ message: 'ID pembayaran tidak valid.' });
  }
  try {
    let payment = await findParentPayment(req.user.id, req.params.orderId);
    if (!payment) return res.status(404).json({ message: 'Pembayaran tidak ditemukan.' });
    payment = await refreshPaymentStatus({ ...payment, user_id: req.user.id });
    return res.status(200).json({ data: await toPaymentResponse(payment) });
  } catch (error) {
    if (error instanceof MidtransError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Get parent top-up payment status error:', error);
    return res.status(500).json({ message: 'Gagal memeriksa status pembayaran.' });
  }
};
