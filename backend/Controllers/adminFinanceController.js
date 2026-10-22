import pool from '../config/db.js';
import { currentServiceFeePeriod } from '../services/monthlyServiceFees.js';

const parseMoney = (value, field, { allowZero = false, max = 9999999999.99 } = {}) => {
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

const parseEntryId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const getIdempotencyKey = (req) => {
  const key = req.get('Idempotency-Key')?.trim();
  return key && key.length >= 8 && key.length <= 64 &&
    /^[A-Za-z0-9._:-]+$/.test(key) ? key : null;
};

const duplicateError = (error) => error.code === 'ER_DUP_ENTRY';

const moneyToCents = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

const centsToMoney = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

const nextServiceFeePeriod = () => {
  const next = new Date(`${currentServiceFeePeriod()}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 10);
};

export const getAdminCash = async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const currentPeriod = currentServiceFeePeriod();
  try {
    const [[totals]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'income' THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) AS expense
       FROM admin_cash_entries`
    );
    const [[debts]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS outstanding
       FROM service_fee_charges WHERE status = 'unpaid' AND billing_period = ?`,
      [currentPeriod]
    );
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM admin_cash_entries');
    const [rates] = await pool.query(
      `SELECT amount, DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from
       FROM service_fee_rates
       WHERE effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [currentPeriod]
    );
    const [scheduledRates] = await pool.query(
      `SELECT amount, DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from
       FROM service_fee_rates
       WHERE effective_from > ? ORDER BY effective_from ASC, id DESC LIMIT 1`,
      [currentPeriod]
    );
    const [entries] = await pool.query(
      `SELECT e.id, e.direction, e.category, e.amount, e.description, e.created_at,
              e.reverses_entry_id, u.username AS created_by_username,
              DATE_FORMAT(charge.billing_period, '%Y-%m') AS billing_period,
              s.nis, s.nama_lengkap,
              EXISTS(
                SELECT 1 FROM admin_cash_entries reversal
                WHERE reversal.reverses_entry_id = e.id
              ) AS is_reversed
       FROM admin_cash_entries e
       LEFT JOIN users u ON u.id = e.created_by
       LEFT JOIN service_fee_charges charge ON charge.id = e.service_fee_charge_id
       LEFT JOIN santri s ON s.id = charge.santri_id
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return res.status(200).json({
      summary: {
        income: totals.income,
        expense: totals.expense,
        balance: centsToMoney(moneyToCents(totals.income) - moneyToCents(totals.expense)),
        outstanding_service_fee: debts.outstanding,
      },
      service_fee: {
        current: rates[0] ?? null,
        scheduled: scheduledRates[0] ?? null,
        next_effective_from: nextServiceFeePeriod(),
      },
      data: entries,
      pagination: { page, limit, total: count.total },
    });
  } catch (error) {
    console.error('Get admin cash error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kas admin.' });
  }
};

export const setMonthlyServiceFee = async (req, res) => {
  const amount = parseMoney(req.body.amount, 'Biaya layanan', {
    allowZero: true,
    max: 99999999.99,
  });
  if (amount.error) return res.status(400).json({ message: amount.error });
  const effectiveFrom = nextServiceFeePeriod();
  try {
    await pool.query(
      `INSERT INTO service_fee_rates (amount, effective_from, created_by)
       VALUES (?, ?, ?)`,
      [amount.value, effectiveFrom, req.user.id]
    );
    return res.status(200).json({
      message: `Biaya layanan berlaku mulai ${effectiveFrom}.`,
      data: { amount: amount.value, effective_from: effectiveFrom },
    });
  } catch (error) {
    console.error('Set monthly service fee error:', error);
    return res.status(500).json({ message: 'Gagal menyimpan biaya layanan.' });
  }
};

export const createAdminExpense = async (req, res) => {
  const { category, description } = req.body;
  const amount = parseMoney(req.body.amount, 'Nominal');
  if (amount.error) return res.status(400).json({ message: amount.error });
  const key = getIdempotencyKey(req);
  if (!key) return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  if (typeof category !== 'string' || !category.trim() || category.trim().length > 80) {
    return res.status(400).json({ message: 'Kategori wajib diisi dan maksimal 80 karakter.' });
  }
  if (typeof description !== 'string' || !description.trim() || description.trim().length > 500) {
    return res.status(400).json({ message: 'Keterangan wajib diisi dan maksimal 500 karakter.' });
  }
  try {
    const [previous] = await pool.query(
      `SELECT id, direction, category, amount, description, created_by
       FROM admin_cash_entries WHERE idempotency_key = ? LIMIT 1`,
      [key]
    );
    if (previous.length) {
      const entry = previous[0];
      if (Number(entry.created_by) !== req.user.id ||
          entry.direction !== 'expense' ||
          entry.category !== category.trim() ||
          String(entry.amount) !== amount.value ||
          entry.description !== description.trim()) {
        return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk catatan kas lain.' });
      }
      return res.status(200).json({ message: 'Pengeluaran sudah dicatat sebelumnya.', data: entry });
    }
    const [result] = await pool.query(
      `INSERT INTO admin_cash_entries
         (direction, category, amount, description, idempotency_key, created_by)
       VALUES ('expense', ?, ?, ?, ?, ?)`,
      [category.trim(), amount.value, description.trim(), key, req.user.id]
    );
    return res.status(201).json({
      message: 'Pengeluaran berhasil dicatat.',
      data: { id: result.insertId, direction: 'expense', category: category.trim(), amount: amount.value },
    });
  } catch (error) {
    if (duplicateError(error)) {
      try {
        const [previous] = await pool.query(
          `SELECT id, direction, category, amount, description, created_by
           FROM admin_cash_entries WHERE idempotency_key = ? LIMIT 1`,
          [key]
        );
        const entry = previous[0];
        if (entry && Number(entry.created_by) === req.user.id &&
            entry.direction === 'expense' &&
            entry.category === category.trim() &&
            String(entry.amount) === amount.value &&
            entry.description === description.trim()) {
          return res.status(200).json({ message: 'Pengeluaran sudah dicatat sebelumnya.', data: entry });
        }
        return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk catatan kas lain.' });
      } catch (lookupError) {
        console.error('Lookup idempotent expense error:', lookupError);
        return res.status(500).json({ message: 'Gagal memverifikasi status pengeluaran.' });
      }
    }
    console.error('Create admin expense error:', error);
    return res.status(500).json({ message: 'Gagal mencatat pengeluaran.' });
  }
};

export const reverseAdminCashEntry = async (req, res) => {
  const entryId = parseEntryId(req.params.id);
  const { reason } = req.body;
  if (!entryId) return res.status(400).json({ message: 'ID catatan kas tidak valid.' });
  const key = getIdempotencyKey(req);
  if (!key) return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    return res.status(400).json({ message: 'Alasan koreksi wajib diisi dan maksimal 500 karakter.' });
  }
  try {
    const connection = await pool.getConnection();
    let result;
    try {
      await connection.beginTransaction();
      const [entries] = await connection.query(
        `SELECT id, direction, category, amount
         FROM admin_cash_entries WHERE id = ? FOR UPDATE`,
        [entryId]
      );
      if (!entries.length) {
        await connection.rollback();
        return res.status(404).json({ message: 'Catatan kas tidak ditemukan.' });
      }
      const [previousByKey] = await connection.query(
        `SELECT id, direction, amount, description, reverses_entry_id, created_by
         FROM admin_cash_entries WHERE idempotency_key = ? LIMIT 1`,
        [key]
      );
      if (previousByKey.length) {
        const entry = previousByKey[0];
        if (Number(entry.created_by) !== req.user.id ||
            Number(entry.reverses_entry_id) !== entryId ||
            entry.description !== reason.trim()) {
          await connection.rollback();
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk catatan kas lain.' });
        }
        await connection.commit();
        return res.status(200).json({
          message: 'Catatan koreksi kas sudah dibuat sebelumnya.',
          data: {
            id: entry.id,
            direction: entry.direction,
            amount: entry.amount,
            reverses_entry_id: entryId,
          },
        });
      }
      const [reversals] = await connection.query(
        'SELECT id FROM admin_cash_entries WHERE reverses_entry_id = ? LIMIT 1',
        [entryId]
      );
      if (reversals.length) {
        await connection.rollback();
        return res.status(409).json({ message: 'Catatan kas ini sudah pernah dikoreksi.' });
      }
      const original = entries[0];
      const direction = original.direction === 'income' ? 'expense' : 'income';
      const [inserted] = await connection.query(
        `INSERT INTO admin_cash_entries
           (direction, category, amount, description, reverses_entry_id, idempotency_key, created_by)
         VALUES (?, 'Koreksi', ?, ?, ?, ?, ?)`,
        [direction, original.amount, reason.trim(), entryId, key, req.user.id]
      );
      result = { id: inserted.insertId, direction, amount: original.amount, reverses_entry_id: entryId };
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return res.status(201).json({ message: 'Catatan koreksi kas berhasil dibuat.', data: result });
  } catch (error) {
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'Catatan kas ini sudah pernah dikoreksi.' });
    }
    console.error('Reverse admin cash entry error:', error);
    return res.status(500).json({ message: 'Gagal membuat koreksi catatan kas.' });
  }
};
