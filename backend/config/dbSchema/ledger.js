export const ensureLedgerSchema = async (pool) => {
  const [transactionCreatorColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi' AND COLUMN_NAME = 'created_by'`
  );
  if (!transactionCreatorColumn.length) {
    await pool.query('ALTER TABLE transaksi ADD COLUMN created_by INT DEFAULT NULL');
  }
  const [transactionCreatorForeignKey] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi'
       AND CONSTRAINT_NAME = 'fk_transaksi_creator'`
  );
  if (!transactionCreatorForeignKey.length) {
    await pool.query(
      `ALTER TABLE transaksi ADD CONSTRAINT fk_transaksi_creator
       FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`
    );
  }
  for (const column of [
    { name: 'idempotency_key', definition: 'VARCHAR(64) DEFAULT NULL' },
    { name: 'created_by', definition: 'INT DEFAULT NULL' },
  ]) {
    const [existing] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kantin_transaksi'
         AND COLUMN_NAME = ?`,
      [column.name]
    );
    if (!existing.length) {
      await pool.query(`ALTER TABLE kantin_transaksi ADD COLUMN ${column.name} ${column.definition}`);
    }
  }
  const [canteenIdempotencyIndex] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kantin_transaksi'
       AND INDEX_NAME = 'uq_kantin_idempotency_key'`
  );
  if (!canteenIdempotencyIndex.length) {
    await pool.query('CREATE UNIQUE INDEX uq_kantin_idempotency_key ON kantin_transaksi (idempotency_key)');
  }
  const [canteenCreatorForeignKey] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'kantin_transaksi'
       AND CONSTRAINT_NAME = 'fk_kantin_transaksi_creator'`
  );
  if (!canteenCreatorForeignKey.length) {
    await pool.query(
      `ALTER TABLE kantin_transaksi ADD CONSTRAINT fk_kantin_transaksi_creator
       FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`
    );
  }
  for (const [triggerName, event] of [
    ['trg_transaksi_no_update', 'UPDATE'],
    ['trg_transaksi_no_delete', 'DELETE'],
    ['trg_kantin_transaksi_no_update', 'UPDATE'],
    ['trg_kantin_transaksi_no_delete', 'DELETE'],
  ]) {
    const table = triggerName.includes('kantin_') ? 'kantin_transaksi' : 'transaksi';
    const [trigger] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
       WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`,
      [triggerName]
    );
    if (!trigger.length) {
      await pool.query(
        `CREATE TRIGGER ${triggerName} BEFORE ${event} ON ${table}
         FOR EACH ROW SIGNAL SQLSTATE '45000'
         SET MESSAGE_TEXT = 'Financial ledger rows are append-only'`
      );
    }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      request_id CHAR(36) NOT NULL UNIQUE,
      actor_user_id INT DEFAULT NULL,
      action VARCHAR(10) NOT NULL,
      resource VARCHAR(255) NOT NULL,
      details VARCHAR(500) DEFAULT NULL,
      source_ip VARCHAR(45) DEFAULT NULL,
      user_agent VARCHAR(255) DEFAULT NULL,
      status_code SMALLINT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_actor_created (actor_user_id, created_at),
      INDEX idx_audit_resource_created (resource, created_at),
      CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  const [auditDetailsColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND COLUMN_NAME = 'details'`
  );
  if (!auditDetailsColumn.length) {
    await pool.query('ALTER TABLE audit_logs ADD COLUMN details VARCHAR(500) DEFAULT NULL AFTER resource');
  }
  for (const triggerName of ['trg_audit_logs_no_delete', 'trg_audit_logs_protect_update']) {
    const [triggers] = await pool.query(
      `SELECT ACTION_STATEMENT FROM INFORMATION_SCHEMA.TRIGGERS
       WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`,
      [triggerName]
    );
    const triggerNeedsUpdate = triggerName.endsWith('protect_update') &&
      triggers.length &&
      !String(triggers[0].ACTION_STATEMENT).includes('NEW.details');
    if (triggerNeedsUpdate) {
      await pool.query(`DROP TRIGGER ${triggerName}`);
    }
    if ((!triggers.length || triggerNeedsUpdate) && triggerName.endsWith('no_delete')) {
      await pool.query(
        `CREATE TRIGGER ${triggerName} BEFORE DELETE ON audit_logs
         FOR EACH ROW SIGNAL SQLSTATE '45000'
         SET MESSAGE_TEXT = 'Audit log rows are immutable'`
      );
    }
    if ((!triggers.length || triggerNeedsUpdate) && triggerName.endsWith('protect_update')) {
      await pool.query(
        `CREATE TRIGGER ${triggerName} BEFORE UPDATE ON audit_logs
         FOR EACH ROW
         BEGIN
           IF NOT (NEW.request_id <=> OLD.request_id)
             OR NOT (NEW.actor_user_id <=> OLD.actor_user_id)
             OR NOT (NEW.action <=> OLD.action)
             OR NOT (NEW.resource <=> OLD.resource)
             OR NOT (NEW.details <=> OLD.details)
             OR NOT (NEW.source_ip <=> OLD.source_ip)
             OR NOT (NEW.user_agent <=> OLD.user_agent)
             OR NOT (NEW.created_at <=> OLD.created_at)
             OR (OLD.status_code IS NOT NULL AND NOT (NEW.status_code <=> OLD.status_code))
           THEN
             SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log rows are immutable';
           END IF;
         END`
      );
    }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS financial_approvals (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      action ENUM('santri_topup', 'santri_withdrawal', 'canteen_withdrawal') NOT NULL,
      resource_id INT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      keterangan TEXT DEFAULT NULL,
      requester_id INT NOT NULL,
      approver_id INT DEFAULT NULL,
      status ENUM('pending', 'approved', 'rejected', 'consumed', 'expired') NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      decided_at TIMESTAMP DEFAULT NULL,
      consumed_at TIMESTAMP DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_financial_approval_pending (status, expires_at),
      CONSTRAINT fk_financial_approval_requester FOREIGN KEY (requester_id)
        REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_financial_approval_approver FOREIGN KEY (approver_id)
        REFERENCES users(id) ON DELETE RESTRICT
    )
  `);
  const [approvalTrigger] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE()
       AND TRIGGER_NAME = 'trg_financial_approval_protect_update'`
  );
  if (!approvalTrigger.length) {
    await pool.query(
      `CREATE TRIGGER trg_financial_approval_protect_update BEFORE UPDATE ON financial_approvals
       FOR EACH ROW
       BEGIN
         IF NOT (NEW.action <=> OLD.action)
           OR NOT (NEW.resource_id <=> OLD.resource_id)
           OR NOT (NEW.amount <=> OLD.amount)
           OR NOT (NEW.keterangan <=> OLD.keterangan)
           OR NOT (NEW.requester_id <=> OLD.requester_id)
           OR NOT (NEW.expires_at <=> OLD.expires_at)
           OR NOT (NEW.created_at <=> OLD.created_at)
           OR (
             NOT (
               OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')
               AND OLD.approver_id IS NULL AND NEW.approver_id IS NOT NULL
               AND OLD.decided_at IS NULL AND NEW.decided_at IS NOT NULL
               AND NEW.consumed_at IS NULL
             )
             AND NOT (
               OLD.status = 'approved' AND NEW.status = 'consumed'
               AND OLD.approver_id <=> NEW.approver_id
               AND OLD.decided_at <=> NEW.decided_at
               AND OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL
             )
             AND NOT (
               OLD.status <=> NEW.status
               AND OLD.approver_id <=> NEW.approver_id
               AND OLD.decided_at <=> NEW.decided_at
               AND OLD.consumed_at <=> NEW.consumed_at
             )
           )
         THEN
           SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Financial approval data is immutable';
         END IF;
       END`
    );
  }
};
