import express from 'express';
import {
  approveFinancialApproval,
  getFinancialApprovalById,
  getFinancialApprovals,
  rejectFinancialApproval,
  requestFinancialApproval,
} from '../../services/financialApprovals.js';

const router = express.Router();

router.get('/financial-approvals', getFinancialApprovals);
router.post('/financial-approvals', requestFinancialApproval);
router.get('/financial-approvals/:id', getFinancialApprovalById);
router.post('/financial-approvals/:id/approve', approveFinancialApproval);
router.post('/financial-approvals/:id/reject', rejectFinancialApproval);

export default router;
