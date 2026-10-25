import express from 'express';
import {
  exportFinancialReportCsv,
  exportFinancialReportPdf,
  getFinancialReport,
} from '../../Controllers/financialReportController.js';

const router = express.Router();

router.get('/reports/financial', getFinancialReport);
router.get('/reports/financial/export.csv', exportFinancialReportCsv);
router.get('/reports/financial/export.pdf', exportFinancialReportPdf);

export default router;
