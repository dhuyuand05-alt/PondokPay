import express from 'express';
import {
  createCredential,
  createCanteenSale,
  createCanteenWithdrawal,
  createKantin,
  createSantri,
  createTopup,
  createWali,
  createWaliAccount,
  createWithdrawal,
  assignCanteenCashier,
  deleteCredential,
  deleteKantin,
  deleteSantri,
  deleteWali,
  getCredentials,
  getCredentialById,
  getAuditLogs,
  getCanteenTransactions,
  getCanteenCashiers,
  getDashboard,
  getKantin,
  getKantinById,
  getSantri,
  getSantriById,
  getTransactions,
  getWali,
  getWaliAccounts,
  getWaliAccountById,
  getWaliById,
  updateCredential,
  updateKantin,
  updateSantri,
  updateWali,
  updateWaliAccount,
  deleteWaliAccount,
  linkWaliChild,
  unlinkWaliChild,
  removeCanteenCashier,
  registerStudentCard,
  registerStudentFingerprint,
} from '../Controllers/adminController.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { auditMutation } from '../middleware/security.js';
import {
  approveFinancialApproval,
  getFinancialApprovalById,
  getFinancialApprovals,
  rejectFinancialApproval,
  requestFinancialApproval,
} from '../services/financialApprovals.js';
import {
  getCanteenPayoutApprovalsForAdmin,
  requestCanteenPayoutApproval,
} from '../services/canteenPayoutApprovals.js';

const router = express.Router();

router.use(authenticateToken, authorizeRoles('admin'));
router.use(auditMutation);

router.get('/dashboard', getDashboard);
router.get('/audit-logs', getAuditLogs);
router.get('/financial-approvals', getFinancialApprovals);
router.post('/financial-approvals', requestFinancialApproval);
router.get('/financial-approvals/:id', getFinancialApprovalById);
router.post('/financial-approvals/:id/approve', approveFinancialApproval);
router.post('/financial-approvals/:id/reject', rejectFinancialApproval);

router.get('/santri', getSantri);
router.post('/santri', createSantri);
router.get('/santri/:id', getSantriById);
router.put('/santri/:id', updateSantri);
router.patch('/santri/:id', updateSantri);
router.delete('/santri/:id', deleteSantri);
router.post('/santri/:id/topup', createTopup);
router.post('/santri/:id/tarik', createWithdrawal);
router.post('/santri/:id/kartu', registerStudentCard);
router.post('/santri/:id/sidik-jari', registerStudentFingerprint);

router.get('/kantin', getKantin);
router.post('/kantin', createKantin);
router.get('/kantin/:id', getKantinById);
router.put('/kantin/:id', updateKantin);
router.patch('/kantin/:id', updateKantin);
router.delete('/kantin/:id', deleteKantin);
router.get('/kantin/:id/kasir', getCanteenCashiers);
router.post('/kantin/:id/kasir', assignCanteenCashier);
router.delete('/kantin/:id/kasir/:userId', removeCanteenCashier);
router.post('/kantin/:id/penjualan', createCanteenSale);
router.get('/kantin/:id/pencairan/persetujuan-kasir', getCanteenPayoutApprovalsForAdmin);
router.post('/kantin/:id/pencairan/persetujuan-kasir', requestCanteenPayoutApproval);
router.post('/kantin/:id/pencairan', createCanteenWithdrawal);
router.get('/kantin/:id/transaksi', getCanteenTransactions);

router.get('/transaksi', getTransactions);

router.get('/wali', getWali);
router.post('/wali', createWali);
router.get('/wali/:id', getWaliById);
router.put('/wali/:id', updateWali);
router.patch('/wali/:id', updateWali);
router.delete('/wali/:id', deleteWali);

router.get('/wali-akun', getWaliAccounts);
router.post('/wali-akun', createWaliAccount);
router.get('/wali-akun/:id', getWaliAccountById);
router.patch('/wali-akun/:id', updateWaliAccount);
router.put('/wali-akun/:id', updateWaliAccount);
router.delete('/wali-akun/:id', deleteWaliAccount);
router.post('/wali-akun/:id/anak', linkWaliChild);
router.delete('/wali-akun/:id/anak/:santriId', unlinkWaliChild);

router.get('/credentials', getCredentials);
router.post('/credentials', createCredential);
router.get('/credentials/:id', getCredentialById);
router.patch('/credentials/:id', updateCredential);
router.put('/credentials/:id', updateCredential);
router.delete('/credentials/:id', deleteCredential);

export default router;
