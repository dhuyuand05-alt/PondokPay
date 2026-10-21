# Dokumentasi Backend PondokPay

Dokumen ini menjelaskan instalasi, konfigurasi, struktur, API, dan operasi backend PondokPay. Rincian request dan response setiap endpoint tersedia di [API_DOCUMENTATION.md](./API_DOCUMENTATION.md); panduan operasional keamanan tambahan tersedia di [SECURITY_OPERATIONS.md](./SECURITY_OPERATIONS.md) dan [operasi_keamanan.md](./operasi_keamanan.md).

## 1. Gambaran umum

Backend adalah REST API berbasis Node.js ES Modules, Express, dan MySQL. Aplikasi menangani autentikasi dan MFA, akun berbasis peran, data santri dan wali, kantin, transaksi saldo, persetujuan finansial, serta pencatatan audit. Semua API aplikasi menggunakan prefix `/api`, kecuali endpoint status `GET /`.

Peran akun yang didukung:

| Peran | Cakupan |
|---|---|
| `admin` | Administrasi pondok, akun, santri, kantin, transaksi, persetujuan, dan audit |
| `kasir` | Transaksi dan riwayat kantin yang ditugaskan |
| `wali` | Informasi dan limit harian anak yang terhubung |
| `santri` | Autentikasi tersedia, tetapi tidak ada antarmuka/API khusus santri yang terdokumentasi untuk UI saat ini |

Nilai saldo menggunakan `DECIMAL` dan umumnya dikirim sebagai string desimal, misalnya `"50000.00"`. Password tidak dikembalikan API. Perubahan saldo dicatat dalam ledger finansial; endpoint penghapusan data tertentu menonaktifkan atau memblokir record, bukan menghapus riwayat.

## 2. Teknologi dan prasyarat

- Node.js dengan dukungan ES Modules dan `npm`.
- MySQL yang dapat diakses backend.
- MySQL client tools `mysql` dan `mysqldump` untuk pemulihan dan backup.
- Akun MySQL terpisah untuk aplikasi, migrasi, dan backup pada deployment produksi.

Dependency utama adalah Express, `mysql2`, `jsonwebtoken`, `bcryptjs`, dan `dotenv`. Versi dependency terkunci di `package-lock.json`.

## 3. Instalasi dan menjalankan secara lokal

Dari PowerShell:

```powershell
cd E:\project-akhir\backend
npm install
Copy-Item .env.example .env
```

Edit `.env` dengan database dan kunci lokal yang sesuai. Pastikan database MySQL sudah dibuat, misalnya `db_cashless_santri`, dan user database mempunyai akses yang diperlukan. Jangan gunakan kredensial contoh di luar lingkungan lokal.

Di lingkungan pengembangan, server secara default memastikan skema database tersedia saat startup. Jalankan:

```powershell
npm run dev
```

atau:

```powershell
npm start
```

API berjalan di port `3000` secara default. `GET http://localhost:3000/` memberikan status dan beberapa route utama. Body request mutasi harus JSON (`Content-Type: application/json`); ukuran body dibatasi 32 KB.

## 4. Konfigurasi lingkungan

Gunakan `backend/.env.example` sebagai daftar variabel yang tersedia. Simpan nilai rahasia hanya di environment atau secret manager, bukan pada source control.

| Variabel | Kegunaan |
|---|---|
| `PORT` | Port HTTP API; default `3000` |
| `NODE_ENV` | Mode aplikasi; gunakan `production` saat deployment produksi |
| `JWT_SECRET` | Kunci token; wajib sekurangnya 32 byte acak |
| `MFA_ENCRYPTION_KEY` | Kunci AES-256 untuk secret MFA; 64 karakter hex |
| `FINANCIAL_DUAL_APPROVAL_THRESHOLD` | Ambang nominal yang mewajibkan persetujuan admin kedua; default `500000` |
| `TRUST_PROXY_HOPS` | Jumlah proxy tepercaya di depan API, bilangan 0–5; sesuaikan hanya dengan topologi deployment |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Koneksi database waktu jalan |
| `DB_SSL_CA` | Sertifikat CA database; wajib pada mode produksi |
| `DB_AUTO_MIGRATE` | Mengizinkan setup skema otomatis pada startup nonproduksi; harus `false` pada produksi |
| `MIGRATION_DB_USER`, `MIGRATION_DB_PASSWORD` | Kredensial khusus untuk menjalankan migrasi |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Input sementara untuk provisioning admin melalui script |
| `ADMIN_RESET_EXISTING` | Harus `true` untuk reset akun admin yang sudah ada dan nonaktif |
| `BACKUP_DB_USER`, `BACKUP_DB_PASSWORD` | Kredensial khusus backup |
| `BACKUP_ENCRYPTION_KEY` | Kunci AES-256-GCM backup terpisah dari kunci MFA; 64 karakter hex |
| `BACKUP_DIR` | Direktori backup terenkripsi |

Pada produksi, backend mewajibkan TLS untuk request, `DB_SSL_CA`, serta `DB_AUTO_MIGRATE=false`. Proxy TLS harus dikonfigurasi dengan benar dan jumlah hop tepercaya harus tepat. Jangan menyalin file `.env` dari satu environment ke environment lain.

## 5. Struktur kode

| Lokasi | Tanggung jawab |
|---|---|
| `index.mjs` | Konfigurasi Express, middleware global, route mounting, pengecekan konfigurasi, dan startup |
| `Routes/` | Pemetaan URL/method ke controller dan middleware akses |
| `Controllers/` | Implementasi handler autentikasi, admin, kasir, wali, dan akun |
| `middleware/auth.js` | Verifikasi token, status sesi, dan role |
| `middleware/security.js` | Header keamanan, HTTPS produksi, rate limit, dan audit mutasi |
| `middleware/canteenAccess.js` | Pembatasan akses kasir berdasarkan penugasan kantin |
| `config/db.js` | Pool MySQL dan helper setup/migrasi skema |
| `config/security.js` | Validasi kunci, enkripsi secret MFA, serta fungsi TOTP |
| `config/passwords.js` | Validasi aturan password |
| `services/financialApprovals.js` | Permintaan, keputusan, masa berlaku, dan konsumsi approval finansial |
| `scripts/` | Migrasi skema, provisioning admin, backup, dan restore |
| `sql/` | SQL pendukung API dan tabel akun |
| `test/` | Tes keamanan otomatis berbasis `node:test` |

Route utama yang dipasang adalah `/api/auth`, `/api/users`, `/api/admin`, `/api/kantin`, dan `/api/wali`. Semua route role terlindungi memeriksa token dan role di server; pembatasan UI frontend bukan pengganti otorisasi ini.

## 6. Migrasi dan provisioning admin

Untuk membuat atau memperbarui skema secara eksplisit:

```powershell
cd E:\project-akhir\backend
npm run migrate
```

Script migrasi menggunakan `MIGRATION_DB_USER` dan `MIGRATION_DB_PASSWORD` jika dikonfigurasi, kemudian menjalankan pemeriksaan skema. Pada produksi, jalankan migrasi terpisah sebelum deploy aplikasi. Akun migrasi membutuhkan hak skema dan tidak boleh menjadi kredensial proses API.

Provision admin awal sesudah migrasi:

```powershell
$env:ADMIN_USERNAME = "admin-pondok"
$env:ADMIN_PASSWORD = Read-Host "Masukkan password provisioning sementara"
npm run seed:admin
Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
```

Nama pengguna harus 3–50 karakter yang terdiri dari huruf, angka, titik, garis bawah, atau tanda hubung. Password minimal 12 byte dan maksimal 72 byte. Gunakan password unik, jangan memasukkannya ke log atau riwayat shell, dan segera selesaikan enrollment MFA saat login pertama.

Reset hanya dapat dilakukan atas akun admin nonaktif yang telah ada dan memerlukan persetujuan operasional eksplisit:

```powershell
$env:ADMIN_USERNAME = "admin-pondok"
$env:ADMIN_PASSWORD = Read-Host "Masukkan password reset sementara"
$env:ADMIN_RESET_EXISTING = "true"
npm run seed:admin
Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD, Env:ADMIN_RESET_EXISTING
```

Pengaturan ulang mengaktifkan akun, mengubah password, mencabut token lama, serta menghapus enrollment MFA agar dapat didaftarkan ulang. Hindari menjalankan perintah ini tanpa prosedur perubahan yang disetujui.

## 7. API dan autentikasi

Endpoint API lengkap—termasuk parameter, bentuk body, contoh response, status error, serta aturan akses—didokumentasikan di [API_DOCUMENTATION.md](./API_DOCUMENTATION.md). Daftar kelompok endpoint utamanya:

| Prefix | Fungsi |
|---|---|
| `/api/auth` | Login, enrollment/verifikasi MFA, dan profil sesi |
| `/api/users` | Administrasi akun oleh admin |
| `/api/admin` | Dashboard, santri, kantin/kasir, wali, kredensial, transaksi, approval, audit |
| `/api/kantin` | Kantin yang ditugaskan, lookup santri, penjualan, dan riwayat kasir |
| `/api/wali` | Profil wali, anak terhubung, riwayat, dan limit harian |

Sertakan access token pada header autentikasi HTTP dengan skema Bearer. Login admin dan kasir memerlukan MFA TOTP; challenge MFA berlaku 5 menit, sedangkan access token berlaku 1 jam. Token yang kedaluwarsa atau dicabut mengharuskan login kembali. Login dan MFA memiliki rate limit; API juga membatasi request umum.

Transaksi finansial wajib memakai header `Idempotency-Key` sesuai ketentuan endpoint. Retry yang belum diketahui hasilnya harus memakai key dan payload yang sama. Key sama dengan payload berbeda menghasilkan konflik, bukan transaksi kedua.

Nominal tertentu untuk top-up santri, penarikan santri, dan pencairan kantin memerlukan persetujuan admin kedua. Approval harus sesuai tindakan, target, nominal, dan keterangan, hanya berlaku 24 jam, dan hanya dapat dikonsumsi sekali. Lihat detail alurnya di API dan panduan operasi keamanan.

## 8. Aturan keamanan penting

- Jangan menyediakan aplikasi ke internet publik sebelum konfigurasi produksi, hak database, HTTPS, rate limiting pada proxy, serta skenario approval dan pemulihan diuji.
- Kunci JWT, MFA, dan backup harus acak, unik, disimpan terpisah, serta tidak dimasukkan ke source control.
- Admin dan kasir harus menyelesaikan MFA. Secret enrollment hanya ditampilkan saat setup dan tidak boleh dicatat ke log.
- Audit dicatat sebelum mutasi terautentikasi; kegagalan penulisan audit menggagalkan mutasi. Ledger finansial bersifat append-only dan dilindungi trigger database.
- Data RFID dan fingerprint adalah identifier, bukan template atau gambar biometrik.
- Di produksi gunakan akun runtime dengan hak DML minimum; jangan jalankan backend dengan akun migrasi.

Panduan hak database, TLS, rate limit, audit, persetujuan, dan checklist deployment yang lebih rinci ada di [SECURITY_OPERATIONS.md](./SECURITY_OPERATIONS.md).

## 9. Backup dan pemulihan

`npm run backup` menjalankan `mysqldump` dan mengenkripsi hasilnya menggunakan AES-256-GCM. Backup ditulis ke `BACKUP_DIR`; akun backup harus khusus dan hanya memiliki hak yang diperlukan untuk dump.

```powershell
cd E:\project-akhir\backend
npm run backup
```

Untuk restore, gunakan database staging baru dan kosong—jangan langsung memilih database produksi:

```powershell
mysql --host=$env:DB_HOST --user=$env:MIGRATION_DB_USER -e "CREATE DATABASE cashless_restore_test"
npm run restore -- "E:\secure-backups\cashless-latest.csbk" cashless_restore_test
```

Skrip memverifikasi tag autentikasi AES-GCM sebelum menjalankan MySQL. SQL hasil dekripsi ditempatkan sementara di direktori temporer dan direktori tersebut dibersihkan setelah proses selesai. Lindungi storage temporer host. Verifikasi jumlah baris, rekonsiliasi ledger dan saldo, serta alur login/MFA di staging. Backup belum tervalidasi sampai restore test berhasil.

## 10. Pengujian dan pemecahan masalah

Jalankan suite backend:

```powershell
cd E:\project-akhir\backend
npm test
```

Tes menggunakan runner bawaan Node.js (`node --test`). Saat ini cakupan test yang ada berfokus pada validasi password, enkripsi secret MFA, dan verifikasi TOTP. File `api_test.rest` berisi contoh request API untuk penggunaan melalui REST client.

| Gejala | Pemeriksaan awal |
|---|---|
| Server berhenti saat startup | Validasi `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, nilai ambang, koneksi database, dan CA database pada produksi |
| Gagal tersambung database | Pastikan database sudah dibuat, host/port dapat dijangkau, kredensial benar, serta user memiliki hak yang sesuai |
| `401` pada request | Periksa token, masa berlaku, role/status akun, atau versi token yang berubah setelah password/role/status diperbarui |
| `403` untuk admin/kasir | Pastikan role tepat, MFA aktif, atau approval finansial yang dibutuhkan sudah valid |
| `409` pada transaksi | Periksa saldo/limit, status resource, konflik key idempotensi, serta kecocokan approval |
| `429` | Rate limit berlaku; jangan melakukan retry agresif |
| Restore gagal autentikasi | Backup rusak/berubah atau `BACKUP_ENCRYPTION_KEY` tidak cocok; jangan alirkan file ke MySQL secara manual |
