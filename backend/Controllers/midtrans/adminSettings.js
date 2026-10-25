import pool from '../../config/db.js';
import { decryptApplicationSecret, encryptApplicationSecret } from '../../config/security.js';
import { isMidtransCredential } from '../../services/midtrans.js';

const publicAdminConfiguration = (settings) => ({
  merchant_id: settings.midtrans_merchant_id || '',
  client_key: settings.midtrans_client_key || '',
  server_key_configured: Boolean(settings.midtrans_server_key_enc),
  environment: settings.midtrans_environment || 'sandbox',
  enabled: Boolean(
    settings.midtrans_merchant_id &&
    settings.midtrans_client_key &&
    settings.midtrans_server_key_enc,
  ),
});

const readAdminConfiguration = async () => {
  const [rows] = await pool.query(
    `SELECT midtrans_merchant_id, midtrans_client_key,
            midtrans_server_key_enc, midtrans_environment
     FROM institution_settings WHERE id = 1`
  );
  if (!rows.length) throw new Error('Pengaturan pondok belum tersedia.');
  return rows[0];
};

export const getAdminMidtransSettings = async (req, res) => {
  try {
    const settings = await readAdminConfiguration();
    return res.status(200).json({ data: publicAdminConfiguration(settings) });
  } catch (error) {
    console.error('Get Midtrans settings error:', error);
    return res.status(500).json({ message: 'Gagal mengambil pengaturan pembayaran.' });
  }
};

export const updateAdminMidtransSettings = async (req, res) => {
  const environment = req.body.environment;
  const merchantId = typeof req.body.merchant_id === 'string' ? req.body.merchant_id.trim() : '';
  const clientKey = typeof req.body.client_key === 'string' ? req.body.client_key.trim() : '';
  const serverKey = typeof req.body.server_key === 'string' ? req.body.server_key.trim() : '';
  const clearServerKey = req.body.clear_server_key === true;

  if (!['sandbox', 'production'].includes(environment)) {
    return res.status(400).json({ message: 'Pilih lingkungan Sandbox atau Production.' });
  }
  if (merchantId.length > 100 || clientKey.length > 255 || serverKey.length > 255) {
    return res.status(400).json({ message: 'Salah satu kredensial Midtrans terlalu panjang.' });
  }
  if (serverKey && clearServerKey) {
    return res.status(400).json({ message: 'Kunci server baru dan penghapusan kunci tidak dapat dilakukan bersamaan.' });
  }
  if (clientKey && !isMidtransCredential(clientKey, 'client')) {
    return res.status(400).json({ message: 'Client Key harus menggunakan format Mid-client- atau SB-Mid-client-.' });
  }

  try {
    const current = await readAdminConfiguration();
    let encryptedServerKey = current.midtrans_server_key_enc;
    let currentServerKey = null;
    if (encryptedServerKey && !serverKey && !clearServerKey) {
      try {
        currentServerKey = decryptApplicationSecret(encryptedServerKey);
      } catch (error) {
        console.error('Stored Midtrans server key is unreadable during update:', error);
        return res.status(503).json({ message: 'Kunci server tersimpan tidak dapat dibaca. Periksa MFA_ENCRYPTION_KEY.' });
      }
    }

    if (clearServerKey) {
      encryptedServerKey = null;
      currentServerKey = null;
    } else if (serverKey) {
      currentServerKey = serverKey;
      encryptedServerKey = encryptApplicationSecret(serverKey);
    }
    if (currentServerKey && !isMidtransCredential(currentServerKey, 'server')) {
      return res.status(400).json({ message: 'Server Key harus menggunakan format Mid-server- atau SB-Mid-server-. Masukkan kunci baru atau hapus kunci lama.' });
    }

    await pool.query(
      `UPDATE institution_settings
       SET midtrans_merchant_id = ?, midtrans_client_key = ?,
           midtrans_server_key_enc = ?, midtrans_environment = ?
       WHERE id = 1`,
      [merchantId || null, clientKey || null, encryptedServerKey, environment],
    );
    const updated = await readAdminConfiguration();
    return res.status(200).json({
      message: 'Pengaturan pembayaran Midtrans berhasil disimpan.',
      data: publicAdminConfiguration(updated),
    });
  } catch (error) {
    console.error('Update Midtrans settings error:', error);
    return res.status(500).json({ message: 'Gagal menyimpan pengaturan pembayaran.' });
  }
};
