import express from 'express';
import {
  createWali,
  createWaliAccount,
  deleteWali,
  deleteWaliAccount,
  getWali,
  getWaliAccountById,
  getWaliAccounts,
  getWaliById,
  linkWaliChild,
  unlinkWaliChild,
  updateWali,
  updateWaliAccount,
} from '../../Controllers/admin/wali.js';

const router = express.Router();

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

export default router;
