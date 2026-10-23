import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createWhatsAppChallenge,
  getDirectWhatsAppSenderJid,
  hashVerificationCode,
  normalizeWhatsAppNumber,
  parseWhatsAppVerificationCode,
} from '../services/whatsapp.js';
import {
  clearWhatsAppAuthDirectoryContents,
  getWhatsAppSessionStatus,
} from '../services/whatsappBot.js';

test('WhatsApp numbers are normalized to international digits', () => {
  assert.equal(normalizeWhatsAppNumber('0812 3456-7890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber('+62 (812) 3456-7890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber('006281234567890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber('not-a-phone'), null);
});

test('WhatsApp verification challenges have high entropy and are stored as hashes', () => {
  const challenge = createWhatsAppChallenge();
  assert.match(challenge, /^[a-f0-9]{48}$/);
  const expected = hashVerificationCode(challenge);
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.notEqual(expected, challenge);
  assert.equal(hashVerificationCode(challenge), expected);
});

test('WhatsApp connection status does not expose session credentials', () => {
  const status = getWhatsAppSessionStatus();
  assert.equal(status.status, 'disconnected');
  assert.deepEqual(Object.keys(status).sort(), ['error', 'phone', 'qr_data_url', 'status']);
});

test('clearing a WhatsApp session removes its contents but preserves the writable directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pondokpay-whatsapp-'));
  const authDirectory = path.join(root, 'whatsapp-auth');
  await mkdir(path.join(authDirectory, 'nested'), { recursive: true });
  await writeFile(path.join(authDirectory, 'creds.json'), '{}');
  await writeFile(path.join(authDirectory, 'nested', 'session.json'), '{}');

  try {
    await clearWhatsAppAuthDirectoryContents(authDirectory);
    assert.deepEqual(await readdir(authDirectory), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('WhatsApp verification code parser accepts the sent format and rejects unrelated messages', () => {
  const challenge = createWhatsAppChallenge();
  assert.equal(parseWhatsAppVerificationCode(`PONDOKPAY VERIFIKASI ${challenge}`), challenge);
  assert.equal(parseWhatsAppVerificationCode(`  pondokpay   verifikasi ${challenge.toUpperCase()}  `), challenge);
  assert.equal(parseWhatsAppVerificationCode(`PONDOKPAY VERIFIKASI ${challenge.slice(1)}`), null);
  assert.equal(parseWhatsAppVerificationCode('Halo'), null);
});

test('WhatsApp sender lookup handles LID messages and excludes groups', () => {
  assert.equal(
    getDirectWhatsAppSenderJid({ remoteJid: '12345@lid', senderPn: '6281234567890@s.whatsapp.net' }),
    '6281234567890@s.whatsapp.net',
  );
  assert.equal(
    getDirectWhatsAppSenderJid({ remoteJid: '6281234567890@s.whatsapp.net' }),
    '6281234567890@s.whatsapp.net',
  );
  assert.equal(
    getDirectWhatsAppSenderJid({ remoteJid: '123@g.us', participantPn: '6281234567890@s.whatsapp.net' }),
    null,
  );
});
