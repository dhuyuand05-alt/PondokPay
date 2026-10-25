import pool from '../../config/db.js';

export const validCredentialStatuses = ['active', 'blocked'];
export const validTransactionTypes = ['belanja', 'topup', 'tarik', 'biaya_layanan'];
export const maxPageSize = 100;

export const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const parseMoney = (value, field, { required = false, max = 99999999.99 } = {}) => {
  if (value === undefined && !required) return { value: undefined };
  if (value === null && !required) return { value: null };
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { error: `${field} harus berupa angka.` };
  }

  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { error: `${field} harus berupa angka positif dengan maksimal 2 angka desimal.` };
  }

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > max) {
    return { error: `${field} berada di luar batas yang diizinkan.` };
  }

  return { value: amount.toFixed(2) };
};

export const moneyToCents = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

export const centsToMoney = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

export const normalizeSaleItems = (value) => {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    return { error: 'Keranjang harus berisi 1 sampai 100 produk.' };
  }
  const items = new Map();
  for (const row of value) {
    const productId = parseId(row?.product_id);
    const quantity = Number(row?.quantity);
    if (
      !productId ||
      (typeof row?.quantity !== 'number' && typeof row?.quantity !== 'string') ||
      !/^\d+$/.test(String(row.quantity)) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    ) {
      return { error: 'Produk atau jumlah pada keranjang tidak valid.' };
    }
    items.set(productId, (items.get(productId) || 0) + quantity);
    if (items.get(productId) > 999) return { error: 'Jumlah setiap produk maksimal 999.' };
  }
  return { items: [...items].map(([product_id, quantity]) => ({ product_id, quantity })).sort((a, b) => a.product_id - b.product_id) };
};

export const getIdempotencyKey = (req) => {
  const key = req.get('Idempotency-Key')?.trim();
  return key && key.length >= 8 && key.length <= 64 &&
    /^[A-Za-z0-9._:-]+$/.test(key) ? key : null;
};

export const idempotencyConflict = () => {
  const error = new Error('Idempotency key is already used by another operation.');
  error.code = 'IDEMPOTENCY_KEY_CONFLICT';
  return error;
};

export const duplicateError = (error) => error.code === 'ER_DUP_ENTRY';

export const runInTransaction = async (callback) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const parsePagination = (query) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 20;
  return {
    page: Math.max(1, page),
    limit: Math.min(maxPageSize, Math.max(1, limit)),
  };
};
