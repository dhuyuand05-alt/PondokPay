import 'dotenv/config';
import pool from '../config/db.js';
import { runMonthlyServiceFeeCharge } from '../services/monthlyServiceFees.js';

try {
  const report = await runMonthlyServiceFeeCharge();
  console.log('Monthly service fee processing completed:', JSON.stringify(report));
} catch (error) {
  console.error('Monthly service fee processing failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
