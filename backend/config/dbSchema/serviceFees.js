export const ensureServiceFeeSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_rate_limits (
      bucket_key CHAR(64) PRIMARY KEY,
      attempts INT UNSIGNED NOT NULL,
      window_started_at TIMESTAMP NOT NULL,
      INDEX idx_security_rate_window (window_started_at)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_fee_rates (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      amount DECIMAL(10,2) NOT NULL,
      effective_from DATE NOT NULL,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_service_fee_rates_effective (effective_from, id),
      CONSTRAINT fk_service_fee_rate_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  const [serviceFeeRateTrigger] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE()
       AND TRIGGER_NAME = 'trg_service_fee_rates_immutable'`
  );
  if (!serviceFeeRateTrigger.length) {
    await pool.query(
      `CREATE TRIGGER trg_service_fee_rates_immutable
       BEFORE UPDATE ON service_fee_rates
       FOR EACH ROW SIGNAL SQLSTATE '45000'
       SET MESSAGE_TEXT = 'Service fee rate history is append-only'`
    );
  }
  const [serviceFeeRateDeleteTrigger] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE()
       AND TRIGGER_NAME = 'trg_service_fee_rates_no_delete'`
  );
  if (!serviceFeeRateDeleteTrigger.length) {
    await pool.query(
      `CREATE TRIGGER trg_service_fee_rates_no_delete
       BEFORE DELETE ON service_fee_rates
       FOR EACH ROW SIGNAL SQLSTATE '45000'
       SET MESSAGE_TEXT = 'Service fee rate history is append-only'`
    );
  }
  await pool.query(`
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
    )
  `);
  let serviceFeeChargeSchemaChanged = false;
  const [forgivenAtColumn] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_fee_charges'
       AND COLUMN_NAME = 'forgiven_at'`
  );
  if (!forgivenAtColumn.length) {
    await pool.query(
      'ALTER TABLE service_fee_charges ADD COLUMN forgiven_at TIMESTAMP DEFAULT NULL AFTER paid_at'
    );
    serviceFeeChargeSchemaChanged = true;
  }
  const [serviceFeeStatusColumn] = await pool.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_fee_charges'
       AND COLUMN_NAME = 'status'`
  );
  if (serviceFeeStatusColumn.length &&
      !serviceFeeStatusColumn[0].COLUMN_TYPE.includes("'forgiven'")) {
    await pool.query(
      `ALTER TABLE service_fee_charges MODIFY status
       ENUM('unpaid', 'paid', 'forgiven') NOT NULL DEFAULT 'unpaid'`
    );
    serviceFeeChargeSchemaChanged = true;
  }
  if (serviceFeeChargeSchemaChanged) {
    await pool.query('DROP TRIGGER IF EXISTS trg_service_fee_charge_protect_update');
  }
  const [serviceFeeTrigger] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE()
       AND TRIGGER_NAME = 'trg_service_fee_charge_protect_update'`
  );
  if (!serviceFeeTrigger.length) {
    await pool.query(
      `CREATE TRIGGER trg_service_fee_charge_protect_update
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
           SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Service fee charge records are immutable';
         END IF;
       END`
    );
  }
  const [serviceFeeDeleteTrigger] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE()
       AND TRIGGER_NAME = 'trg_service_fee_charge_no_delete'`
  );
  if (!serviceFeeDeleteTrigger.length) {
    await pool.query(
      `CREATE TRIGGER trg_service_fee_charge_no_delete
       BEFORE DELETE ON service_fee_charges
       FOR EACH ROW SIGNAL SQLSTATE '45000'
       SET MESSAGE_TEXT = 'Service fee charge records are immutable'`
    );
  }
};
