import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { auditMutation } from '../middleware/security.js';
import auditRoutes from './adminRoutes/auditRoutes.js';
import cashRoutes from './adminRoutes/cashRoutes.js';
import canteenRoutes from './adminRoutes/canteenRoutes.js';
import credentialRoutes from './adminRoutes/credentialRoutes.js';
import dashboardRoutes from './adminRoutes/dashboardRoutes.js';
import financialApprovalRoutes from './adminRoutes/financialApprovalRoutes.js';
import parentRoutes from './adminRoutes/parentRoutes.js';
import reportRoutes from './adminRoutes/reportRoutes.js';
import santriRoutes from './adminRoutes/santriRoutes.js';
import settingsRoutes from './adminRoutes/settingsRoutes.js';
import transactionRoutes from './adminRoutes/transactionRoutes.js';

const router = express.Router();

router.use(authenticateToken, authorizeRoles('admin'));
router.use(auditMutation);
router.use(
  dashboardRoutes,
  reportRoutes,
  settingsRoutes,
  auditRoutes,
  financialApprovalRoutes,
  cashRoutes,
  santriRoutes,
  canteenRoutes,
  transactionRoutes,
  parentRoutes,
  credentialRoutes,
);

export default router;
