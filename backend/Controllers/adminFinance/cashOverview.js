import pool from '../../config/db.js';
import { currentServiceFeePeriod } from '../../services/monthlyServiceFees.js';

export const getAdminCash = async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const currentPeriod = currentServiceFeePeriod();
  try {
    const [[totals]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'income' THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) AS expense
       FROM admin_cash_entries`
    );
    const [[debts]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS outstanding
       FROM service_fee_charges WHERE status = 'unpaid' AND billing_period = ?`,
      [currentPeriod]
    );
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM admin_cash_entries');
    const [rates] = await pool.query(
      `SELECT amount, DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from
       FROM service_fee_rates
       WHERE effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [currentPeriod]
    );
    const [scheduledRates] = await pool.query(
      `SELECT amount, DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from
       FROM service_fee_rates
       WHERE effective_from > ? ORDER BY effective_from ASC, id DESC LIMIT 1`,
      [currentPeriod]
    );
    const [entries] = await pool.query(
      `SELECT e.id, e.direction, e.category, e.amount, e.description, e.created_at,
              e.reverses_entry_id, u.username AS created_by_username,
              DATE_FORMAT(charge.billing_period, '%Y-%m') AS billing_period,
              s.nis, s.nama_lengkap,
              EXISTS(
                SELECT 1 FROM admin_cash_entries reversal
                WHERE reversal.reverses_entry_id = e.id
              ) AS is_reversed
       FROM admin_cash_entries e
       LEFT JOIN users u ON u.id = e.created_by
       LEFT JOIN service_fee_charges charge ON charge.id = e.service_fee_charge_id
       LEFT JOIN santri s ON s.id = charge.santri_id
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return res.status(200).json({
      summary: {
        income: totals.income,
        expense: totals.expense,
        balance: centsToMoney(moneyToCents(totals.income) - moneyToCents(totals.expense)),
        outstanding_service_fee: debts.outstanding,
      },
      service_fee: {
        current: rates[0] ?? null,
        scheduled: scheduledRates[0] ?? null,
        next_effective_from: nextServiceFeePeriod(),
      },
      data: entries,
      pagination: { page, limit, total: count.total },
    });
  } catch (error) {
    console.error('Get admin cash error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kas admin.' });
  }
};
