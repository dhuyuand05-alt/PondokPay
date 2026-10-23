import {
  connectWhatsAppSession,
  disconnectWhatsAppSession,
  getWhatsAppSessionStatus,
} from '../services/whatsappBot.js';

export const getWhatsAppStatus = (req, res) =>
  res.status(200).json({ data: getWhatsAppSessionStatus() });

export const connectWhatsApp = async (req, res) => {
  try {
    const data = await connectWhatsAppSession();
    return res.status(200).json({
      message: data.status === 'connected'
        ? 'WhatsApp sudah terhubung.'
        : 'Koneksi WhatsApp dimulai. Pindai QR yang ditampilkan.',
      data,
    });
  } catch (error) {
    console.error('Start WhatsApp connection failed:', error);
    return res.status(503).json({ message: error.message || 'Gagal memulai koneksi WhatsApp.' });
  }
};

export const disconnectWhatsApp = async (req, res) => {
  try {
    const data = await disconnectWhatsAppSession();
    return res.status(200).json({
      message: 'WhatsApp terputus dan sesi tersimpan telah dihapus.',
      data,
    });
  } catch (error) {
    console.error('Disconnect WhatsApp failed:', error);
    return res.status(500).json({ message: error.message || 'Gagal memutuskan koneksi WhatsApp.' });
  }
};
