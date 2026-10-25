import pool from '../../../config/db.js';
import { consumeCanteenPayoutApproval } from '../../../services/canteenPayoutApprovals.js';
import { consumeFinancialApproval } from '../../../services/financialApprovals.js';
import { collectCurrentServiceFeeDebt } from '../../../services/monthlyServiceFees.js';
import { enqueueParentTransactionNotifications } from '../../../services/whatsappNotifications.js';
import { centsToMoney, duplicateError, getIdempotencyKey, idempotencyConflict, moneyToCents, normalizeSaleItems, parseId, parseMoney, parsePagination, runInTransaction, validTransactionTypes } from '../shared.js';

export const createCanteenSale = async (req, res) => {
  const kantinId = parseId(req.params.id);
  const santriId = parseId(req.body.santri_id);
  const catalogRequest = req.body.items !== undefined;
  const normalizedItems = catalogRequest ? normalizeSaleItems(req.body.items) : null;
  const amount = catalogRequest ? { value: undefined } : parseMoney(req.body.jumlah, 'jumlah');
  const expectedCatalogAmount = catalogRequest && req.body.jumlah !== undefined
    ? parseMoney(req.body.jumlah, 'jumlah')
    : null;
  if (!kantinId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  if (catalogRequest && req.user.role !== 'kasir') {
    return res.status(403).json({ message: 'Rincian produk hanya dapat dicatat oleh petugas kantin.' });
  }
  if (normalizedItems?.error) return res.status(400).json({ message: normalizedItems.error });
  if (expectedCatalogAmount?.error) return res.status(400).json({ message: expectedCatalogAmount.error });
  if (!catalogRequest && (amount.error || !amount.value || Number(amount.value) <= 0)) {
    return res.status(400).json({ message: amount.error || 'Jumlah belanja harus lebih dari 0.' });
  }
  const keterangan = req.body.keterangan ?? null;
  if (keterangan !== null && (typeof keterangan !== 'string' || keterangan.length > 65535)) {
    return res.status(400).json({ message: 'Keterangan transaksi tidak valid.' });
  }
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi (8-64 karakter).' });
  }

  try {
    const sale = await runInTransaction(async (connection) => {
      const [canteens] = await connection.query(
        'SELECT saldo, status, catalog_enabled FROM kantin WHERE id = ? FOR UPDATE',
        [kantinId]
      );
      if (!canteens.length) return { notFound: 'kantin' };
      const [previous] = await connection.query(
        `SELECT id, santri_id, kantin_id, jumlah, saldo_akhir, keterangan, created_by
         FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (previous.length) {
        const transaction = previous[0];
        const [previousItems] = await connection.query(
          'SELECT product_id, quantity FROM canteen_sale_items WHERE transaksi_id = ? ORDER BY product_id',
          [transaction.id]
        );
        const sameItems = catalogRequest &&
          previousItems.length === normalizedItems.items.length &&
          previousItems.every((row, index) =>
            Number(row.product_id) === normalizedItems.items[index].product_id &&
            Number(row.quantity) === normalizedItems.items[index].quantity) &&
          (!expectedCatalogAmount?.value ||
            moneyToCents(transaction.jumlah) === moneyToCents(expectedCatalogAmount.value));
        const sameManualAmount = !catalogRequest && !previousItems.length &&
          moneyToCents(transaction.jumlah) === moneyToCents(amount.value);
        if (
          Number(transaction.created_by) !== req.user.id ||
          Number(transaction.santri_id) !== santriId ||
          Number(transaction.kantin_id) !== kantinId ||
          !(sameItems || sameManualAmount) ||
          (transaction.keterangan ?? null) !== keterangan
        ) {
          throw idempotencyConflict();
        }
        const [[currentCanteen]] = await connection.query(
          'SELECT saldo FROM kantin WHERE id = ?',
          [kantinId]
        );
        return {
          duplicate: true,
          santri: { id: santriId, saldo: transaction.saldo_akhir },
          kantin: { id: kantinId, saldo: currentCanteen.saldo },
          transaksi_id: transaction.id,
          jumlah: transaction.jumlah,
        };
      }
      if (canteens[0].status !== 'active') {
        const error = new Error('Kantin tidak aktif.');
        error.code = 'CANTEEN_INACTIVE';
        throw error;
      }
      let saleItems = [];
      let amountCents;
      if (catalogRequest) {
        if (!canteens[0].catalog_enabled) {
          const error = new Error('Mode kasir produk tidak aktif untuk kantin ini.');
          error.code = 'CATALOG_DISABLED';
          throw error;
        }
        const productIds = normalizedItems.items.map((item) => item.product_id);
        const [products] = await connection.query(
          `SELECT id, nama, sku, harga, stok
           FROM canteen_products
           WHERE kantin_id = ? AND is_active = TRUE AND id IN (?)
           ORDER BY id FOR UPDATE`,
          [kantinId, productIds]
        );
        if (products.length !== normalizedItems.items.length) {
          const error = new Error('Satu atau beberapa produk sudah tidak tersedia.');
          error.code = 'PRODUCT_UNAVAILABLE';
          throw error;
        }
        const productMap = new Map(products.map((product) => [Number(product.id), product]));
        amountCents = 0n;
        saleItems = normalizedItems.items.map((item) => {
          const product = productMap.get(item.product_id);
          if (Number(product.stok) < item.quantity) {
            const error = new Error(`Stok ${product.nama} tidak mencukupi.`);
            error.code = 'INSUFFICIENT_PRODUCT_STOCK';
            throw error;
          }
          const subtotalCents = moneyToCents(product.harga) * BigInt(item.quantity);
          amountCents += subtotalCents;
          return {
            ...item,
            product,
            unitPrice: product.harga,
            subtotal: centsToMoney(subtotalCents),
            remainingStock: Number(product.stok) - item.quantity,
          };
        });
        if (amountCents <= 0n || amountCents > 9999999999n) {
          const error = new Error('Total transaksi melebihi batas yang diizinkan.');
          error.code = 'SALE_AMOUNT_LIMIT';
          throw error;
        }
        if (expectedCatalogAmount?.value &&
            moneyToCents(expectedCatalogAmount.value) !== amountCents) {
          const error = new Error('Harga produk berubah. Muat ulang katalog dan periksa keranjang.');
          error.code = 'CATALOG_PRICE_CHANGED';
          throw error;
        }
      } else {
        amountCents = moneyToCents(amount.value);
      }
      const [students] = await connection.query(
        'SELECT saldo, limit_harian, is_active FROM santri WHERE id = ? FOR UPDATE',
        [santriId]
      );
      if (!students.length || !students[0].is_active) return { notFound: 'santri' };

      const studentBalanceCents = moneyToCents(students[0].saldo ?? '0.00');
      if (amountCents > studentBalanceCents) {
        const error = new Error('Saldo santri tidak mencukupi.');
        error.code = 'INSUFFICIENT_STUDENT_BALANCE';
        throw error;
      }

      const [dailyRows] = await connection.query(
        `SELECT COALESCE(SUM(jumlah), 0) AS total
         FROM transaksi
         WHERE santri_id = ? AND tipe_transaksi = 'belanja'
           AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY`,
        [santriId]
      );
      const spentCents = moneyToCents(dailyRows[0].total ?? '0.00');
      const limitCents = moneyToCents(students[0].limit_harian ?? '0.00');
      if (spentCents + amountCents > limitCents) {
        const error = new Error('Batas belanja harian terlampaui.');
        error.code = 'DAILY_LIMIT_EXCEEDED';
        throw error;
      }

      const canteenBalanceCents = moneyToCents(canteens[0].saldo ?? '0.00');
      if (canteenBalanceCents + amountCents > 999999999999n) {
        const error = new Error('Saldo kantin melebihi batas maksimum.');
        error.code = 'CANTEEN_BALANCE_LIMIT';
        throw error;
      }
      const studentBalance = centsToMoney(studentBalanceCents - amountCents);
      const canteenBalance = centsToMoney(canteenBalanceCents + amountCents);

      await connection.query('UPDATE santri SET saldo = ? WHERE id = ?', [studentBalance, santriId]);
      await connection.query('UPDATE kantin SET saldo = ? WHERE id = ?', [canteenBalance, kantinId]);
      const [transaction] = await connection.query(
        `INSERT INTO transaksi
           (santri_id, kantin_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
         VALUES (?, ?, 'belanja', ?, ?, ?, ?, ?)`,
        [santriId, kantinId, centsToMoney(amountCents), studentBalance, keterangan, idempotencyKey, req.user.id]
      );
      for (const item of saleItems) {
        await connection.query(
          `INSERT INTO canteen_sale_items
             (transaksi_id, product_id, nama_produk, sku, harga_satuan, quantity, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [transaction.insertId, item.product.id, item.product.nama, item.product.sku,
            item.unitPrice, item.quantity, item.subtotal]
        );
        await connection.query(
          'UPDATE canteen_products SET stok = ? WHERE id = ?',
          [item.remainingStock, item.product.id]
        );
        await connection.query(
          `INSERT INTO canteen_stock_movements
             (product_id, transaksi_id, user_id, movement_type, quantity_change, stock_after, note)
           VALUES (?, ?, ?, 'sale', ?, ?, 'Penjualan melalui kasir')`,
          [item.product.id, transaction.insertId, req.user.id, -item.quantity, item.remainingStock]
        );
      }
      await enqueueParentTransactionNotifications(connection, transaction.insertId);
      await connection.query(
        `INSERT INTO kantin_transaksi
           (kantin_id, transaksi_id, tipe_transaksi, jumlah, saldo_akhir, keterangan)
         VALUES (?, ?, 'penjualan', ?, ?, ?)`,
        [kantinId, transaction.insertId, centsToMoney(amountCents), canteenBalance, keterangan]
      );
      return {
        santri: { id: santriId, saldo: studentBalance },
        kantin: { id: kantinId, saldo: canteenBalance },
        transaksi_id: transaction.insertId,
        jumlah: centsToMoney(amountCents),
      };
    });
    if (sale.notFound === 'kantin') return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    if (sale.notFound === 'santri') return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(sale.duplicate ? 200 : 201).json({
      message: sale.duplicate ? 'Transaksi sudah diproses sebelumnya.' : 'Transaksi belanja berhasil.',
      data: sale,
    });
  } catch (error) {
    if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
    }
    if (duplicateError(error) && idempotencyKey) {
      try {
        const [previous] = await pool.query(
          `SELECT id, santri_id, kantin_id, jumlah, saldo_akhir, keterangan, created_by
           FROM transaksi WHERE idempotency_key = ? LIMIT 1`,
          [idempotencyKey]
        );
        if (
          previous.length &&
          Number(previous[0].created_by) === req.user.id &&
          Number(previous[0].santri_id) === santriId &&
          Number(previous[0].kantin_id) === kantinId &&
          (previous[0].keterangan ?? null) === keterangan
        ) {
          const [previousItems] = await pool.query(
            'SELECT product_id, quantity FROM canteen_sale_items WHERE transaksi_id = ? ORDER BY product_id',
            [previous[0].id]
          );
          const sameItems = catalogRequest &&
            previousItems.length === normalizedItems.items.length &&
            previousItems.every((row, index) =>
              Number(row.product_id) === normalizedItems.items[index].product_id &&
              Number(row.quantity) === normalizedItems.items[index].quantity) &&
            (!expectedCatalogAmount?.value ||
              moneyToCents(previous[0].jumlah) === moneyToCents(expectedCatalogAmount.value));
          const sameManualAmount = !catalogRequest && !previousItems.length &&
            moneyToCents(previous[0].jumlah) === moneyToCents(amount.value);
          if (sameItems || sameManualAmount) {
            return res.status(200).json({
              message: 'Transaksi sudah diproses sebelumnya.',
              data: {
                duplicate: true,
                transaksi_id: previous[0].id,
                santri: { id: santriId, saldo: previous[0].saldo_akhir },
                kantin: { id: kantinId },
                jumlah: previous[0].jumlah,
              },
            });
          }
        }
        if (previous.length) {
          return res.status(409).json({ message: 'Idempotency-Key sudah dipakai untuk transaksi lain.' });
        }
      } catch (lookupError) {
        console.error('Lookup idempotent canteen transaction error:', lookupError);
        return res.status(500).json({ message: 'Gagal memverifikasi status transaksi.' });
      }
    }
    if (error.code === 'CANTEEN_INACTIVE') {
      return res.status(409).json({ message: 'Kantin tidak aktif dan tidak dapat menerima transaksi.' });
    }
    if (error.code === 'INSUFFICIENT_STUDENT_BALANCE') {
      return res.status(409).json({ message: 'Saldo santri tidak mencukupi.' });
    }
    if (error.code === 'DAILY_LIMIT_EXCEEDED') {
      return res.status(409).json({ message: 'Transaksi melebihi limit belanja harian santri.' });
    }
    if (error.code === 'CANTEEN_BALANCE_LIMIT') {
      return res.status(400).json({ message: 'Saldo kantin melebihi batas maksimum.' });
    }
    if (['CATALOG_ITEMS_REQUIRED', 'CATALOG_DISABLED', 'PRODUCT_UNAVAILABLE', 'INSUFFICIENT_PRODUCT_STOCK', 'CATALOG_PRICE_CHANGED'].includes(error.code)) {
      return res.status(409).json({ message: error.message });
    }
    if (error.code === 'SALE_AMOUNT_LIMIT') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Create canteen sale error:', error);
    return res.status(500).json({ message: 'Gagal mencatat transaksi kantin.' });
  }
};
