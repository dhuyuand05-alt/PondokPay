import express from 'express';
import {
  getAssignedCanteen,
  getAssignedCanteens,
  getCanteenTransactions,
  lookupStudent,
} from '../Controllers/canteenController.js';
import { createCanteenSale } from '../Controllers/adminController.js';
import {
  createCanteenProduct,
  changeCanteenProductStock,
  getCanteenProducts,
  getCanteenStockMovements,
  updateAssignedCanteenCatalogMode,
  updateCanteenProduct,
} from '../Controllers/canteenCatalogController.js';
import {
  closeCanteenShift,
  deleteHeldCart,
  getCurrentCanteenShift,
  getCanteenShiftHistory,
  getHeldCarts,
  openCanteenShift,
  refundCanteenSale,
  saveHeldCart,
} from '../Controllers/canteenOperationsController.js';
import {
  createCanteenSupplier,
  getCanteenPurchase,
  getCanteenPurchases,
  getCanteenSuppliers,
  receiveCanteenPurchase,
  recordCanteenSupplierPayment,
  updateCanteenSupplier,
} from '../Controllers/canteenPurchasingController.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { requireAssignedCanteen } from '../middleware/canteenAccess.js';
import { auditMutation } from '../middleware/security.js';
import {
  approveCanteenPayout,
  getCanteenPayoutApprovalsForCashier,
  rejectCanteenPayout,
} from '../services/canteenPayoutApprovals.js';

const router = express.Router();

router.use(authenticateToken, authorizeRoles('kasir'));
router.use(auditMutation);

router.get('/', getAssignedCanteens);
router.get('/pencairan/persetujuan', getCanteenPayoutApprovalsForCashier);
router.post('/pencairan/persetujuan/:id/approve', approveCanteenPayout);
router.post('/pencairan/persetujuan/:id/reject', rejectCanteenPayout);
router.get('/:id/giliran/aktif', requireAssignedCanteen, getCurrentCanteenShift);
router.get('/:id/giliran/riwayat', requireAssignedCanteen, getCanteenShiftHistory);
router.post('/:id/giliran/buka', requireAssignedCanteen, openCanteenShift);
router.post('/:id/giliran/:shiftId/tutup', requireAssignedCanteen, closeCanteenShift);
router.get('/:id/keranjang-tertahan', requireAssignedCanteen, getHeldCarts);
router.post('/:id/keranjang-tertahan', requireAssignedCanteen, saveHeldCart);
router.put('/:id/keranjang-tertahan/:cartId', requireAssignedCanteen, saveHeldCart);
router.delete('/:id/keranjang-tertahan/:cartId', requireAssignedCanteen, deleteHeldCart);
router.post('/:id/santri/lookup', requireAssignedCanteen, lookupStudent);
router.get('/:id/pemasok', requireAssignedCanteen, getCanteenSuppliers);
router.post('/:id/pemasok', requireAssignedCanteen, createCanteenSupplier);
router.patch('/:id/pemasok/:supplierId', requireAssignedCanteen, updateCanteenSupplier);
router.get('/:id/pembelian', requireAssignedCanteen, getCanteenPurchases);
router.post('/:id/pembelian', requireAssignedCanteen, receiveCanteenPurchase);
router.get('/:id/pembelian/:purchaseId', requireAssignedCanteen, getCanteenPurchase);
router.post('/:id/pembelian/:purchaseId/pembayaran', requireAssignedCanteen, recordCanteenSupplierPayment);
router.get('/:id', requireAssignedCanteen, getAssignedCanteen);
router.get('/:id/saldo', requireAssignedCanteen, getAssignedCanteen);
router.get('/:id/produk', requireAssignedCanteen, getCanteenProducts);
router.patch('/:id/katalog', requireAssignedCanteen, updateAssignedCanteenCatalogMode);
router.post('/:id/produk', requireAssignedCanteen, createCanteenProduct);
router.patch('/:id/produk/:productId', requireAssignedCanteen, updateCanteenProduct);
router.post('/:id/produk/:productId/stok', requireAssignedCanteen, changeCanteenProductStock);
router.get('/:id/pergerakan-stok', requireAssignedCanteen, getCanteenStockMovements);
router.post('/:id/penjualan', requireAssignedCanteen, (req, res, next) => {
  if (typeof req.get('Idempotency-Key') !== 'string' || !req.get('Idempotency-Key').trim()) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi untuk transaksi kasir.' });
  }
  next();
}, createCanteenSale);
router.post('/:id/transaksi/:transactionId/refund', requireAssignedCanteen, refundCanteenSale);
router.get('/:id/transaksi', requireAssignedCanteen, getCanteenTransactions);

export default router;
