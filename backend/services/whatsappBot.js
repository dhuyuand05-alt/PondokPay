import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { chmod, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../config/db.js';
import {
  getDirectWhatsAppSenderJid,
  hashVerificationCode,
  normalizeWhatsAppNumber,
  parseWhatsAppVerificationCode,
} from './whatsapp.js';

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authDirectory = path.resolve(
  process.env.WHATSAPP_AUTH_DIR || path.join(backendDirectory, 'whatsapp-auth'),
);
const state = {
  status: 'disconnected',
  phone: null,
  qr_data_url: null,
  error: null,
};

let socket = null;
let starting = null;
let reconnectTimer = null;
let disconnectRequested = false;

const validateAuthDirectory = () => {
  const root = path.parse(authDirectory).root;
  const backendRelative = path.relative(authDirectory, backendDirectory);
  if (authDirectory === root || authDirectory === backendDirectory ||
      (backendRelative && !backendRelative.startsWith(`..${path.sep}`) && backendRelative !== '..') ||
      path.basename(authDirectory) !== 'whatsapp-auth') {
    throw new Error('WHATSAPP_AUTH_DIR harus menunjuk ke folder khusus bernama whatsapp-auth.');
  }
};

const prepareAuthDirectory = async () => {
  validateAuthDirectory();
  await mkdir(authDirectory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await chmod(authDirectory, 0o700);
};

const clearAuthDirectory = async () => {
  validateAuthDirectory();
  await rm(authDirectory, { recursive: true, force: true });
};

const updateStatus = (updates) => Object.assign(state, updates);

const extractMessageText = (message) => {
  let content = message?.message;
  while (content) {
    const wrapped = content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  return String(
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    '',
  ).trim();
};

const verifyParentOptIn = async (activeSocket, message) => {
  const remoteJid = message?.key?.remoteJid;
  if (message?.key?.fromMe) return 'outgoing';
  if (typeof remoteJid !== 'string') return 'missing-jid';
  if (remoteJid.endsWith('@g.us')) return 'group-message';
  const senderJid = getDirectWhatsAppSenderJid(message.key);
  if (!senderJid) return 'unresolved-sender';

  const sender = normalizeWhatsAppNumber(senderJid.slice(0, -'@s.whatsapp.net'.length));
  const challenge = parseWhatsAppVerificationCode(extractMessageText(message));
  if (!sender) return 'invalid-sender';
  if (!challenge) return 'message-without-verification-code';

  const [result] = await pool.query(
    `UPDATE parent_notification_settings
     SET verified_at = CURRENT_TIMESTAMP,
         verification_code_hash = NULL,
         verification_expires_at = NULL
     WHERE whatsapp_number = ?
       AND verification_code_hash = ?
       AND verification_expires_at > CURRENT_TIMESTAMP
       AND verified_at IS NULL`,
    [sender, hashVerificationCode(challenge)],
  );
  if (result.affectedRows) {
    await activeSocket.sendMessage(remoteJid, {
      text: 'Nomor WhatsApp berhasil diverifikasi. Notifikasi transaksi santri telah diaktifkan.',
    });
    return 'verified';
  }
  return 'code-not-matched-or-expired';
};

export const getWhatsAppSessionStatus = () => ({ ...state });

export const connectWhatsAppSession = async () => {
  if (state.status === 'connected' || starting) {
    if (starting) await starting;
    return getWhatsAppSessionStatus();
  }

  disconnectRequested = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  updateStatus({ status: 'connecting', qr_data_url: null, error: null });

  starting = (async () => {
    await prepareAuthDirectory();
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDirectory);
    const activeSocket = makeWASocket({
      auth: authState,
      printQRInTerminal: false,
      syncFullHistory: false,
    });
    socket = activeSocket;

    activeSocket.ev.on('creds.update', saveCreds);
    activeSocket.ev.on('messages.upsert', ({ messages, type }) => {
      const incomingMessages = messages.filter((message) => !message?.key?.fromMe);
      if (incomingMessages.length) {
        console.info('WhatsApp inbound messages received:', {
          type,
          count: incomingMessages.length,
        });
      }
      for (const message of messages) {
        verifyParentOptIn(activeSocket, message).then((result) => {
          if (result && result !== 'outgoing') {
            console.info('WhatsApp opt-in message processed:', { result, type });
          }
        }).catch((error) => {
          console.error('WhatsApp opt-in message processing failed:', error);
        });
      }
    });
    activeSocket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (socket !== activeSocket) return;
      if (qr) {
        QRCode.toDataURL(qr).then((qrDataUrl) => {
          if (socket === activeSocket) {
            updateStatus({ status: 'qr', qr_data_url: qrDataUrl, error: null });
          }
        }).catch((error) => {
          updateStatus({ status: 'error', qr_data_url: null, error: error.message });
        });
      }
      if (connection === 'open') {
        const userId = String(activeSocket.user?.id || '').split('@')[0].split(':')[0];
        updateStatus({
          status: 'connected',
          phone: normalizeWhatsAppNumber(userId),
          qr_data_url: null,
          error: null,
        });
      }
      if (connection === 'close') {
        socket = null;
        updateStatus({ qr_data_url: null });
        if (disconnectRequested) {
          updateStatus({ status: 'disconnected', phone: null, error: null });
          return;
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          updateStatus({
            status: 'logged_out',
            phone: null,
            error: 'Sesi WhatsApp keluar. Hubungkan ulang dengan memindai QR baru.',
          });
          clearAuthDirectory().catch((error) => {
            console.error('Clear logged-out WhatsApp session failed:', error);
          });
          return;
        }
        updateStatus({ status: 'reconnecting', phone: null, error: null });
        reconnectTimer = setTimeout(() => {
          connectWhatsAppSession().catch((error) => {
            updateStatus({ status: 'error', error: error.message });
          });
        }, 5000);
        reconnectTimer.unref();
      }
    });
  })();

  try {
    await starting;
    return getWhatsAppSessionStatus();
  } catch (error) {
    updateStatus({ status: 'error', qr_data_url: null, error: error.message });
    throw error;
  } finally {
    starting = null;
  }
};

export const resumeWhatsAppSession = async () => {
  try {
    validateAuthDirectory();
    const entries = await readdir(authDirectory);
    if (!entries.includes('creds.json')) return;
    await connectWhatsAppSession();
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Resume WhatsApp session failed:', error);
      updateStatus({ status: 'error', error: error.message });
    }
  }
};

export const disconnectWhatsAppSession = async () => {
  if (starting) await starting;
  disconnectRequested = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const activeSocket = socket;
  socket = null;
  let logoutError = null;
  if (activeSocket) {
    if (state.status === 'connected') {
      try {
        await activeSocket.logout();
      } catch (error) {
        logoutError = error;
        console.error('WhatsApp logout request failed:', error);
      }
    } else {
      activeSocket.end(new Error('WhatsApp connection cancelled by administrator.'));
    }
  }
  await clearAuthDirectory();
  updateStatus({
    status: 'disconnected',
    phone: null,
    qr_data_url: null,
    error: logoutError ? 'Sesi lokal dihapus, tetapi WhatsApp tidak mengonfirmasi proses keluar.' : null,
  });
  if (logoutError) {
    throw new Error('Sesi lokal dihapus, tetapi WhatsApp tidak mengonfirmasi proses keluar.');
  }
  return getWhatsAppSessionStatus();
};

export const sendWhatsAppMessage = async (target, message) => {
  if (state.status !== 'connected' || !socket) {
    throw new Error('WhatsApp belum terhubung.');
  }
  const phone = normalizeWhatsAppNumber(target);
  if (!phone) throw new Error('Nomor WhatsApp penerima tidak valid.');
  return socket.sendMessage(`${phone}@s.whatsapp.net`, { text: message });
};
