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
    CREATE TABLE IF NOT EXISTS canteen_shifts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      cashier_id INT NOT NULL,
      status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
      opening_note VARCHAR(255) DEFAULT NULL,
      closing_note VARCHAR(255) DEFAULT NULL,
      opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP DEFAULT NULL,
      INDEX idx_canteen_shift_cashier_status (cashier_id, status, kantin_id),
      INDEX idx_canteen_shift_kantin_opened (kantin_id, opened_at),
      CONSTRAINT fk_canteen_shift_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_shift_cashier FOREIGN KEY (cashier_id)
        REFERENCES users(id) ON DELETE RESTRICT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canteen_held_carts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      cashier_id INT NOT NULL,
      label VARCHAR(80) NOT NULL,
      items JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_canteen_held_cart_owner (kantin_id, cashier_id, updated_at),
      CONSTRAINT fk_canteen_held_cart_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE CASCADE,
      CONSTRAINT fk_canteen_held_cart_cashier FOREIGN KEY (cashier_id)
        REFERENCES users(id) ON DELETE CASCADE
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
      average_unit_cost DECIMAL(10,2) DEFAULT NULL,
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
      harga_pokok_satuan DECIMAL(10,2) DEFAULT NULL,
      total_harga_pokok DECIMAL(14,2) DEFAULT NULL,
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
    CREATE TABLE IF NOT EXISTS canteen_sale_refunds (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      original_transaksi_id BIGINT NOT NULL,
      refund_transaksi_id BIGINT NOT NULL,
      shift_id BIGINT NOT NULL,
      cashier_id INT NOT NULL,
      idempotency_key VARCHAR(64) NOT NULL,
      reason VARCHAR(500) NOT NULL,
      restocked BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_canteen_sale_refund_original (original_transaksi_id),
      UNIQUE KEY uq_canteen_sale_refund_transaction (refund_transaksi_id),
      UNIQUE KEY uq_canteen_sale_refund_idempotency (idempotency_key),
      CONSTRAINT fk_canteen_sale_refund_original FOREIGN KEY (original_transaksi_id)
        REFERENCES transaksi(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_sale_refund_transaction FOREIGN KEY (refund_transaksi_id)
        REFERENCES transaksi(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_sale_refund_shift FOREIGN KEY (shift_id)
        REFERENCES canteen_shifts(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_sale_refund_cashier FOREIGN KEY (cashier_id)
        REFERENCES users(id) ON DELETE RESTRICT
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
    CREATE TABLE IF NOT EXISTS canteen_suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      contact_name VARCHAR(120) DEFAULT NULL,
      phone VARCHAR(40) DEFAULT NULL,
      email VARCHAR(190) DEFAULT NULL,
      address VARCHAR(255) DEFAULT NULL,
      notes VARCHAR(255) DEFAULT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_canteen_suppliers_active (kantin_id, is_active, name),
      CONSTRAINT fk_canteen_supplier_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_supplier_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canteen_purchase_receipts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      supplier_id INT NOT NULL,
      supplier_name VARCHAR(120) DEFAULT NULL,
      invoice_number VARCHAR(80) NOT NULL,
      invoice_date DATE DEFAULT NULL,
      due_date DATE DEFAULT NULL,
      total_amount DECIMAL(12,2) NOT NULL,
      note VARCHAR(255) DEFAULT NULL,
      idempotency_key VARCHAR(64) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      received_by INT DEFAULT NULL,
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_canteen_purchase_invoice (kantin_id, supplier_id, invoice_number),
      UNIQUE KEY uq_canteen_purchase_idempotency (kantin_id, idempotency_key),
      INDEX idx_canteen_purchase_received (kantin_id, received_at),
      INDEX idx_canteen_purchase_supplier (supplier_id, received_at),
      CONSTRAINT fk_canteen_purchase_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_purchase_supplier FOREIGN KEY (supplier_id)
        REFERENCES canteen_suppliers(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_purchase_receiver FOREIGN KEY (received_by)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canteen_purchase_items (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      purchase_id BIGINT NOT NULL,
      product_id INT NOT NULL,
      product_name VARCHAR(120) NOT NULL,
      quantity INT UNSIGNED NOT NULL,
      unit_cost DECIMAL(10,2) NOT NULL,
      subtotal DECIMAL(12,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_canteen_purchase_items_purchase (purchase_id),
      INDEX idx_canteen_purchase_items_product (product_id),
      CONSTRAINT fk_canteen_purchase_item_receipt FOREIGN KEY (purchase_id)
        REFERENCES canteen_purchase_receipts(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_purchase_item_product FOREIGN KEY (product_id)
        REFERENCES canteen_products(id) ON DELETE RESTRICT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canteen_supplier_payments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kantin_id INT NOT NULL,
      purchase_id BIGINT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      method ENUM('cash', 'bank_transfer', 'other') NOT NULL,
      reference_code VARCHAR(100) DEFAULT NULL,
      note VARCHAR(255) DEFAULT NULL,
      idempotency_key VARCHAR(64) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      paid_by INT DEFAULT NULL,
      paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_canteen_supplier_payment_idempotency (kantin_id, idempotency_key),
      INDEX idx_canteen_supplier_payment_purchase (purchase_id, paid_at),
      CONSTRAINT fk_canteen_supplier_payment_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_supplier_payment_purchase FOREIGN KEY (purchase_id)
        REFERENCES canteen_purchase_receipts(id) ON DELETE RESTRICT,
      CONSTRAINT fk_canteen_supplier_payment_cashier FOREIGN KEY (paid_by)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  const [movementPurchaseColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen_stock_movements'
       AND COLUMN_NAME = 'purchase_id'`
  );
  if (!movementPurchaseColumn.length) {
    await pool.query('ALTER TABLE canteen_stock_movements ADD COLUMN purchase_id BIGINT DEFAULT NULL');
  }
  const [movementPurchaseForeignKey] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen_stock_movements'
       AND CONSTRAINT_NAME = 'fk_canteen_stock_purchase'`
  );
  if (!movementPurchaseForeignKey.length) {
    await pool.query(
      `ALTER TABLE canteen_stock_movements ADD CONSTRAINT fk_canteen_stock_purchase
       FOREIGN KEY (purchase_id) REFERENCES canteen_purchase_receipts(id) ON DELETE RESTRICT`
    );
  }
  for (const [table, column, definition] of [
    ['transaksi', 'canteen_shift_id', 'BIGINT DEFAULT NULL'],
    ['canteen_products', 'average_unit_cost', 'DECIMAL(10,2) DEFAULT NULL'],
    ['canteen_sale_items', 'harga_pokok_satuan', 'DECIMAL(10,2) DEFAULT NULL'],
    ['canteen_sale_items', 'total_harga_pokok', 'DECIMAL(14,2) DEFAULT NULL'],
    ['canteen_purchase_receipts', 'supplier_name', 'VARCHAR(120) DEFAULT NULL'],
  ]) {
    const [existing] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (!existing.length) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  const [totalCostColumn] = await pool.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen_sale_items'
       AND COLUMN_NAME = 'total_harga_pokok'`
  );
  if (totalCostColumn.length && !totalCostColumn[0].COLUMN_TYPE.toLowerCase().includes('decimal(14,2)')) {
    await pool.query(
      'ALTER TABLE canteen_sale_items MODIFY total_harga_pokok DECIMAL(14,2) DEFAULT NULL'
    );
  }
  const [averageCostColumn] = await pool.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen_products'
       AND COLUMN_NAME = 'average_unit_cost'`
  );
  if (averageCostColumn[0]?.IS_NULLABLE === 'NO') {
    await pool.query(
      `ALTER TABLE canteen_products MODIFY average_unit_cost DECIMAL(10,2) DEFAULT NULL`
    );
    await pool.query(
      `UPDATE canteen_products SET average_unit_cost = NULL
       WHERE stok > 0 AND average_unit_cost = 0`
    );
  }
  const [shiftForeignKey] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi'
       AND CONSTRAINT_NAME = 'fk_transaksi_canteen_shift'`
  );
  if (!shiftForeignKey.length) {
    await pool.query(
      `ALTER TABLE transaksi ADD CONSTRAINT fk_transaksi_canteen_shift
       FOREIGN KEY (canteen_shift_id) REFERENCES canteen_shifts(id) ON DELETE RESTRICT`
    );
  }
  for (const [table, column, definition, acceptedValue] of [
    ['transaksi', 'tipe_transaksi', "ENUM('belanja', 'topup', 'tarik', 'biaya_layanan', 'refund_belanja') NOT NULL", "'refund_belanja'"],
    ['kantin_transaksi', 'tipe_transaksi', "ENUM('penjualan', 'pencairan', 'refund') NOT NULL", "'refund'"],
    ['canteen_stock_movements', 'movement_type', "ENUM('adjustment', 'sale', 'receipt', 'refund') NOT NULL", "'receipt'"],
  ]) {
    const [existing] = await pool.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (existing.length && !existing[0].COLUMN_TYPE.includes(acceptedValue)) {
      await pool.query(`ALTER TABLE ${table} MODIFY ${column} ${definition}`);
    }
  }
  for (const triggerName of ['trg_canteen_sale_refund_no_update', 'trg_canteen_sale_refund_no_delete']) {
    const event = triggerName.endsWith('no_update') ? 'UPDATE' : 'DELETE';
    const [existing] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
       WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`,
      [triggerName]
    );
    if (!existing.length) {
      await pool.query(
        `CREATE TRIGGER ${triggerName} BEFORE ${event} ON canteen_sale_refunds
         FOR EACH ROW SIGNAL SQLSTATE '45000'
         SET MESSAGE_TEXT = 'Canteen refund records are immutable'`
      );
    }
  }
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
  for (const [table, prefix, events] of [
    ['canteen_purchase_receipts', 'canteen_purchase_receipts', ['UPDATE', 'DELETE']],
    ['canteen_purchase_items', 'canteen_purchase_items', ['UPDATE', 'DELETE']],
    ['canteen_supplier_payments', 'canteen_supplier_payments', ['UPDATE', 'DELETE']],
  ]) {
    for (const event of events) {
      const triggerName = `trg_${prefix}_no_${event.toLowerCase()}`;
      const [existing] = await pool.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
         WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`,
        [triggerName]
      );
      if (!existing.length) {
        await pool.query(
          `CREATE TRIGGER ${triggerName} BEFORE ${event} ON ${table}
           FOR EACH ROW SIGNAL SQLSTATE '45000'
           SET MESSAGE_TEXT = 'Canteen purchasing records are immutable'`
        );
      }
    }
  }
};
