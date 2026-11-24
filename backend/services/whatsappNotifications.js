import pool from '../config/db.js';
import { sendWhatsAppMessage } from './whatsappBot.js';

const maxAttempts = 5;
const retryDelaysMinutes = [1, 5, 15, 60];

export const enqueueParentTransactionNotifications = async (connection, transactionId) => {
  await connection.query(
    `INSERT IGNORE INTO whatsapp_notification_outbox (transaction_id, user_id)
     SELECT ?, pns.user_id
     FROM transaksi t
     JOIN wali_santri w ON w.santri_id = t.santri_id
     JOIN users u ON u.id = w.user_id AND u.role = 'wali' AND u.is_active = TRUE
     JOIN parent_notification_settings pns ON pns.user_id = u.id
     WHERE t.id = ? AND t.tipe_transaksi IN ('belanja', 'refund_belanja', 'topup', 'tarik')
       AND pns.verified_at IS NOT NULL`,
    [transactionId, transactionId]
  );
};

const claimNotification = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id
       FROM whatsapp_notification_outbox
       WHERE (status = 'pending' AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status = 'processing' AND processing_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 MINUTE))
       ORDER BY id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );
    if (!rows.length) {
      await connection.commit();
      return null;
    }
    await connection.query(
      `UPDATE whatsapp_notification_outbox
       SET status = 'processing', processing_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rows[0].id]
    );
    await connection.commit();
    return rows[0].id;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const sendQueuedNotification = async (id) => {
  const [rows] = await pool.query(
    `SELECT o.id, o.attempts, pns.whatsapp_number,
            t.tipe_transaksi, t.jumlah, t.saldo_akhir, t.keterangan, t.created_at,
            s.nama_lengkap, s.nis, k.nama AS nama_kantin,
            i.name AS institution_name, i.timezone
     FROM whatsapp_notification_outbox o
     JOIN parent_notification_settings pns
       ON pns.user_id = o.user_id AND pns.verified_at IS NOT NULL
     JOIN users u ON u.id = pns.user_id AND u.role = 'wali' AND u.is_active = TRUE
     JOIN transaksi t ON t.id = o.transaction_id
     JOIN santri s ON s.id = t.santri_id
     LEFT JOIN kantin k ON k.id = t.kantin_id
     JOIN institution_settings i ON i.id = 1
     WHERE o.id = ? AND o.status = 'processing'`,
    [id]
  );
  if (!rows.length) {
    await pool.query(
      `UPDATE whatsapp_notification_outbox SET status = 'failed',
       last_error = 'Nomor wali tidak lagi terverifikasi.' WHERE id = ?`,
      [id]
    );
    return;
  }

  const notification = rows[0];
  try {
    const date = new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: notification.timezone || 'Asia/Jakarta',
    }).format(new Date(notification.created_at));
    const typeName = {
      belanja: 'Belanja',
      refund_belanja: 'Pengembalian belanja',
      topup: 'Top-up saldo',
      tarik: 'Penarikan saldo',
    }[notification.tipe_transaksi];
    const amount = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(notification.jumlah));
    const balance = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(notification.saldo_akhir));
    const lines = [
      `Notifikasi ${notification.institution_name || 'PondokPay'}`,
      `Santri: ${notification.nama_lengkap} (${notification.nis})`,
      `Transaksi: ${typeName}`,
      `Jumlah: ${amount}`,
      `Saldo setelah transaksi: ${balance}`,
    ];
    if (notification.nama_kantin) lines.push(`Kantin: ${notification.nama_kantin}`);
    if (notification.keterangan) lines.push(`Keterangan: ${notification.keterangan}`);
    lines.push(`Waktu: ${date}`, 'Pesan otomatis PondokPay.');
    await sendWhatsAppMessage(notification.whatsapp_number, lines.join('\n'));
    await pool.query(
      `UPDATE whatsapp_notification_outbox
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, processing_at = NULL, last_error = NULL
       WHERE id = ?`,
      [id]
    );
  } catch (error) {
    const attempts = Number(notification.attempts) + 1;
    const failed = attempts >= maxAttempts;
    const delay = retryDelaysMinutes[Math.min(attempts - 1, retryDelaysMinutes.length - 1)];
    await pool.query(
      `UPDATE whatsapp_notification_outbox
       SET status = ?, attempts = ?, processing_at = NULL, last_error = ?,
           next_attempt_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)
       WHERE id = ?`,
      [
        failed ? 'failed' : 'pending',
        attempts,
        String(error.message || 'Pengiriman gagal.').slice(0, 255),
        delay,
        id,
      ]
    );
    console.error(`WhatsApp notification ${id} delivery failed (${attempts}/${maxAttempts}):`, error.message);
  }
};

let workerRunning = false;
export const processWhatsAppNotificationQueue = async () => {
  if (workerRunning) return;
  workerRunning = true;
  try {
    for (let count = 0; count < 10; count += 1) {
      const id = await claimNotification();
      if (!id) break;
      await sendQueuedNotification(id);
    }
  } catch (error) {
    console.error('WhatsApp notification queue processing failed:', error);
  } finally {
    workerRunning = false;
  }
};

export const startWhatsAppNotificationWorker = () => {
  const timer = setInterval(() => {
    processWhatsAppNotificationQueue().catch((error) => {
      console.error('WhatsApp notification worker failed:', error);
    });
  }, 5000);
  timer.unref();
  processWhatsAppNotificationQueue().catch((error) => {
    console.error('WhatsApp notification worker startup failed:', error);
  });
  return timer;
};
