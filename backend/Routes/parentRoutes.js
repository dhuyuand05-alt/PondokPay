import express from 'express';
import {
  getChildDetails,
  getChildren,
  getChildTransactions,
  getParentProfile,
  getParentWhatsAppSettings,
  requestParentWhatsAppVerification,
  disableParentWhatsAppNotifications,
  updateChildDailyLimit,
} from '../Controllers/parentController.js';
import {
  createParentTopupPayment,
  getParentTopupConfiguration,
  getParentTopupHistory,
  getParentTopupPaymentStatus,
} from '../Controllers/midtransController.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { auditMutation, rateLimitParentTopupCreation } from '../middleware/security.js';

const router = express.Router();

router.use(authenticateToken, authorizeRoles('wali'));
router.use(auditMutation);

router.get('/me', getParentProfile);
router.get('/topup/config', getParentTopupConfiguration);
router.get('/topup/history', getParentTopupHistory);
router.post('/topup', rateLimitParentTopupCreation, createParentTopupPayment);
router.get('/topup/:orderId', getParentTopupPaymentStatus);
router.get('/notifikasi/whatsapp', getParentWhatsAppSettings);
router.post('/notifikasi/whatsapp/verifikasi', requestParentWhatsAppVerification);
router.delete('/notifikasi/whatsapp', disableParentWhatsAppNotifications);
router.get('/anak', getChildren);
router.get('/anak/:santriId', getChildDetails);
router.get('/anak/:santriId/transaksi', getChildTransactions);
router.patch('/anak/:santriId/limit-harian', updateChildDailyLimit);
router.put('/anak/:santriId/limit-harian', updateChildDailyLimit);

export default router;
