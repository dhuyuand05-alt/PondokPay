import express from 'express';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFinancialApprovalThreshold, getJwtSecret, getMfaEncryptionKey } from './config/security.js';
import authRoutes from './Routes/authRoutes.js';
import userRoutes from './Routes/userRoutes.js';
import adminRoutes from './Routes/adminRoutes.js';
import canteenRoutes from './Routes/canteenRoutes.js';
import parentRoutes from './Routes/parentRoutes.js';
import settingsRoutes from './Routes/settingsRoutes.js';
import { handleMidtransNotification } from './Controllers/midtransController.js';
import pool, { ensureAdminSchema } from './config/db.js';
import { startWhatsAppNotificationWorker } from './services/whatsappNotifications.js';
import { resumeWhatsAppSession } from './services/whatsappBot.js';
import {
  rateLimitApi,
  requireHttpsInProduction,
  securityHeaders,
} from './middleware/security.js';

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDirectory = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'uploads');

const proxyHops = process.env.TRUST_PROXY_HOPS;
if (proxyHops !== undefined && (!/^\d+$/.test(proxyHops) || Number(proxyHops) > 5)) {
  throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 5.');
}
app.set('trust proxy', proxyHops === undefined ? false : Number(proxyHops));
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(requireHttpsInProduction);
app.use(rateLimitApi);
app.use('/api/uploads', express.static(uploadDirectory, {
  dotfiles: 'deny',
  index: false,
  maxAge: '1y',
  immutable: true,
}));
app.use(express.json({ limit: '32kb', strict: true }));
app.use((req, res, next) => {
  const isLogoUpload = req.method === 'POST' &&
    req.path === '/api/admin/settings/logo' &&
    req.is('multipart/form-data');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      Number(req.get('content-length') ?? 0) > 0 &&
      !req.is('application/json') && !isLogoUpload) {
    return res.status(415).json({ message: 'Request body harus menggunakan application/json.' });
  }
  req.body ??= {};
  next();
});

app.get('/', (req, res) => {
  res.json({
    message: 'API Pondok Backend berjalan dengan aman.',
    endpoints: {
      login: 'POST /api/auth/login',
      profile: 'GET /api/auth/me',
      institution: 'GET /api/settings',
      users: 'GET /api/users',
      adminDashboard: 'GET /api/admin/dashboard',
      adminSantri: '/api/admin/santri',
      adminKantin: '/api/admin/kantin',
      cashier: '/api/kantin',
      parent: '/api/wali',
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.post('/api/midtrans/notification', handleMidtransNotification);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kantin', canteenRoutes);
app.use('/api/wali', parentRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Ukuran request melebihi batas 32 KB.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON request tidak valid.' });
  }
  console.error('Unhandled API error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan server.' });
});

const startServer = async () => {
  try {
    getJwtSecret();
    getMfaEncryptionKey();
    getFinancialApprovalThreshold();
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.DB_SSL_CA) {
        throw new Error('DB_SSL_CA must point to the trusted CA certificate for the production database.');
      }
      if (process.env.DB_AUTO_MIGRATE === 'true') {
        throw new Error('DB_AUTO_MIGRATE must not be enabled in production; run the migration script separately.');
      }
    } else if (process.env.DB_AUTO_MIGRATE !== 'false') {
      await ensureAdminSchema();
    }
    await pool.query('SELECT 1');
    await resumeWhatsAppSession();
    startWhatsAppNotificationWorker();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log('Admin APIs are ready.');
    });
  } catch (error) {
    console.error('Gagal menyiapkan database:', error);
    process.exit(1);
  }
};

startServer();