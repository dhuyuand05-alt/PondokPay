import express from 'express';
import { getAuditLogs } from '../../Controllers/admin/dashboard.js';

const router = express.Router();

router.get('/audit-logs', getAuditLogs);

export default router;
