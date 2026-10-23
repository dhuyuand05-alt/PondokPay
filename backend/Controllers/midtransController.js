import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import pool from '../config/db.js';
import {
  decryptApplicationSecret,
  encryptApplicationSecret,
} from '../config/security.js';
import { collectCurrentServiceFeeDebt } from '../services/monthlyServiceFees.js';
import {
  createMidtransQrisTransaction,
  getMidtransTransactionStatus,
  MIDTRANS_TOPUP_EXPIRY_MINUTES,
  MIDTRANS_TOPUP_MAXIMUM,
  MIDTRANS_TOPUP_MINIMUM,
  getMidtransQrisImageUrl,
  isMidtransCredential,
  MidtransError,
  midtransConfigurationFromPayment,
  normalizeMidtransStatus,
  readMidtransConfiguration,
  validateMidtransTransaction,
  validateTopupAmount,
  verifyMidtransSignature,
} from '../services/midtrans.js';
import { enqueueParentTransactionNotifications } from '../services/whatsappNotifications.js';

const publicAdminConfiguration = (settings) => ({
  merchant_id: settings.midtrans_merchant_id || '',
  client_key: settings.midtrans_client_key || '',
  server_key_configured: Boolean(settings.midtrans_server_key_enc),
  environment: settings.midtrans_environment || 'sandbox',
  enabled: Boolean(
    settings.midtrans_merchant_id &&
    settings.midtrans_client_key &&
    settings.midtrans_server_key_enc,
  ),
});

const readAdminConfiguration = async () => {
  const [rows] = await pool.query(
    `SELECT midtrans_merchant_id, midtrans_client_key,
            midtrans_server_key_enc, midtrans_environment
     FROM institution_settings WHERE id = 1`
  );
  if (!rows.length) throw new Error('Pengaturan pondok belum tersedia.');
  return rows[0];
};

export const getAdminMidtransSettings = async (req, res) => {
  try {
    const settings = await readAdminConfiguration();
    return res.status(200).json({ data: publicAdminConfiguration(settings) });
  } catch (error) {
    console.error('Get Midtrans settings error:', error);
    return res.status(500).json({ message: 'Gagal mengambil pengaturan pembayaran.' });
  }
};

export const updateAdminMidtransSettings = async (req, res) => {
  const environment = req.body.environment;
  const merchantId = typeof req.body.merchant_id === 'string' ? req.body.merchant_id.trim() : '';
  const clientKey = typeof req.body.client_key === 'string' ? req.body.client_key.trim() : '';
  const serverKey = typeof req.body.server_key === 'string' ? req.body.server_key.trim() : '';
  const clearServerKey = req.body.clear_server_key === true;

  if (!['sandbox', 'production'].includes(environment)) {
    return res.status(400).json({ message: 'Pilih lingkungan Sandbox atau Production.' });
  }
  if (merchantId.length > 100 || clientKey.length > 255 || serverKey.length > 255) {
    return res.status(400).json({ message: 'Salah satu kredensial Midtrans terlalu panjang.' });
  }
  if (serverKey && clearServerKey) {
    return res.status(400).json({ message: 'Kunci server baru dan penghapusan kunci tidak dapat dilakukan bersamaan.' });
  }
  if (clientKey && !isMidtransCredential(clientKey, 'client')) {
    return res.status(400).json({ message: 'Client Key harus menggunakan format Mid-client- atau SB-Mid-client-.' });
  }

  try {
    const current = await readAdminConfiguration();
    let encryptedServerKey = current.midtrans_server_key_enc;
    let currentServerKey = null;
    if (encryptedServerKey && !serverKey && !clearServerKey) {
      try {
        currentServerKey = decryptApplicationSecret(encryptedServerKey);
      } catch (error) {
        console.error('Stored Midtrans server key is unreadable during update:', error);
        return res.status(503).json({ message: 'Kunci server tersimpan tidak dapat dibaca. Periksa MFA_ENCRYPTION_KEY.' });
      }
    }

    if (clearServerKey) {
      encryptedServerKey = null;
      currentServerKey = null;
    } else if (serverKey) {
      currentServerKey = serverKey;
      encryptedServerKey = encryptApplicationSecret(serverKey);
    }
    if (currentServerKey && !isMidtransCredential(currentServerKey, 'server')) {
      return res.status(400).json({ message: 'Server Key harus menggunakan format Mid-server- atau SB-Mid-server-. Masukkan kunci baru atau hapus kunci lama.' });
    }

    await pool.query(
      `UPDATE institution_settings
       SET midtrans_merchant_id = ?, midtrans_client_key = ?,
           midtrans_server_key_enc = ?, midtrans_environment = ?
       WHERE id = 1`,
      [merchantId || null, clientKey || null, encryptedServerKey, environment],
    );
    const updated = await readAdminConfiguration();
    return res.status(200).json({
      message: 'Pengaturan pembayaran Midtrans berhasil disimpan.',
      data: publicAdminConfiguration(updated),
    });
  } catch (error) {
    console.error('Update Midtrans settings error:', error);
    return res.status(500).json({ message: 'Gagal menyimpan pengaturan pembayaran.' });
  }
};

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

const toPaymentResponse = async (payment) => ({
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

const findParentPayment = async (userId, orderId) => {
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

const moneyToCents = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

const centsToMoney = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

const applyProviderPaymentStatus = async (orderId, providerStatus) => {
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
