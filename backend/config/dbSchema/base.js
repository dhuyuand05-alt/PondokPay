import bcrypt from 'bcryptjs';

export const ensureBaseSchema = async (pool) => {
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
      catalog_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      saldo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const [catalogEnabledColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kantin' AND COLUMN_NAME = 'catalog_enabled'`
  );
  if (!catalogEnabledColumn.length) {
    await pool.query('ALTER TABLE kantin ADD COLUMN catalog_enabled BOOLEAN NOT NULL DEFAULT FALSE');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS institution_settings (
      id TINYINT UNSIGNED PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      address VARCHAR(255) DEFAULT NULL,
      phone VARCHAR(30) DEFAULT NULL,
      email VARCHAR(254) DEFAULT NULL,
      manager_name VARCHAR(100) DEFAULT NULL,
      logo_path VARCHAR(255) DEFAULT NULL,
      app_name VARCHAR(80) DEFAULT NULL,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
      midtrans_merchant_id VARCHAR(100) DEFAULT NULL,
      midtrans_client_key VARCHAR(255) DEFAULT NULL,
      midtrans_server_key_enc TEXT DEFAULT NULL,
      midtrans_environment ENUM('sandbox', 'production') NOT NULL DEFAULT 'sandbox'
    )
  `);
  for (const column of [
    { name: 'app_name', definition: 'VARCHAR(80) DEFAULT NULL' },
    { name: 'midtrans_merchant_id', definition: 'VARCHAR(100) DEFAULT NULL' },
    { name: 'midtrans_client_key', definition: 'VARCHAR(255) DEFAULT NULL' },
    { name: 'midtrans_server_key_enc', definition: 'TEXT DEFAULT NULL' },
    { name: 'midtrans_environment', definition: "ENUM('sandbox', 'production') NOT NULL DEFAULT 'sandbox'" },
  ]) {
    const [existing] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institution_settings' AND COLUMN_NAME = ?`,
      [column.name]
    );
    if (!existing.length) {
      await pool.query(`ALTER TABLE institution_settings ADD COLUMN ${column.name} ${column.definition}`);
    }
  }
  const [legacyWhatsAppColumns] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institution_settings'
       AND COLUMN_NAME IN ('fonnte_token_enc', 'fonnte_webhook_secret_hash')`
  );
  if (legacyWhatsAppColumns.length) {
    const resetColumns = legacyWhatsAppColumns
      .map(({ COLUMN_NAME }) => `\`${COLUMN_NAME}\` = NULL`)
      .join(', ');
    await pool.query(`UPDATE institution_settings SET ${resetColumns}`);
  }
  await pool.query(
    `INSERT IGNORE INTO institution_settings
       (id, name, address, phone, email, manager_name, timezone)
     VALUES (1, 'Nama Pondok', 'Jl. Contoh No. 123, Kabupaten/Kota',
       '+62 812-0000-0000', 'info@contoh.ponpes.id', 'Nama Penanggung Jawab', 'Asia/Jakarta')`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_notification_settings (
      user_id INT PRIMARY KEY,
      whatsapp_number VARCHAR(16) NOT NULL,
      verification_code_hash CHAR(64) DEFAULT NULL,
      verification_expires_at DATETIME DEFAULT NULL,
      verified_at DATETIME DEFAULT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_parent_notification_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
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
      tipe_transaksi ENUM('belanja', 'topup', 'tarik', 'biaya_layanan') NOT NULL,
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
    CREATE TABLE IF NOT EXISTS whatsapp_notification_outbox (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      transaction_id BIGINT NOT NULL,
      user_id INT NOT NULL,
      status ENUM('pending', 'processing', 'sent', 'failed') NOT NULL DEFAULT 'pending',
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processing_at DATETIME DEFAULT NULL,
      sent_at DATETIME DEFAULT NULL,
      last_error VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_whatsapp_notification_transaction_user (transaction_id, user_id),
      INDEX idx_whatsapp_notification_queue (status, next_attempt_at),
      CONSTRAINT fk_whatsapp_notification_transaction FOREIGN KEY (transaction_id)
        REFERENCES transaksi(id) ON DELETE CASCADE,
      CONSTRAINT fk_whatsapp_notification_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
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
};
