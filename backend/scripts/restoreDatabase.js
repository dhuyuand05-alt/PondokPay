import 'dotenv/config';
import { createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';

const keyValue = process.env.BACKUP_ENCRYPTION_KEY;
if (!/^[a-fA-F0-9]{64}$/.test(keyValue ?? '')) {
  throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex-encoded key.');
}
const backupPath = process.argv[2];
const targetDatabase = process.argv[3] ?? process.env.DB_NAME;
if (!backupPath || !targetDatabase || !/^[A-Za-z0-9_]+$/.test(targetDatabase)) {
  throw new Error('Usage: node scripts/restoreDatabase.js <backup-file> [empty-staging-database]');
}
const restoreUser = process.env.MIGRATION_DB_USER || process.env.DB_USER;
const restorePassword = process.env.MIGRATION_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '';
if (!restoreUser) throw new Error('MIGRATION_DB_USER or DB_USER must be configured.');

const resolvedPath = path.resolve(backupPath);
const file = await open(resolvedPath, 'r');
const fileInfo = await stat(resolvedPath);
if (fileInfo.size < 34) {
  await file.close();
  throw new Error('Backup file is incomplete.');
}
const header = Buffer.alloc(18);
const tag = Buffer.alloc(16);
try {
  await file.read(header, 0, header.length, 0);
  await file.read(tag, 0, tag.length, fileInfo.size - tag.length);
} finally {
  await file.close();
}
if (header.subarray(0, 6).toString() !== 'CSBKP1') {
  throw new Error('Unrecognized encrypted backup format.');
}

const decipher = createDecipheriv(
  'aes-256-gcm',
  Buffer.from(keyValue, 'hex'),
  header.subarray(6, 18)
);
decipher.setAuthTag(tag);
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cashless-restore-'));

try {
  await pipeline(
    createReadStream(resolvedPath, { start: header.length, end: fileInfo.size - tag.length - 1 }),
    decipher,
    createWriteStream(path.join(tempDir, 'restore.sql'), { flags: 'wx', mode: 0o600 })
  );

  const mysql = spawn('mysql', [
    '--host', process.env.DB_HOST || 'localhost',
    '--user', restoreUser,
    targetDatabase,
  ], {
    env: { ...process.env, MYSQL_PWD: restorePassword },
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  mysql.stderr.setEncoding('utf8');
  mysql.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-10000); });
  const exitStatus = new Promise((resolve) => {
    mysql.once('error', (error) => resolve({ error }));
    mysql.once('close', (code, signal) => resolve({ code, signal }));
  });

  try {
    await pipeline(createReadStream(path.join(tempDir, 'restore.sql')), mysql.stdin);
    const status = await exitStatus;
    if (status.error) throw status.error;
    if (status.code !== 0) {
      throw new Error(`mysql restore exited with ${status.code ?? status.signal}: ${stderr.trim()}`);
    }
    console.log(`Backup restored to database ${targetDatabase}.`);
  } catch (error) {
    mysql.kill();
    await exitStatus;
    throw error;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
