import express from 'express';
import {
  createCredential,
  deleteCredential,
  getCredentialById,
  getCredentials,
  updateCredential,
} from '../../Controllers/admin/credentials.js';

const router = express.Router();

router.get('/credentials', getCredentials);
router.post('/credentials', createCredential);
router.get('/credentials/:id', getCredentialById);
router.patch('/credentials/:id', updateCredential);
router.put('/credentials/:id', updateCredential);
router.delete('/credentials/:id', deleteCredential);

export default router;
