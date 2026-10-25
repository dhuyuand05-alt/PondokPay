export const ensureCanteenSchema = async (pool) => {
  const [canteenBalanceColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kantin' AND COLUMN_NAME = 'saldo'`
  );
  if (!canteenBalanceColumn.length) {
    await pool.query('ALTER TABLE kantin ADD COLUMN saldo DECIMAL(12,2) NOT NULL DEFAULT 0.00');
  }

  const [canteenIdColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi' AND COLUMN_NAME = 'kantin_id'`
  );
  if (!canteenIdColumn.length) {
    await pool.query('ALTER TABLE transaksi ADD COLUMN kantin_id INT NULL AFTER santri_id');
    await pool.query(
      `ALTER TABLE transaksi ADD CONSTRAINT fk_transaksi_kantin
       FOREIGN KEY (kantin_id) REFERENCES kantin(id) ON DELETE SET NULL`
    );
  }

  const [transactionTypeColumn] = await pool.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi' AND COLUMN_NAME = 'tipe_transaksi'`
  );
  if (transactionTypeColumn.length &&
      (!transactionTypeColumn[0].COLUMN_TYPE.includes("'tarik'") ||
        !transactionTypeColumn[0].COLUMN_TYPE.includes("'biaya_layanan'"))) {
    await pool.query(
      `ALTER TABLE transaksi MODIFY tipe_transaksi
       ENUM('belanja', 'topup', 'tarik', 'biaya_layanan') NOT NULL`
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kantin_transaksi (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      transaksi_id BIGINT DEFAULT NULL,
      tipe_transaksi ENUM('penjualan', 'pencairan') NOT NULL,
      jumlah DECIMAL(10,2) NOT NULL,
      saldo_akhir DECIMAL(12,2) NOT NULL,
      idempotency_key VARCHAR(64) DEFAULT NULL,
      created_by INT DEFAULT NULL,
      keterangan TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_kantin_transaksi_transaksi (transaksi_id),
      UNIQUE KEY uq_kantin_idempotency_key (idempotency_key),
      CONSTRAINT fk_kantin_transaksi_kantin
        FOREIGN KEY (kantin_id) REFERENCES kantin(id) ON DELETE RESTRICT,
      CONSTRAINT fk_kantin_transaksi_transaksi
        FOREIGN KEY (transaksi_id) REFERENCES transaksi(id) ON DELETE SET NULL,
      CONSTRAINT fk_kantin_transaksi_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kantin_kasir (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_kantin_kasir (kantin_id, user_id),
      CONSTRAINT fk_kantin_kasir_kantin
        FOREIGN KEY (kantin_id) REFERENCES kantin(id) ON DELETE CASCADE,
      CONSTRAINT fk_kantin_kasir_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canteen_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      nama VARCHAR(120) NOT NULL,
      kategori VARCHAR(80) NOT NULL DEFAULT 'Umum',
      sku VARCHAR(40) DEFAULT NULL,
      barcode VARCHAR(80) DEFAULT NULL,
      harga DECIMAL(10,2) NOT NULL,
      stok INT UNSIGNED NOT NULL DEFAULT 0,
      stok_minimum INT UNSIGNED NOT NULL DEFAULT 5,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_canteen_product_sku (kantin_id, sku),
      UNIQUE KEY uq_canteen_product_barcode (kantin_id, barcode),
      INDEX idx_canteen_product_catalog (kantin_id, is_active, kategori, nama),
      CONSTRAINT fk_canteen_product_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE RESTRICT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canteen_sale_items (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      transaksi_id BIGINT NOT NULL,
      product_id INT NOT NULL,
      nama_produk VARCHAR(120) NOT NULL,
      sku VARCHAR(40) DEFAULT NULL,
      harga_satuan DECIMAL(10,2) NOT NULL,
      quantity INT UNSIGNED NOT NULL,
      subtotal DECIMAL(12,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_canteen_sale_items_transaction (transaksi_id),
      INDEX idx_canteen_sale_items_product (product_id),
      CONSTRAINT fk_canteen_sale_item_transaction FOREIGN KEY (transaksi_id)
        REFERENCES transaksi(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_sale_item_product FOREIGN KEY (product_id)
        REFERENCES canteen_products(id) ON DELETE RESTRICT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canteen_stock_movements (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      transaksi_id BIGINT DEFAULT NULL,
      user_id INT DEFAULT NULL,
      movement_type ENUM('adjustment', 'sale') NOT NULL,
      quantity_change INT NOT NULL,
      stock_after INT UNSIGNED NOT NULL,
      note VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_canteen_stock_product_created (product_id, created_at),
      INDEX idx_canteen_stock_transaction (transaksi_id),
      CONSTRAINT fk_canteen_stock_product FOREIGN KEY (product_id)
        REFERENCES canteen_products(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_stock_transaction FOREIGN KEY (transaksi_id)
        REFERENCES transaksi(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_stock_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canteen_payout_approvals (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      keterangan TEXT DEFAULT NULL,
      requester_id INT NOT NULL,
      cashier_id INT DEFAULT NULL,
      status ENUM('pending', 'approved', 'rejected', 'consumed') NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      decided_at TIMESTAMP DEFAULT NULL,
      consumed_at TIMESTAMP DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_canteen_payout_pending (status, expires_at),
      INDEX idx_canteen_payout_requester (requester_id, created_at),
      CONSTRAINT fk_canteen_payout_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_payout_requester FOREIGN KEY (requester_id)
        REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_payout_cashier FOREIGN KEY (cashier_id)
        REFERENCES users(id) ON DELETE RESTRICT
    )
  `);
  const [payoutApprovalTrigger] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE()
       AND TRIGGER_NAME = 'trg_canteen_payout_approval_protect_update'`
  );
  if (!payoutApprovalTrigger.length) {
    await pool.query(
      `CREATE TRIGGER trg_canteen_payout_approval_protect_update
       BEFORE UPDATE ON canteen_payout_approvals
       FOR EACH ROW
       BEGIN
         IF NOT (NEW.kantin_id <=> OLD.kantin_id)
           OR NOT (NEW.amount <=> OLD.amount)
           OR NOT (NEW.keterangan <=> OLD.keterangan)
           OR NOT (NEW.requester_id <=> OLD.requester_id)
           OR NOT (NEW.expires_at <=> OLD.expires_at)
           OR NOT (NEW.created_at <=> OLD.created_at)
           OR (
             NOT (
               OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')
               AND OLD.cashier_id IS NULL AND NEW.cashier_id IS NOT NULL
               AND OLD.decided_at IS NULL AND NEW.decided_at IS NOT NULL
               AND NEW.consumed_at IS NULL
             )
             AND NOT (
               OLD.status = 'approved' AND NEW.status = 'consumed'
               AND OLD.cashier_id <=> NEW.cashier_id
               AND OLD.decided_at <=> NEW.decided_at
               AND OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL
             )
             AND NOT (
               OLD.status <=> NEW.status
               AND OLD.cashier_id <=> NEW.cashier_id
               AND OLD.decided_at <=> NEW.decided_at
               AND OLD.consumed_at <=> NEW.consumed_at
             )
           )
         THEN
           SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Canteen payout approval data is immutable';
         END IF;
       END`
    );
  }
};
