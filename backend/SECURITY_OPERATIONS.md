# Security operations

This API handles real balances. Do not expose it to the public internet until the deployment checklist below is complete and the restore/approval flows have been tested in staging.

## Secrets and administrator provisioning

- `JWT_SECRET` must be at least 32 cryptographically random bytes. Changing it invalidates every active access and MFA challenge token.
- `MFA_ENCRYPTION_KEY` and `BACKUP_ENCRYPTION_KEY` must each be independent 32-byte random keys encoded as 64 hex characters. Keep them in a secret manager, not source control or database backups. Losing the MFA key requires a controlled MFA reset; losing the backup key makes encrypted backups unrecoverable.
- Baileys session files in `WHATSAPP_AUTH_DIR` are device credentials. Keep the dedicated directory private to the backend service account, persistent across deployments, excluded from Git/static serving, and out of ordinary source backups. Do not copy the session between institutions or machines. Deleting the session requires pairing again.
- Baileys is an unofficial WhatsApp Web integration and may be disconnected or restricted by WhatsApp. Use a dedicated number, send only parent-approved transaction notifications, honor opt-outs promptly, and follow applicable WhatsApp terms. A parent-initiated verification message is an opt-in safeguard, not a guarantee against restrictions.
- The known default `admin` / `admin123` account is disabled during migration. No default administrator is created at startup. Create an administrator only after migrations using `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` of at least 12 bytes and no more than bcrypt's 72-byte limit:

  ```powershell
  $env:ADMIN_USERNAME = "your-admin-name"
  $securePassword = Read-Host "Enter a strong one-time provisioning password" -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    npm run seed:admin
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
  }
  ```

  To reset the already-disabled legacy `admin` account, set `ADMIN_RESET_EXISTING=true` for the provisioning command. A reset clears its MFA enrollment, increments the token version, and requires a fresh MFA setup. Do not put the one-time password in shell history, REST examples, or logs.
- Admin and cashier accounts cannot use the API until TOTP MFA is enrolled. The login response contains a short-lived `challenge_token`; use it with `POST /api/auth/mfa/setup`, register the returned secret/URI in an authenticator, and submit the six-digit code to `POST /api/auth/mfa/verify`. Show the enrollment secret only over HTTPS and do not log or persist it in a client.
- Access tokens last one hour. Successful MFA login increments `token_version`; changing a password, role, or active status also increments it. Disabled accounts are denied immediately. MFA codes are accepted only once per time step.

## Production configuration and database permissions

Set `NODE_ENV=production`, `HOST=127.0.0.1` when the reverse proxy is on the same host, strong independent keys, `DB_AUTO_MIGRATE=false`, `DB_SSL_CA` to the trusted database CA certificate, and `TRUST_PROXY_HOPS` to the exact number of trusted TLS-terminating proxies. The API rejects plain HTTP in production. Configure the reverse proxy to redirect HTTP to HTTPS, forward `X-Forwarded-Proto`, and enforce its own distributed rate limit. The in-process general API limiter is per instance; login/MFA limits are database-backed and shared across instances.

Run `npm run migrate` with a separate `MIGRATION_DB_USER` account before deploying the application. Keep the runtime database account limited to required DML; it must not have schema/trigger privileges. The runtime account must not be able to delete users, students, canteens, credentials, financial ledger rows, audit logs, or approval records. Grant application reads/writes broadly only if the application uses a dedicated database containing no unrelated tables; grant deletes only for relation unlinking and rate-limit cleanup:

```sql
GRANT SELECT, INSERT, UPDATE ON db_cashless_santri.* TO 'cashless_app'@'%';
GRANT DELETE ON db_cashless_santri.wali_santri TO 'cashless_app'@'%';
GRANT DELETE ON db_cashless_santri.parent_notification_settings TO 'cashless_app'@'%';
GRANT DELETE ON db_cashless_santri.kantin_kasir TO 'cashless_app'@'%';
GRANT DELETE ON db_cashless_santri.security_rate_limits TO 'cashless_app'@'%';
```

The app deactivates accounts/students/canteens and blocks credentials rather than deleting them. Financial ledger tables also have database triggers rejecting updates and deletes. Keep the migration credential separate, tightly controlled, and unavailable to the running API process. Use a distinct MySQL account per environment and restrict its network access.

## Financial controls and audit

- `FINANCIAL_DUAL_APPROVAL_THRESHOLD` is the amount in the database currency at which student top-ups, student withdrawals, and canteen withdrawals require a second, different active admin. The default is `500000`; set the value to the institution's approved policy before deployment.
- A requester creates `POST /api/admin/financial-approvals`; another MFA-authenticated admin approves or rejects it. The requester then submits the matching financial operation with `approval_id`. The amount, target, action, and description must match; the approval expires after 24 hours and is consumed atomically with the balance update.
- Every canteen payout also requires confirmation by an active cashier assigned to that canteen. The cashier reviews it in their own MFA-authenticated session; the confirmation is bound to the requesting admin, canteen, amount, and description, expires after 24 hours, and is consumed atomically with the payout. Do not ask cashiers to share their TOTP code with admins.
- Cashier sales, admin top-ups, student withdrawals, and canteen withdrawals are atomic and require a unique `Idempotency-Key`. Reusing the same key and matching payload returns the original result without changing balances; reusing it for another operation is rejected. Never retry a transaction with a new key until its prior status is known.
- Monthly service-fee charges, student balance deductions, fee-income entries, and top-up collection of current-month arrears are atomic and period-idempotent. Install and monitor `pondokpay-service-fee.timer` using the [deployment instructions](../deploy/systemd/README.md); it runs on the first day of each month at 00:15 Asia/Jakarta. Unpaid service-fee charges become forgiven when the next monthly period is processed. Cash entries are append-only; correct an entry by creating its full reversing entry rather than changing or deleting it.
- Mutating authenticated requests are audited before execution; if the audit insert fails, the mutation is rejected. Audit entries omit request bodies, passwords, tokens, RFID values, and fingerprint identifiers. Authentication outcomes are recorded without credentials. Audit rows cannot be deleted or rewritten through the application.
- Reconcile student/canteen balances against their append-only ledgers routinely. Alert on failed audit writes, denied login bursts, unexpected balance changes, approval activity, and repeated API failures. Restrict audit-log access and define retention according to applicable financial/privacy requirements.
- RFID/fingerprint values in this schema are identifiers, not biometric templates. Do not store fingerprint images/templates here; keep biometric templates on the device/provider and use revocable identifiers only.

## Encrypted backups and restore tests

Install the MySQL client tools (`mysqldump` and `mysql`) on the backup host. Set `BACKUP_DIR` to a protected path outside the source tree and use a separate `BACKUP_ENCRYPTION_KEY`. Configure `BACKUP_DB_USER` as a dedicated dump-only account with the MySQL privileges required for dumps, not as the runtime or migration user. `npm run backup` creates an AES-256-GCM encrypted database dump; store copies off-site with restricted access and retain the decryption key separately. The database backup does not include uploaded pondok logos; back up the `UPLOAD_DIR` contents separately and restore them alongside the database.

At a scheduled interval, restore a backup into a new, empty staging database (never the production database):

The restore script verifies the AES-GCM authentication tag before starting MySQL. It stages decrypted SQL in a temporary directory and removes that directory after the restore; ensure the host's temporary storage is protected.

```powershell
mysql --host=$env:DB_HOST --user=$env:MIGRATION_DB_USER -e "CREATE DATABASE cashless_restore_test"
npm run restore -- "C:\secure-backups\cashless-latest.csbk" cashless_restore_test
```

Verify row counts, ledger-to-balance reconciliation, login/MFA, and representative transaction reads in staging. Record restore duration and results. A backup is not considered valid until a restore test succeeds.

## Operational notes

- Rate limits use a 15-minute window: at most 5 password attempts per IP/username pair, 30 per IP, and 10 MFA attempts per IP. Persistent bucket keys are HMACed; raw passwords and usernames are not stored in the rate-limit table.
- Keep application logs free of request bodies and secrets. Secure and rotate the `.env` file; never commit it.
- Rotate JWT keys as an incident response or scheduled procedure. Rotate MFA encryption keys only with a planned decrypt/re-encrypt migration and verified backup.
