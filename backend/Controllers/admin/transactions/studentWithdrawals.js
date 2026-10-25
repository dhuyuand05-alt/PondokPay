import pool from '../../../config/db.js';
import { consumeFinancialApproval } from '../../../services/financialApprovals.js';
import { collectCurrentServiceFeeDebt } from '../../../services/monthlyServiceFees.js';
import { enqueueParentTransactionNotifications } from '../../../services/whatsappNotifications.js';
import { centsToMoney, duplicateError, getIdempotencyKey, idempotencyConflict, moneyToCents, parseId, parseMoney, runInTransaction } from '../shared.js';

export const createWithdrawal = async (req, res) => {
  const santriId = parseId(req.params.id);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  }
  const amount = parseMoney(req.body.jumlah, 'jumlah');
  if (amount.error || !amount.value || Number(amount.value) <= 0) {
    return res.status(400).json({ message: amount.error || 'Jumlah penarikan harus lebih dari 0.' });
  }
  const keterangan = req.body.keterangan ?? null;
  if (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 65535)) {
    return res.status(400).json({ message: 'Keterangan transaksi tidak valid.' });
  }

  try {
    const transaction = await runInTransaction(async (connection) => {
      const [students] = await connection.query(
        'SELECT saldo, is_active FROM santri WHERE id = ? FOR UPDATE',
        [santriId]
      );
      if (!students.length) return null;
      const [previous] = await connection.query(
        `SELECT id, santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
         FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (previous.length) {
        const existing = previous[0];
        if (Number(existing.created_by) !== req.user.id ||
            Number(existing.santri_id) !== santriId ||
            existing.tipe_transaksi !== 'tarik' ||
            moneyToCents(existing.jumlah) !== moneyToCents(amount.value) ||
            (existing.keterangan ?? null) !== keterangan) {
          throw idempotencyConflict();
        }
        return {
          id: existing.id,
          santri_id: santriId,
          tipe_transaksi: 'tarik',
          jumlah: amount.value,
          saldo_akhir: existing.saldo_akhir,
          keterangan,
          duplicate: true,
        };
      }
      if (!students[0].is_active) return null;
      await consumeFinancialApproval(
        connection, req, 'santri_withdrawal', santriId, amount.value, keterangan
      );
      const currentCents = moneyToCents(students[0].saldo ?? '0.00');
      const amountCents = moneyToCents(amount.value);
      if (amountCents > currentCents) {
        const error = new Error('Saldo santri tidak mencukupi.');
        error.code = 'INSUFFICIENT_STUDENT_BALANCE';
        throw error;
      }

      const updatedBalance = centsToMoney(currentCents - amountCents);
      await connection.query('UPDATE santri SET saldo = ? WHERE id = ?', [updatedBalance, santriId]);
      const [result] = await connection.query(
        `INSERT INTO transaksi
           (santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
         VALUES (?, 'tarik', ?, ?, ?, ?, ?)`,
        [santriId, amount.value, updatedBalance, keterangan, idempotencyKey, req.user.id]
      );
      await enqueueParentTransactionNotifications(connection, result.insertId);
      return {
        id: result.insertId,
        santri_id: santriId,
        tipe_transaksi: 'tarik',
        jumlah: amount.value,
        saldo_akhir: updatedBalance,
        keterangan,
      };
    });
    if (!transaction) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(transaction.duplicate ? 200 : 201).json({
      message: transaction.duplicate ? 'Penarikan sudah diproses sebelumnya.' : 'Penarikan saldo santri berhasil.',
      data: transaction,
    });
  } catch (error) {
    if (duplicateError(error)) {
      try {
        const [previous] = await pool.query(
          `SELECT id, santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by
           FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
          [idempotencyKey]
        );
        if (previous.length) {
          const existing = previous[0];
          if (Number(existing.created_by) === req.user.id &&
              Number(existing.santri_id) === santriId &&
              existing.tipe_transaksi === 'tarik' &&
              moneyToCents(existing.jumlah) === moneyToCents(amount.value) &&
              (existing.keterangan ?? null) === keterangan) {
            return res.status(200).json({
              message: 'Penarikan sudah diproses sebelumnya.',
              data: { id: existing.id, santri_id: santriId, tipe_transaksi: 'tarik',
                jumlah: amount.value, saldo_akhir: existing.saldo_akhir, keterangan, duplicate: true },
            });
          }
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
        }
      } catch (lookupError) {
        console.error('Lookup idempotent withdrawal error:', lookupError);
        return res.status(500).json({ message: 'Gagal memverifikasi status penarikan.' });
      }
    }
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
    }
    if (error.code === 'FINANCIAL_APPROVAL_REQUIRED') {
      return res.status(403).json({ message: 'Penarikan di atas ambang memerlukan persetujuan admin kedua.', approval_required: true });
    }
    if (error.code === 'FINANCIAL_APPROVAL_INVALID') {
      return res.status(409).json({ message: 'Persetujuan penarikan tidak cocok atau sudah digunakan.' });
    }
    if (error.code === 'INSUFFICIENT_STUDENT_BALANCE') {
      return res.status(409).json({ message: 'Saldo santri tidak mencukupi untuk penarikan ini.' });
    }
    console.error('Create withdrawal error:', error);
    return res.status(500).json({ message: 'Gagal menarik saldo santri.' });
  }
};
