export const ensureAdminCashSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_cash_entries (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      direction ENUM('income', 'expense') NOT NULL,
      category VARCHAR(80) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      description VARCHAR(500) NOT NULL,
      service_fee_charge_id BIGINT DEFAULT NULL UNIQUE,
      reverses_entry_id BIGINT DEFAULT NULL UNIQUE,
      idempotency_key VARCHAR(64) DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_admin_cash_created (created_at, id),
      UNIQUE KEY uq_admin_cash_idempotency_key (idempotency_key),
      CONSTRAINT fk_admin_cash_fee_charge FOREIGN KEY (service_fee_charge_id)
        REFERENCES service_fee_charges(id) ON DELETE RESTRICT,
      CONSTRAINT fk_admin_cash_reversal FOREIGN KEY (reverses_entry_id)
        REFERENCES admin_cash_entries(id) ON DELETE RESTRICT,
      CONSTRAINT fk_admin_cash_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  const [adminCashIdempotencyColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_cash_entries'
       AND COLUMN_NAME = 'idempotency_key'`
  );
  if (!adminCashIdempotencyColumn.length) {
    await pool.query(
      'ALTER TABLE admin_cash_entries ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL'
    );
  }
  const [adminCashIdempotencyIndex] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_cash_entries'
       AND COLUMN_NAME = 'idempotency_key' AND NON_UNIQUE = 0`
  );
  if (!adminCashIdempotencyIndex.length) {
    await pool.query(
      'CREATE UNIQUE INDEX uq_admin_cash_idempotency_key ON admin_cash_entries (idempotency_key)'
    );
  }
  for (const [triggerName, event] of [
    ['trg_admin_cash_no_update', 'UPDATE'],
    ['trg_admin_cash_no_delete', 'DELETE'],
  ]) {
    const [trigger] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
       WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`,
      [triggerName]
    );
    if (!trigger.length) {
      await pool.query(
        `CREATE TRIGGER ${triggerName} BEFORE ${event} ON admin_cash_entries
         FOR EACH ROW SIGNAL SQLSTATE '45000'
         SET MESSAGE_TEXT = 'Admin cash ledger rows are append-only'`
      );
    }
  }
};
