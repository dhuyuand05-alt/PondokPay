import express from 'express';
import {
  assignCanteenCashier,
  createKantin,
  deleteKantin,
  getCanteenCashiers,
  getKantin,
  getKantinById,
  removeCanteenCashier,
  updateKantin,
} from '../../Controllers/admin/kantin.js';
import {
  createCanteenSale,
  createCanteenWithdrawal,
  getCanteenTransactions,
} from '../../Controllers/admin/transactions.js';
import {
  getCanteenPayoutApprovalsForAdmin,
  requestCanteenPayoutApproval,
} from '../../services/canteenPayoutApprovals.js';
import {
  getCanteenSalesReport,
  getCanteenShiftHistory,
} from '../../Controllers/canteenOperationsController.js';
import { getCanteenProducts } from '../../Controllers/canteenCatalogController.js';

const router = express.Router();

router.get('/kantin', getKantin);
router.post('/kantin', createKantin);
router.get('/kantin/:id', getKantinById);
router.put('/kantin/:id', updateKantin);
router.patch('/kantin/:id', updateKantin);
router.delete('/kantin/:id', deleteKantin);
router.get('/kantin/:id/kasir', getCanteenCashiers);
router.get('/kantin/:id/produk', getCanteenProducts);
router.post('/kantin/:id/kasir', assignCanteenCashier);
router.delete('/kantin/:id/kasir/:userId', removeCanteenCashier);
router.post('/kantin/:id/penjualan', createCanteenSale);
router.get('/kantin/:id/pencairan/persetujuan-kasir', getCanteenPayoutApprovalsForAdmin);
router.post('/kantin/:id/pencairan/persetujuan-kasir', requestCanteenPayoutApproval);
router.post('/kantin/:id/pencairan', createCanteenWithdrawal);
router.get('/kantin/:id/transaksi', getCanteenTransactions);
router.get('/kantin/:id/laporan', getCanteenSalesReport);
router.get('/kantin/:id/giliran', getCanteenShiftHistory);

export default router;
