import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import pool from '../config/db.js';

const defaultSettings = {
  name: 'Nama Pondok',
  address: 'Jl. Contoh No. 123, Kabupaten/Kota',
  phone: '+62 812-0000-0000',
  email: 'info@contoh.ponpes.id',
  manager_name: 'Nama Penanggung Jawab',
  logo_path: null,
  app_name: null,
  timezone: 'Asia/Jakarta',
};
const uploadDirectory = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
const acceptedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter: (req, file, callback) => {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      return callback(new Error('Logo harus berupa file PNG, JPG, atau WebP.'));
    }
    return callback(null, true);
  },
});

export const parseLogoUpload = (req, res, next) => {
  logoUpload.single('logo')(req, res, (error) => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      message: status === 413
        ? 'Ukuran logo maksimal 2 MB.'
        : error.message || 'File logo tidak valid.',
    });
  });
};

const getImageExtension = (buffer) => {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
};

const readSettings = async () => {
  const [rows] = await pool.query(
    `SELECT name, address, phone, email, manager_name, logo_path, app_name, timezone
     FROM institution_settings WHERE id = 1`
  );
  return rows[0] || defaultSettings;
};

export const createPwaManifest = (settings) => {
  const iconPath = settings.logo_path || '/pwa-icon.svg';
  const iconType = settings.logo_path?.toLowerCase().endsWith('.png')
    ? 'image/png'
    : settings.logo_path?.toLowerCase().endsWith('.webp')
      ? 'image/webp'
      : settings.logo_path
        ? 'image/jpeg'
        : 'image/svg+xml';
  const appName = (settings.app_name || settings.name || 'PondokPay').trim();
  return {
    id: '/',
    name: appName,
    short_name: appName.slice(0, 12),
    description: `${appName} - aplikasi layanan pondok.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f6f2',
    theme_color: '#075746',
    icons: [
      { src: iconPath, sizes: 'any', type: iconType, purpose: 'any' },
      {
        src: '/pwa-icon.svg',
        sizes: '192x192 512x512',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };
};

const removeStoredLogo = async (logoPath) => {
  if (typeof logoPath !== 'string' || !logoPath.startsWith('/api/uploads/')) return;
  const filename = path.basename(logoPath);
  if (filename !== logoPath.slice('/api/uploads/'.length)) return;
  try {
    await unlink(path.join(uploadDirectory, filename));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

export const getPublicSettings = async (req, res) => {
  try {
    const settings = await readSettings();
    return res.status(200).json({
      data: {
        name: settings.name,
        logo_path: settings.logo_path,
        app_name: settings.app_name,
        timezone: settings.timezone,
      },
    });
  } catch (error) {
    console.error('Get institution settings error:', error);
    return res.status(500).json({ message: 'Gagal mengambil profil pondok.' });
  }
};

export const getAdminSettings = async (req, res) => {
  try {
    return res.status(200).json({ data: await readSettings() });
  } catch (error) {
    console.error('Get admin institution settings error:', error);
    return res.status(500).json({ message: 'Gagal mengambil profil pondok.' });
  }
};

export const updateSettings = async (req, res) => {
  const { name, address, phone, email, manager_name: managerName, timezone } = req.body;
  const appName = req.body.app_name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) {
    return res.status(400).json({ message: 'Nama pondok wajib diisi dan maksimal 150 karakter.' });
  }
  if (appName !== undefined && appName !== null &&
      (typeof appName !== 'string' || appName.trim().length > 80)) {
    return res.status(400).json({ message: 'Nama aplikasi tidak valid atau melebihi 80 karakter.' });
  }
  const optionalFields = [
    ['address', address, 255],
    ['phone', phone, 30],
    ['email', email, 254],
    ['manager_name', managerName, 100],
  ];
  for (const [field, value, maxLength] of optionalFields) {
    if (value !== undefined && value !== null &&
        (typeof value !== 'string' || value.trim().length > maxLength)) {
      return res.status(400).json({ message: `Data ${field} tidak valid atau terlalu panjang.` });
    }
  }
  let currentSettings;
  try {
    currentSettings = await readSettings();
  } catch (error) {
    console.error('Read institution settings before update error:', error);
    return res.status(500).json({ message: 'Gagal membaca profil pondok.' });
  }
  const normalizedEmail = typeof email === 'string' ? email.trim() : (email === null ? '' : currentSettings.email || '');
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Format email tidak valid.' });
  }
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : (phone === null ? '' : currentSettings.phone || '');
  const normalizedAddress = typeof address === 'string'
    ? address.trim()
    : (address === null ? '' : currentSettings.address || '');
  const normalizedManagerName = typeof managerName === 'string'
    ? managerName.trim()
    : (managerName === null ? '' : currentSettings.manager_name || '');
  const normalizedTimezone = timezone === undefined ? currentSettings.timezone : timezone;
  const normalizedAppName = appName === undefined
    ? currentSettings.app_name || null
    : (typeof appName === 'string' && appName.trim() ? appName.trim() : null);
  if (normalizedPhone && !/^[+\d\s().-]+$/.test(normalizedPhone)) {
    return res.status(400).json({ message: 'Nomor telepon hanya boleh berisi angka dan karakter + ( ) . -.' });
  }
  if (typeof normalizedTimezone !== 'string' || normalizedTimezone.length > 64) {
    return res.status(400).json({ message: 'Zona waktu tidak valid.' });
  }
  try {
    new Intl.DateTimeFormat('id-ID', { timeZone: normalizedTimezone }).format();
  } catch {
    return res.status(400).json({ message: 'Gunakan zona waktu IANA yang valid, misalnya Asia/Jakarta.' });
  }

  try {
    await pool.query(
      `UPDATE institution_settings
       SET name = ?, address = ?, phone = ?, email = ?, manager_name = ?, app_name = ?, timezone = ?
       WHERE id = 1`,
      [
        name.trim(),
        normalizedAddress || null,
        normalizedPhone || null,
        normalizedEmail || null,
        normalizedManagerName || null,
        normalizedAppName,
        normalizedTimezone,
      ]
    );
    return res.status(200).json({ message: 'Profil pondok berhasil diperbarui.', data: await readSettings() });
  } catch (error) {
    console.error('Update institution settings error:', error);
    return res.status(500).json({ message: 'Gagal menyimpan profil pondok.' });
  }
};

export const getPwaManifest = async (req, res) => {
  try {
    const settings = await readSettings();
    res.set('Cache-Control', 'no-store');
    res.type('application/manifest+json');
    return res.status(200).json(createPwaManifest(settings));
  } catch (error) {
    console.error('Get PWA manifest error:', error);
    return res.status(500).json({ message: 'Gagal mengambil konfigurasi aplikasi.' });
  }
};

export const uploadInstitutionLogo = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Pilih file logo terlebih dahulu.' });
  const extension = getImageExtension(req.file.buffer);
  if (!extension) return res.status(400).json({ message: 'Isi file bukan gambar PNG, JPG, atau WebP yang valid.' });

  const filename = `${randomUUID()}.${extension}`;
  const logoPath = `/api/uploads/${filename}`;
  let previousLogo;
  let settingsUpdated = false;
  try {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, filename), req.file.buffer, { flag: 'wx', mode: 0o640 });
    const [[settings]] = await pool.query(
      'SELECT logo_path FROM institution_settings WHERE id = 1'
    );
    previousLogo = settings?.logo_path;
    await pool.query('UPDATE institution_settings SET logo_path = ? WHERE id = 1', [logoPath]);
    settingsUpdated = true;
    if (previousLogo && previousLogo !== logoPath) {
      await removeStoredLogo(previousLogo).catch((error) => {
        console.error('Remove previous institution logo failed:', error);
      });
    }
    return res.status(200).json({
      message: 'Logo pondok berhasil diperbarui.',
      data: await readSettings(),
    });
  } catch (error) {
    if (!settingsUpdated) {
      await unlink(path.join(uploadDirectory, filename)).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') console.error('Remove failed logo upload failed:', cleanupError);
      });
    }
    console.error('Upload institution logo error:', error);
    return res.status(500).json({ message: 'Gagal menyimpan logo pondok.' });
  }
};

export const deleteInstitutionLogo = async (req, res) => {
  try {
    const [[settings]] = await pool.query(
      'SELECT logo_path FROM institution_settings WHERE id = 1'
    );
    await pool.query('UPDATE institution_settings SET logo_path = NULL WHERE id = 1');
    if (settings?.logo_path) {
      await removeStoredLogo(settings.logo_path).catch((error) => {
        console.error('Remove institution logo failed:', error);
      });
    }
    return res.status(200).json({
      message: 'Logo pondok berhasil dihapus.',
      data: await readSettings(),
    });
  } catch (error) {
    console.error('Delete institution logo error:', error);
    return res.status(500).json({ message: 'Gagal menghapus logo pondok.' });
  }
};
