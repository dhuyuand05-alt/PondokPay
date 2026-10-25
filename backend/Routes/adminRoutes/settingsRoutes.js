import express from 'express';
import {
  deleteInstitutionLogo,
  getAdminSettings,
  parseLogoUpload,
  updateSettings,
  uploadInstitutionLogo,
} from '../../Controllers/settingsController.js';
import {
  getAdminMidtransSettings,
  updateAdminMidtransSettings,
} from '../../Controllers/midtransController.js';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
} from '../../Controllers/whatsappController.js';

const router = express.Router();

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

export default router;
