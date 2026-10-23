import pool from '../config/db.js';

const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const parseWholeNumber = (value, label, { max = 1000000 } = {}) => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^\d+$/.test(String(value)) ||
    !Number.isInteger(Number(value)) ||
    Number(value) < 0 ||
    Number(value) > max
  ) {
    return { error: `${label} harus berupa bilangan bulat antara 0 dan ${max}.` };
  }
  return { value: Number(value) };
};

const parseProduct = (body, partial = false) => {
  const values = {};
  const errors = [];
  const fields = ['nama', 'kategori', 'sku', 'barcode', 'harga', 'stok', 'stok_minimum', 'is_active'];
  const source = partial ? body : {
    ...body,
    stok: body.stok ?? 0,
    stok_minimum: body.stok_minimum ?? 5,
    is_active: body.is_active ?? true,
  };
  for (const field of fields) {
    if (partial && source[field] === undefined) continue;
    const value = source[field];
    if (field === 'nama') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) errors.push('Nama produk wajib diisi dan maksimal 120 karakter.');
      else values.nama = value.trim();
    } else if (field === 'kategori') {
      if (value !== undefined && (typeof value !== 'string' || value.trim().length > 80)) errors.push('Kategori maksimal 80 karakter.');
      else values.kategori = value?.trim() || 'Umum';
    } else if (field === 'sku' || field === 'barcode') {
      if (value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > (field === 'sku' ? 40 : 80))) {
        errors.push(`${field.toUpperCase()} tidak valid.`);
      } else values[field] = value?.trim() || null;
    } else if (field === 'harga') {
      const text = String(value);
      const amount = Number(text);
      if (!/^\d+(\.\d{1,2})?$/.test(text) || !Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) {
        errors.push('Harga harus lebih dari 0 dan maksimal Rp99.999.999,99.');
      } else values.harga = amount.toFixed(2);
    } else if (field === 'stok' || field === 'stok_minimum') {
      const parsed = parseWholeNumber(value, field === 'stok' ? 'Stok' : 'Stok minimum');
      if (parsed.error) errors.push(parsed.error);
      else values[field] = parsed.value;
    } else if (field === 'is_active') {
      if (typeof value !== 'boolean' && ![0, 1].includes(value)) errors.push('Status produk tidak valid.');
      else values.is_active = Boolean(value);
    }
  }
  return errors.length ? { errors } : { values };
};

const ensureCanteen = async (canteenId) => {
  const [rows] = await pool.query('SELECT id FROM kantin WHERE id = ?', [canteenId]);
  return rows.length > 0;
};

export const getCanteenProducts = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT id, kantin_id, nama, kategori, sku, barcode, harga, stok, stok_minimum,
              is_active, created_at, updated_at
       FROM canteen_products WHERE kantin_id = ?
       ORDER BY kategori, nama`,
      [canteenId]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get canteen products error:', error);
    return res.status(500).json({ message: 'Gagal mengambil katalog produk.' });
  }
};

export const updateAssignedCanteenCatalogMode = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const { catalog_enabled: enabled } = req.body;
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'Mode kasir harus berupa nilai boolean.' });
  }
  try {
    const [result] = await pool.query(
      'UPDATE kantin SET catalog_enabled = ? WHERE id = ?',
      [enabled, canteenId]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.query('SELECT id FROM kantin WHERE id = ?', [canteenId]);
      if (!rows.length) return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    }
    return res.status(200).json({
      message: enabled ? 'Kasir produk diaktifkan.' : 'Pencatatan nominal manual diaktifkan.',
      data: { kantin_id: canteenId, catalog_enabled: enabled },
    });
  } catch (error) {
    console.error('Update assigned canteen catalog mode error:', error);
    return res.status(500).json({ message: 'Gagal mengubah mode kasir kantin.' });
  }
};

export const createCanteenProduct = async (req, res) => {
  const canteenId = parseId(req.params.id);
  if (!canteenId) return res.status(400).json({ message: 'ID kantin tidak valid.' });
  const parsed = parseProduct(req.body);
  if (parsed.errors) return res.status(400).json({ message: parsed.errors[0], errors: parsed.errors });
  const product = { kategori: 'Umum', stok: 0, stok_minimum: 5, ...parsed.values };
  try {
    if (!await ensureCanteen(canteenId)) return res.status(404).json({ message: 'Data kantin tidak ditemukan.' });
    const connection = await pool.getConnection();
    let result;
    try {
      await connection.beginTransaction();
      [result] = await connection.query(
        `INSERT INTO canteen_products
           (kantin_id, nama, kategori, sku, barcode, harga, stok, stok_minimum, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [canteenId, product.nama, product.kategori, product.sku, product.barcode,
          product.harga, product.stok, product.stok_minimum, product.is_active ?? true]
      );
      if (product.stok > 0) {
        await connection.query(
          `INSERT INTO canteen_stock_movements
             (product_id, user_id, movement_type, quantity_change, stock_after, note)
           VALUES (?, ?, 'adjustment', ?, ?, 'Stok awal produk')`,
          [result.insertId, req.user.id, product.stok, product.stok]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    const [[created]] = await pool.query('SELECT * FROM canteen_products WHERE id = ?', [result.insertId]);
    return res.status(201).json({ message: 'Produk berhasil ditambahkan.', data: created });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'SKU atau barcode sudah digunakan di kantin ini.' });
    console.error('Create canteen product error:', error);
    return res.status(500).json({ message: 'Gagal menambahkan produk.' });
  }
};

export const updateCanteenProduct = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const productId = parseId(req.params.productId);
  if (!canteenId || !productId) return res.status(400).json({ message: 'ID kantin atau produk tidak valid.' });
  const parsed = parseProduct(req.body, true);
  if (parsed.errors) return res.status(400).json({ message: parsed.errors[0], errors: parsed.errors });
  const fields = Object.keys(parsed.values);
  if (!fields.length) return res.status(400).json({ message: 'Tidak ada data produk yang diubah.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[product]] = await connection.query(
      'SELECT stok FROM canteen_products WHERE id = ? AND kantin_id = ? FOR UPDATE',
      [productId, canteenId]
    );
    if (!product) {
      await connection.rollback();
      return res.status(404).json({ message: 'Produk tidak ditemukan.' });
    }
    const assignments = fields.map((field) => `\`${field}\` = ?`).join(', ');
    await connection.query(
      `UPDATE canteen_products SET ${assignments} WHERE id = ? AND kantin_id = ?`,
      [...fields.map((field) => parsed.values[field]), productId, canteenId]
    );
    if (parsed.values.stok !== undefined && parsed.values.stok !== Number(product.stok)) {
      const change = parsed.values.stok - Number(product.stok);
      await connection.query(
        `INSERT INTO canteen_stock_movements
           (product_id, user_id, movement_type, quantity_change, stock_after, note)
         VALUES (?, ?, 'adjustment', ?, ?, 'Penyesuaian stok produk oleh petugas kantin')`,
        [productId, req.user.id, change, parsed.values.stok]
      );
    }
    await connection.commit();
    const [[updated]] = await pool.query('SELECT * FROM canteen_products WHERE id = ?', [productId]);
    return res.status(200).json({ message: 'Produk berhasil diperbarui.', data: updated });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'SKU atau barcode sudah digunakan di kantin ini.' });
    console.error('Update canteen product error:', error);
    return res.status(500).json({ message: 'Gagal memperbarui produk.' });
  } finally {
    connection.release();
  }
};

export const getCanteenStockMovements = async (req, res) => {
  const canteenId = parseId(req.params.id);
  const productId = req.query.product_id === undefined ? null : parseId(req.query.product_id);
  if (!canteenId || (req.query.product_id !== undefined && !productId)) {
    return res.status(400).json({ message: 'ID kantin atau produk tidak valid.' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT m.id, m.product_id, p.nama AS nama_produk, m.transaksi_id,
              m.movement_type, m.quantity_change, m.stock_after, m.note, m.created_at,
              u.username
       FROM canteen_stock_movements m
       JOIN canteen_products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE p.kantin_id = ? ${productId ? 'AND m.product_id = ?' : ''}
       ORDER BY m.created_at DESC, m.id DESC LIMIT 100`,
      productId ? [canteenId, productId] : [canteenId]
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get canteen stock movements error:', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat pergerakan stok.' });
  }
};
