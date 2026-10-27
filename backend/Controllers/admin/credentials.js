import pool from '../../config/db.js';
import {
  duplicateError,
  parseId,
  parsePagination,
  runInTransaction,
  validCredentialStatuses,
} from './shared.js';

export const getCredentials = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.santri_id, s.nis, s.nama_lengkap, c.rfid_uid,
              c.fingerprint_id, c.status
       FROM credentials_auth c LEFT JOIN santri s ON s.id = c.santri_id
       ORDER BY c.id DESC`
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Get credentials error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kredensial.' });
  }
};

export const getCredentialById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kredensial tidak valid.' });
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.santri_id, s.nis, s.nama_lengkap, c.rfid_uid,
              c.fingerprint_id, c.status
       FROM credentials_auth c LEFT JOIN santri s ON s.id = c.santri_id
       WHERE c.id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Kredensial tidak ditemukan.' });
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('Get credential by id error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data kredensial.' });
  }
};

const registerCredentialValue = async (req, res, type) => {
  const santriId = parseId(req.params.id);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  const isCard = type === 'kartu';
  const column = isCard ? 'rfid_uid' : 'fingerprint_id';
  const inputKey = isCard ? 'rfid_uid' : 'fingerprint_id';
  let value = req.body[inputKey];
  if (isCard) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 50) {
      return res.status(400).json({ message: 'RFID UID wajib diisi dan maksimal 50 karakter.' });
    }
    value = value.trim();
  } else {
    value = Number(value);
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ message: 'Fingerprint ID harus berupa bilangan bulat positif.' });
    }
  }

  try {
    const result = await runInTransaction(async (connection) => {
      const [students] = await connection.query('SELECT id FROM santri WHERE id = ? FOR UPDATE', [santriId]);
      if (!students.length) return { notFound: true };
      const [duplicates] = await connection.query(
        `SELECT id, santri_id FROM credentials_auth WHERE ${column} = ? LIMIT 1 FOR UPDATE`,
        [value]
      );
      if (duplicates.length) {
        let duplicate;
        if (duplicates[0].santri_id === santriId) {
          duplicate = new Error('Kredensial sudah terdaftar untuk santri ini.');
          duplicate.code = 'CREDENTIAL_ALREADY_REGISTERED';
        } else {
          duplicate = new Error('Kredensial sudah digunakan santri lain.');
          duplicate.code = 'CREDENTIAL_IN_USE';
        }
        throw duplicate;
      }
      const [insert] = await connection.query(
        `INSERT INTO credentials_auth (santri_id, ${column}, status)
         VALUES (?, ?, 'active')`,
        [santriId, value]
      );
      return { id: insert.insertId, santri_id: santriId, [inputKey]: value, status: 'active' };
    });
    if (result.notFound) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    return res.status(201).json({ message: `${isCard ? 'Kartu' : 'Sidik jari'} berhasil didaftarkan.`, data: result });
  } catch (error) {
    if (error.code === 'CREDENTIAL_ALREADY_REGISTERED') {
      return res.status(409).json({ message: 'Kredensial tersebut sudah terdaftar untuk santri ini.' });
    }
    if (error.code === 'CREDENTIAL_IN_USE' || duplicateError(error)) {
      return res.status(409).json({ message: 'Kredensial tersebut sudah digunakan oleh santri lain.' });
    }
    console.error(`Register ${type} error:`, error);
    return res.status(500).json({ message: `Gagal mendaftarkan ${isCard ? 'kartu' : 'sidik jari'}.` });
  }
};

export const registerStudentCard = (req, res) => registerCredentialValue(req, res, 'kartu');
export const registerStudentFingerprint = (req, res) => registerCredentialValue(req, res, 'sidik-jari');

export const createCredential = async (req, res) => {
  const santriId = parseId(req.body.santri_id);
  const { rfid_uid: rfidUid = null, fingerprint_id: fingerprintValue = null, status = 'active' } = req.body;
  const fingerprintId = fingerprintValue === null ? null : Number(fingerprintValue);
  if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
  if (rfidUid !== null && (typeof rfidUid !== 'string' || rfidUid.length > 50)) {
    return res.status(400).json({ message: 'RFID UID maksimal 50 karakter.' });
  }
  if (fingerprintId !== null && (!Number.isInteger(fingerprintId) || fingerprintId < 0)) {
    return res.status(400).json({ message: 'Fingerprint ID harus berupa bilangan bulat positif.' });
  }
  if (!rfidUid && fingerprintId === null) {
    return res.status(400).json({ message: 'RFID UID atau fingerprint ID wajib diisi.' });
  }
  if (!validCredentialStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status kredensial harus active atau blocked.' });
  }
  try {
    const [students] = await pool.query('SELECT id FROM santri WHERE id = ? LIMIT 1', [santriId]);
    if (!students.length) return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    const normalizedRfid = rfidUid?.trim() || null;
    if (normalizedRfid) {
      const [existing] = await pool.query(
        'SELECT id FROM credentials_auth WHERE rfid_uid = ? LIMIT 1',
        [normalizedRfid]
      );
      if (existing.length) return res.status(409).json({ message: 'RFID UID sudah terdaftar.' });
    }
    if (fingerprintId !== null) {
      const [existing] = await pool.query(
        'SELECT id FROM credentials_auth WHERE fingerprint_id = ? LIMIT 1',
        [fingerprintId]
      );
      if (existing.length) return res.status(409).json({ message: 'Fingerprint ID sudah terdaftar.' });
    }
    const [result] = await pool.query(
      `INSERT INTO credentials_auth (santri_id, rfid_uid, fingerprint_id, status)
       VALUES (?, ?, ?, ?)`,
      [santriId, normalizedRfid, fingerprintId, status]
    );
    const [rows] = await pool.query(
      'SELECT id, santri_id, rfid_uid, fingerprint_id, status FROM credentials_auth WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json({ message: 'Kredensial berhasil dibuat.', data: rows[0] });
  } catch (error) {
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'RFID UID atau fingerprint ID sudah terdaftar.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    }
    console.error('Create credential error:', error);
    return res.status(500).json({ message: 'Gagal membuat data kredensial.' });
  }
};

export const updateCredential = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kredensial tidak valid.' });
  const fields = [];
  const values = [];
  if (req.body.santri_id !== undefined) {
    const santriId = parseId(req.body.santri_id);
    if (!santriId) return res.status(400).json({ message: 'ID santri tidak valid.' });
    fields.push('santri_id = ?');
    values.push(santriId);
  }
  if (req.body.rfid_uid !== undefined) {
    const value = req.body.rfid_uid;
    if (value !== null && (typeof value !== 'string' || value.length > 50)) {
      return res.status(400).json({ message: 'RFID UID maksimal 50 karakter.' });
    }
    fields.push('rfid_uid = ?');
    values.push(value?.trim() || null);
  }
  if (req.body.fingerprint_id !== undefined) {
    const value = req.body.fingerprint_id;
    const fingerprintId = value === null ? null : Number(value);
    if (fingerprintId !== null && (!Number.isInteger(fingerprintId) || fingerprintId < 0)) {
      return res.status(400).json({ message: 'Fingerprint ID harus berupa bilangan bulat positif.' });
    }
    fields.push('fingerprint_id = ?');
    values.push(fingerprintId);
  }
  if (req.body.status !== undefined) {
    if (!validCredentialStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Status kredensial harus active atau blocked.' });
    }
    fields.push('status = ?');
    values.push(req.body.status);
  }
  if (!fields.length) return res.status(400).json({ message: 'Tidak ada data yang diubah.' });
  try {
    const [currentRows] = await pool.query(
      'SELECT rfid_uid, fingerprint_id FROM credentials_auth WHERE id = ? LIMIT 1',
      [id]
    );
    if (!currentRows.length) return res.status(404).json({ message: 'Kredensial tidak ditemukan.' });
    const nextRfid = req.body.rfid_uid === undefined
      ? currentRows[0].rfid_uid
      : (req.body.rfid_uid?.trim() || null);
    const nextFingerprint = req.body.fingerprint_id === undefined
      ? currentRows[0].fingerprint_id
      : (req.body.fingerprint_id === null ? null : Number(req.body.fingerprint_id));
    if (!nextRfid && nextFingerprint === null) {
      return res.status(400).json({ message: 'Minimal RFID UID atau fingerprint ID harus tetap terdaftar.' });
    }
    if (nextRfid) {
      const [duplicates] = await pool.query(
        'SELECT id FROM credentials_auth WHERE rfid_uid = ? AND id <> ? LIMIT 1',
        [nextRfid, id]
      );
      if (duplicates.length) return res.status(409).json({ message: 'RFID UID sudah terdaftar.' });
    }
    if (nextFingerprint !== null) {
      const [duplicates] = await pool.query(
        'SELECT id FROM credentials_auth WHERE fingerprint_id = ? AND id <> ? LIMIT 1',
        [nextFingerprint, id]
      );
      if (duplicates.length) return res.status(409).json({ message: 'Fingerprint ID sudah terdaftar.' });
    }
    const [result] = await pool.query(
      `UPDATE credentials_auth SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.query('SELECT id FROM credentials_auth WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Kredensial tidak ditemukan.' });
    }
    const [rows] = await pool.query(
      'SELECT id, santri_id, rfid_uid, fingerprint_id, status FROM credentials_auth WHERE id = ?',
      [id]
    );
    return res.status(200).json({ message: 'Kredensial berhasil diubah.', data: rows[0] });
  } catch (error) {
    if (duplicateError(error)) {
      return res.status(409).json({ message: 'RFID UID atau fingerprint ID sudah terdaftar.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ message: 'Data santri tidak ditemukan.' });
    }
    console.error('Update credential error:', error);
    return res.status(500).json({ message: 'Gagal mengubah data kredensial.' });
  }
};

export const deleteCredential = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID kredensial tidak valid.' });
  try {
    const [result] = await pool.query(
      `UPDATE credentials_auth SET status = 'blocked'
       WHERE id = ? AND status <> 'blocked'`,
      [id]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.query('SELECT id FROM credentials_auth WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Kredensial tidak ditemukan.' });
    }
    return res.status(200).json({ message: 'Kredensial diblokir; data dipertahankan untuk audit.' });
  } catch (error) {
    console.error('Delete credential error:', error);
    return res.status(500).json({ message: 'Gagal menghapus data kredensial.' });
  }
};
