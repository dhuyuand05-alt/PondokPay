import express from 'express';
import { getPublicSettings, getPwaManifest } from '../Controllers/settingsController.js';

const router = express.Router();

router.get('/', getPublicSettings);
router.get('/manifest.webmanifest', getPwaManifest);

export default router;
