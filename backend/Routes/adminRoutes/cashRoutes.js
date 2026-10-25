import express from 'express';
import {
  createAdminExpense,
  createAdminIncome,
  getAdminCash,
  reverseAdminCashEntry,
  setMonthlyServiceFee,
} from '../../Controllers/adminFinanceController.js';

const router = express.Router();

router.get('/cash', getAdminCash);
router.post('/cash/service-fee', setMonthlyServiceFee);
router.post('/cash/income', createAdminIncome);
router.post('/cash/expenses', createAdminExpense);
router.post('/cash/entries/:id/reverse', reverseAdminCashEntry);

export default router;
