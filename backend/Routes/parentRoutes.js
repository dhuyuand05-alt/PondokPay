import express from 'express';
import {
  getChildDetails,
  getChildren,
  getChildTransactions,
  getParentProfile,
  updateChildDailyLimit,
} from '../controllers/parentController.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { auditMutation } from '../middleware/security.js';

const router = express.Router();

router.use(authenticateToken, authorizeRoles('wali'));
router.use(auditMutation);

router.get('/me', getParentProfile);
router.get('/anak', getChildren);
router.get('/anak/:santriId', getChildDetails);
router.get('/anak/:santriId/transaksi', getChildTransactions);
router.patch('/anak/:santriId/limit-harian', updateChildDailyLimit);
router.put('/anak/:santriId/limit-harian', updateChildDailyLimit);

export default router;
