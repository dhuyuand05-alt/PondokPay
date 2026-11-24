import pool from './pool.js';
import { ensureBaseSchema } from './dbSchema/base.js';
import { ensureCanteenSchema } from './dbSchema/canteen.js';
import { ensureLedgerSchema } from './dbSchema/ledger.js';
import { ensureServiceFeeSchema } from './dbSchema/serviceFees.js';
import { ensureAdminCashSchema } from './dbSchema/adminCash.js';
import { ensurePaymentAndIndexesSchema } from './dbSchema/paymentAndIndexes.js';
import { ensurePortfolioSchema } from './dbSchema/portfolio.js';

export const ensureAdminSchema = async () => {
  await ensureBaseSchema(pool);
  await ensureCanteenSchema(pool);
  await ensureLedgerSchema(pool);
  await ensureServiceFeeSchema(pool);
  await ensureAdminCashSchema(pool);
  await ensurePaymentAndIndexesSchema(pool);
  await ensurePortfolioSchema(pool);
};

export default pool;
