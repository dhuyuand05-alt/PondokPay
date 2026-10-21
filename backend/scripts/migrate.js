import 'dotenv/config';
if (process.env.MIGRATION_DB_USER) process.env.DB_USER = process.env.MIGRATION_DB_USER;
if (process.env.MIGRATION_DB_PASSWORD) process.env.DB_PASSWORD = process.env.MIGRATION_DB_PASSWORD;
const { ensureAdminSchema, default: pool } = await import('../config/db.js');

try {
  await ensureAdminSchema();
  console.log('Database schema migration completed.');
} catch (error) {
  console.error('Database schema migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
