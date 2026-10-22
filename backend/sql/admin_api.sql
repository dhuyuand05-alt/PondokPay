-- Tabel operasional PondokPay.
-- Membutuhkan tabel users dari users.sql; gunakan install.sql untuk instalasi baru.

CREATE TABLE IF NOT EXISTS kantin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    lokasi VARCHAR(255) DEFAULT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    saldo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    tipe_transaksi ENUM('belanja', 'topup', 'tarik') NOT NULL,
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
