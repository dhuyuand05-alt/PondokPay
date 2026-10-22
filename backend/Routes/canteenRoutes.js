import express from 'express';
import {
  getAssignedCanteen,
  getAssignedCanteens,
  getCanteenTransactions,
  lookupStudent,
} from '../Controllers/canteenController.js';
import { createCanteenSale } from '../Controllers/adminController.js';
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
router.post('/:id/santri/lookup', requireAssignedCanteen, lookupStudent);
router.get('/:id', requireAssignedCanteen, getAssignedCanteen);
router.get('/:id/saldo', requireAssignedCanteen, getAssignedCanteen);
router.post('/:id/penjualan', requireAssignedCanteen, (req, res, next) => {
  if (typeof req.get('Idempotency-Key') !== 'string' || !req.get('Idempotency-Key').trim()) {
    return res.status(400).json({ message: 'Header Idempotency-Key wajib diisi untuk transaksi kasir.' });
  }
  next();
}, createCanteenSale);
router.get('/:id/transaksi', requireAssignedCanteen, getCanteenTransactions);

export default router;
