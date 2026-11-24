import { createHash } from 'node:crypto';
import pool from '../config/db.js';
import {
  centsToMoney,
  duplicateError,
  getIdempotencyKey,
  idempotencyConflict,
  moneyToCents,
  parseId,
  parsePagination,
  runInTransaction,
} from './admin/shared.js';
import {
  calculateWeightedAverageCost,
  isValidPurchaseDate,
  normalizePurchaseItems,
} from './canteenPurchasingUtils.js';

const hashRequest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parseText = (value, label, max, { required = false } = {}) => {
  if (value === undefined || value === null) {
    return required ? { error: `${label} wajib diisi.` } : { value: null };
  }
  if (typeof value !== 'string') return { error: `${label} tidak valid.` };
  const text = value.trim();
  if ((required && !text) || text.length > max) return { error: `${label} tidak valid (maksimal ${max} karakter).` };
  return { value: text || null };
};

const parseOptionalDate = (value, label) => {
  if (value === undefined || value === null || value === '') return { value: null };
  if (!isValidPurchaseDate(value)) return { error: `${label} harus berupa tanggal kalender yang valid.` };
  return { value };
};

const parsePaymentAmount = (value) => {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(value))) {
    return { error: 'Nominal pembayaran tidak valid.' };
  }
  const [whole, fraction = ''] = String(value).split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return cents > 0n && cents <= 999999999999n
    ? { cents }
    : { error: 'Nominal pembayaran harus lebih besar dari nol dan masih dalam batas.' };
};

const supplierFields = [
  ['name', 'Nama pemasok', 120],
  ['contact_name', 'Nama kontak', 120],
  ['phone', 'Nomor telepon', 40],
  ['email', 'Email', 190],
  ['address', 'Alamat', 255],
  ['notes', 'Catatan', 255],
];

export const getCanteenSuppliers = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const [rows] = await pool.query(
      `SELECT id, name, contact_name, phone, email, address, notes, is_active, created_at, updated_at
       FROM canteen_suppliers
       WHERE kantin_id = ? ${includeInactive ? '' : 'AND is_active = TRUE'}
       ORDER BY is_active DESC, name`,
      [canteenId]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get canteen suppliers error:', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar pemasok.' });
  }
};

export const createCanteenSupplier = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const values = {};
  for (const [field, label, max] of supplierFields) {
    const parsed = parseText(req.body?.[field], label, max, { required: field === 'name' });
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    values[field] = parsed.value;
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return res.status(400).json({ message: 'Alamat email pemasok tidak valid.' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO canteen_suppliers
         (kantin_id, name, contact_name, phone, email, address, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [canteenId, values.name, values.contact_name, values.phone, values.email,
        values.address, values.notes, req.user.id]
    );
    return res.status(201).json({
      message: 'Pemasok berhasil ditambahkan.',
      data: { id: result.insertId, ...values, is_active: 1 },
    });
  } catch (error) {
    console.error('Create canteen supplier error:', error);
    return res.status(500).json({ message: 'Gagal menambahkan pemasok.' });
  }
};

export const updateCanteenSupplier = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const supplierId = parseId(req.params.supplierId);
  if (!canteenId || !supplierId) return res.status(400).json({ message: 'ID kantin atau pemasok tidak valid.' });
  const updates = [];
  const values = [];
  for (const [field, label, max] of supplierFields) {
    if (req.body?.[field] === undefined) continue;
    const parsed = parseText(req.body[field], label, max, { required: field === 'name' });
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    if (field === 'email' && parsed.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.value)) {
      return res.status(400).json({ message: 'Alamat email pemasok tidak valid.' });
    }
    updates.push(`${field} = ?`);
    values.push(parsed.value);
  }
  if (req.body?.is_active !== undefined) {
    if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ message: 'Status pemasok tidak valid.' });
    updates.push('is_active = ?');
    values.push(req.body.is_active);
  }
  if (!updates.length) return res.status(400).json({ message: 'Tidak ada perubahan pemasok yang dikirim.' });
  try {
    const [result] = await pool.query(
      `UPDATE canteen_suppliers SET ${updates.join(', ')}
       WHERE id = ? AND kantin_id = ?`,
      [...values, supplierId, canteenId]
    );
    if (!result.affectedRows) {
      const [existing] = await pool.query(
        'SELECT id FROM canteen_suppliers WHERE id = ? AND kantin_id = ?',
        [supplierId, canteenId]
      );
      if (!existing.length) return res.status(404).json({ message: 'Pemasok tidak ditemukan.' });
    }
    return res.status(200).json({ message: 'Data pemasok berhasil diperbarui.' });
  } catch (error) {
    console.error('Update canteen supplier error:', error);
    return res.status(500).json({ message: 'Gagal memperbarui pemasok.' });
  }
};

export const getCanteenPurchases = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const { page, limit } = parsePagination(req.query);
  const conditions = ['r.kantin_id = ?'];
  const values = [canteenId];
  if (req.query.supplier_id !== undefined) {
    const supplierId = parseId(req.query.supplier_id);
    if (!supplierId) return res.status(400).json({ message: 'Filter pemasok tidak valid.' });
    conditions.push('r.supplier_id = ?');
    values.push(supplierId);
  }
  if (req.query.status !== undefined) {
    if (!['unpaid', 'partial', 'paid'].includes(req.query.status)) {
      return res.status(400).json({ message: 'Filter status pembayaran tidak valid.' });
    }
    const paidValue = 'COALESCE(payments.total_paid, 0)';
    const statusCondition = req.query.status === 'paid'
      ? `${paidValue} >= r.total_amount`
      : req.query.status === 'partial'
        ? `${paidValue} > 0 AND ${paidValue} < r.total_amount`
        : `${paidValue} = 0`;
    conditions.push(statusCondition);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  try {
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM canteen_purchase_receipts r
       LEFT JOIN (
         SELECT purchase_id, SUM(amount) AS total_paid
         FROM canteen_supplier_payments GROUP BY purchase_id
       ) payments ON payments.purchase_id = r.id
       ${where}`,
      values
    );
    const [rows] = await pool.query(
      `SELECT r.id, r.supplier_id, COALESCE(r.supplier_name, s.name) AS supplier_name, r.invoice_number,
              r.invoice_date, r.due_date, r.total_amount, r.note, r.received_by, r.received_at,
              COALESCE(payments.total_paid, 0.00) AS total_paid,
              GREATEST(r.total_amount - COALESCE(payments.total_paid, 0.00), 0.00) AS outstanding,
              CASE WHEN COALESCE(payments.total_paid, 0) >= r.total_amount THEN 'paid'
                   WHEN COALESCE(payments.total_paid, 0) > 0 THEN 'partial'
                   ELSE 'unpaid' END AS payment_status
       FROM canteen_purchase_receipts r
       JOIN canteen_suppliers s ON s.id = r.supplier_id
       LEFT JOIN (
         SELECT purchase_id, SUM(amount) AS total_paid
         FROM canteen_supplier_payments GROUP BY purchase_id
       ) payments ON payments.purchase_id = r.id
       ${where}
       ORDER BY r.received_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit]
    );
    const [[summary]] = await pool.query(
      `SELECT COALESCE(SUM(r.total_amount), 0.00) AS total_amount,
              COALESCE(SUM(COALESCE(payments.total_paid, 0.00)), 0.00) AS total_paid,
              COALESCE(SUM(GREATEST(r.total_amount - COALESCE(payments.total_paid, 0.00), 0.00)), 0.00) AS outstanding,
              COALESCE(SUM(CASE WHEN COALESCE(payments.total_paid, 0) < r.total_amount THEN 1 ELSE 0 END), 0) AS open_invoices
       FROM canteen_purchase_receipts r
       LEFT JOIN (
         SELECT purchase_id, SUM(amount) AS total_paid
         FROM canteen_supplier_payments GROUP BY purchase_id
       ) payments ON payments.purchase_id = r.id
       WHERE r.kantin_id = ?`,
      [canteenId]
    );
    return res.status(200).json({
      data: rows,
      summary,
      pagination: { page, limit, total: Number(count.total) },
    });
  } catch (error) {
    console.error('Get canteen purchases error:', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar faktur pembelian.' });
  }
};

export const getCanteenPurchase = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const purchaseId = parseId(req.params.purchaseId);
  if (!canteenId || !purchaseId) return res.status(400).json({ message: 'ID kantin atau faktur tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.supplier_id, COALESCE(r.supplier_name, s.name) AS supplier_name, r.invoice_number,
              r.invoice_date, r.due_date, r.total_amount, r.note, r.received_by, r.received_at,
              COALESCE(payments.total_paid, 0.00) AS total_paid,
              GREATEST(r.total_amount - COALESCE(payments.total_paid, 0.00), 0.00) AS outstanding,
              CASE WHEN COALESCE(payments.total_paid, 0) >= r.total_amount THEN 'paid'
                   WHEN COALESCE(payments.total_paid, 0) > 0 THEN 'partial'
                   ELSE 'unpaid' END AS payment_status
       FROM canteen_purchase_receipts r
       JOIN canteen_suppliers s ON s.id = r.supplier_id
       LEFT JOIN (
         SELECT purchase_id, SUM(amount) AS total_paid
         FROM canteen_supplier_payments GROUP BY purchase_id
       ) payments ON payments.purchase_id = r.id
       WHERE r.id = ? AND r.kantin_id = ?`,
      [purchaseId, canteenId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Faktur pembelian tidak ditemukan.' });
    const [items] = await pool.query(
      `SELECT id, product_id, product_name, quantity, unit_cost, subtotal
       FROM canteen_purchase_items WHERE purchase_id = ? ORDER BY id`,
      [purchaseId]
    );
    const [payments] = await pool.query(
      `SELECT id, amount, method, reference_code, note, paid_by, paid_at
       FROM canteen_supplier_payments WHERE purchase_id = ? ORDER BY paid_at DESC, id DESC`,
      [purchaseId]
    );
    return res.status(200).json({ data: { ...rows[0], items, payments } });
  } catch (error) {
    console.error('Get canteen purchase detail error:', error);
    return res.status(500).json({ message: 'Gagal mengambil rincian faktur pembelian.' });
  }
};

export const receiveCanteenPurchase = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const supplierId = parseId(req.body?.supplier_id);
  const idempotencyKey = getIdempotencyKey(req);
  if (!canteenId || !supplierId) return res.status(400).json({ message: 'ID kantin atau pemasok tidak valid.' });
  if (!idempotencyKey) return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  const invoiceNumber = parseText(req.body?.invoice_number, 'Nomor faktur', 80, { required: true });
  const invoiceDate = parseOptionalDate(req.body?.invoice_date, 'Tanggal faktur');
  const dueDate = parseOptionalDate(req.body?.due_date, 'Tanggal jatuh tempo');
  const note = parseText(req.body?.note, 'Catatan', 255);
  const normalized = normalizePurchaseItems(req.body?.items);
  for (const parsed of [invoiceNumber, invoiceDate, dueDate, note]) {
    if (parsed.error) return res.status(400).json({ message: parsed.error });
  }
  if (normalized.error) return res.status(400).json({ message: normalized.error });
  if (invoiceDate.value && dueDate.value && dueDate.value < invoiceDate.value) {
    return res.status(400).json({ message: 'Tanggal jatuh tempo tidak boleh sebelum tanggal faktur.' });
  }
  const totalCents = normalized.value.reduce(
    (total, item) => total + moneyToCents(item.subtotal),
    0n
  );
  if (totalCents <= 0n || totalCents > 999999999999n) {
    return res.status(400).json({ message: 'Total faktur melebihi batas yang diizinkan.' });
  }
  const payload = {
    supplier_id: supplierId,
    invoice_number: invoiceNumber.value,
    invoice_date: invoiceDate.value,
    due_date: dueDate.value,
    note: note.value,
    items: normalized.value,
  };
  const requestHash = hashRequest(payload);
  try {
    const result = await runInTransaction(async (connection) => {
      const [canteens] = await connection.query('SELECT id FROM kantin WHERE id = ? FOR UPDATE', [canteenId]);
      if (!canteens.length) return { notFound: 'canteen' };
      const [previous] = await connection.query(
        `SELECT id, request_hash FROM canteen_purchase_receipts
         WHERE kantin_id = ? AND idempotency_key = ? FOR UPDATE`,
        [canteenId, idempotencyKey]
      );
      if (previous.length) {
        if (previous[0].request_hash !== requestHash) throw idempotencyConflict();
        return { duplicate: true, purchaseId: previous[0].id };
      }
      const [suppliers] = await connection.query(
        `SELECT id, name FROM canteen_suppliers
         WHERE id = ? AND kantin_id = ? AND is_active = TRUE FOR UPDATE`,
        [supplierId, canteenId]
      );
      if (!suppliers.length) return { notFound: 'supplier' };
      const [invoices] = await connection.query(
        `SELECT id FROM canteen_purchase_receipts
         WHERE kantin_id = ? AND supplier_id = ? AND invoice_number = ? FOR UPDATE`,
        [canteenId, supplierId, invoiceNumber.value]
      );
      if (invoices.length) return { duplicateInvoice: true };
      const productIds = normalized.value.map((item) => item.product_id);
      const [products] = await connection.query(
        `SELECT id, nama, stok, average_unit_cost FROM canteen_products
         WHERE kantin_id = ? AND id IN (?) ORDER BY id FOR UPDATE`,
        [canteenId, productIds]
      );
      if (products.length !== productIds.length) return { productsUnavailable: true };
      const productsById = new Map(products.map((product) => [Number(product.id), product]));
      const receiptItems = normalized.value.map((item) => {
        const product = productsById.get(item.product_id);
        const stockAfter = Number(product.stok) + item.quantity;
        if (!Number.isSafeInteger(stockAfter) || stockAfter > 4294967295) return { stockLimit: true };
        return {
          ...item,
          product,
          stockAfter,
          averageUnitCost: calculateWeightedAverageCost(
            product.stok,
            product.average_unit_cost,
            item.quantity,
            item.unit_cost,
          ),
        };
      });
      if (receiptItems.some((item) => item.stockLimit)) return { stockLimit: true };
      const [receipt] = await connection.query(
        `INSERT INTO canteen_purchase_receipts
           (kantin_id, supplier_id, supplier_name, invoice_number, invoice_date, due_date, total_amount,
            note, idempotency_key, request_hash, received_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [canteenId, supplierId, suppliers[0].name, invoiceNumber.value, invoiceDate.value, dueDate.value,
          centsToMoney(totalCents), note.value, idempotencyKey, requestHash, req.user.id]
      );
      for (const item of receiptItems) {
        await connection.query(
          `INSERT INTO canteen_purchase_items
             (purchase_id, product_id, product_name, quantity, unit_cost, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [receipt.insertId, item.product.id, item.product.nama, item.quantity,
            item.unit_cost, item.subtotal]
        );
        await connection.query(
          `UPDATE canteen_products SET stok = ?, average_unit_cost = ? WHERE id = ?`,
          [item.stockAfter, item.averageUnitCost, item.product.id]
        );
        await connection.query(
          `INSERT INTO canteen_stock_movements
             (product_id, purchase_id, user_id, movement_type, quantity_change, stock_after, note)
           VALUES (?, ?, ?, 'receipt', ?, ?, ?)`,
          [item.product.id, receipt.insertId, req.user.id, item.quantity, item.stockAfter,
            `Penerimaan faktur ${invoiceNumber.value}`]
        );
      }
      return { purchaseId: receipt.insertId };
    });
    if (result.notFound === 'canteen') return res.status(404).json({ message: 'Kantin tidak ditemukan.' });
    if (result.notFound === 'supplier') return res.status(404).json({ message: 'Pemasok tidak ditemukan atau nonaktif.' });
    if (result.duplicateInvoice) return res.status(409).json({ message: 'Nomor faktur tersebut sudah pernah diterima dari pemasok ini.' });
    if (result.productsUnavailable) return res.status(409).json({ message: 'Satu atau beberapa produk tidak ditemukan pada kantin ini.' });
    if (result.stockLimit) return res.status(409).json({ message: 'Penerimaan akan membuat stok di luar batas yang diizinkan.' });
    const [rows] = await pool.query(
      `SELECT r.id, r.supplier_id, COALESCE(r.supplier_name, s.name) AS supplier_name, r.invoice_number, r.invoice_date,
              r.due_date, r.total_amount, r.note, r.received_by, r.received_at,
              COALESCE(payments.total_paid, 0.00) AS total_paid,
              GREATEST(r.total_amount - COALESCE(payments.total_paid, 0.00), 0.00) AS outstanding,
              CASE WHEN COALESCE(payments.total_paid, 0) >= r.total_amount THEN 'paid'
                   WHEN COALESCE(payments.total_paid, 0) > 0 THEN 'partial'
                   ELSE 'unpaid' END AS payment_status
       FROM canteen_purchase_receipts r
       JOIN canteen_suppliers s ON s.id = r.supplier_id
       LEFT JOIN (
         SELECT purchase_id, SUM(amount) AS total_paid
         FROM canteen_supplier_payments GROUP BY purchase_id
       ) payments ON payments.purchase_id = r.id
       WHERE r.id = ? AND r.kantin_id = ?`,
      [result.purchaseId, canteenId]
    );
    return res.status(result.duplicate ? 200 : 201).json({
      message: result.duplicate ? 'Faktur tersebut sudah pernah diterima.' : 'Faktur diterima dan stok berhasil diperbarui.',
      data: rows[0],
      duplicate: Boolean(result.duplicate),
    });
  } catch (error) {
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah digunakan untuk faktur lain.' });
    }
    if (duplicateError(error)) {
      try {
        const [rows] = await pool.query(
          `SELECT id, request_hash FROM canteen_purchase_receipts
           WHERE kantin_id = ? AND idempotency_key = ?`,
          [canteenId, idempotencyKey]
        );
        if (rows.length) {
          if (rows[0].request_hash !== requestHash) {
            return res.status(409).json({ message: 'Idempotency-Key sudah digunakan untuk faktur lain.' });
          }
          return res.status(409).json({ message: 'Permintaan faktur sedang diproses; muat ulang daftar pembelian.' });
        }
        return res.status(409).json({ message: 'Nomor faktur tersebut sudah pernah diterima dari pemasok ini.' });
      } catch (lookupError) {
        console.error('Resolve duplicate canteen purchase error:', lookupError);
        return res.status(500).json({ message: 'Gagal memastikan status penerimaan faktur.' });
      }
    }
    console.error('Receive canteen purchase error:', error);
    return res.status(500).json({ message: 'Gagal menerima faktur pembelian.' });
  }
};

export const recordCanteenSupplierPayment = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const purchaseId = parseId(req.params.purchaseId);
  const idempotencyKey = getIdempotencyKey(req);
  if (!canteenId || !purchaseId) return res.status(400).json({ message: 'ID kantin atau faktur tidak valid.' });
  if (!idempotencyKey) return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  const amount = parsePaymentAmount(req.body?.amount);
  if (amount.error) return res.status(400).json({ message: amount.error });
  const method = req.body?.method;
  if (!['cash', 'bank_transfer', 'other'].includes(method)) {
    return res.status(400).json({ message: 'Metode pembayaran harus tunai, transfer bank, atau lainnya.' });
  }
  const reference = parseText(req.body?.reference_code, 'Referensi pembayaran', 100);
  const note = parseText(req.body?.note, 'Catatan', 255);
  if (reference.error || note.error) return res.status(400).json({ message: reference.error || note.error });
  const payload = {
    purchase_id: purchaseId,
    amount: centsToMoney(amount.cents),
    method,
    reference_code: reference.value,
    note: note.value,
  };
  const requestHash = hashRequest(payload);
  try {
    const result = await runInTransaction(async (connection) => {
      const [previous] = await connection.query(
        `SELECT id, purchase_id, request_hash FROM canteen_supplier_payments
         WHERE kantin_id = ? AND idempotency_key = ? FOR UPDATE`,
        [canteenId, idempotencyKey]
      );
      if (previous.length) {
        if (Number(previous[0].purchase_id) !== purchaseId || previous[0].request_hash !== requestHash) {
          throw idempotencyConflict();
        }
        return { duplicate: true, paymentId: previous[0].id };
      }
      const [purchases] = await connection.query(
        `SELECT id, total_amount FROM canteen_purchase_receipts
         WHERE id = ? AND kantin_id = ? FOR UPDATE`,
        [purchaseId, canteenId]
      );
      if (!purchases.length) return { notFound: true };
      const [afterLock] = await connection.query(
        `SELECT id, purchase_id, request_hash FROM canteen_supplier_payments
         WHERE kantin_id = ? AND idempotency_key = ? FOR UPDATE`,
        [canteenId, idempotencyKey]
      );
      if (afterLock.length) {
        if (Number(afterLock[0].purchase_id) !== purchaseId || afterLock[0].request_hash !== requestHash) {
          throw idempotencyConflict();
        }
        return { duplicate: true, paymentId: afterLock[0].id };
      }
      const [[paid]] = await connection.query(
        'SELECT COALESCE(SUM(amount), 0.00) AS total_paid FROM canteen_supplier_payments WHERE purchase_id = ?',
        [purchaseId]
      );
      const outstandingCents = moneyToCents(purchases[0].total_amount) - moneyToCents(paid.total_paid);
      if (outstandingCents <= 0n) return { alreadyPaid: true };
      if (amount.cents > outstandingCents) return { exceedsOutstanding: true };
      const [payment] = await connection.query(
        `INSERT INTO canteen_supplier_payments
           (kantin_id, purchase_id, amount, method, reference_code, note,
            idempotency_key, request_hash, paid_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [canteenId, purchaseId, payload.amount, method, reference.value, note.value,
          idempotencyKey, requestHash, req.user.id]
      );
      return { paymentId: payment.insertId };
    });
    if (result.notFound) return res.status(404).json({ message: 'Faktur pembelian tidak ditemukan.' });
    if (result.alreadyPaid) return res.status(409).json({ message: 'Faktur ini sudah lunas.' });
    if (result.exceedsOutstanding) return res.status(409).json({ message: 'Pembayaran melebihi sisa utang faktur.' });
    const [[balance]] = await pool.query(
      `SELECT r.total_amount, COALESCE(SUM(p.amount), 0.00) AS total_paid
       FROM canteen_purchase_receipts r
       LEFT JOIN canteen_supplier_payments p ON p.purchase_id = r.id
       WHERE r.id = ? AND r.kantin_id = ?
       GROUP BY r.id`,
      [purchaseId, canteenId]
    );
    const outstanding = centsToMoney(moneyToCents(balance.total_amount) - moneyToCents(balance.total_paid));
    const [paymentRows] = await pool.query(
      `SELECT id, purchase_id, amount, method, reference_code, note, paid_by, paid_at
       FROM canteen_supplier_payments WHERE id = ? AND kantin_id = ?`,
      [result.paymentId, canteenId]
    );
    return res.status(result.duplicate ? 200 : 201).json({
      message: result.duplicate ? 'Pembayaran tersebut sudah tercatat.' : 'Pembayaran pemasok berhasil dicatat.',
      data: paymentRows[0],
      outstanding,
      duplicate: Boolean(result.duplicate),
      balance_effect: 'external_cash_or_bank_only',
    });
  } catch (error) {
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah digunakan untuk pembayaran lain.' });
    }
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'Permintaan pembayaran terduplikasi; muat ulang rincian faktur.' });
    }
    console.error('Record canteen supplier payment error:', error);
    return res.status(500).json({ message: 'Gagal mencatat pembayaran pemasok.' });
  }
};
