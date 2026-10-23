import { createHash, randomBytes } from 'node:crypto';

export const normalizeWhatsAppNumber = (value) => {
  if (typeof value !== 'string') return null;
  let digits = value.trim().replace(/[\s().-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
};

export const hashVerificationCode = (value) =>
  createHash('sha256').update(value).digest('hex');

export const parseWhatsAppVerificationCode = (value) => {
  if (typeof value !== 'string') return null;
  return /^PONDOKPAY\s+VERIFIKASI\s+([a-f0-9]{48})$/i.exec(value.trim())?.[1].toLowerCase() ?? null;
};

export const getDirectWhatsAppSenderJid = (key) => {
  const remoteJid = key?.remoteJid;
  if (typeof remoteJid !== 'string' || remoteJid.endsWith('@g.us')) return null;
  return [key.senderPn, key.participantPn, remoteJid]
    .find((jid) => typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) || null;
};

export const createWhatsAppChallenge = () => randomBytes(24).toString('hex');
