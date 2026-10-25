import pool from '../../config/db.js';
import { acquireAdminCashLock, duplicateError, getAdminCashBalance, getIdempotencyKey, moneyToCents, parseEntryId, parseMoney, releaseAdminCashLock } from './shared.js';

const createManualCashEntry = async (req, res, direction) => {
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
  const entryCategory = category.trim();
  const entryDescription = description.trim();
  const entryLabel = direction === 'income' ? 'pemasukan' : 'pengeluaran';
  let connection;
  let lockAcquired = false;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await acquireAdminCashLock(connection);
    lockAcquired = true;
    await connection.beginTransaction();
    transactionStarted = true;
    const [previous] = await connection.query(
      `SELECT id, direction, category, amount, description, created_by
       FROM admin_cash_entries WHERE idempotency_key = ? LIMIT 1`,
      [key]
    );
    if (previous.length) {
      const entry = previous[0];
      if (Number(entry.created_by) !== req.user.id ||
          entry.direction !== direction ||
          entry.category !== entryCategory ||
          String(entry.amount) !== amount.value ||
          entry.description !== entryDescription) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk catatan kas lain.' });
      }
      await connection.commit();
      transactionStarted = false;
      return res.status(200).json({ message: `${entryLabel[0].toUpperCase()}${entryLabel.slice(1)} sudah dicatat sebelumnya.`, data: entry });
    }
    if (direction === 'expense' &&
        await getAdminCashBalance(connection) < moneyToCents(amount.value)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Saldo kas admin tidak mencukupi untuk pengeluaran ini.' });
    }
    const [result] = await connection.query(
      `INSERT INTO admin_cash_entries
         (direction, category, amount, description, idempotency_key, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [direction, entryCategory, amount.value, entryDescription, key, req.user.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      message: `${entryLabel[0].toUpperCase()}${entryLabel.slice(1)} berhasil dicatat.`,
      data: { id: result.insertId, direction, category: entryCategory, amount: amount.value },
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (error.code === 'ADMIN_CASH_LOCK_TIMEOUT') {
      return res.status(503).json({ message: error.message });
    }
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk catatan kas lain.' });
    }
    console.error(`Create admin ${direction} error:`, error);
    return res.status(500).json({ message: `Gagal mencatat ${entryLabel}.` });
  } finally {
    if (connection) {
      if (lockAcquired) await releaseAdminCashLock(connection);
      else connection.release();
    }
  }
};

export const createAdminExpense = (req, res) => createManualCashEntry(req, res, 'expense');

export const createAdminIncome = (req, res) => createManualCashEntry(req, res, 'income');

export const reverseAdminCashEntry = async (req, res) => {
  const entryId = parseEntryId(req.params.id);
  const { reason } = req.body;
  if (!entryId) return res.status(400).json({ message: 'ID catatan kas tidak valid.' });
  const key = getIdempotencyKey(req);
  if (!key) return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    return res.status(400).json({ message: 'Alasan koreksi wajib diisi dan maksimal 500 karakter.' });
  }
  let connection;
  let lockAcquired = false;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    let result;
    try {
      await acquireAdminCashLock(connection);
      lockAcquired = true;
      await connection.beginTransaction();
      transactionStarted = true;
      const [entries] = await connection.query(
        `SELECT id, direction, category, amount
         FROM admin_cash_entries WHERE id = ? FOR UPDATE`,
        [entryId]
      );
      if (!entries.length) {
        await connection.rollback();
        transactionStarted = false;
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
          transactionStarted = false;
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk catatan kas lain.' });
        }
        await connection.commit();
        transactionStarted = false;
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
        transactionStarted = false;
        return res.status(409).json({ message: 'Catatan kas ini sudah pernah dikoreksi.' });
      }
      const original = entries[0];
      const direction = original.direction === 'income' ? 'expense' : 'income';
      if (direction === 'expense' &&
          await getAdminCashBalance(connection) < moneyToCents(original.amount)) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ message: 'Saldo kas admin tidak mencukupi untuk mengoreksi pemasukan ini.' });
      }
      const [inserted] = await connection.query(
        `INSERT INTO admin_cash_entries
           (direction, category, amount, description, reverses_entry_id, idempotency_key, created_by)
         VALUES (?, 'Koreksi', ?, ?, ?, ?, ?)`,
        [direction, original.amount, reason.trim(), entryId, key, req.user.id]
      );
      result = { id: inserted.insertId, direction, amount: original.amount, reverses_entry_id: entryId };
      await connection.commit();
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) await connection.rollback();
      throw error;
    } finally {
      if (lockAcquired) await releaseAdminCashLock(connection);
      else connection.release();
    }
    return res.status(201).json({ message: 'Catatan koreksi kas berhasil dibuat.', data: result });
  } catch (error) {
    if (error.code === 'ADMIN_CASH_LOCK_TIMEOUT') {
      return res.status(503).json({ message: error.message });
    }
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'Catatan kas ini sudah pernah dikoreksi.' });
    }
    console.error('Reverse admin cash entry error:', error);
    return res.status(500).json({ message: 'Gagal membuat koreksi catatan kas.' });
  }
};
