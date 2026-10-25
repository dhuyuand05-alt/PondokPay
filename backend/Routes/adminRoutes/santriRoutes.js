import express from 'express';
import {
  createSantri,
  deleteSantri,
  exportSantri,
  getSantri,
  getSantriById,
  importSantri,
  updateSantri,
} from '../../Controllers/admin/santri.js';
import {
  registerStudentCard,
  registerStudentFingerprint,
} from '../../Controllers/admin/credentials.js';
import {
  createTopup,
  createWithdrawal,
} from '../../Controllers/admin/transactions.js';

const router = express.Router();

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

export default router;
