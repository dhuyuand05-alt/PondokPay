import pool from '../../config/db.js';
import { nextServiceFeePeriod, parseMoney } from './shared.js';

export const setMonthlyServiceFee = async (req, res) => {
  const amount = parseMoney(req.body.amount, 'Biaya layanan', {
    allowZero: true,
    max: 99999999.99,
  });
  if (amount.error) return res.status(400).json({ message: amount.error });
  const effectiveFrom = nextServiceFeePeriod();
  try {
    await pool.query(
      `INSERT INTO service_fee_rates (amount, effective_from, created_by)
       VALUES (?, ?, ?)`,
      [amount.value, effectiveFrom, req.user.id]
    );
    return res.status(200).json({
      message: `Biaya layanan berlaku mulai ${effectiveFrom}.`,
      data: { amount: amount.value, effective_from: effectiveFrom },
    });
  } catch (error) {
    console.error('Set monthly service fee error:', error);
    return res.status(500).json({ message: 'Gagal menyimpan biaya layanan.' });
  }
};
