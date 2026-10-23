-- Tabel operasional PondokPay.
-- Membutuhkan tabel users dari users.sql; gunakan install.sql untuk instalasi baru.

CREATE TABLE IF NOT EXISTS kantin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    lokasi VARCHAR(255) DEFAULT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    catalog_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    saldo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

INSERT IGNORE INTO institution_settings
    (id, name, address, phone, email, manager_name, timezone)
VALUES (1, 'Nama Pondok', 'Jl. Contoh No. 123, Kabupaten/Kota',
    '+62 812-0000-0000', 'info@contoh.ponpes.id', 'Nama Penanggung Jawab', 'Asia/Jakarta');

CREATE TABLE IF NOT EXISTS parent_notification_settings (
    user_id INT PRIMARY KEY,
    whatsapp_number VARCHAR(16) NOT NULL,
    verification_code_hash CHAR(64) DEFAULT NULL,
    verification_expires_at DATETIME DEFAULT NULL,
    verified_at DATETIME DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_parent_notification_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS santri (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    nis VARCHAR(30) NOT NULL UNIQUE,
    nama_lengkap VARCHAR(100) NOT NULL,
    asrama VARCHAR(50) DEFAULT NULL,
    saldo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    limit_harian DECIMAL(10,2) NOT NULL DEFAULT 50000.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    INDEX idx_santri_nama (nama_lengkap),
    CONSTRAINT fk_santri_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS credentials_auth (
    id INT AUTO_INCREMENT PRIMARY KEY,
    santri_id INT DEFAULT NULL,
    rfid_uid VARCHAR(50) DEFAULT NULL,
    fingerprint_id INT DEFAULT NULL,
    status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
    UNIQUE KEY uq_credentials_rfid_uid (rfid_uid),
    UNIQUE KEY uq_credentials_fingerprint_id (fingerprint_id),
    CONSTRAINT fk_credentials_santri FOREIGN KEY (santri_id)
        REFERENCES santri(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transaksi (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    santri_id INT DEFAULT NULL,
    kantin_id INT DEFAULT NULL,
    tipe_transaksi ENUM('belanja', 'topup', 'tarik', 'biaya_layanan') NOT NULL,
    jumlah DECIMAL(10,2) NOT NULL,
    saldo_akhir DECIMAL(12,2) NOT NULL,
    created_by INT DEFAULT NULL,
    idempotency_key VARCHAR(64) DEFAULT NULL,
    keterangan TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_transaksi_idempotency_key (idempotency_key),
    INDEX idx_transaksi_santri_created (santri_id, created_at),
    INDEX idx_transaksi_kantin_created (kantin_id, created_at),
    INDEX idx_transaksi_tipe_created (tipe_transaksi, created_at),
    CONSTRAINT fk_transaksi_santri FOREIGN KEY (santri_id)
        REFERENCES santri(id) ON DELETE CASCADE,
    CONSTRAINT fk_transaksi_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE SET NULL,
    CONSTRAINT fk_transaksi_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wali_santri (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    santri_id INT DEFAULT NULL,
    no_whatsapp VARCHAR(20) DEFAULT NULL,
    UNIQUE KEY uq_wali_user_santri (user_id, santri_id),
    INDEX idx_wali_santri_user (user_id),
    INDEX idx_wali_santri_student (santri_id),
    CONSTRAINT fk_wali_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_wali_santri FOREIGN KEY (santri_id)
        REFERENCES santri(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_kantin_transaksi_transaksi (transaksi_id),
    UNIQUE KEY uq_kantin_idempotency_key (idempotency_key),
    INDEX idx_kantin_transaksi_created (kantin_id, created_at),
    CONSTRAINT fk_kantin_transaksi_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE RESTRICT,
    CONSTRAINT fk_kantin_transaksi_transaksi FOREIGN KEY (transaksi_id)
        REFERENCES transaksi(id) ON DELETE SET NULL,
    CONSTRAINT fk_kantin_transaksi_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS kantin_kasir (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kantin_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_kantin_kasir (kantin_id, user_id),
    INDEX idx_kantin_kasir_user (user_id),
    CONSTRAINT fk_kantin_kasir_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE CASCADE,
    CONSTRAINT fk_kantin_kasir_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS service_fee_rates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    amount DECIMAL(10,2) NOT NULL,
    effective_from DATE NOT NULL,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_service_fee_rates_effective (effective_from, id),
    CONSTRAINT fk_service_fee_rate_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS service_fee_charges (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    santri_id INT NOT NULL,
    billing_period DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('unpaid', 'paid', 'forgiven') NOT NULL DEFAULT 'unpaid',
    paid_at TIMESTAMP DEFAULT NULL,
    forgiven_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_service_fee_student_period (santri_id, billing_period),
    INDEX idx_service_fee_status_period (status, billing_period),
    CONSTRAINT fk_service_fee_charge_santri FOREIGN KEY (santri_id)
        REFERENCES santri(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_cash_entries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    direction ENUM('income', 'expense') NOT NULL,
    category VARCHAR(80) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description VARCHAR(500) NOT NULL,
    service_fee_charge_id BIGINT DEFAULT NULL UNIQUE,
    reverses_entry_id BIGINT DEFAULT NULL UNIQUE,
    idempotency_key VARCHAR(64) DEFAULT NULL UNIQUE,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_cash_created (created_at, id),
    CONSTRAINT fk_admin_cash_fee_charge FOREIGN KEY (service_fee_charge_id)
        REFERENCES service_fee_charges(id) ON DELETE RESTRICT,
    CONSTRAINT fk_admin_cash_reversal FOREIGN KEY (reverses_entry_id)
        REFERENCES admin_cash_entries(id) ON DELETE RESTRICT,
    CONSTRAINT fk_admin_cash_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS canteen_payout_approvals (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kantin_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    keterangan TEXT DEFAULT NULL,
    requester_id INT NOT NULL,
    cashier_id INT DEFAULT NULL,
    status ENUM('pending', 'approved', 'rejected', 'consumed')
        NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL,
    decided_at TIMESTAMP DEFAULT NULL,
    consumed_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_canteen_payout_pending (status, expires_at),
    INDEX idx_canteen_payout_requester (requester_id, created_at),
    CONSTRAINT fk_canteen_payout_kantin FOREIGN KEY (kantin_id)
        REFERENCES kantin(id) ON DELETE RESTRICT,
    CONSTRAINT fk_canteen_payout_requester FOREIGN KEY (requester_id)
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_canteen_payout_cashier FOREIGN KEY (cashier_id)
        REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TRIGGER IF EXISTS trg_transaksi_no_update;
DROP TRIGGER IF EXISTS trg_transaksi_no_delete;
DROP TRIGGER IF EXISTS trg_kantin_transaksi_no_update;
DROP TRIGGER IF EXISTS trg_kantin_transaksi_no_delete;
DROP TRIGGER IF EXISTS trg_canteen_payout_approval_protect_update;
DROP TRIGGER IF EXISTS trg_admin_cash_no_update;
DROP TRIGGER IF EXISTS trg_admin_cash_no_delete;
DROP TRIGGER IF EXISTS trg_service_fee_charge_protect_update;
DROP TRIGGER IF EXISTS trg_service_fee_charge_no_delete;
DROP TRIGGER IF EXISTS trg_service_fee_rates_immutable;
DROP TRIGGER IF EXISTS trg_service_fee_rates_no_delete;

DELIMITER $$

CREATE TRIGGER trg_transaksi_no_update
BEFORE UPDATE ON transaksi
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Financial ledger rows are append-only';
END$$

CREATE TRIGGER trg_transaksi_no_delete
BEFORE DELETE ON transaksi
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Financial ledger rows are append-only';
END$$

CREATE TRIGGER trg_kantin_transaksi_no_update
BEFORE UPDATE ON kantin_transaksi
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Financial ledger rows are append-only';
END$$

CREATE TRIGGER trg_kantin_transaksi_no_delete
BEFORE DELETE ON kantin_transaksi
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Financial ledger rows are append-only';
END$$

CREATE TRIGGER trg_admin_cash_no_update
BEFORE UPDATE ON admin_cash_entries
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Admin cash ledger rows are append-only';
END$$

CREATE TRIGGER trg_admin_cash_no_delete
BEFORE DELETE ON admin_cash_entries
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Admin cash ledger rows are append-only';
END$$

CREATE TRIGGER trg_service_fee_rates_immutable
BEFORE UPDATE ON service_fee_rates
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Service fee rate history is append-only';
END$$

CREATE TRIGGER trg_service_fee_rates_no_delete
BEFORE DELETE ON service_fee_rates
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Service fee rate history is append-only';
END$$

CREATE TRIGGER trg_service_fee_charge_protect_update
BEFORE UPDATE ON service_fee_charges
FOR EACH ROW
BEGIN
    IF NOT (NEW.santri_id <=> OLD.santri_id)
        OR NOT (NEW.billing_period <=> OLD.billing_period)
        OR NOT (NEW.amount <=> OLD.amount)
        OR NOT (NEW.created_at <=> OLD.created_at)
        OR NOT (
            (OLD.status = 'unpaid' AND NEW.status IN ('paid', 'forgiven')
                AND (
                    (NEW.status = 'paid' AND NEW.paid_at IS NOT NULL AND NEW.forgiven_at IS NULL)
                    OR (NEW.status = 'forgiven' AND NEW.paid_at IS NULL AND NEW.forgiven_at IS NOT NULL)
                ))
            OR (OLD.status <=> NEW.status AND OLD.paid_at <=> NEW.paid_at
                AND OLD.forgiven_at <=> NEW.forgiven_at)
        )
    THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Service fee charge records are immutable';
    END IF;
END$$

CREATE TRIGGER trg_service_fee_charge_no_delete
BEFORE DELETE ON service_fee_charges
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Service fee charge records are immutable';
END$$

CREATE TRIGGER trg_canteen_payout_approval_protect_update
BEFORE UPDATE ON canteen_payout_approvals
FOR EACH ROW
BEGIN
    IF NOT (NEW.kantin_id <=> OLD.kantin_id)
        OR NOT (NEW.amount <=> OLD.amount)
        OR NOT (NEW.keterangan <=> OLD.keterangan)
        OR NOT (NEW.requester_id <=> OLD.requester_id)
        OR NOT (NEW.expires_at <=> OLD.expires_at)
        OR NOT (NEW.created_at <=> OLD.created_at)
        OR NOT (
            (
                OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')
                AND OLD.cashier_id IS NULL AND NEW.cashier_id IS NOT NULL
                AND OLD.decided_at IS NULL AND NEW.decided_at IS NOT NULL
                AND NEW.consumed_at IS NULL
            )
            OR (
                OLD.status = 'approved' AND NEW.status = 'consumed'
                AND OLD.cashier_id <=> NEW.cashier_id
                AND OLD.decided_at <=> NEW.decided_at
                AND OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL
            )
        )
    THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Canteen payout approval data is immutable';
    END IF;
END$$

DELIMITER ;
