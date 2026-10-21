import pool from '../config/db.js';

export const requireAssignedCanteen = async (req, res, next) => {
  const canteenId = Number(req.params.id);
  if (!Number.isSafeInteger(canteenId) || canteenId < 1) {
    return res.status(400).json({ message: 'ID kantin tidak valid.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT 1 FROM kantin_kasir
       WHERE kantin_id = ? AND user_id = ?
       LIMIT 1`,
      [canteenId, req.user.id]
    );
    if (!rows.length) {
      return res.status(403).json({ message: 'Akun kasir tidak ditugaskan ke kantin ini.' });
    }
    next();
  } catch (error) {
    console.error('Check cashier canteen assignment error:', error);
    return res.status(500).json({ message: 'Gagal memeriksa akses kantin.' });
  }
};
