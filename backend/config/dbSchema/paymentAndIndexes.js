export const ensurePaymentAndIndexesSchema = async (pool) => {
  const [idempotencyColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi'
       AND COLUMN_NAME = 'idempotency_key'`
  );
  if (!idempotencyColumn.length) {
    await pool.query('ALTER TABLE transaksi ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL');
  }
  const [idempotencyIndex] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi'
       AND INDEX_NAME = 'uq_transaksi_idempotency_key'`
  );
  if (!idempotencyIndex.length) {
    await pool.query('CREATE UNIQUE INDEX uq_transaksi_idempotency_key ON transaksi (idempotency_key)');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS midtrans_topup_payments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      santri_id INT NOT NULL,
      order_id VARCHAR(50) NOT NULL UNIQUE,
      idempotency_key VARCHAR(64) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      status ENUM('creating', 'pending', 'paid', 'expired', 'failed') NOT NULL DEFAULT 'creating',
      snap_token VARCHAR(255) DEFAULT NULL,
      qr_string TEXT DEFAULT NULL,
      qr_code_url VARCHAR(1000) DEFAULT NULL,
      midtrans_client_key VARCHAR(255) DEFAULT NULL,
      midtrans_server_key_enc TEXT DEFAULT NULL,
      midtrans_environment ENUM('sandbox', 'production') DEFAULT NULL,
      provider_transaction_id VARCHAR(100) DEFAULT NULL,
      ledger_transaction_id BIGINT DEFAULT NULL UNIQUE,
      expires_at DATETIME DEFAULT NULL,
      paid_at DATETIME DEFAULT NULL,
      status_checked_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_midtrans_payment_user_idempotency (user_id, idempotency_key),
      INDEX idx_midtrans_payment_user_created (user_id, created_at),
      INDEX idx_midtrans_payment_status_created (status, created_at),
      CONSTRAINT fk_midtrans_payment_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_midtrans_payment_santri FOREIGN KEY (santri_id)
        REFERENCES santri(id) ON DELETE RESTRICT,
      CONSTRAINT fk_midtrans_payment_ledger FOREIGN KEY (ledger_transaction_id)
        REFERENCES transaksi(id) ON DELETE RESTRICT
    )
  `);
  for (const column of [
    { name: 'qr_string', definition: 'TEXT DEFAULT NULL' },
    { name: 'qr_code_url', definition: 'VARCHAR(1000) DEFAULT NULL' },
    { name: 'midtrans_client_key', definition: 'VARCHAR(255) DEFAULT NULL' },
    { name: 'midtrans_server_key_enc', definition: 'TEXT DEFAULT NULL' },
    { name: 'midtrans_environment', definition: "ENUM('sandbox', 'production') DEFAULT NULL" },
  ]) {
    const [existing] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'midtrans_topup_payments'
         AND COLUMN_NAME = ?`,
      [column.name]
    );
    if (!existing.length) {
      await pool.query(
        `ALTER TABLE midtrans_topup_payments ADD COLUMN ${column.name} ${column.definition}`
      );
    }
  }
  await pool.query(
    `UPDATE midtrans_topup_payments p
     JOIN institution_settings s ON s.id = 1
     SET p.midtrans_client_key = COALESCE(p.midtrans_client_key, s.midtrans_client_key),
         p.midtrans_server_key_enc = COALESCE(p.midtrans_server_key_enc, s.midtrans_server_key_enc),
         p.midtrans_environment = COALESCE(p.midtrans_environment, s.midtrans_environment)
     WHERE p.midtrans_client_key IS NULL
        OR p.midtrans_server_key_enc IS NULL
        OR p.midtrans_environment IS NULL`
  );

  for (const { column, index } of [
    { column: 'rfid_uid', index: 'uq_credentials_rfid_uid' },
    { column: 'fingerprint_id', index: 'uq_credentials_fingerprint_id' },
  ]) {
    const [indexes] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'credentials_auth' AND INDEX_NAME = ?`,
      [index]
    );
    if (indexes.length) continue;

    const [duplicates] = await pool.query(
      `SELECT ${column} AS credential FROM credentials_auth
       WHERE ${column} IS NOT NULL
       GROUP BY ${column} HAVING COUNT(*) > 1 LIMIT 1`
    );
    if (duplicates.length) {
      console.warn(`Unique index ${index} not created because duplicate credential values already exist.`);
      continue;
    }

    await pool.query(`CREATE UNIQUE INDEX ${index} ON credentials_auth (${column})`);
  }

  const [waliRelationIndex] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wali_santri'
       AND INDEX_NAME = 'uq_wali_user_santri'`
  );
  if (!waliRelationIndex.length) {
    const [duplicateWaliRelations] = await pool.query(
      `SELECT user_id, santri_id FROM wali_santri
       WHERE user_id IS NOT NULL AND santri_id IS NOT NULL
       GROUP BY user_id, santri_id HAVING COUNT(*) > 1 LIMIT 1`
    );
    if (duplicateWaliRelations.length) {
      console.warn('Unique wali-child index not created because duplicate links already exist.');
    } else {
      await pool.query('CREATE UNIQUE INDEX uq_wali_user_santri ON wali_santri (user_id, santri_id)');
    }
  }
};
