import express from 'express';
import { login, getProfile, setupMfa, verifyMfa } from '../Controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { rateLimitLogin, rateLimitMfa } from '../middleware/security.js';

const router = express.Router();

router.post('/login', rateLimitLogin, login);
router.post('/mfa/setup', rateLimitMfa, setupMfa);
router.post('/mfa/verify', rateLimitMfa, verifyMfa);
router.get('/me', authenticateToken, getProfile);

export default router;
