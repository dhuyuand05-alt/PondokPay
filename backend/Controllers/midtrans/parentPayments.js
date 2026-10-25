import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import pool from '../../config/db.js';
import { encryptApplicationSecret } from '../../config/security.js';
import {
  createMidtransQrisTransaction,
  MIDTRANS_TOPUP_EXPIRY_MINUTES,
  MIDTRANS_TOPUP_MAXIMUM,
  MIDTRANS_TOPUP_MINIMUM,
  getMidtransQrisImageUrl,
  MidtransError,
  readMidtransConfiguration,
  validateMidtransTransaction,
  validateTopupAmount,
} from '../../services/midtrans.js';

export const getParentTopupConfiguration = async (req, res) => {
  try {
    const configuration = await readMidtransConfiguration({ requireEnabled: false });
    return res.status(200).json({
      data: {
        enabled: configuration.configured,
        client_key: configuration.configured ? configuration.clientKey : null,
        environment: configuration.environment,
        snap_script_url: configuration.configured ? configuration.snapScriptUrl : null,
        minimum_amount: MIDTRANS_TOPUP_MINIMUM,
        maximum_amount: MIDTRANS_TOPUP_MAXIMUM,
        expiry_minutes: MIDTRANS_TOPUP_EXPIRY_MINUTES,
      },
    });
  } catch (error) {
    console.error('Get parent top-up configuration error:', error);
    return res.status(error.status || 503).json({ message: error.message || 'Pengaturan pembayaran belum tersedia.' });
  }
};

const parseIdempotencyKey = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{8,64}$/.test(value) ? value : null;

export const moneyToCents = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

export const toPaymentResponse = async (payment) => ({
  order_id: payment.order_id,
  santri_id: payment.santri_id,
  nama_santri: payment.nama_santri,
  amount: payment.amount,
  status: payment.status,
  snap_token: payment.snap_token,
  qr_string: payment.qr_string || null,
  qr_code_url: payment.qr_code_url || null,
  qr_data_url: payment.qr_string
    ? await QRCode.toDataURL(payment.qr_string, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    })
    : null,
  redirect_url: payment.redirect_url || null,
  expires_at: payment.expires_at,
  created_at: payment.created_at,
  paid_at: payment.paid_at,
  ...(payment.midtrans_client_key ? {
    client_key: payment.midtrans_client_key,
    environment: payment.midtrans_environment,
    snap_script_url: payment.midtrans_environment === 'production'
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js',
  } : {}),
});

export const findParentPayment = async (userId, orderId) => {
  const [rows] = await pool.query(
    `SELECT p.order_id, p.santri_id, s.nama_lengkap AS nama_santri,
            p.amount, p.status, p.snap_token, p.qr_string, p.qr_code_url,
            p.expires_at, p.created_at, p.paid_at,
            p.midtrans_client_key, p.midtrans_environment
     FROM midtrans_topup_payments p
     JOIN santri s ON s.id = p.santri_id
     WHERE p.user_id = ? AND p.order_id = ? LIMIT 1`,
    [userId, orderId],
  );
  return rows[0] || null;
};

export const createParentTopupPayment = async (req, res) => {
  const santriId = Number(req.body.santri_id);
  const amount = validateTopupAmount(req.body.amount);
  const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
  if (!Number.isSafeInteger(santriId) || santriId < 1) {
    return res.status(400).json({ message: 'Pilih santri yang akan menerima top-up.' });
  }
  if (amount === null) {
    return res.status(400).json({
      message: `Nominal top-up harus berupa bilangan rupiah bulat antara Rp${MIDTRANS_TOPUP_MINIMUM.toLocaleString('id-ID')} dan Rp${MIDTRANS_TOPUP_MAXIMUM.toLocaleString('id-ID')}.`,
    });
  }
  if (!idempotencyKey) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  }

  let connection;
  let payment;
  let configuration;
  try {
    configuration = await readMidtransConfiguration();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [existingRows] = await connection.query(
      `SELECT p.order_id, p.santri_id, p.amount, p.status, p.snap_token,
              p.qr_string, p.qr_code_url,
              p.expires_at, p.created_at, p.paid_at,
              p.midtrans_client_key, p.midtrans_environment
       FROM midtrans_topup_payments p
       WHERE p.user_id = ? AND p.idempotency_key = ? FOR UPDATE`,
      [req.user.id, idempotencyKey],
    );
    if (existingRows.length) {
      const existing = existingRows[0];
      if (Number(existing.santri_id) !== santriId || Number(existing.amount) !== amount) {
        await connection.rollback();
        return res.status(409).json({ message: 'Idempotency-Key sudah digunakan untuk permintaan top-up berbeda.' });
      }
      if (existing.status === 'creating') {
        await connection.rollback();
        return res.status(409).json({ message: 'Permintaan pembayaran masih dibuat. Tunggu sebentar sebelum mencoba kembali.' });
      }
      if (existing.status !== 'pending' && existing.status !== 'paid') {
        await connection.rollback();
        return res.status(409).json({ message: 'Permintaan sebelumnya tidak lagi aktif. Buat top-up baru.' });
      }
      await connection.commit();
      const found = await findParentPayment(req.user.id, existing.order_id);
      return res.status(200).json({
        message: 'Permintaan pembayaran yang sama sudah tersedia.',
        data: await toPaymentResponse(found),
      });
    }

    const [children] = await connection.query(
      `SELECT s.id, s.nama_lengkap, s.saldo
       FROM wali_santri w
       JOIN santri s ON s.id = w.santri_id
       WHERE w.user_id = ? AND s.id = ? FOR UPDATE`,
      [req.user.id, santriId],
    );
    if (!children.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Santri tidak terhubung ke akun wali ini.' });
    }
    if (moneyToCents(children[0].saldo || '0.00') + BigInt(amount) * 100n > 999999999999n) {
      await connection.rollback();
      return res.status(409).json({ message: 'Saldo santri sudah mendekati batas maksimum sehingga top-up ini tidak dapat dilakukan.' });
    }

    const orderId = `PP-${randomUUID()}`;
    await connection.query(
      `INSERT INTO midtrans_topup_payments
         (user_id, santri_id, order_id, idempotency_key, amount, status,
          midtrans_client_key, midtrans_server_key_enc, midtrans_environment)
       VALUES (?, ?, ?, ?, ?, 'creating', ?, ?, ?)`,
      [
        req.user.id,
        santriId,
        orderId,
        idempotencyKey,
        amount,
        configuration.clientKey,
        encryptApplicationSecret(configuration.serverKey),
        configuration.environment,
      ],
    );
    payment = { orderId, studentName: children[0].nama_lengkap };
    await connection.commit();
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) {
        console.error('Rollback parent top-up creation failed:', rollbackError);
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      try {
        const [rows] = await pool.query(
          `SELECT order_id, santri_id, amount, status
           FROM midtrans_topup_payments WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
          [req.user.id, idempotencyKey],
        );
        if (rows.length && Number(rows[0].santri_id) === santriId && Number(rows[0].amount) === amount &&
            ['pending', 'paid'].includes(rows[0].status)) {
          const found = await findParentPayment(req.user.id, rows[0].order_id);
          return res.status(200).json({
            message: 'Permintaan pembayaran yang sama sudah tersedia.',
            data: await toPaymentResponse(found),
          });
        }
        if (rows.length && Number(rows[0].santri_id) === santriId &&
            Number(rows[0].amount) === amount && rows[0].status === 'creating') {
          return res.status(409).json({ message: 'Permintaan pembayaran masih dibuat. Tunggu sebentar sebelum mencoba kembali.' });
        }
      } catch (lookupError) {
        console.error('Lookup idempotent Midtrans payment error:', lookupError);
        return res.status(500).json({ message: 'Gagal memeriksa permintaan top-up sebelumnya.' });
      }
    }
    if (error instanceof MidtransError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Create parent top-up payment error:', error);
    return res.status(500).json({ message: 'Gagal membuat permintaan pembayaran.' });
  } finally {
    connection?.release();
  }

  try {
    const qris = await createMidtransQrisTransaction(configuration, {
      orderId: payment.orderId,
      amount,
      parentName: req.user.username,
      studentName: payment.studentName,
    });
    validateMidtransTransaction(qris, {
      orderId: payment.orderId,
      amount: String(amount),
    });
    if (typeof qris.qr_string !== 'string' || !qris.qr_string.trim()) {
      throw new MidtransError('Midtrans tidak mengembalikan QRIS untuk pembayaran ini.');
    }
    const qrCodeUrl = getMidtransQrisImageUrl(qris, configuration.apiBaseUrl);
    await pool.query(
      `UPDATE midtrans_topup_payments
       SET status = 'pending', qr_string = ?, qr_code_url = ?, provider_transaction_id = ?,
           expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE),
           status_checked_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND status = 'creating'`,
      [
        qris.qr_string,
        qrCodeUrl,
        qris.transaction_id || null,
        MIDTRANS_TOPUP_EXPIRY_MINUTES,
        payment.orderId,
      ],
    );
    const created = await findParentPayment(req.user.id, payment.orderId);
    return res.status(201).json({
      message: 'QRIS berhasil disiapkan. Selesaikan pembayaran sebelum kode kedaluwarsa.',
      data: await toPaymentResponse(created),
    });
  } catch (error) {
    await pool.query(
      `UPDATE midtrans_topup_payments SET status = 'failed'
       WHERE order_id = ? AND status = 'creating'`,
      [payment.orderId],
    ).catch((updateError) => console.error('Mark failed Midtrans payment error:', updateError));
    if (error instanceof MidtransError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Create Midtrans Snap transaction error:', error);
    return res.status(500).json({ message: 'Gagal menyiapkan QRIS. Silakan coba lagi.' });
  }
};
