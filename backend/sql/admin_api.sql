CREATE TABLE IF NOT EXISTS kantin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    lokasi VARCHAR(255) DEFAULT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    saldo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE transaksi
    MODIFY tipe_transaksi ENUM('belanja', 'topup', 'tarik') NOT NULL,
    ADD COLUMN kantin_id INT NULL AFTER santri_id,
    ADD CONSTRAINT fk_transaksi_kantin
        FOREIGN KEY (kantin_id) REFERENCES kantin(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS kantin_transaksi (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kantin_id INT NOT NULL,
    transaksi_id BIGINT DEFAULT NULL,
    tipe_transaksi ENUM('penjualan', 'pencairan') NOT NULL,
    jumlah DECIMAL(10,2) NOT NULL,
    saldo_akhir DECIMAL(12,2) NOT NULL,
    keterangan TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_kantin_transaksi_transaksi (transaksi_id),
    CONSTRAINT fk_kantin_transaksi_kantin
        FOREIGN KEY (kantin_id) REFERENCES kantin(id) ON DELETE RESTRICT,
    CONSTRAINT fk_kantin_transaksi_transaksi
        FOREIGN KEY (transaksi_id) REFERENCES transaksi(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_credentials_rfid_uid ON credentials_auth (rfid_uid);
CREATE UNIQUE INDEX uq_credentials_fingerprint_id ON credentials_auth (fingerprint_id);
CREATE UNIQUE INDEX uq_wali_user_santri ON wali_santri (user_id, santri_id);

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
);

ALTER TABLE transaksi
    ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL,
    ADD COLUMN created_by INT DEFAULT NULL,
    ADD CONSTRAINT fk_transaksi_creator
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD UNIQUE INDEX uq_transaksi_idempotency_key (idempotency_key);

ALTER TABLE kantin_transaksi
    ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL,
    ADD COLUMN created_by INT DEFAULT NULL,
    ADD UNIQUE INDEX uq_kantin_idempotency_key (idempotency_key),
    ADD CONSTRAINT fk_kantin_transaksi_creator
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TRIGGER trg_transaksi_no_update BEFORE UPDATE ON transaksi
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Financial ledger rows are append-only';
CREATE TRIGGER trg_transaksi_no_delete BEFORE DELETE ON transaksi
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Financial ledger rows are append-only';
CREATE TRIGGER trg_kantin_transaksi_no_update BEFORE UPDATE ON kantin_transaksi
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Financial ledger rows are append-only';
CREATE TRIGGER trg_kantin_transaksi_no_delete BEFORE DELETE ON kantin_transaksi
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Financial ledger rows are append-only';
