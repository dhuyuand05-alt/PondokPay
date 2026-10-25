import express from 'express';
import { getDashboard } from '../../Controllers/admin/dashboard.js';

const router = express.Router();

router.get('/dashboard', getDashboard);

export default router;
