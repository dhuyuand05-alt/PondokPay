import 'dotenv/config';
import { randomBytes, createCipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, appendFile, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const keyValue = process.env.BACKUP_ENCRYPTION_KEY;
if (!/^[a-fA-F0-9]{64}$/.test(keyValue ?? '')) {
  throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex-encoded key.');
}
const backupUser = process.env.BACKUP_DB_USER || process.env.DB_USER;
const backupPassword = process.env.BACKUP_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '';
if (!process.env.DB_NAME || !backupUser) {
  throw new Error('DB_NAME and BACKUP_DB_USER (or DB_USER) must be configured.');
}

const targetDir = process.env.BACKUP_DIR;
if (!targetDir) throw new Error('Set BACKUP_DIR to a protected location outside the source tree.');
const outputPath = path.resolve(process.argv[2] ??
  path.join(targetDir, `cashless-${new Date().toISOString().replace(/[:.]/g, '-')}.csbk`));
await mkdir(path.dirname(outputPath), { recursive: true });

const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyValue, 'hex'), iv);
const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
output.write(Buffer.concat([Buffer.from('CSBKP1'), iv]));
const dump = spawn('mysqldump', [
  '--single-transaction',
  '--routines',
  '--triggers',
  '--events',
  '--hex-blob',
  '--host', process.env.DB_HOST || 'localhost',
  '--user', backupUser,
  process.env.DB_NAME,
], {
  env: { ...process.env, MYSQL_PWD: backupPassword },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
dump.stderr.setEncoding('utf8');
dump.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-10000); });
const exitStatus = new Promise((resolve, reject) => {
  dump.once('error', reject);
  dump.once('close', (code, signal) => resolve({ code, signal }));
});

try {
  await pipeline(dump.stdout, cipher, output);
  const status = await exitStatus;
  if (status.code !== 0) {
    throw new Error(`mysqldump exited with ${status.code ?? status.signal}: ${stderr.trim()}`);
  }
  await appendFile(outputPath, cipher.getAuthTag());
  console.log(`Encrypted database backup written to ${outputPath}`);
} catch (error) {
  dump.kill();
  await unlink(outputPath).catch(() => {});
  throw error;
}
