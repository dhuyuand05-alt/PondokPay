import { currentServiceFeePeriod } from '../../services/monthlyServiceFees.js';

export const parseMoney = (value, field, { allowZero = false, max = 9999999999.99 } = {}) => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { error: `${field} harus berupa angka.` };
  }
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { error: `${field} harus berupa angka dengan maksimal 2 angka desimal.` };
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount > max || (!allowZero && amount <= 0)) {
    return { error: `${field} berada di luar batas yang diizinkan.` };
  }
  return { value: amount.toFixed(2) };
};

export const parseEntryId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const getIdempotencyKey = (req) => {
  const key = req.get('Idempotency-Key')?.trim();
  return key && key.length >= 8 && key.length <= 64 &&
    /^[A-Za-z0-9._:-]+$/.test(key) ? key : null;
};

export const duplicateError = (error) => error.code === 'ER_DUP_ENTRY';

export const moneyToCents = (value) => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Invalid decimal amount returned by the database.');
  const sign = match[1] === '-' ? -1n : 1n;
  return sign * (BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0')));
};

export const centsToMoney = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

export const adminCashLockName = 'pondokpay_admin_cash_ledger';

export const acquireAdminCashLock = async (connection) => {
  const [[result]] = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [adminCashLockName]);
  if (Number(result.acquired) !== 1) {
    const error = new Error('Kas admin sedang diproses. Silakan coba kembali.');
    error.code = 'ADMIN_CASH_LOCK_TIMEOUT';
    throw error;
  }
};

export const releaseAdminCashLock = async (connection) => {
  try {
    const [[result]] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [adminCashLockName]);
    if (Number(result.released) !== 1) {
      throw new Error('MySQL did not release the admin cash lock.');
    }
    connection.release();
  } catch (error) {
    console.error('Release admin cash lock error:', error);
    connection.destroy();
  }
};

export const getAdminCashBalance = async (connection) => {
  const [[result]] = await connection.query(
    `SELECT COALESCE(
       SUM(CASE WHEN direction = 'income' THEN amount ELSE -amount END), 0
     ) AS balance
     FROM admin_cash_entries`
  );
  return moneyToCents(result.balance);
};

export const nextServiceFeePeriod = () => {
  const next = new Date(`${currentServiceFeePeriod()}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 10);
};
