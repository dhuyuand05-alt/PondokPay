-- Tabel akun dan keamanan PondokPay.
-- Jalankan melalui install.sql agar database yang benar dipilih terlebih dahulu.

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('santri', 'kasir', 'wali', 'admin') NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    token_version INT UNSIGNED NOT NULL DEFAULT 0,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret_enc VARCHAR(255) DEFAULT NULL,
    mfa_pending_secret_enc VARCHAR(255) DEFAULT NULL,
    mfa_last_step BIGINT NOT NULL DEFAULT -1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id CHAR(36) NOT NULL UNIQUE,
    actor_user_id INT DEFAULT NULL,
    action VARCHAR(10) NOT NULL,
    resource VARCHAR(255) NOT NULL,
    source_ip VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,
    status_code SMALLINT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_actor_created (actor_user_id, created_at),
    INDEX idx_audit_resource_created (resource, created_at),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS financial_approvals (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    action ENUM('santri_topup', 'santri_withdrawal', 'canteen_withdrawal') NOT NULL,
    resource_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    keterangan TEXT DEFAULT NULL,
    requester_id INT NOT NULL,
    approver_id INT DEFAULT NULL,
    status ENUM('pending', 'approved', 'rejected', 'consumed', 'expired')
        NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL,
    decided_at TIMESTAMP DEFAULT NULL,
    consumed_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_financial_approval_pending (status, expires_at),
    INDEX idx_financial_approval_requester (requester_id, created_at),
    INDEX idx_financial_approval_approver (approver_id, decided_at),
    CONSTRAINT fk_financial_approval_requester FOREIGN KEY (requester_id)
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_financial_approval_approver FOREIGN KEY (approver_id)
        REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS security_rate_limits (
    bucket_key CHAR(64) PRIMARY KEY,
    attempts INT UNSIGNED NOT NULL,
    window_started_at TIMESTAMP NOT NULL,
    INDEX idx_security_rate_window (window_started_at)
) ENGINE=InnoDB;

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete;
DROP TRIGGER IF EXISTS trg_audit_logs_protect_update;
DROP TRIGGER IF EXISTS trg_financial_approval_protect_update;

DELIMITER $$

CREATE TRIGGER trg_audit_logs_no_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Audit log rows are immutable';
END$$

CREATE TRIGGER trg_audit_logs_protect_update
BEFORE UPDATE ON audit_logs
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
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Audit log rows are immutable';
    END IF;
END$$

CREATE TRIGGER trg_financial_approval_protect_update
BEFORE UPDATE ON financial_approvals
FOR EACH ROW
BEGIN
    IF NOT (NEW.action <=> OLD.action)
        OR NOT (NEW.resource_id <=> OLD.resource_id)
        OR NOT (NEW.amount <=> OLD.amount)
        OR NOT (NEW.keterangan <=> OLD.keterangan)
        OR NOT (NEW.requester_id <=> OLD.requester_id)
        OR NOT (NEW.expires_at <=> OLD.expires_at)
        OR NOT (NEW.created_at <=> OLD.created_at)
        OR NOT (
            (
                OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')
                AND OLD.approver_id IS NULL AND NEW.approver_id IS NOT NULL
                AND OLD.decided_at IS NULL AND NEW.decided_at IS NOT NULL
                AND NEW.consumed_at IS NULL
            )
            OR (
                OLD.status = 'approved' AND NEW.status = 'consumed'
                AND OLD.approver_id <=> NEW.approver_id
                AND OLD.decided_at <=> NEW.decided_at
                AND OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL
            )
            OR (
                OLD.status <=> NEW.status
                AND OLD.approver_id <=> NEW.approver_id
                AND OLD.decided_at <=> NEW.decided_at
                AND OLD.consumed_at <=> NEW.consumed_at
            )
        )
    THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Financial approval data is immutable';
    END IF;
END$$

DELIMITER ;
