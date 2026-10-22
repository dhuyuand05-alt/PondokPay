import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_cashless_santri',
  ssl: process.env.DB_SSL_CA
    ? { ca: readFileSync(process.env.DB_SSL_CA), rejectUnauthorized: true }
    : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
});

export const ensureAdminSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('santri', 'kasir', 'wali', 'admin') NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      token_version INT UNSIGNED NOT NULL DEFAULT 0,
      mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      mfa_secret_enc VARCHAR(255) DEFAULT NULL,
      mfa_pending_secret_enc VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  for (const column of [
    { name: 'is_active', definition: 'BOOLEAN NOT NULL DEFAULT TRUE' },
    { name: 'token_version', definition: 'INT UNSIGNED NOT NULL DEFAULT 0' },
    { name: 'mfa_enabled', definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
    { name: 'mfa_secret_enc', definition: 'VARCHAR(255) DEFAULT NULL' },
    { name: 'mfa_pending_secret_enc', definition: 'VARCHAR(255) DEFAULT NULL' },
    { name: 'mfa_last_step', definition: 'BIGINT NOT NULL DEFAULT -1' },
  ]) {
    const [existing] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
      [column.name]
    );
    if (!existing.length) {
      await pool.query(`ALTER TABLE users ADD COLUMN ${column.name} ${column.definition}`);
    }
  }
  const [legacyAdmin] = await pool.query(
    `SELECT id, password FROM users WHERE username = ? AND role = ? AND is_active = TRUE`,
    ['admin', 'admin']
  );
  if (legacyAdmin.length && await bcrypt.compare('admin123', legacyAdmin[0].password)) {
    await pool.query(
      'UPDATE users SET is_active = FALSE, token_version = token_version + 1 WHERE id = ?',
      [legacyAdmin[0].id]
    );
    console.warn('Disabled the known default admin credential. Provision a new secret before admin access.');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kantin (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nama VARCHAR(100) NOT NULL,
      lokasi VARCHAR(255) DEFAULT NULL,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      saldo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS santri (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      nis VARCHAR(30) UNIQUE NOT NULL,
      nama_lengkap VARCHAR(100) NOT NULL,
      asrama VARCHAR(50) DEFAULT NULL,
      saldo DECIMAL(12,2) DEFAULT 0.00,
      limit_harian DECIMAL(10,2) DEFAULT 50000.00,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  const [studentActiveColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri' AND COLUMN_NAME = 'is_active'`
  );
  if (!studentActiveColumn.length) {
    await pool.query('ALTER TABLE santri ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS credentials_auth (
      id INT AUTO_INCREMENT PRIMARY KEY,
      santri_id INT DEFAULT NULL,
      rfid_uid VARCHAR(50) DEFAULT NULL,
      fingerprint_id INT DEFAULT NULL,
      status ENUM('active', 'blocked') DEFAULT 'active',
      FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transaksi (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      santri_id INT DEFAULT NULL,
      tipe_transaksi ENUM('belanja', 'topup', 'tarik') NOT NULL,
      jumlah DECIMAL(10,2) NOT NULL,
      saldo_akhir DECIMAL(12,2) NOT NULL,
      created_by INT DEFAULT NULL,
      keterangan TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
      CONSTRAINT fk_transaksi_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wali_santri (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      santri_id INT DEFAULT NULL,
      no_whatsapp VARCHAR(20) DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE
    )
  `);
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
  if (transactionTypeColumn.length && !transactionTypeColumn[0].COLUMN_TYPE.includes("'tarik'")) {
    await pool.query(
      `ALTER TABLE transaksi MODIFY tipe_transaksi
       ENUM('belanja', 'topup', 'tarik') NOT NULL`
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
  for (const triggerName of ['trg_audit_logs_no_delete', 'trg_audit_logs_protect_update']) {
    const [trigger] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
       WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`,
      [triggerName]
    );
    if (!trigger.length && triggerName.endsWith('no_delete')) {
      await pool.query(
        `CREATE TRIGGER ${triggerName} BEFORE DELETE ON audit_logs
         FOR EACH ROW SIGNAL SQLSTATE '45000'
         SET MESSAGE_TEXT = 'Audit log rows are immutable'`
      );
    }
    if (!trigger.length && triggerName.endsWith('protect_update')) {
      await pool.query(
        `CREATE TRIGGER ${triggerName} BEFORE UPDATE ON audit_logs
         FOR EACH ROW
         BEGIN
           IF NOT (NEW.request_id <=> OLD.request_id)
             OR NOT (NEW.actor_user_id <=> OLD.actor_user_id)
             OR NOT (NEW.action <=> OLD.action)
             OR NOT (NEW.resource <=> OLD.resource)
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_rate_limits (
      bucket_key CHAR(64) PRIMARY KEY,
      attempts INT UNSIGNED NOT NULL,
      window_started_at TIMESTAMP NOT NULL,
      INDEX idx_security_rate_window (window_started_at)
    )
  `);

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

export default pool;
