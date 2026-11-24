import pool from '../config/db.js';
import { enqueueParentTransactionNotifications } from '../services/whatsappNotifications.js';
import {
  centsToMoney,
  duplicateError,
  getIdempotencyKey,
  idempotencyConflict,
  moneyToCents,
  normalizeSaleItems,
  parseId,
  runInTransaction,
} from './admin/shared.js';
import { calculateWeightedAverageCost } from './canteenPurchasingUtils.js';

const parseNote = (value, label, { required = false, max = 255 } = {}) => {
  if (value === undefined || value === null) {
    return required ? { error: `${label} wajib diisi.` } : { value: null };
  }
  if (typeof value !== 'string') return { error: `${label} tidak valid.` };
  const note = value.trim();
  if ((!note && required) || note.length > max) {
    return { error: `${label} ${required ? 'wajib diisi' : 'tidak valid'} dan maksimal ${max} karakter.` };
  }
  return { value: note || null };
};

const getShiftSummary = async (connection, shiftId) => {
  const [[summary]] = await connection.query(
    `SELECT
       COALESCE(SUM(CASE WHEN tipe_transaksi = 'belanja' THEN jumlah ELSE 0 END), 0) AS sales_total,
       COALESCE(SUM(CASE WHEN tipe_transaksi = 'refund_belanja' THEN jumlah ELSE 0 END), 0) AS refunds_total,
       SUM(tipe_transaksi = 'belanja') AS sales_count,
       SUM(tipe_transaksi = 'refund_belanja') AS refunds_count
     FROM transaksi WHERE canteen_shift_id = ?`,
    [shiftId]
  );
  return {
    sales_total: summary.sales_total,
    refunds_total: summary.refunds_total,
    net_total: centsToMoney(moneyToCents(summary.sales_total) - moneyToCents(summary.refunds_total)),
    sales_count: Number(summary.sales_count || 0),
    refunds_count: Number(summary.refunds_count || 0),
  };
};

export const getCurrentCanteenShift = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT id, kantin_id, cashier_id, status, opening_note, opened_at
       FROM canteen_shifts
       WHERE kantin_id = ? AND cashier_id = ? AND status = 'open'
       ORDER BY id DESC LIMIT 1`,
      [canteenId, req.user.id]
    );
    if (!rows.length) return res.status(200).json({ data: null });
    return res.status(200).json({
      data: { ...rows[0], ...(await getShiftSummary(pool, rows[0].id)) },
    });
  } catch (error) {
    console.error('Get current canteen shift error:', error);
    return res.status(500).json({ message: 'Gagal mengambil giliran kasir.' });
  }
};

export const getCanteenShiftHistory = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const requestedLimit = Number.parseInt(req.query.limit, 10) || 20;
  const limit = Math.min(100, Math.max(1, requestedLimit));
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT sh.id, sh.kantin_id, sh.cashier_id, u.username AS cashier_username,
              sh.status, sh.opening_note, sh.closing_note, sh.opened_at, sh.closed_at,
              COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'belanja' THEN t.jumlah ELSE 0 END), 0) AS sales_total,
              COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'refund_belanja' THEN t.jumlah ELSE 0 END), 0) AS refunds_total,
              SUM(t.tipe_transaksi = 'belanja') AS sales_count,
              SUM(t.tipe_transaksi = 'refund_belanja') AS refunds_count
       FROM canteen_shifts sh
       JOIN users u ON u.id = sh.cashier_id
       LEFT JOIN transaksi t ON t.canteen_shift_id = sh.id
       WHERE sh.kantin_id = ?
       GROUP BY sh.id
       ORDER BY sh.opened_at DESC, sh.id DESC LIMIT ?`,
      [canteenId, limit]
    );
    return res.status(200).json({
      data: rows.map((row) => ({
        ...row,
        net_total: centsToMoney(moneyToCents(row.sales_total) - moneyToCents(row.refunds_total)),
        sales_count: Number(row.sales_count || 0),
        refunds_count: Number(row.refunds_count || 0),
      })),
    });
  } catch (error) {
    console.error('Get canteen shift history error:', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat giliran kasir.' });
  }
};

export const openCanteenShift = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const note = parseNote(req.body?.opening_note, 'Catatan awal');
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  if (note.error) return res.status(400).json({ message: note.error });
  try {
    const shift = await runInTransaction(async (connection) => {
      const [canteens] = await connection.query(
        'SELECT id, status FROM kantin WHERE id = ? FOR UPDATE',
        [canteenId]
      );
      if (!canteens.length) return { notFound: true };
      if (canteens[0].status !== 'active') return { inactive: true };
      const [assignments] = await connection.query(
        'SELECT 1 FROM kantin_kasir WHERE kantin_id = ? AND user_id = ? LIMIT 1',
        [canteenId, req.user.id]
      );
      if (!assignments.length) return { forbidden: true };
      const [existing] = await connection.query(
        `SELECT id FROM canteen_shifts
         WHERE kantin_id = ? AND cashier_id = ? AND status = 'open'
         LIMIT 1 FOR UPDATE`,
        [canteenId, req.user.id]
      );
      if (existing.length) return { alreadyOpen: existing[0].id };
      const [result] = await connection.query(
        `INSERT INTO canteen_shifts (kantin_id, cashier_id, opening_note)
         VALUES (?, ?, ?)`,
        [canteenId, req.user.id, note.value]
      );
      return { id: result.insertId };
    });
    if (shift.notFound) return res.status(404).json({ message: 'Kantin tidak ditemukan.' });
    if (shift.inactive) return res.status(409).json({ message: 'Kantin tidak aktif.' });
    if (shift.forbidden) return res.status(403).json({ message: 'Akun tidak ditugaskan ke kantin ini.' });
    if (shift.alreadyOpen) {
      return res.status(409).json({ message: 'Giliran kasir sudah dibuka.', data: { id: shift.alreadyOpen } });
    }
    return res.status(201).json({ message: 'Giliran kasir dibuka.', data: { id: shift.id } });
  } catch (error) {
    console.error('Open canteen shift error:', error);
    return res.status(500).json({ message: 'Gagal membuka giliran kasir.' });
  }
};

export const closeCanteenShift = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const shiftId = parseId(req.params.shiftId);
  const note = parseNote(req.body?.closing_note, 'Catatan penutupan');
  if (!canteenId || !shiftId) return res.status(400).json({ message: 'ID kantin atau giliran tidak valid.' });
  if (note.error) return res.status(400).json({ message: note.error });
  try {
    const result = await runInTransaction(async (connection) => {
      await connection.query('SELECT id FROM kantin WHERE id = ? FOR UPDATE', [canteenId]);
      const [shifts] = await connection.query(
        `SELECT id FROM canteen_shifts
         WHERE id = ? AND kantin_id = ? AND cashier_id = ? AND status = 'open'
         FOR UPDATE`,
        [shiftId, canteenId, req.user.id]
      );
      if (!shifts.length) return null;
      const summary = await getShiftSummary(connection, shiftId);
      await connection.query(
        `UPDATE canteen_shifts SET status = 'closed', closed_at = CURRENT_TIMESTAMP,
          closing_note = ? WHERE id = ? AND status = 'open'`,
        [note.value, shiftId]
      );
      return summary;
    });
    if (!result) return res.status(404).json({ message: 'Giliran aktif tidak ditemukan.' });
    return res.status(200).json({ message: 'Giliran kasir ditutup.', data: { id: shiftId, ...result } });
  } catch (error) {
    console.error('Close canteen shift error:', error);
    return res.status(500).json({ message: 'Gagal menutup giliran kasir.' });
  }
};

export const getHeldCarts = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.label, c.items, c.created_at, c.updated_at, u.username AS cashier_username
       FROM canteen_held_carts c JOIN users u ON u.id = c.cashier_id
       WHERE c.kantin_id = ? AND c.cashier_id = ?
       ORDER BY c.updated_at DESC LIMIT 50`,
      [canteenId, req.user.id]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get held canteen carts error:', error);
    return res.status(500).json({ message: 'Gagal mengambil keranjang tertahan.' });
  }
};

export const saveHeldCart = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const cartId = req.params.cartId === undefined ? null : parseId(req.params.cartId);
  const label = parseNote(req.body?.label, 'Nama keranjang', { required: true, max: 80 });
  const normalized = normalizeSaleItems(req.body?.items);
  if (!canteenId || (req.params.cartId !== undefined && !cartId)) {
    return res.status(400).json({ message: 'ID kantin atau keranjang tidak valid.' });
  }
  if (label.error) return res.status(400).json({ message: label.error });
  if (normalized.error) return res.status(400).json({ message: normalized.error });
  try {
    const saved = await runInTransaction(async (connection) => {
      const [canteens] = await connection.query(
        'SELECT id FROM kantin WHERE id = ? FOR UPDATE',
        [canteenId]
      );
      if (!canteens.length) return { canteenNotFound: true };
      const [products] = await connection.query(
        `SELECT id FROM canteen_products
         WHERE kantin_id = ? AND is_active = TRUE AND id IN (?)`,
        [canteenId, normalized.items.map((item) => item.product_id)]
      );
      if (products.length !== normalized.items.length) return { productsUnavailable: true };
      if (cartId) {
        const [existing] = await connection.query(
          `SELECT id FROM canteen_held_carts
           WHERE id = ? AND kantin_id = ? AND cashier_id = ? FOR UPDATE`,
          [cartId, canteenId, req.user.id]
        );
        if (!existing.length) return { notFound: true };
        const [result] = await connection.query(
          `UPDATE canteen_held_carts SET label = ?, items = ?
           WHERE id = ? AND kantin_id = ? AND cashier_id = ?`,
          [label.value, JSON.stringify(normalized.items), cartId, canteenId, req.user.id]
        );
        if (!result.affectedRows) return { notFound: true };
        return { id: cartId };
      }
      const [[count]] = await connection.query(
        'SELECT COUNT(*) AS total FROM canteen_held_carts WHERE kantin_id = ? AND cashier_id = ?',
        [canteenId, req.user.id]
      );
      if (Number(count.total) >= 50) return { cartLimit: true };
      const [result] = await connection.query(
        `INSERT INTO canteen_held_carts (kantin_id, cashier_id, label, items)
         VALUES (?, ?, ?, ?)`,
        [canteenId, req.user.id, label.value, JSON.stringify(normalized.items)]
      );
      return { id: result.insertId };
    });
    if (saved.canteenNotFound) return res.status(404).json({ message: 'Kantin tidak ditemukan.' });
    if (saved.productsUnavailable) return res.status(409).json({ message: 'Satu atau beberapa produk tidak tersedia lagi.' });
    if (saved.notFound) return res.status(404).json({ message: 'Keranjang tidak ditemukan.' });
    if (saved.cartLimit) return res.status(409).json({ message: 'Maksimal 50 keranjang tertahan per kantin. Hapus antrean lama untuk menyimpan keranjang baru.' });
    return res.status(cartId ? 200 : 201).json({ message: 'Keranjang berhasil disimpan.', data: saved });
  } catch (error) {
    console.error('Save held canteen cart error:', error);
    return res.status(500).json({ message: 'Gagal menyimpan keranjang.' });
  }
};

export const deleteHeldCart = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const cartId = parseId(req.params.cartId);
  if (!canteenId || !cartId) return res.status(400).json({ message: 'ID kantin atau keranjang tidak valid.' });
  try {
    const [result] = await pool.query(
      'DELETE FROM canteen_held_carts WHERE id = ? AND kantin_id = ? AND cashier_id = ?',
      [cartId, canteenId, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Keranjang tidak ditemukan.' });
    return res.status(200).json({ message: 'Keranjang tertahan dihapus.' });
  } catch (error) {
    console.error('Delete held canteen cart error:', error);
    return res.status(500).json({ message: 'Gagal menghapus keranjang tertahan.' });
  }
};

export const refundCanteenSale = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const transactionId = parseId(req.params.transactionId);
  const reason = parseNote(req.body?.reason, 'Alasan refund', { required: true, max: 500 });
  const restock = req.body?.restock;
  const idempotencyKey = getIdempotencyKey(req);
  if (!canteenId || !transactionId) return res.status(400).json({ message: 'ID kantin atau transaksi tidak valid.' });
  if (reason.error || reason.value?.length < 5) {
    return res.status(400).json({ message: reason.error || 'Alasan refund minimal 5 karakter.' });
  }
  if (typeof restock !== 'boolean') return res.status(400).json({ message: 'Konfirmasi barang kembali wajib berupa nilai boolean.' });
  if (!idempotencyKey) return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  try {
    const refund = await runInTransaction(async (connection) => {
      const [canteens] = await connection.query(
        'SELECT saldo, status FROM kantin WHERE id = ? FOR UPDATE',
        [canteenId]
      );
      if (!canteens.length) return { notFound: 'canteen' };
      const [previous] = await connection.query(
        `SELECT r.id, r.refund_transaksi_id, r.original_transaksi_id,
                r.cashier_id, r.idempotency_key, r.reason, r.restocked, t.jumlah, t.saldo_akhir
         FROM canteen_sale_refunds r
         JOIN transaksi t ON t.id = r.refund_transaksi_id
         WHERE r.original_transaksi_id = ? FOR UPDATE`,
        [transactionId]
      );
      if (previous.length) {
        const row = previous[0];
        if (row.idempotency_key !== idempotencyKey) return { duplicateConflict: true };
        if (Number(row.cashier_id) !== req.user.id || row.reason !== reason.value ||
            Boolean(row.restocked) !== restock) throw idempotencyConflict();
        return { duplicate: true, transaksi_id: row.refund_transaksi_id, jumlah: row.jumlah, saldo_akhir: row.saldo_akhir };
      }
      const [shifts] = await connection.query(
        `SELECT id FROM canteen_shifts
         WHERE kantin_id = ? AND cashier_id = ? AND status = 'open'
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [canteenId, req.user.id]
      );
      if (!shifts.length) return { shiftRequired: true };
      const [sales] = await connection.query(
        `SELECT id, santri_id, jumlah, created_by
         FROM transaksi
         WHERE id = ? AND kantin_id = ? AND tipe_transaksi = 'belanja'
         FOR UPDATE`,
        [transactionId, canteenId]
      );
      if (!sales.length) return { notFound: 'sale' };
      if (Number(sales[0].created_by) !== req.user.id) return { forbidden: true };
      const [[alreadyRefunded]] = await connection.query(
        'SELECT id FROM canteen_sale_refunds WHERE original_transaksi_id = ? LIMIT 1',
        [transactionId]
      );
      if (alreadyRefunded) return { duplicateConflict: true };
      const amountCents = moneyToCents(sales[0].jumlah);
      const canteenBalanceCents = moneyToCents(canteens[0].saldo || '0.00');
      if (canteenBalanceCents < amountCents) return { insufficientCanteenBalance: true };
      const canteenBalance = centsToMoney(canteenBalanceCents - amountCents);
      const [items] = await connection.query(
        `SELECT product_id, quantity, harga_pokok_satuan FROM canteen_sale_items
         WHERE transaksi_id = ? ORDER BY product_id FOR UPDATE`,
        [transactionId]
      );
      let restockProducts = [];
      if (restock && items.length) {
        const [products] = await connection.query(
          `SELECT id, stok, average_unit_cost FROM canteen_products
           WHERE kantin_id = ? AND id IN (?) ORDER BY id FOR UPDATE`,
          [canteenId, items.map((item) => item.product_id)]
        );
        const productMap = new Map(products.map((product) => [Number(product.id), product]));
        restockProducts = items.map((item) => {
          const product = productMap.get(Number(item.product_id));
          if (!product) throw new Error(`Product ${item.product_id} for sale ${transactionId} is missing.`);
          const stockAfter = Number(product.stok) + Number(item.quantity);
          if (!Number.isSafeInteger(stockAfter) || stockAfter > 4294967295) {
            return { stockLimit: true };
          }
          return { ...item, product, stockAfter };
        });
        if (restockProducts.some((item) => item.stockLimit)) return { stockLimit: true };
      }
      const [students] = await connection.query(
        'SELECT saldo FROM santri WHERE id = ? FOR UPDATE',
        [sales[0].santri_id]
      );
      if (!students.length) return { notFound: 'student' };
      const studentBalanceCents = moneyToCents(students[0].saldo || '0.00') + amountCents;
      if (studentBalanceCents > 999999999999n) return { studentBalanceLimit: true };
      const studentBalance = centsToMoney(studentBalanceCents);
      const description = `Refund transaksi #${transactionId}: ${reason.value}`;
      const [ledger] = await connection.query(
        `INSERT INTO transaksi
           (santri_id, kantin_id, tipe_transaksi, jumlah, saldo_akhir, created_by,
            keterangan, idempotency_key, canteen_shift_id)
         VALUES (?, ?, 'refund_belanja', ?, ?, ?, ?, ?, ?)`,
        [sales[0].santri_id, canteenId, centsToMoney(amountCents), studentBalance,
          req.user.id, description, idempotencyKey, shifts[0].id]
      );
      await connection.query('UPDATE santri SET saldo = ? WHERE id = ?', [studentBalance, sales[0].santri_id]);
      await connection.query('UPDATE kantin SET saldo = ? WHERE id = ?', [canteenBalance, canteenId]);
      for (const item of restockProducts) {
        let averageCost = item.product.average_unit_cost;
        if (item.harga_pokok_satuan !== null &&
            (Number(item.product.stok) === 0 || moneyToCents(item.product.average_unit_cost || '0.00') > 0n)) {
          averageCost = calculateWeightedAverageCost(
            item.product.stok,
            item.product.average_unit_cost,
            item.quantity,
            item.harga_pokok_satuan,
          );
        }
        await connection.query(
          'UPDATE canteen_products SET stok = ?, average_unit_cost = ? WHERE id = ?',
          [item.stockAfter, averageCost, item.product.id]
        );
        await connection.query(
          `INSERT INTO canteen_stock_movements
             (product_id, transaksi_id, user_id, movement_type, quantity_change, stock_after, note)
           VALUES (?, ?, ?, 'refund', ?, ?, ?)`,
          [item.product.id, ledger.insertId, req.user.id, item.quantity, item.stockAfter,
            `Restok refund transaksi #${transactionId}`]
        );
      }
      await connection.query(
        `INSERT INTO canteen_sale_refunds
           (original_transaksi_id, refund_transaksi_id, shift_id, cashier_id, idempotency_key, reason, restocked)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [transactionId, ledger.insertId, shifts[0].id, req.user.id, idempotencyKey, reason.value, restock]
      );
      await connection.query(
        `INSERT INTO kantin_transaksi
           (kantin_id, transaksi_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, created_by)
         VALUES (?, ?, 'refund', ?, ?, ?, ?)`,
        [canteenId, ledger.insertId, centsToMoney(amountCents), canteenBalance, description, req.user.id]
      );
      await enqueueParentTransactionNotifications(connection, ledger.insertId);
      return {
        transaksi_id: ledger.insertId,
        original_transaksi_id: transactionId,
        jumlah: centsToMoney(amountCents),
        santri: { id: sales[0].santri_id, saldo: studentBalance },
        kantin: { id: canteenId, saldo: canteenBalance },
        restocked: restock && items.length > 0,
      };
    });
    if (refund.notFound === 'canteen') return res.status(404).json({ message: 'Kantin tidak ditemukan.' });
    if (refund.notFound === 'sale') return res.status(404).json({ message: 'Transaksi penjualan tidak ditemukan.' });
    if (refund.notFound === 'student') return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    if (refund.forbidden) return res.status(403).json({ message: 'Refund hanya dapat diproses oleh kasir yang mencatat transaksi tersebut.' });
    if (refund.shiftRequired) return res.status(409).json({ message: 'Buka giliran kasir sebelum memproses refund.' });
    if (refund.insufficientCanteenBalance) return res.status(409).json({ message: 'Saldo kantin tidak mencukupi untuk refund ini.' });
    if (refund.stockLimit) return res.status(409).json({ message: 'Stok produk akan melebihi kapasitas maksimum.' });
    if (refund.studentBalanceLimit) return res.status(409).json({ message: 'Saldo santri tidak dapat menampung pengembalian dana ini.' });
    if (refund.duplicateConflict) return res.status(409).json({ message: 'Transaksi ini telah direfund.' });
    return res.status(refund.duplicate ? 200 : 201).json({
      message: refund.duplicate ? 'Refund sudah diproses sebelumnya.' : 'Refund berhasil dikembalikan ke saldo santri.',
      data: refund,
    });
  } catch (error) {
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Kunci idempotensi sudah dipakai untuk refund lain.' });
    }
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'Refund atau kunci idempotensi sudah pernah diproses.' });
    }
    console.error('Refund canteen sale error:', error);
    return res.status(500).json({ message: 'Gagal memproses refund transaksi kantin.' });
  }
};

export const isValidCanteenReportDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const escapeCanteenCsvCell = (value, formulaSafe = false) => {
  let text = String(value ?? '');
  if (formulaSafe && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export const getCanteenSalesReport = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const { from, to, cashier_id: cashierId, product_id: productId } = req.query;
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  if (!isValidCanteenReportDate(from) || !isValidCanteenReportDate(to) || from > to) {
    return res.status(400).json({ message: 'Rentang tanggal laporan tidak valid.' });
  }
  const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (rangeDays > 365) return res.status(400).json({ message: 'Rentang laporan maksimal 366 hari.' });
  const parsedCashierId = cashierId === undefined ? null : parseId(cashierId);
  const parsedProductId = productId === undefined ? null : parseId(productId);
  if ((cashierId !== undefined && !parsedCashierId) || (productId !== undefined && !parsedProductId)) {
    return res.status(400).json({ message: 'Filter kasir atau produk tidak valid.' });
  }
  const conditions = [
    't.kantin_id = ?',
    "t.tipe_transaksi IN ('belanja', 'refund_belanja')",
    't.created_at >= ?',
    't.created_at < DATE_ADD(?, INTERVAL 1 DAY)',
  ];
  const values = [canteenId, from, to];
  if (parsedCashierId) {
    conditions.push('t.created_by = ?');
    values.push(parsedCashierId);
  }
  if (parsedProductId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM canteen_sale_items filter_item
      WHERE filter_item.transaksi_id = COALESCE(ref.original_transaksi_id, t.id)
        AND filter_item.product_id = ?
    )`);
    values.push(parsedProductId);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const itemCostFilter = parsedProductId ? 'WHERE product_id = ?' : '';
  const itemCostValues = parsedProductId ? [parsedProductId] : [];
  try {
    const [[summary]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'belanja' THEN t.jumlah ELSE 0 END), 0) AS sales_total,
         COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'refund_belanja' THEN t.jumlah ELSE 0 END), 0) AS refunds_total,
         SUM(t.tipe_transaksi = 'belanja') AS sales_count,
         SUM(t.tipe_transaksi = 'refund_belanja') AS refunds_count,
         COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'belanja'
           AND item_costs.item_count > 0 AND item_costs.cost_count = item_costs.item_count
           THEN item_costs.sale_revenue ELSE 0 END), 0) AS costed_sales_total,
         COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'refund_belanja'
           AND item_costs.item_count > 0 AND item_costs.cost_count = item_costs.item_count
           THEN item_costs.sale_revenue ELSE 0 END), 0) AS costed_refunds_total,
         COALESCE(SUM(CASE
           WHEN t.tipe_transaksi = 'belanja'
             AND item_costs.item_count > 0 AND item_costs.cost_count = item_costs.item_count
             THEN item_costs.cost_of_goods
           WHEN t.tipe_transaksi = 'refund_belanja' AND ref.restocked = TRUE
             AND item_costs.item_count > 0 AND item_costs.cost_count = item_costs.item_count
             THEN -item_costs.cost_of_goods
           ELSE 0 END), 0) AS net_cost_of_goods,
         SUM(CASE WHEN item_costs.item_count > 0
           AND item_costs.cost_count = item_costs.item_count THEN 1 ELSE 0 END) AS costed_transactions,
         SUM(CASE WHEN item_costs.item_count IS NULL OR item_costs.item_count = 0
           OR item_costs.cost_count <> item_costs.item_count THEN 1 ELSE 0 END) AS transactions_without_cost
       FROM transaksi t
       LEFT JOIN canteen_sale_refunds ref ON ref.refund_transaksi_id = t.id
       LEFT JOIN (
         SELECT transaksi_id, SUM(subtotal) AS sale_revenue,
                SUM(total_harga_pokok) AS cost_of_goods, COUNT(*) AS item_count,
                COUNT(total_harga_pokok) AS cost_count
         FROM canteen_sale_items ${itemCostFilter}
         GROUP BY transaksi_id
       ) item_costs ON item_costs.transaksi_id = COALESCE(ref.original_transaksi_id, t.id)
       ${where}`,
      [...itemCostValues, ...values]
    );
    if (req.query.format === 'csv') {
      const [[count]] = await pool.query(
        `SELECT COUNT(*) AS total FROM transaksi t
         LEFT JOIN canteen_sale_refunds ref ON ref.refund_transaksi_id = t.id ${where}`,
        values
      );
      if (Number(count.total) > 20000) {
        return res.status(413).json({ message: 'Laporan CSV melebihi 20.000 transaksi. Persempit rentang tanggal atau gunakan filter.' });
      }
      const [rows] = await pool.query(
        `SELECT t.id, t.tipe_transaksi, t.jumlah, t.keterangan, t.created_at,
                s.nama_lengkap AS student_name, s.nis,
                u.username AS cashier_username, ref.reason AS refund_reason
         FROM transaksi t
         LEFT JOIN canteen_sale_refunds ref ON ref.refund_transaksi_id = t.id
         LEFT JOIN santri s ON s.id = t.santri_id
         LEFT JOIN users u ON u.id = t.created_by
         ${where}
         ORDER BY t.created_at DESC, t.id DESC`,
        values
      );
      const lines = [
        ['ID Transaksi', 'Jenis', 'Waktu', 'Nama Santri', 'NIS', 'Kasir', 'Nominal', 'Alasan Refund']
          .map((cell) => escapeCanteenCsvCell(cell)).join(','),
        ...rows.map((row) => [
          row.id,
          row.tipe_transaksi === 'belanja' ? 'Penjualan' : 'Refund',
          row.created_at,
          row.student_name,
          row.nis,
          row.cashier_username,
          row.tipe_transaksi === 'belanja' ? row.jumlah : `-${row.jumlah}`,
          row.refund_reason || row.keterangan,
        ].map((cell, index) => escapeCanteenCsvCell(cell, [3, 4, 5, 7].includes(index))).join(','),
        ),
      ];
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="laporan-kantin-${from}-${to}.csv"`,
      });
      return res.status(200).send(`\uFEFF${lines.join('\r\n')}`);
    }
    const requestedPage = Number.parseInt(req.query.page, 10) || 1;
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 20;
    const page = Math.max(1, requestedPage);
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const [rows] = await pool.query(
      `SELECT t.id, t.tipe_transaksi, t.jumlah, t.keterangan, t.created_at,
              s.nama_lengkap AS student_name, s.nis, u.username AS cashier_username,
              ref.reason AS refund_reason, ref.restocked
       FROM transaksi t
       LEFT JOIN canteen_sale_refunds ref ON ref.refund_transaksi_id = t.id
       LEFT JOIN santri s ON s.id = t.santri_id
       LEFT JOIN users u ON u.id = t.created_by
       ${where}
       ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit]
    );
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM transaksi t
       LEFT JOIN canteen_sale_refunds ref ON ref.refund_transaksi_id = t.id ${where}`,
      values
    );
    return res.status(200).json({
      data: rows,
      summary: {
        sales_total: summary.sales_total,
        refunds_total: summary.refunds_total,
        net_total: centsToMoney(moneyToCents(summary.sales_total) - moneyToCents(summary.refunds_total)),
        sales_count: Number(summary.sales_count || 0),
        refunds_count: Number(summary.refunds_count || 0),
        margin: (() => {
          const revenue = moneyToCents(summary.costed_sales_total || '0.00');
          const refunds = moneyToCents(summary.costed_refunds_total || '0.00');
          const costOfGoods = moneyToCents(summary.net_cost_of_goods || '0.00');
          const netSales = revenue - refunds;
          const grossProfit = netSales - costOfGoods;
          return {
            costed_sales_total: centsToMoney(revenue),
            costed_refunds_total: centsToMoney(refunds),
            net_cost_of_goods: centsToMoney(costOfGoods),
            gross_profit: centsToMoney(grossProfit),
            gross_margin_percent: netSales > 0n
              ? centsToMoney(grossProfit * 10000n / netSales)
              : null,
            costed_transactions: Number(summary.costed_transactions || 0),
            transactions_without_cost: Number(summary.transactions_without_cost || 0),
          };
        })(),
      },
      pagination: { page, limit, total: Number(count.total) },
    });
  } catch (error) {
    console.error('Get canteen sales report error:', error);
    return res.status(500).json({ message: 'Gagal mengambil laporan penjualan kantin.' });
  }
};
