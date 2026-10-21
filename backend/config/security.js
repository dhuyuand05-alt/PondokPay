import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of cryptographically random data.');
  }
  return secret;
};

export const getMfaEncryptionKey = () => {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error('MFA_ENCRYPTION_KEY must be a 64-character hex-encoded 256-bit key.');
  }
  return Buffer.from(key, 'hex');
};

export const getFinancialApprovalThreshold = () => {
  const value = process.env.FINANCIAL_DUAL_APPROVAL_THRESHOLD ?? '500000';
  if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
    throw new Error('FINANCIAL_DUAL_APPROVAL_THRESHOLD must be a positive amount with at most 2 decimals.');
  }
  return value;
};

export const encryptMfaSecret = (secret) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
};

export const decryptMfaSecret = (value) => {
  const [ivHex, tagHex, ciphertextHex] = String(value ?? '').split(':');
  if (!/^[a-f0-9]{24}$/i.test(ivHex ?? '') ||
      !/^[a-f0-9]{32}$/i.test(tagHex ?? '') ||
      !/^[a-f0-9]+$/i.test(ciphertextHex ?? '')) {
    throw new Error('Stored MFA secret is malformed.');
  }
  const decipher = createDecipheriv('aes-256-gcm', getMfaEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
};

export const generateTotpSecret = () => {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let encoded = '';
  for (let i = 0; i < bits.length; i += 5) {
    encoded += base32Alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return encoded;
};

const decodeBase32 = (value) => {
  let bits = '';
  for (const char of value.toUpperCase().replace(/=+$/g, '')) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid TOTP secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};

const totpAt = (secret, counter) => {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1000000).padStart(6, '0');
};

export const getVerifiedTotpStep = (secret, token, now = Date.now()) => {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return null;
  const supplied = Buffer.from(token);
  const currentStep = Math.floor(now / 30000);
  for (let drift = -1; drift <= 1; drift += 1) {
    const step = currentStep + drift;
    if (step < 0) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(supplied, expected)) return step;
  }
  return null;
};

export const verifyTotp = (secret, token, now = Date.now()) =>
  getVerifiedTotpStep(secret, token, now) !== null;

export const createTotpProvisioningUri = (username, secret) => {
  const label = encodeURIComponent(`Cashless Santri:${username}`);
  const issuer = encodeURIComponent('Cashless Santri');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
};
