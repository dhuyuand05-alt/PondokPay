import pool from '../config/db.js';

const jakartaDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const currentServiceFeePeriod = (date = new Date()) => `${jakartaDate(date).slice(0, 7)}-01`;

const moneyToCents = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

const centsToMoney = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

const recordFeeCollection = async (connection, {
  santriId,
  chargeId,
  amount,
  balance,
  period,
  createdBy = null,
}) => {
  const newBalance = centsToMoney(moneyToCents(balance) - moneyToCents(amount));
  await connection.query('UPDATE santri SET saldo = ? WHERE id = ?', [newBalance, santriId]);
  const [transaction] = await connection.query(
    `INSERT INTO transaksi
       (santri_id, tipe_transaksi, jumlah, saldo_akhir, keterangan, idempotency_key, created_by)
     VALUES (?, 'biaya_layanan', ?, ?, ?, ?, ?)`,
    [
      santriId,
      amount,
      newBalance,
      `Biaya layanan bulanan ${period.slice(0, 7)}`,
      `svcfee:${period.slice(0, 7)}:${santriId}`,
      createdBy,
    ]
  );
  await connection.query(
    `UPDATE service_fee_charges SET status = 'paid', paid_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'unpaid'`,
    [chargeId]
  );
  await connection.query(
    `INSERT INTO admin_cash_entries
       (direction, category, amount, description, service_fee_charge_id, idempotency_key, created_by)
     VALUES ('income', 'Biaya layanan', ?, ?, ?, ?, ?)`,
    [
      amount,
      `Biaya layanan santri #${santriId} periode ${period.slice(0, 7)}`,
      chargeId,
      `svcfee:${period.slice(0, 7)}:${santriId}`,
      createdBy,
    ]
  );
  return { transaction_id: transaction.insertId, amount, balance: newBalance };
};

export const collectCurrentServiceFeeDebt = async (connection, {
  santriId,
  balance,
  createdBy,
}) => {
  const period = currentServiceFeePeriod();
  await connection.query(
    `UPDATE service_fee_charges SET status = 'forgiven', forgiven_at = CURRENT_TIMESTAMP
     WHERE santri_id = ? AND status = 'unpaid' AND billing_period < ?`,
    [santriId, period]
  );
  const [charges] = await connection.query(
    `SELECT id, amount FROM service_fee_charges
     WHERE santri_id = ? AND billing_period = ? AND status = 'unpaid'
     LIMIT 1 FOR UPDATE`,
    [santriId, period]
  );
  if (!charges.length || moneyToCents(balance) < moneyToCents(charges[0].amount)) return null;
  return recordFeeCollection(connection, {
    santriId,
    chargeId: charges[0].id,
    amount: charges[0].amount,
    balance,
    period,
    createdBy,
  });
};

export const runMonthlyServiceFeeCharge = async (date = new Date()) => {
  const period = currentServiceFeePeriod(date);
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `UPDATE service_fee_charges SET status = 'forgiven', forgiven_at = CURRENT_TIMESTAMP
       WHERE status = 'unpaid' AND billing_period < ?`,
      [period]
    );
    const [rates] = await connection.query(
      `SELECT amount FROM service_fee_rates
       WHERE effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [period]
    );
    if (!rates.length || moneyToCents(rates[0].amount) === 0n) {
      return { period, charged: 0, collected: 0, unpaid: 0, skipped: 'no_active_fee' };
    }

    const [students] = await connection.query(
      'SELECT id FROM santri WHERE is_active = TRUE ORDER BY id'
    );
    const report = { period, charged: 0, collected: 0, unpaid: 0 };
    for (const student of students) {
      await connection.beginTransaction();
      try {
        const [lockedStudents] = await connection.query(
          'SELECT saldo, is_active FROM santri WHERE id = ? FOR UPDATE',
          [student.id]
        );
        if (!lockedStudents.length || !lockedStudents[0].is_active) {
          await connection.commit();
          continue;
        }
        const [existing] = await connection.query(
          `SELECT id FROM service_fee_charges
           WHERE santri_id = ? AND billing_period = ? LIMIT 1`,
          [student.id, period]
        );
        if (existing.length) {
          await connection.commit();
          continue;
        }
        const [charge] = await connection.query(
          `INSERT INTO service_fee_charges
             (santri_id, billing_period, amount, status)
           VALUES (?, ?, ?, 'unpaid')`,
          [student.id, period, rates[0].amount]
        );
        report.charged += 1;
        if (moneyToCents(lockedStudents[0].saldo) >= moneyToCents(rates[0].amount)) {
          await recordFeeCollection(connection, {
            santriId: student.id,
            chargeId: charge.insertId,
            amount: rates[0].amount,
            balance: lockedStudents[0].saldo,
            period,
          });
          report.collected += 1;
        } else {
          report.unpaid += 1;
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    return report;
  } finally {
    connection.release();
  }
};
