import pool from '../../config/db.js';
import {
  getMidtransTransactionStatus,
  MidtransError,
  midtransConfigurationFromPayment,
  readMidtransConfiguration,
  validateMidtransTransaction,
  verifyMidtransSignature,
} from '../../services/midtrans.js';
import { applyProviderPaymentStatus } from './paymentStatus.js';

export const handleMidtransNotification = async (req, res) => {
  const notification = req.body;
  if (!notification || typeof notification !== 'object' || Array.isArray(notification) ||
      typeof notification.order_id !== 'string' || notification.order_id.length > 50 ||
      (typeof notification.status_code !== 'string' && typeof notification.status_code !== 'number') ||
      typeof notification.gross_amount !== 'string' || typeof notification.signature_key !== 'string') {
    return res.status(400).json({ message: 'Format notifikasi Midtrans tidak valid.' });
  }
  try {
    const [payments] = await pool.query(
      `SELECT amount, midtrans_client_key, midtrans_server_key_enc, midtrans_environment
       FROM midtrans_topup_payments WHERE order_id = ? LIMIT 1`,
      [notification.order_id],
    );
    if (!payments.length) return res.status(404).json({ message: 'Order pembayaran tidak ditemukan.' });
    const configuration = payments[0].midtrans_server_key_enc
      ? midtransConfigurationFromPayment(payments[0])
      : await readMidtransConfiguration();
    if (!verifyMidtransSignature(notification, configuration.serverKey)) {
      return res.status(401).json({ message: 'Signature notifikasi Midtrans tidak valid.' });
    }
    const providerStatus = await getMidtransTransactionStatus(configuration, notification.order_id);
    validateMidtransTransaction(providerStatus, {
      orderId: notification.order_id,
      amount: String(payments[0].amount),
    });
    if (notification.gross_amount !== providerStatus.gross_amount) {
      return res.status(400).json({ message: 'Nominal notifikasi dan status Midtrans tidak cocok.' });
    }
    const payment = await applyProviderPaymentStatus(notification.order_id, providerStatus);
    if (!payment) return res.status(404).json({ message: 'Order pembayaran tidak ditemukan.' });
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    if (error instanceof MidtransError) {
      if (error.status === 400) return res.status(400).json({ message: error.message });
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Midtrans notification processing error:', error);
    return res.status(500).json({ message: 'Gagal memproses notifikasi pembayaran.' });
  }
};
