import express from 'express';
import {
  getTransactions,
} from '../../Controllers/admin/transactions.js';

const router = express.Router();

router.get('/transaksi', getTransactions);

export default router;
