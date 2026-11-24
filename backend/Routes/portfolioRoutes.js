import express from 'express';
import {
  changePortfolioPassword,
  getPortfolioContent,
  getPortfolioStatus,
  loginPortfolioAdmin,
  logoutPortfolioAdmin,
  savePortfolioContent,
  setupPortfolioAdmin,
} from '../Controllers/portfolioController.js';
import { authenticatePortfolioAdmin } from '../middleware/portfolioAuth.js';
import { rateLimitLogin } from '../middleware/security.js';

const router = express.Router();
const rateLimitPortfolioLogin = (req, res, next) => {
  req.body = { ...req.body, username: 'portfolio-admin' };
  return rateLimitLogin(req, res, next);
};

router.get('/status', getPortfolioStatus);
router.get('/', getPortfolioContent);
router.post('/auth/setup', rateLimitPortfolioLogin, setupPortfolioAdmin);
router.post('/auth/login', rateLimitPortfolioLogin, loginPortfolioAdmin);
router.post('/auth/logout', authenticatePortfolioAdmin, logoutPortfolioAdmin);
router.patch('/auth/password', authenticatePortfolioAdmin, changePortfolioPassword);
router.put('/content', authenticatePortfolioAdmin, savePortfolioContent);

export default router;
