import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateTotpSecret,
  getVerifiedTotpStep,
  verifyTotp,
} from '../config/security.js';
import { validatePassword } from '../config/passwords.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const createTotp = (secret, now) => {
  let bits = '';
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
};

test('password validation enforces byte-based bcrypt limits', () => {
  assert.equal(validatePassword('Long-enough-passphrase-123'), null);
  assert.match(validatePassword('short'), /minimal 12 byte/);
  assert.match(validatePassword('é'.repeat(37)), /72 byte/);
});

test('MFA secret encryption round-trips and rejects tampering', () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  try {
    const secret = generateTotpSecret();
    const encrypted = encryptMfaSecret(secret);
    assert.equal(decryptMfaSecret(encrypted), secret);
    const parts = encrypted.split(':');
    parts[1] = `${parts[1][0] === '0' ? '1' : '0'}${parts[1].slice(1)}`;
    assert.throws(() => decryptMfaSecret(parts.join(':')));
  } finally {
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previousKey;
  }
});

test('TOTP verifies current and adjacent time windows and rejects invalid values', () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const validCode = createTotp(secret, now);
  assert.equal(verifyTotp(secret, validCode, now), true);
  assert.equal(getVerifiedTotpStep(secret, validCode, now), Math.floor(now / 30000));
  assert.equal(verifyTotp(secret, 'abc123', now), false);
});
