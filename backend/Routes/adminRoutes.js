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
  exportSantri,
  importSantri,
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
import {
  createAdminIncome,
  createAdminExpense,
  getAdminCash,
  reverseAdminCashEntry,
  setMonthlyServiceFee,
} from '../Controllers/adminFinanceController.js';
import {
  deleteInstitutionLogo,
  getAdminSettings,
  parseLogoUpload,
  updateSettings,
  uploadInstitutionLogo,
} from '../Controllers/settingsController.js';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
} from '../Controllers/whatsappController.js';
import {
  exportFinancialReportCsv,
  exportFinancialReportPdf,
  getFinancialReport,
} from '../Controllers/financialReportController.js';
import {
  getAdminMidtransSettings,
  updateAdminMidtransSettings,
} from '../Controllers/midtransController.js';

const router = express.Router();

router.use(authenticateToken, authorizeRoles('admin'));
router.use(auditMutation);

router.get('/dashboard', getDashboard);
router.get('/reports/financial', getFinancialReport);
router.get('/reports/financial/export.csv', exportFinancialReportCsv);
router.get('/reports/financial/export.pdf', exportFinancialReportPdf);
router.get('/settings', getAdminSettings);
router.get('/settings/midtrans', getAdminMidtransSettings);
router.put('/settings/midtrans', updateAdminMidtransSettings);
router.put('/settings', updateSettings);
router.patch('/settings', updateSettings);
router.post('/settings/logo', parseLogoUpload, uploadInstitutionLogo);
router.delete('/settings/logo', deleteInstitutionLogo);
router.get('/settings/whatsapp/status', getWhatsAppStatus);
router.post('/settings/whatsapp/connect', connectWhatsApp);
router.delete('/settings/whatsapp/disconnect', disconnectWhatsApp);
router.get('/audit-logs', getAuditLogs);
router.get('/financial-approvals', getFinancialApprovals);
router.post('/financial-approvals', requestFinancialApproval);
router.get('/financial-approvals/:id', getFinancialApprovalById);
router.post('/financial-approvals/:id/approve', approveFinancialApproval);
router.post('/financial-approvals/:id/reject', rejectFinancialApproval);

router.get('/cash', getAdminCash);
router.post('/cash/service-fee', setMonthlyServiceFee);
router.post('/cash/income', createAdminIncome);
router.post('/cash/expenses', createAdminExpense);
router.post('/cash/entries/:id/reverse', reverseAdminCashEntry);

router.get('/santri', getSantri);
router.get('/santri/export', exportSantri);
router.post('/santri/import', importSantri);
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
