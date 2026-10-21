import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { validatePassword } from '../config/passwords.js';

const username = process.env.ADMIN_USERNAME?.trim();
const password = process.env.ADMIN_PASSWORD;

try {
  if (!username || !/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
    throw new Error('Set ADMIN_USERNAME to a valid 3-50 character username before provisioning.');
  }
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(`ADMIN_PASSWORD is invalid: ${passwordError}`);

  const [existing] = await pool.query(
    'SELECT id, role, is_active FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  const hash = await bcrypt.hash(password, 12);
  if (existing.length) {
    if (existing[0].role !== 'admin' || existing[0].is_active ||
        process.env.ADMIN_RESET_EXISTING !== 'true') {
      throw new Error('That username exists. Only an explicitly approved inactive admin can be reset; set ADMIN_RESET_EXISTING=true.');
    }
    await pool.query(
      `UPDATE users SET password = ?, is_active = TRUE, token_version = token_version + 1,
         mfa_enabled = FALSE, mfa_secret_enc = NULL, mfa_pending_secret_enc = NULL,
         mfa_last_step = -1
       WHERE id = ? AND role = 'admin' AND is_active = FALSE`,
      [hash, existing[0].id]
    );
    console.log(`Inactive admin reset with user ID ${existing[0].id}. MFA enrollment is required at first login.`);
  } else {
    const [result] = await pool.query(
      'INSERT INTO users (username, password, role, is_active) VALUES (?, ?, ?, TRUE)',
      [username, hash, 'admin']
    );
    console.log(`Initial admin provisioned with user ID ${result.insertId}. MFA enrollment is required at first login.`);
  }
} catch (error) {
  console.error('Admin provisioning failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
