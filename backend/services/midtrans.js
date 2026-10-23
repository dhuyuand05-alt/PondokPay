import { createHash, timingSafeEqual } from 'node:crypto';
import pool from '../config/db.js';
import { decryptApplicationSecret } from '../config/security.js';

export const MIDTRANS_TOPUP_MINIMUM = 10000;
export const MIDTRANS_TOPUP_MAXIMUM = 450000;
export const MIDTRANS_TOPUP_EXPIRY_MINUTES = 15;

export class MidtransError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'MidtransError';
    this.status = status;
  }
}

export const isMidtransCredential = (key, kind) =>
  typeof key === 'string' &&
  (key.startsWith(`Mid-${kind}-`) || key.startsWith(`SB-Mid-${kind}-`));

export const validateTopupAmount = (amount) => {
  const value = typeof amount === 'number' ? String(amount) : amount;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= MIDTRANS_TOPUP_MINIMUM &&
    parsed <= MIDTRANS_TOPUP_MAXIMUM
    ? parsed
    : null;
};

export const createMidtransSignature = (orderId, statusCode, grossAmount, serverKey) =>
  createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');

export const verifyMidtransSignature = (notification, serverKey) => {
  if (!notification || typeof notification !== 'object' ||
      typeof notification.order_id !== 'string' ||
      typeof notification.status_code !== 'string' && typeof notification.status_code !== 'number' ||
      typeof notification.gross_amount !== 'string' ||
      typeof notification.signature_key !== 'string' ||
      !/^[a-f0-9]{128}$/i.test(notification.signature_key)) return false;
  const expected = Buffer.from(createMidtransSignature(
    notification.order_id,
    String(notification.status_code),
    notification.gross_amount,
    serverKey,
  ));
  const supplied = Buffer.from(notification.signature_key.toLowerCase());
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
};

export const normalizeMidtransStatus = (status) => {
  if (!status || typeof status !== 'object') {
    throw new MidtransError('Status pembayaran dari Midtrans tidak valid.');
  }
  const { transaction_status: transactionStatus, fraud_status: fraudStatus } = status;
  if (transactionStatus === 'settlement' ||
      (transactionStatus === 'capture' && fraudStatus === 'accept')) return 'paid';
  if (transactionStatus === 'pending') return 'pending';
  if (transactionStatus === 'expire') return 'expired';
  if (['cancel', 'deny', 'failure'].includes(transactionStatus) ||
      (transactionStatus === 'capture' && fraudStatus === 'deny')) return 'failed';
  throw new MidtransError('Status transaksi Midtrans belum didukung.');
};

export const amountMatchesMidtrans = (storedAmount, providerAmount) => {
  if (typeof storedAmount !== 'string' && typeof storedAmount !== 'number') return false;
  if (typeof providerAmount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(providerAmount)) return false;
  const toCents = (value) => {
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  return toCents(storedAmount) === toCents(providerAmount);
};

export const validateMidtransTransaction = (status, { orderId, amount }) => {
  if (!status || status.order_id !== orderId) {
    throw new MidtransError('Order ID status Midtrans tidak cocok dengan catatan pembayaran.', 400);
  }
  if (!amountMatchesMidtrans(amount, status.gross_amount)) {
    throw new MidtransError('Nominal status Midtrans tidak cocok dengan catatan pembayaran.', 400);
  }
  if (status.currency !== 'IDR' || status.payment_type !== 'qris') {
    throw new MidtransError('Pembayaran harus menggunakan QRIS dengan mata uang rupiah.', 400);
  }
  return true;
};

export const readMidtransConfiguration = async ({ requireEnabled = true } = {}) => {
  const [rows] = await pool.query(
    `SELECT midtrans_merchant_id, midtrans_client_key,
            midtrans_server_key_enc, midtrans_environment
     FROM institution_settings WHERE id = 1`
  );
  if (!rows.length) throw new MidtransError('Pengaturan pondok belum tersedia.', 503);
  const settings = rows[0];
  const configured = Boolean(
    settings.midtrans_merchant_id &&
    settings.midtrans_client_key &&
    settings.midtrans_server_key_enc,
  );
  if (requireEnabled && !configured) {
    throw new MidtransError('Pembayaran QRIS belum dikonfigurasi oleh admin pondok.', 503);
  }
  let serverKey = null;
  if (settings.midtrans_server_key_enc) {
    try {
      serverKey = decryptApplicationSecret(settings.midtrans_server_key_enc);
    } catch (error) {
      console.error('Midtrans server key decryption failed:', error);
      throw new MidtransError('Kunci pembayaran tidak dapat dibaca. Hubungi admin pondok.', 503);
    }
  }
  return {
    merchantId: settings.midtrans_merchant_id,
    clientKey: settings.midtrans_client_key,
    serverKey,
    environment: settings.midtrans_environment,
    configured,
    apiBaseUrl: settings.midtrans_environment === 'production'
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com',
    snapApiBaseUrl: settings.midtrans_environment === 'production'
      ? 'https://app.midtrans.com'
      : 'https://app.sandbox.midtrans.com',
    snapScriptUrl: settings.midtrans_environment === 'production'
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js',
  };
};

export const midtransConfigurationFromPayment = (payment) => {
  if (!payment?.midtrans_environment || !payment?.midtrans_client_key ||
      !payment?.midtrans_server_key_enc) {
    throw new MidtransError('Konfigurasi Midtrans untuk pembayaran ini tidak tersedia.', 503);
  }
  let serverKey;
  try {
    serverKey = decryptApplicationSecret(payment.midtrans_server_key_enc);
  } catch (error) {
    console.error('Midtrans payment server key decryption failed:', error);
    throw new MidtransError('Kunci pembayaran tidak dapat dibaca. Hubungi admin pondok.', 503);
  }
  const production = payment.midtrans_environment === 'production';
  return {
    merchantId: null,
    clientKey: payment.midtrans_client_key,
    serverKey,
    environment: payment.midtrans_environment,
    configured: true,
    apiBaseUrl: production ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com',
    snapApiBaseUrl: production ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com',
    snapScriptUrl: production
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js',
  };
};

const midtransRequest = async (configuration, path, { method = 'GET', body, baseUrl } = {}) => {
  let response;
  try {
    response = await fetch(`${baseUrl || configuration.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${configuration.serverKey}:`).toString('base64')}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const message = error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'Midtrans tidak merespons tepat waktu.'
      : 'Tidak dapat menghubungi layanan Midtrans.';
    throw new MidtransError(message, 503);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new MidtransError('Respons layanan Midtrans tidak dapat dibaca.');
  }
  if (!response.ok) {
    console.error('Midtrans API request failed:', {
      status: response.status,
      errorCode: result.error_messages?.[0] || result.status_message || 'unknown',
    });
    throw new MidtransError(
      response.status === 401
        ? 'Kredensial Midtrans tidak valid untuk lingkungan yang dipilih.'
        : 'Midtrans menolak permintaan pembayaran. Periksa konfigurasi akun QRIS.',
      response.status === 401 ? 503 : 502,
    );
  }
  return result;
};

export const createMidtransQrisTransaction = (configuration, {
  orderId,
  amount,
  parentName,
  studentName,
}) => midtransRequest(configuration, '/v2/charge', {
  method: 'POST',
  baseUrl: configuration.apiBaseUrl,
  body: {
    payment_type: 'qris',
    transaction_details: { order_id: orderId, gross_amount: amount },
    item_details: [{
      id: 'topup-saldo',
      price: amount,
      quantity: 1,
      name: `Top-up saldo ${studentName}`.slice(0, 50),
    }],
    customer_details: { first_name: String(parentName || 'Wali santri').slice(0, 50) },
    custom_expiry: { unit: 'minute', expiry_duration: MIDTRANS_TOPUP_EXPIRY_MINUTES },
  },
});

export const getMidtransQrisImageUrl = (transaction, apiBaseUrl) => {
  const action = Array.isArray(transaction?.actions)
    ? transaction.actions.find((item) => item?.name === 'generate-qr-code' && item?.method === 'GET')
    : null;
  if (typeof action?.url !== 'string') {
    throw new MidtransError('Midtrans tidak mengembalikan URL gambar QRIS.');
  }
  let imageUrl;
  let apiUrl;
  try {
    imageUrl = new URL(action.url);
    apiUrl = new URL(apiBaseUrl);
  } catch {
    throw new MidtransError('URL gambar QRIS dari Midtrans tidak valid.');
  }
  if (imageUrl.protocol !== 'https:' || imageUrl.host !== apiUrl.host ||
      !/^\/v2\/qris\/[^/]+\/qr-code$/.test(imageUrl.pathname)) {
    throw new MidtransError('URL gambar QRIS dari Midtrans tidak sesuai lingkungan pembayaran.');
  }
  return imageUrl.toString();
};

export const getMidtransTransactionStatus = (configuration, orderId) =>
  midtransRequest(configuration, `/v2/${encodeURIComponent(orderId)}/status`);
