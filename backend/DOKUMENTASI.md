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

Dependency utama adalah Express, `mysql2`, `jsonwebtoken`, `bcryptjs`, `dotenv`, `multer` untuk unggahan logo, Baileys dan `qrcode` untuk koneksi WhatsApp berbasis QR, serta PDFKit untuk laporan finansial. Midtrans Snap menggunakan HTTPS API bawaan Node.js tanpa menyimpan Server Key di frontend. Versi dependency terkunci di `package-lock.json`.

Untuk instalasi database kosong, gunakan [`sql/install.sql`](./sql/install.sql) dari direktori `backend`; skrip tersebut memasang semua tabel dan trigger yang dipakai aplikasi melalui `users.sql` dan `admin_api.sql`. Langkah deployment VPS lengkap terdapat di [PANDUAN_DEPLOYMENT_VPS.md](../PANDUAN_DEPLOYMENT_VPS.md).

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

API berjalan di port `3000` secara default. `GET http://localhost:3000/` memberikan status dan beberapa route utama. Body request mutasi harus JSON (`Content-Type: application/json`); ukuran body JSON dibatasi 32 KB. Pengecualian hanya unggahan logo pondok melalui `multipart/form-data`, maksimal 2 MB.

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
| `UPLOAD_DIR` | Direktori persisten untuk logo pondok; default `backend/uploads` |
| `WHATSAPP_AUTH_DIR` | Direktori privat persisten bernama `whatsapp-auth` untuk sesi perangkat Baileys; default `backend/whatsapp-auth` |

Kredensial Midtrans diatur admin pada halaman **Pengaturan pondok** dan disimpan terenkripsi di database menggunakan `MFA_ENCRYPTION_KEY`. Top-up menggunakan Core API QRIS langsung dan menampilkan kode QR untuk dipindai, bukan halaman kanal Snap. Setiap pesanan menyimpan snapshot kredensial terenkripsi dan lingkungan agar pergantian konfigurasi tidak memutus pembayaran yang sedang berjalan. Sandbox Core API aktif secara default; aktivasi Core API Production harus diminta kepada Midtrans. Atur Payment Notification URL di dashboard Midtrans ke `https://<domain-api>/api/midtrans/notification`; endpoint harus dapat dijangkau publik melalui HTTPS. Wali dapat top-up Rp10.000–Rp450.000 per transaksi, dengan QRIS berlaku 15 menit. Saldo hanya bertambah setelah status settlement diverifikasi.

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
| `services/midtrans.js` | Integrasi Snap/QRIS, validasi signature dan status transaksi Midtrans |
| `Controllers/midtransController.js` | Pengaturan admin, API top-up wali, webhook, dan pencocokan saldo |
| `scripts/` | Migrasi skema, provisioning admin, backup, dan restore |
| `sql/` | SQL pendukung API dan tabel akun |
| `test/` | Tes keamanan otomatis berbasis `node:test` |

Route utama yang dipasang adalah `/api/auth`, `/api/settings`, `/api/users`, `/api/admin`, `/api/kantin`, dan `/api/wali`. Semua route role terlindungi memeriksa token dan role di server; pembatasan UI frontend bukan pengganti otorisasi ini.

Profil pondok disimpan per instalasi pada satu baris `institution_settings`. Endpoint publik hanya menampilkan identitas pondok; perubahan profil dan logo memerlukan akun admin. Nilai awal berupa data contoh dan harus diganti sebelum aplikasi digunakan. Nama aplikasi PWA dan logo pada profil digunakan oleh web app manifest. File logo PNG/JPG/WebP maksimal 2 MB disimpan di `UPLOAD_DIR`; direktori tersebut harus persisten dan dapat ditulis oleh proses backend, serta harus disertakan dalam backup deployment. Instalasi PWA menggunakan HTTPS dan origin frontend/API yang sama; `GET /api/settings/manifest.webmanifest` bersifat publik.

Audit log menyimpan username/aktor, endpoint, metode, kode status, serta detail aksi yang dirangkai dari metadata aman untuk transaksi saldo dan operasi umum. Filter admin mendukung aktor, rentang tanggal inklusif, dan metode aksi. Payload request, kata sandi, token, RFID, serta fingerprint tidak dicatat.

Integrasi notifikasi wali menggunakan Baileys: admin menghubungkan perangkat dari Pengaturan pondok dan memindai QR. Kredensial sesi berada di `WHATSAPP_AUTH_DIR`, harus dijaga aksesnya hanya untuk akun layanan backend, persisten setelah deploy/restart, dan tidak boleh masuk Git atau disajikan sebagai file statis. Tombol batalkan menghapus isi folder sesi tetapi mempertahankan foldernya, agar systemd tidak memerlukan izin tulis ke direktori induk. Sesi yang hilang perlu dipasangkan ulang. Wali sendiri harus mengirim pesan verifikasi dari nomor yang akan menerima notifikasi. Notifikasi belanja, top-up, dan penarikan menggunakan antrean `whatsapp_notification_outbox`; kegagalan kirim dicoba ulang dan tidak membatalkan transaksi.

Baileys adalah library tidak resmi untuk protokol WhatsApp Web, bukan layanan WhatsApp resmi. Koneksi dapat terputus dan akun dapat dibatasi; gunakan nomor khusus bot, patuhi ketentuan WhatsApp, dan kirim hanya notifikasi yang disetujui wali. Data sesi adalah kredensial sensitif; perlakukan sebagai rahasia dan jangan salin ke lingkungan lain.

Migrasi skema mengosongkan token Fonnte lama jika masih tersimpan, menyiapkan kolom kredensial Midtrans dan tabel pesanan QRIS, menambahkan nama aplikasi PWA, serta menambahkan pengaturan katalog dan tabel produk, rincian penjualan, serta pergerakan stok. Untuk instalasi produksi, jalankan `npm run migrate` dengan kredensial migrasi sebelum menjalankan versi backend ini.

## 6. Migrasi dan provisioning admin

Untuk membuat atau memperbarui skema secara eksplisit:

```powershell
cd E:\project-akhir\backend
npm run migrate
```

Untuk database kosong yang baru dibuat, jalankan installer SQL terlebih dahulu dari direktori `backend`:

```powershell
mysql -u root -p < sql/install.sql
```

Installer membuat database `db_cashless_santri`, seluruh tabel operasional, indeks, foreign key, dan trigger append-only. Script migrasi Node menggunakan `MIGRATION_DB_USER` dan `MIGRATION_DB_PASSWORD` jika dikonfigurasi, kemudian memastikan/memperbarui skema termasuk menambahkan kolom idempotensi yang belum ada pada ledger kas lama. Pada produksi, jalankan migrasi terpisah sebelum deploy aplikasi. Akun migrasi membutuhkan hak skema dan tidak boleh menjadi kredensial proses API.

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
| `/api/admin` | Dashboard, santri, kantin/kasir, wali, kredensial, transaksi dan laporan finansial tanpa rincian produk, approval (daftar, detail, keputusan, riwayat), audit |
| `/api/kantin` | Kantin yang ditugaskan, lookup santri, katalog/stok yang dikelola kasir, mode nominal atau POS per transaksi, penjualan, dan riwayat kasir |
| `/api/wali` | Profil wali, anak terhubung, riwayat, dan limit harian |

Sertakan access token pada header autentikasi HTTP dengan skema Bearer. Login admin dan kasir memerlukan MFA TOTP; challenge MFA berlaku 5 menit, sedangkan access token berlaku 1 jam. Token yang kedaluwarsa atau dicabut mengharuskan login kembali. Login dan MFA memiliki rate limit; API juga membatasi request umum.

Transaksi finansial wajib memakai header `Idempotency-Key` sesuai ketentuan endpoint. Retry yang belum diketahui hasilnya harus memakai key dan payload yang sama. Key sama dengan payload berbeda menghasilkan konflik, bukan transaksi kedua.

Setiap pencairan saldo kantin memerlukan konfirmasi kasir aktif yang ditugaskan, dari sesi kasir yang login dengan MFA. Konfirmasi terikat ke admin peminta, kantin, nominal, dan keterangan, berlaku 24 jam, serta hanya dapat digunakan sekali. Pencairan di atas ambang tetap memerlukan persetujuan admin kedua. Lihat alur endpoint di dokumentasi API.

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
