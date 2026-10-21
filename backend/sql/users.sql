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
    mfa_last_step BIGINT NOT NULL DEFAULT -1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_financial_approval_pending (status, expires_at),
    CONSTRAINT fk_financial_approval_requester FOREIGN KEY (requester_id)
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_financial_approval_approver FOREIGN KEY (approver_id)
        REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS security_rate_limits (
    bucket_key CHAR(64) PRIMARY KEY,
    attempts INT UNSIGNED NOT NULL,
    window_started_at TIMESTAMP NOT NULL,
    INDEX idx_security_rate_window (window_started_at)
);
