import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptApplicationSecret } from '../config/security.js';
import {
  amountMatchesMidtrans,
  createMidtransSignature,
  getMidtransQrisImageUrl,
  normalizeMidtransStatus,
  createMidtransQrisTransaction,
  getMidtransTransactionStatus,
  isMidtransCredential,
  midtransConfigurationFromPayment,
  validateMidtransTransaction,
  validateTopupAmount,
  verifyMidtransSignature,
} from '../services/midtrans.js';

test('QRIS top-up accepts only whole rupiah within the configured bounds', () => {
  assert.equal(validateTopupAmount(10000), 10000);
  assert.equal(validateTopupAmount('450000'), 450000);
  assert.equal(validateTopupAmount('9999'), null);
  assert.equal(validateTopupAmount('450001'), null);
  assert.equal(validateTopupAmount('10000.00'), null);
  assert.equal(validateTopupAmount('1e4'), null);
});

test('Midtrans credentials accept current and legacy key prefixes independently of environment', () => {
  assert.equal(isMidtransCredential('Mid-client-current', 'client'), true);
  assert.equal(isMidtransCredential('SB-Mid-client-legacy', 'client'), true);
  assert.equal(isMidtransCredential('Mid-server-current', 'server'), true);
  assert.equal(isMidtransCredential('SB-Mid-server-legacy', 'server'), true);
  assert.equal(isMidtransCredential('Mid-server-wrong-kind', 'client'), false);
  assert.equal(isMidtransCredential('', 'client'), false);
});

test('Midtrans notification signature uses SHA-512 and rejects changed fields', () => {
  const serverKey = 'sandbox-secret';
  const notification = {
    order_id: 'PP-550e8400-e29b-41d4-a716-446655440000',
    status_code: '200',
    gross_amount: '450000.00',
  };
  const signature = createMidtransSignature(
    notification.order_id,
    notification.status_code,
    notification.gross_amount,
    serverKey,
  );
  assert.equal(signature.length, 128);
  assert.equal(verifyMidtransSignature({ ...notification, signature_key: signature }, serverKey), true);
  assert.equal(verifyMidtransSignature({
    ...notification,
    gross_amount: '10000.00',
    signature_key: signature,
  }, serverKey), false);
  assert.equal(verifyMidtransSignature({
    ...notification,
    signature_key: '0'.repeat(32),
  }, serverKey), false);
});

test('Midtrans QRIS statuses map to safe local states', () => {
  assert.equal(normalizeMidtransStatus({ transaction_status: 'settlement' }), 'paid');
  assert.equal(normalizeMidtransStatus({ transaction_status: 'capture', fraud_status: 'accept' }), 'paid');
  assert.equal(normalizeMidtransStatus({ transaction_status: 'pending' }), 'pending');
  assert.equal(normalizeMidtransStatus({ transaction_status: 'expire' }), 'expired');
  assert.equal(normalizeMidtransStatus({ transaction_status: 'cancel' }), 'failed');
  assert.equal(normalizeMidtransStatus({ transaction_status: 'capture', fraud_status: 'deny' }), 'failed');
  assert.throws(() => normalizeMidtransStatus({ transaction_status: 'refund' }), /belum didukung/);
});

test('Midtrans amount comparison requires an exact rupiah amount', () => {
  assert.equal(amountMatchesMidtrans('450000.00', '450000.00'), true);
  assert.equal(amountMatchesMidtrans('450000.00', '449999.99'), false);
  assert.equal(amountMatchesMidtrans('450000.00', '450000.001'), false);
});

test('Midtrans QR simulator URL comes from its trusted QR-code action', () => {
  const transaction = {
    actions: [{
      name: 'generate-qr-code',
      method: 'GET',
      url: 'https://api.sandbox.midtrans.com/v2/qris/tx-123/qr-code',
    }],
  };
  assert.equal(
    getMidtransQrisImageUrl(transaction, 'https://api.sandbox.midtrans.com'),
    transaction.actions[0].url,
  );
  assert.throws(
    () => getMidtransQrisImageUrl({
      actions: [{
        name: 'generate-qr-code',
        method: 'GET',
        url: 'https://attacker.example/v2/qris/tx-123/qr-code',
      }],
    }, 'https://api.sandbox.midtrans.com'),
    /tidak sesuai lingkungan/,
  );
});

test('existing payments retain their own encrypted Midtrans credentials and environment', () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  try {
    const configuration = midtransConfigurationFromPayment({
      midtrans_client_key: 'SB-Mid-client-old',
      midtrans_server_key_enc: encryptApplicationSecret('SB-Mid-server-old'),
      midtrans_environment: 'sandbox',
    });
    assert.equal(configuration.clientKey, 'SB-Mid-client-old');
    assert.equal(configuration.serverKey, 'SB-Mid-server-old');
    assert.equal(configuration.environment, 'sandbox');
    assert.equal(configuration.apiBaseUrl, 'https://api.sandbox.midtrans.com');
    assert.equal(configuration.snapScriptUrl, 'https://app.sandbox.midtrans.com/snap/snap.js');
  } finally {
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previousKey;
  }
});

test('QRIS transaction uses Core API directly with the configured expiry', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => requests.length === 1
        ? {
          order_id: 'PP-550e8400-e29b-41d4-a716-446655440000',
          gross_amount: '10000.00',
          currency: 'IDR',
          payment_type: 'qris',
          transaction_status: 'pending',
          transaction_id: 'midtrans-transaction-id',
          qr_string: '000201010212TEST',
          actions: [{
            name: 'generate-qr-code',
            method: 'GET',
            url: 'https://api.sandbox.midtrans.com/v2/qris/midtrans-transaction-id/qr-code',
          }],
        }
        : {
          order_id: 'PP-550e8400-e29b-41d4-a716-446655440000',
          gross_amount: '10000.00',
          currency: 'IDR',
          payment_type: 'qris',
          transaction_status: 'pending',
        },
    };
  };
  const configuration = {
    serverKey: 'SB-Mid-server-test',
    apiBaseUrl: 'https://api.sandbox.midtrans.com',
    snapApiBaseUrl: 'https://app.sandbox.midtrans.com',
  };

  try {
    await createMidtransQrisTransaction(configuration, {
      orderId: 'PP-550e8400-e29b-41d4-a716-446655440000',
      amount: 10000,
      parentName: 'Wali',
      studentName: 'Santri',
    });
    await getMidtransTransactionStatus(configuration, 'PP-550e8400-e29b-41d4-a716-446655440000');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests[0].url, 'https://api.sandbox.midtrans.com/v2/charge');
  assert.equal(requests[1].url, 'https://api.sandbox.midtrans.com/v2/PP-550e8400-e29b-41d4-a716-446655440000/status');
  const requestBody = JSON.parse(requests[0].options.body);
  assert.equal(requestBody.payment_type, 'qris');
  assert.equal(requestBody.custom_expiry.unit, 'minute');
  assert.equal(requestBody.custom_expiry.expiry_duration, 15);
  assert.equal(requests[0].options.headers.Authorization, `Basic ${Buffer.from('SB-Mid-server-test:').toString('base64')}`);
  assert.equal(getMidtransQrisImageUrl({
    actions: [{
      name: 'generate-qr-code',
      method: 'GET',
      url: 'https://api.sandbox.midtrans.com/v2/qris/midtrans-transaction-id/qr-code',
    }],
  }, configuration.apiBaseUrl), 'https://api.sandbox.midtrans.com/v2/qris/midtrans-transaction-id/qr-code');
  assert.equal(validateMidtransTransaction({
    order_id: 'PP-550e8400-e29b-41d4-a716-446655440000',
    gross_amount: '10000.00',
    currency: 'IDR',
    payment_type: 'qris',
  }, {
    orderId: 'PP-550e8400-e29b-41d4-a716-446655440000',
    amount: '10000.00',
  }), true);
  assert.throws(() => validateMidtransTransaction({
    order_id: 'PP-other',
    gross_amount: '10000.00',
    currency: 'IDR',
    payment_type: 'qris',
  }, {
    orderId: 'PP-550e8400-e29b-41d4-a716-446655440000',
    amount: '10000.00',
  }), /Order ID status/);
});
