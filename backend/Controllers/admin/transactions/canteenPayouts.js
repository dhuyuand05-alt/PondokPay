import pool from '../../../config/db.js';
import { consumeCanteenPayoutApproval } from '../../../services/canteenPayoutApprovals.js';
import { consumeFinancialApproval } from '../../../services/financialApprovals.js';
import { collectCurrentServiceFeeDebt } from '../../../services/monthlyServiceFees.js';
import { enqueueParentTransactionNotifications } from '../../../services/whatsappNotifications.js';
import { centsToMoney, duplicateError, getIdempotencyKey, idempotencyConflict, moneyToCents, normalizeSaleItems, parseId, parseMoney, parsePagination, runInTransaction, validTransactionTypes } from '../shared.js';

export const createCanteenWithdrawal = async (req, res) => {
  const kantinId = parseId(req.params.id);
  if (!kantinId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  }
  const amount = parseMoney(req.body.jumlah, 'jumlah');
  if (amount.error || !amount.value || Number(amount.value) <= 0) {
    return res.status(400).json({ message: amount.error || 'Jumlah pencairan harus lebih dari 0.' });
  }
  const keterangan = req.body.keterangan ?? null;
  if (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 65535)) {
    return res.status(400).json({ message: 'Keterangan pencairan tidak valid.' });
  }

  try {
    const payout = await runInTransaction(async (connection) => {
      const [canteens] = await connection.query('SELECT saldo FROM kantin WHERE id = ? FOR UPDATE', [kantinId]);
      if (!canteens.length) return null;
      const [previous] = await connection.query(
        `SELECT id, kantin_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
         FROM kantin_transaksi WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (previous.length) {
        const existing = previous[0];
        if (Number(existing.created_by) !== req.user.id ||
            Number(existing.kantin_id) !== kantinId ||
            existing.tipe_transaksi !== 'pencairan' ||
            moneyToCents(existing.jumlah) !== moneyToCents(amount.value) ||
            (existing.keterangan ?? null) !== keterangan) {
          throw idempotencyConflict();
        }
        return {
          id: existing.id,
          kantin_id: kantinId,
          tipe_transaksi: 'pencairan',
          jumlah: amount.value,
          saldo_akhir: existing.saldo_akhir,
          keterangan,
          duplicate: true,
        };
      }
      await consumeCanteenPayoutApproval(
        connection, req, kantinId, amount.value, keterangan
      );
      await consumeFinancialApproval(
        connection, req, 'canteen_withdrawal', kantinId, amount.value, keterangan
      );
      const currentCents = moneyToCents(canteens[0].saldo ?? '0.00');
      const amountCents = moneyToCents(amount.value);
      if (amountCents > currentCents) {
        const error = new Error('Saldo kantin tidak mencukupi.');
        error.code = 'INSUFFICIENT_CANTEEN_BALANCE';
        throw error;
      }
      const updatedBalance = centsToMoney(currentCents - amountCents);
      await connection.query('UPDATE kantin SET saldo = ? WHERE id = ?', [updatedBalance, kantinId]);
      const [result] = await connection.query(
        `INSERT INTO kantin_transaksi
           (kantin_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
         VALUES (?, 'pencairan', ?, ?, ?, ?, ?)`,
        [kantinId, amount.value, updatedBalance, keterangan, idempotencyKey, req.user.id]
      );
      return {
        id: result.insertId,
        kantin_id: kantinId,
        tipe_transaksi: 'pencairan',
        jumlah: amount.value,
        saldo_akhir: updatedBalance,
        keterangan,
      };
    });
    if (!payout) return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    return res.status(payout.duplicate ? 200 : 201).json({
      message: payout.duplicate ? 'Pencairan sudah diproses sebelumnya.' : 'Pencairan saldo kantin berhasil.',
      data: payout,
    });
  } catch (error) {
    if (duplicateError(error)) {
      try {
        const [previous] = await pool.query(
          `SELECT id, kantin_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
           FROM kantin_transaksi WHERE idempotency_key = ? LIMIT 1`,
          [idempotencyKey]
        );
        if (previous.length) {
          const existing = previous[0];
          if (Number(existing.created_by) === req.user.id &&
              Number(existing.kantin_id) === kantinId &&
              existing.tipe_transaksi === 'pencairan' &&
              moneyToCents(existing.jumlah) === moneyToCents(amount.value) &&
              (existing.keterangan ?? null) === keterangan) {
            return res.status(200).json({
              message: 'Pencairan sudah diproses sebelumnya.',
              data: { id: existing.id, kantin_id: kantinId, tipe_transaksi: 'pencairan',
                jumlah: amount.value, saldo_akhir: existing.saldo_akhir, keterangan, duplicate: true },
            });
          }
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
        }
      } catch (lookupError) {
        console.error('Lookup idempotent canteen withdrawal error:', lookupError);
        return res.status(500).json({ message: 'Gagal memverifikasi status pencairan.' });
      }
    }
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
    }
    if (error.code === 'FINANCIAL_APPROVAL_REQUIRED') {
      return res.status(403).json({ message: 'Pencairan di atas ambang memerlukan persetujuan admin kedua.', approval_required: true });
    }
    if (error.code === 'FINANCIAL_APPROVAL_INVALID') {
      return res.status(409).json({ message: 'Persetujuan pencairan tidak cocok atau sudah digunakan.' });
    }
    if (error.code === 'CANTEEN_CASHIER_APPROVAL_REQUIRED') {
      return res.status(403).json({ message: error.message, cashier_approval_required: true });
    }
    if (error.code === 'CANTEEN_CASHIER_APPROVAL_INVALID') {
      return res.status(409).json({ message: error.message });
    }
    if (error.code === 'INSUFFICIENT_CANTEEN_BALANCE') {
      return res.status(409).json({ message: 'Saldo kantin tidak mencukupi untuk pencairan ini.' });
    }
    console.error('Create canteen withdrawal error:', error);
    return res.status(500).json({ message: 'Gagal mencairkan saldo kantin.' });
  }
};

export const getCanteenTransactions = async (req, res) => {
  const kantinId = parseId(req.params.id);
  if (!kantinId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const { page, limit } = parsePagination(req.query);
  const offset = (page - 1) * limit;
  const conditions = ['kt.kantin_id = ?'];
  const values = [kantinId];
  if (req.query.tipe_transaksi !== undefined) {
    if (!['penjualan', 'pencairan'].includes(req.query.tipe_transaksi)) {
      return res.status(400).json({ message: 'Jenis transaksi kantin tidak valid.' });
    }
    conditions.push('kt.tipe_transaksi = ?');
    values.push(req.query.tipe_transaksi);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  try {
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM kantin_transaksi kt ${where}`,
      values
    );
    const [rows] = await pool.query(
      `SELECT kt.id, kt.kantin_id, kt.transaksi_id, kt.tipe_transaksi,
              kt.jumlah, kt.saldo_akhir, kt.keterangan, kt.created_at,
              t.santri_id, s.nis, s.nama_lengkap
       FROM kantin_transaksi kt
       LEFT JOIN transaksi t ON t.id = kt.transaksi_id
       LEFT JOIN santri s ON s.id = t.santri_id
       ${where}
       ORDER BY kt.created_at DESC, kt.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return res.status(200).json({ data: rows, pagination: { page, limit, total: count.total } });
  } catch (error) {
    console.error('Get canteen transactions error:', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat saldo kantin.' });
  }
};
