import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import {
  createTotpProvisioningUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateTotpSecret,
  getJwtSecret,
  getVerifiedTotpStep,
} from '../config/security.js';
import { clearLoginRateLimit, recordSecurityEvent } from '../middleware/security.js';

const isMfaRequired = (role) => role === 'admin' || role === 'kasir';

const recordAuthEvent = (req, event) => recordSecurityEvent(req, event);

const issueAccessToken = (user, tokenVersion) => jwt.sign(
  { id: user.id, type: 'access', token_version: tokenVersion },
  getJwtSecret(),
  { expiresIn: '1h', algorithm: 'HS256' }
);

const issueMfaToken = (user, tokenVersion, type) => jwt.sign(
  { id: user.id, type, token_version: tokenVersion },
  getJwtSecret(),
  { expiresIn: '5m', algorithm: 'HS256' }
);

export const login = async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || !username.trim() ||
      typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi.' });
  }
  if (username.trim().length > 50 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(401).json({ message: 'Username atau password salah.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, username, password, role, is_active, token_version, mfa_enabled
       FROM users WHERE username = ? LIMIT 1`,
      [username.trim()]
    );

    const user = rows[0];
    const passwordValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
    if (!user || !passwordValid || !user.is_active) {
      await recordAuthEvent(req, {
        action: 'LOGIN_FAIL',
        resource: '/api/auth/login',
        statusCode: 401,
      });
      return res.status(401).json({ message: 'Username atau password salah.' });
    }

    clearLoginRateLimit(req);
    if (isMfaRequired(user.role)) {
      const mfaType = user.mfa_enabled ? 'mfa_challenge' : 'mfa_enroll';
      await recordAuthEvent(req, {
        actorUserId: user.id,
        action: 'LOGIN_MFA',
        resource: '/api/auth/login',
        statusCode: 200,
      });
      return res.status(200).json({
        message: user.mfa_enabled
          ? 'Masukkan kode MFA untuk menyelesaikan login.'
          : 'Aktivasi MFA diperlukan sebelum menggunakan akun.',
        mfa_required: true,
        mfa_enrollment_required: !user.mfa_enabled,
        challenge_token: issueMfaToken(user, Number(user.token_version), mfaType),
      });
    }

    await recordAuthEvent(req, {
      actorUserId: user.id,
      action: 'LOGIN_OK',
      resource: '/api/auth/login',
      statusCode: 200,
    });
    return res.status(200).json({
      message: 'Login berhasil.',
      token: issueAccessToken(user, Number(user.token_version)),
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan saat login.' });
  }
};

const getMfaChallengeUser = async (req, res, acceptedTypes) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ message: 'Token tantangan MFA diperlukan.' });
    return null;
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (!acceptedTypes.includes(decoded.type) || !Number.isSafeInteger(decoded.id)) {
      res.status(401).json({ message: 'Token tantangan MFA tidak valid.' });
      return null;
    }
    const [rows] = await pool.query(
      `SELECT id, username, role, is_active, token_version, mfa_enabled,
              mfa_secret_enc, mfa_pending_secret_enc, mfa_last_step
       FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );
    const user = rows[0];
    if (!user || !user.is_active || !isMfaRequired(user.role) ||
        Number(user.token_version) !== Number(decoded.token_version)) {
      res.status(401).json({ message: 'Tantangan MFA tidak lagi berlaku.' });
      return null;
    }
    return { user, type: decoded.type };
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ message: 'Token tantangan MFA tidak valid atau kadaluarsa.' });
      return null;
    }
    throw error;
  }
};

export const setupMfa = async (req, res) => {
  try {
    const challenge = await getMfaChallengeUser(req, res, ['mfa_enroll']);
    if (!challenge) return;
    if (challenge.user.mfa_enabled) {
      return res.status(409).json({ message: 'MFA sudah aktif untuk akun ini.' });
    }
    const secret = generateTotpSecret();
    await pool.query(
      'UPDATE users SET mfa_pending_secret_enc = ? WHERE id = ? AND token_version = ?',
      [encryptMfaSecret(secret), challenge.user.id, challenge.user.token_version]
    );
    await recordAuthEvent(req, {
      actorUserId: challenge.user.id,
      action: 'MFA_SETUP',
      resource: '/api/auth/mfa/setup',
      statusCode: 200,
    });
    return res.status(200).json({
      message: 'Tambahkan secret ini ke aplikasi authenticator, lalu verifikasi kode 6 digit.',
      secret,
      provisioning_uri: createTotpProvisioningUri(challenge.user.username, secret),
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    return res.status(500).json({ message: 'Gagal menyiapkan MFA.' });
  }
};

export const verifyMfa = async (req, res) => {
  const code = req.body?.code;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Kode MFA harus terdiri dari 6 digit.' });
  }
  try {
    const challenge = await getMfaChallengeUser(req, res, ['mfa_enroll', 'mfa_challenge']);
    if (!challenge) return;
    const { user, type } = challenge;
    const encryptedSecret = type === 'mfa_enroll'
      ? user.mfa_pending_secret_enc
      : user.mfa_secret_enc;
    if (!encryptedSecret || (type === 'mfa_enroll' && user.mfa_enabled) ||
        (type === 'mfa_challenge' && !user.mfa_enabled)) {
      return res.status(409).json({ message: 'Status pendaftaran MFA tidak sesuai; silakan login kembali.' });
    }

    const secret = decryptMfaSecret(encryptedSecret);
    const step = getVerifiedTotpStep(secret, code);
    if (step === null) {
      await recordAuthEvent(req, {
        actorUserId: user.id,
        action: 'MFA_FAIL',
        resource: '/api/auth/mfa/verify',
        statusCode: 401,
      });
      return res.status(401).json({ message: 'Kode MFA salah atau sudah kadaluarsa.' });
    }

    const nextVersion = Number(user.token_version) + 1;
    const [result] = type === 'mfa_enroll'
      ? await pool.query(
        `UPDATE users SET mfa_enabled = TRUE, mfa_secret_enc = mfa_pending_secret_enc,
           mfa_pending_secret_enc = NULL, mfa_last_step = ?, token_version = ?
         WHERE id = ? AND token_version = ? AND mfa_enabled = FALSE AND mfa_last_step < ?`,
        [step, nextVersion, user.id, user.token_version, step]
      )
      : await pool.query(
        `UPDATE users SET mfa_last_step = ?, token_version = ?
         WHERE id = ? AND token_version = ? AND mfa_enabled = TRUE AND mfa_last_step < ?`,
        [step, nextVersion, user.id, user.token_version, step]
      );
    if (!result.affectedRows) {
      return res.status(409).json({ message: 'Kode MFA telah digunakan atau sesi sudah berubah. Silakan login kembali.' });
    }

    await recordAuthEvent(req, {
      actorUserId: user.id,
      action: 'MFA_OK',
      resource: '/api/auth/mfa/verify',
      statusCode: 200,
    });
    return res.status(200).json({
      message: type === 'mfa_enroll' ? 'MFA berhasil diaktifkan.' : 'Login berhasil.',
      token: issueAccessToken(user, nextVersion),
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    return res.status(500).json({ message: 'Gagal memverifikasi MFA.' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, role, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: 'Gagal mengambil profil user.' });
  }
};
