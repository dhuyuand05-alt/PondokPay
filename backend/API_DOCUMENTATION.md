# Dokumentasi API Pondok

Dokumen ini merangkum endpoint yang saat ini tersedia di backend untuk membantu perencanaan UI. Contoh respons menunjukkan bentuk JSON yang dikembalikan API; nilai dan waktu di dalamnya hanya contoh.

## Dasar penggunaan

- Base URL lokal: `http://localhost:3000`
- Semua path di bawah menggunakan prefix `/api`.
- `GET /` adalah endpoint status tanpa autentikasi; respons berisi `message` dan objek `endpoints` dengan beberapa route utama.
- Request dengan body harus mengirim `Content-Type: application/json`, kecuali unggahan logo yang memakai `multipart/form-data`.
- Kecuali endpoint login dan MFA setup/verify, endpoint terlindungi memerlukan `Authorization: Bearer <access_token>`.
- Endpoint admin hanya untuk role `admin`; kasir hanya dapat mengakses kantin yang ditugaskan kepadanya; wali hanya dapat mengakses santri yang terhubung dengan akun tersebut.
- Role yang tersedia: `santri`, `kasir`, `wali`, `admin`. API yang terdokumentasi di sini tidak menyediakan endpoint khusus UI santri; autentikasi santri tetap tersedia.
- Nominal uang memakai mata uang yang dikonfigurasi lembaga. Database menyimpan nominal dua angka desimal; nilai `DECIMAL` umumnya diterima/dikirim sebagai string seperti `"50000.00"`. Kirim nominal sebagai angka atau string desimal dengan maksimal dua angka desimal.
- Password baru minimal 12 byte dan maksimal 72 byte. Password disimpan dalam bentuk hash, tidak pernah dikembalikan oleh API.
- Access token berlaku 1 jam; challenge MFA berlaku 5 menit. Tidak ada endpoint logout khusus; perubahan password, role, atau status akun mencabut sesi aktif.
- Endpoint daftar yang mendukung pagination menggunakan `?page=1&limit=20`. Nilai default `page=1`, `limit=20`; limit maksimum 100.
- JSON error umum berbentuk `{"message":"..."}`. Error autentikasi/validasi tertentu juga mengembalikan `approval_required` atau `cashier_approval_required`.

## Profil pondok

Setiap instalasi menyimpan satu profil pondok. Endpoint publik hanya membaca data identitas untuk kebutuhan branding; perubahan memerlukan access token admin dan diaudit.

| Method | Path | Akses | Kegunaan |
|---|---|---|---|
| GET | `/api/settings` | Publik | Membaca nama, nama aplikasi PWA, logo, dan zona waktu untuk branding |
| GET | `/api/settings/manifest.webmanifest` | Publik | Membaca web app manifest dengan nama dan ikon yang dikonfigurasi admin |
| GET | `/api/admin/settings` | Admin | Membaca seluruh detail profil |
| PUT / PATCH | `/api/admin/settings` | Admin | Memperbarui profil pondok dengan JSON |
| POST | `/api/admin/settings/logo` | Admin | Mengunggah logo multipart dengan field `logo`; PNG/JPG/WebP, maksimal 2 MB |
| DELETE | `/api/admin/settings/logo` | Admin | Menghapus logo yang terpasang |
| GET | `/api/uploads/:filename` | Publik | Menampilkan logo |

Contoh body untuk menyimpan profil:

```json
{
  "name": "Pondok Contoh",
  "app_name": "PondokPay Al-Hikmah",
  "address": "Jl. Pendidikan No. 10, Bandung",
  "phone": "+62 812-0000-0000",
  "email": "info@pondokcontoh.id",
  "manager_name": "Nama Pengelola",
  "timezone": "Asia/Jakarta"
}
```

Field `name` wajib diisi; `app_name` opsional (maksimal 80 karakter) dan jika kosong nama aplikasi mengikuti nama pondok. `timezone` harus merupakan zona waktu IANA yang valid (misalnya `Asia/Jakarta`, `Asia/Makassar`, atau `Asia/Jayapura`). Alamat, kontak, email, dan penanggung jawab boleh kosong. Logo disimpan di direktori `UPLOAD_DIR` backend; pastikan direktori tersebut persisten pada deployment.

## Autentikasi, sesi, dan MFA

| Method | Path | Akses | Request |
|---|---|---|---|
| POST | `/api/auth/login` | Publik | `{ "username": "nama", "password": "..." }` |
| POST | `/api/auth/mfa/setup` | Bearer challenge `mfa_enroll` | Tidak perlu body |
| POST | `/api/auth/mfa/verify` | Bearer challenge `mfa_enroll` atau `mfa_challenge` | `{ "code": "123456" }` |
| GET | `/api/auth/me` | Access token | — |

Login untuk role `wali` dan `santri` mengembalikan access token langsung:

```json
{
  "message": "Login berhasil.",
  "token": "<access_token>",
  "user": { "id": 8, "username": "orang_tua", "role": "wali" }
}
```

Admin dan kasir wajib menyelesaikan MFA. Login mereka mengembalikan challenge token, bukan access token:

```json
{
  "message": "Aktivasi MFA diperlukan sebelum menggunakan akun.",
  "mfa_required": true,
  "mfa_enrollment_required": true,
  "challenge_token": "<challenge_token>"
}
```

Jika MFA sudah terdaftar, `mfa_enrollment_required` bernilai `false` dan pengguna harus memasukkan kode MFA. Challenge token berlaku 5 menit. Untuk pendaftaran pertama, kirim challenge token sebagai Bearer ke `/api/auth/mfa/setup`; respons berisi secret dan URI untuk aplikasi authenticator:

```json
{
  "message": "Tambahkan secret ini ke aplikasi authenticator, lalu verifikasi kode 6 digit.",
  "secret": "<secret>",
  "provisioning_uri": "otpauth://totp/..."
}
```

Setelah memasukkan kode enam digit ke `/api/auth/mfa/verify`, respons sukses aktivasi maupun login MFA:

```json
{
  "message": "MFA berhasil diaktifkan.",
  "token": "<access_token>",
  "user": { "id": 2, "username": "admin", "role": "admin" }
}
```

`GET /api/auth/me` mengembalikan:

```json
{
  "user": {
    "id": 2,
    "username": "admin",
    "role": "admin",
    "created_at": "2026-01-01T00:00:00.000Z"
  }
}
```

Error umum auth: `400` data login/kode tidak lengkap atau tidak valid; `401` kredensial, challenge, atau access token tidak valid/kadaluarsa; `403` role tidak berwenang atau MFA belum aktif; `409` status enrollment atau kode MFA sudah digunakan; `429` terlalu banyak percobaan.

## Manajemen akun oleh admin

Semua endpoint `/api/users` membutuhkan access token admin.

| Method | Path | Kegunaan |
|---|---|---|
| GET | `/api/users` | Daftar akun |
| GET | `/api/users/:id` | Detail akun |
| POST | `/api/users` | Buat akun |
| PUT / PATCH | `/api/users/:id` | Ubah akun |
| DELETE | `/api/users/:id` | Nonaktifkan akun (bukan menghapus permanen) |

Buat akun:

```json
{ "username": "kasir_1", "password": "password-kuat", "role": "kasir" }
```

Respons daftar memakai properti `users`; detail memakai `user`. Objek akun tidak pernah memuat password:

```json
{
  "id": 12,
  "username": "kasir_1",
  "role": "kasir",
  "is_active": 1,
  "mfa_enabled": 0,
  "created_at": "2026-01-01T00:00:00.000Z"
}
```

Contoh respons pembuatan:

```json
{
  "message": "User berhasil dibuat.",
  "user": {
    "id": 12,
    "username": "kasir_1",
    "role": "kasir",
    "is_active": 1,
    "mfa_enabled": 0,
    "created_at": "2026-01-01T00:00:00.000Z"
  }
}
```

PUT/PATCH menerima satu atau beberapa properti `username`, `password`, `role`, `is_active`. Role valid: `santri`, `kasir`, `wali`, `admin`. Password minimal 12 byte dan maksimal 72 byte. Perubahan password, role, atau status mencabut sesi aktif. Akun yang diaktifkan ulang wajib disertai password baru dan perlu enrollment MFA ulang bila berperan sebagai admin/kasir. Admin tidak dapat menonaktifkan dirinya sendiri atau admin aktif terakhir.

## API admin

Semua endpoint `/api/admin` memerlukan access token admin. Endpoint mutasi diaudit sebelum diproses.

### Integrasi WhatsApp wali (Baileys)

Admin menghubungkan perangkat WhatsApp dari halaman Pengaturan pondok dengan QR. Status dan QR hanya dapat diakses admin; kredensial perangkat disimpan pada direktori privat persisten `WHATSAPP_AUTH_DIR`. Tidak ada token Fonnte atau webhook eksternal.

| Method | Path | Akses | Kegunaan |
|---|---|---|---|
| GET | `/api/admin/settings/whatsapp/status` | Admin | Melihat status koneksi dan QR sementara untuk pairing |
| POST | `/api/admin/settings/whatsapp/connect` | Admin | Memulai koneksi/pairing Baileys |
| DELETE | `/api/admin/settings/whatsapp/disconnect` | Admin | Keluar dari perangkat tertaut dan menghapus sesi lokal |
| GET | `/api/wali/notifikasi/whatsapp` | Wali | Melihat nomor dan status verifikasi |
| POST | `/api/wali/notifikasi/whatsapp/verifikasi` | Wali | Memulai opt-in dengan `{ "phone": "081234567890" }` |
| DELETE | `/api/wali/notifikasi/whatsapp` | Wali | Menonaktifkan notifikasi dan menghapus nomor tersimpan |

Permintaan verifikasi mengembalikan tautan `wa.me` dengan pesan kode acak sekali pakai, berlaku 10 menit. Wali harus membuka tautan dan secara manual menekan kirim dari nomor yang hendak diverifikasi; sistem tidak memulai chat atau mengirim pesan promosi. Bot hanya menerima kode valid untuk nomor yang sama, sekali pakai. Setelah terverifikasi, wali menerima notifikasi WhatsApp untuk transaksi belanja, top-up, dan penarikan anak yang terhubung.

Notifikasi transaksi dimasukkan ke antrean database dalam transaksi saldo yang sama. Worker mengirimnya terpisah dari request kasir/admin, lalu mencoba ulang kegagalan sementara sampai lima kali. Kegagalan layanan WhatsApp tidak membatalkan transaksi saldo. Jika koneksi terputus setelah pesan terkirim tetapi sebelum aplikasi menerima konfirmasi, pengiriman ulang mungkin menghasilkan duplikat.

Verifikasi berbasis pesan masuk merupakan langkah persetujuan dan mengurangi pesan yang tidak diminta, tetapi tidak menjamin akun/perangkat bebas pembatasan WhatsApp. Baileys adalah integrasi WhatsApp Web tidak resmi dan tidak didukung WhatsApp; gunakan nomor khusus bot, patuhi ketentuan WhatsApp, kirim hanya notifikasi yang disetujui, dan nonaktifkan nomor bila wali meminta berhenti.

### Top-up digital QRIS (Midtrans)

| Method | Path | Akses | Kegunaan |
|---|---|---|---|
| GET | `/api/admin/settings/midtrans` | Admin | Melihat Merchant ID, Client Key, lingkungan, dan status konfigurasi tanpa membuka Server Key |
| PUT | `/api/admin/settings/midtrans` | Admin | Menyimpan `merchant_id`, `client_key`, `server_key`, dan `environment` (`sandbox` atau `production`) |
| GET | `/api/wali/topup/config` | Wali | Membaca status pembayaran, Client Key publik, serta batas nominal dan masa berlaku |
| POST | `/api/wali/topup` | Wali | Membuat transaksi QRIS melalui Midtrans Core API |
| GET | `/api/wali/topup/history` | Wali | Melihat hingga 20 pembayaran terbaru milik akun tersebut |
| GET | `/api/wali/topup/:orderId` | Wali pemilik transaksi | Melihat status dan memeriksa ulang pembayaran |
| POST | `/api/midtrans/notification` | Midtrans, endpoint publik | Memverifikasi notifikasi dan memperbarui ledger secara idempoten |

Permintaan wali mengirim header `Idempotency-Key` unik (8–64 karakter) dan body `{ "santri_id": 12, "amount": 50000 }`. Nilai top-up harus bilangan Rupiah bulat Rp10.000–Rp450.000 dan santri harus terhubung dengan akun wali. `POST` membuat pembayaran dengan `payment_type: "qris"` melalui Core API `/v2/charge` dan mengembalikan `qr_data_url` untuk ditampilkan sebagai gambar, `qr_string` sebagai payload QRIS mentah, serta `qr_code_url` dari action Midtrans `generate-qr-code`. Untuk simulator Midtrans yang meminta **QR Code Image Url**, tempel nilai `qr_code_url`—bukan `qr_string` maupun data URL gambar. Wali dapat memindai kode yang ditampilkan dengan aplikasi pembayaran yang mendukung QRIS. Masa berlaku transaksi QRIS disetel 15 menit. Biaya pemrosesan QRIS ditanggung pondok. Setelah status settlement terverifikasi, saldo dan transaksi ledger dicatat atomik satu kali; aturan biaya layanan bulanan yang sudah ada tetap berlaku.

Sandbox Core API aktif secara default menurut dokumentasi Midtrans. Aktivasi Core API pada Production perlu diminta ke Midtrans, dan metode QRIS harus diaktifkan pada akun merchant terkait. Kredensial yang sama tetap harus dipakai pada seluruh top-up.

Set Server Key dienkripsi dengan `MFA_ENCRYPTION_KEY` sebelum disimpan. API tidak pernah mengembalikan Server Key. Validasi format menerima prefix key Midtrans baru (`Mid-client-` dan `Mid-server-`) maupun prefix Sandbox lama (`SB-Mid-client-` dan `SB-Mid-server-`); pilihan Sandbox/Production tetap menentukan host API yang digunakan. Kredensial terenkripsi dan lingkungan yang dipakai disimpan sebagai snapshot tiap order agar penggantian konfigurasi admin tidak memutus pembayaran yang sedang berjalan. Server memverifikasi `signature_key` SHA-512 dan mengambil status terbaru langsung dari API Midtrans sebelum perubahan saldo. Status pending, paid, expired, dan failed tersedia bagi wali. Setiap order hanya bisa mengkredit satu kali.

Daftarkan `https://<domain-api>/api/midtrans/notification` sebagai Payment Notification URL di dashboard Midtrans untuk lingkungan yang dipilih. Endpoint webhook harus dapat dijangkau dari internet publik; jangan gunakan `localhost` pada pembayaran sandbox tanpa tunnel publik. Sandbox dan production menggunakan Merchant ID, Client Key, Server Key, serta URL dashboard yang berbeda. Untuk instalasi produksi, jalankan migrasi database sebelum deploy API yang menggunakan tabel pembayaran baru.

### Dashboard, audit, dan persetujuan finansial

| Method | Path | Request/query |
|---|---|---|
| GET | `/api/admin/dashboard` | — |
| GET | `/api/admin/audit-logs?page=1&limit=50&actor_user_id=12&from=2026-10-01&to=2026-10-31&method=POST` | `page`, `limit`, `actor_user_id`, `from`, `to`, `method` |
| GET | `/api/admin/financial-approvals?scope=inbox&page=1&limit=20` | Daftar permintaan; `scope`: `inbox`, `mine`, `history`, `all`; `status` opsional |
| GET | `/api/admin/financial-approvals/:id` | Detail permintaan |
| POST | `/api/admin/financial-approvals` | Buat permintaan approval |
| POST | `/api/admin/financial-approvals/:id/approve` | Admin kedua menyetujui |
| POST | `/api/admin/financial-approvals/:id/reject` | Admin kedua menolak |

Audit log menampilkan username dan role aktor, deskripsi aktivitas, endpoint, waktu, IP sumber, dan status HTTP. Filter tanggal bersifat inklusif untuk tanggal awal dan akhir. Deskripsi aksi menggunakan metadata terbatas; payload request, password, token, RFID, dan fingerprint tidak dicatat.

Dashboard:

```json
{
  "summary": {
    "total_santri": 120,
    "total_wali": 90,
    "total_kasir": 8,
    "total_kantin": 4,
    "total_saldo_kantin": "1250000.00",
    "total_saldo": "45000000.00",
    "total_transaksi": 1820,
    "belanja_hari_ini": "320000.00",
    "topup_hari_ini": "500000.00",
    "tarik_hari_ini": "20000.00"
  },
  "recent_transactions": [
    {
      "id": 55,
      "santri_id": 10,
      "kantin_id": 4,
      "nama_kantin": "Kantin Putra",
      "nis": "S-0010",
      "nama_lengkap": "Nama Santri",
      "tipe_transaksi": "belanja",
      "jumlah": "12000.00",
      "saldo_akhir": "88000.00",
      "keterangan": "Makan siang",
      "created_at": "2026-01-01T08:00:00.000Z"
    }
  ]
}
```

Audit log dan endpoint daftar transaksi lain memakai pola:

```json
{
  "data": [{ "id": 4, "request_id": "...", "actor_user_id": 2, "action": "LOGIN_OK", "resource": "/api/auth/login", "source_ip": "...", "user_agent": "...", "status_code": 200, "created_at": "..." }],
  "pagination": { "page": 1, "limit": 50, "total": 1 }
}
```

Untuk riwayat transaksi, elemen `data` mengikuti kolom yang dijelaskan pada bagian Transaksi.

Permintaan approval hanya untuk `santri_topup`, `santri_withdrawal`, atau `canteen_withdrawal`, dengan nominal di atas atau sama dengan ambang yang dikonfigurasi:

```json
{
  "action": "santri_topup",
  "resource_id": 10,
  "jumlah": 600000,
  "keterangan": "Top up bernilai besar"
}
```

Respons pembuatan:

```json
{
  "message": "Permintaan tercatat dan menunggu persetujuan admin lain.",
  "data": {
    "id": 21,
    "action": "santri_topup",
    "resource_id": 10,
    "jumlah": "600000.00",
    "status": "pending"
  }
}
```

Admin peminta tidak dapat menyetujui/menolak permintaannya sendiri. Approval berlaku 24 jam, harus cocok dengan aksi, target, jumlah, dan keterangan transaksi, serta hanya dapat digunakan sekali. Keputusan mengembalikan `{"message":"Permintaan disetujui.","data":{"id":21,"status":"approved"}}` atau status `rejected`.

Daftar approval mengembalikan `{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 1 } }`. `scope=inbox` hanya menampilkan permintaan berstatus menunggu yang belum kedaluwarsa dan dibuat admin lain; `scope=mine` menampilkan permintaan yang diajukan admin saat ini; `scope=history` menampilkan keputusan/approval yang telah digunakan serta permintaan kedaluwarsa; `scope=all` menampilkan seluruhnya. Default scope adalah `all`, default page `1`, default limit `20`, maksimum limit `100`. Filter `status` opsional menerima `pending`, `approved`, `rejected`, `consumed`, atau `expired`.

Setiap entri daftar dan detail berisi `id`, `action`, `resource_id`, `amount`, `keterangan`, `status`, `requester_id`, `requester_username`, `approver_id`, `approver_username`, `resource_name`, `resource_detail`, `created_at`, `expires_at`, `decided_at`, `consumed_at`, dan `can_decide`. `status` untuk permintaan pending yang melewati `expires_at` disajikan sebagai `expired`, walaupun record sumber tetap pending untuk menjaga aturan transisi audit database. `can_decide` bernilai true hanya jika permintaan dibuat admin lain, masih menunggu, dan belum kedaluwarsa menurut waktu database. Detail dibungkus `{ "data": { ... } }`; ID yang tidak valid menghasilkan `400`, record yang tidak ada `404`.

### Santri

| Method | Path | Kegunaan/input utama |
|---|---|---|
| GET | `/api/admin/santri?page=1&limit=20&search=...` | Daftar/cari berdasarkan NIS, nama, asrama, username |
| GET | `/api/admin/santri/export` | Ekspor semua NIS, nama, asrama, dan limit harian |
| POST | `/api/admin/santri/import` | Impor 1–25 profil santri tanpa akun login |
| POST | `/api/admin/santri` | Buat santri dan akun login |
| GET | `/api/admin/santri/:id` | Detail |
| PUT / PATCH | `/api/admin/santri/:id` | Ubah sebagian/seluruh properti |
| DELETE | `/api/admin/santri/:id` | Nonaktifkan santri dan akun |
| POST | `/api/admin/santri/:id/topup` | Top up saldo |
| POST | `/api/admin/santri/:id/tarik` | Penarikan saldo |
| POST | `/api/admin/santri/:id/kartu` | Daftarkan RFID |
| POST | `/api/admin/santri/:id/sidik-jari` | Daftarkan ID fingerprint |

Buat santri memerlukan `username`, `password`, `nis`, `nama_lengkap`; `asrama` opsional dan `limit_harian` default `50000`.

Impor menerima `{ "rows": [{ "row_number": 2, "nis": "S-0011", "nama_lengkap": "Nama Santri", "asrama": "Asrama A", "limit_harian": "50000" }] }`. Kolom `row_number` hanya untuk pelaporan; `asrama` dan `limit_harian` opsional, dengan limit kosong memakai `50000`. Setiap permintaan menerima maksimal 25 baris dan membalas hasil `imported`, `skipped` (NIS duplikat), dan `invalid`. Impor hanya membuat profil baru tanpa akun pengguna dan tidak mengubah saldo, limit akun lama, atau transaksi. Ekspor hanya menyertakan data identitas yang menjadi kolom impor.

```json
{
  "data": {
    "id": 10,
    "user_id": 30,
    "username": "santri_10",
    "nis": "S-0010",
    "nama_lengkap": "Nama Santri",
    "asrama": "Asrama A",
    "saldo": "0.00",
    "limit_harian": "50000.00",
    "is_active": 1
  },
  "message": "Data santri berhasil dibuat."
}
```

Objek santri untuk list/detail memiliki `id`, `user_id`, `username`, `nis`, `nama_lengkap`, `asrama`, `saldo`, `limit_harian`, `is_active`. List menggunakan envelope `data` dan `pagination`.

PUT/PATCH menerima properti opsional `username`, `password`, `nis`, `nama_lengkap`, `asrama`, `limit_harian`. Hapus santri bersifat nonaktifkan; saldo dan transaksi tetap tersimpan. Respons: `{"message":"Akun santri dinonaktifkan; saldo dan seluruh riwayat tetap disimpan."}`.

Top up dan tarik memerlukan header `Idempotency-Key` (8–64 karakter) serta body `{ "jumlah": 25000, "keterangan": "..." }`; `approval_id` ditambahkan bila nominal memerlukan approval.

```json
{
  "message": "Top-up berhasil.",
  "data": {
    "id": 90,
    "santri_id": 10,
    "tipe_transaksi": "topup",
    "jumlah": "25000.00",
    "saldo_akhir": "75000.00",
    "keterangan": "Top up",
    "duplicate": false
  }
}
```

Untuk penarikan, `tipe_transaksi` bernilai `tarik`. Transaksi baru mengembalikan HTTP `201`; retry dengan key dan payload sama mengembalikan HTTP `200` dan `duplicate: true`. Key sama dengan payload berbeda menghasilkan `409`. Saldo tidak cukup menghasilkan `409`; transaksi besar tanpa approval valid menghasilkan `403` dan `approval_required: true`.

Daftarkan kartu dengan `{ "rfid_uid": "RFID-UID-UNIK" }`; sidik jari dengan `{ "fingerprint_id": 12345 }`. Respons pendaftaran:

```json
{
  "message": "Kartu berhasil didaftarkan.",
  "data": { "id": 3, "santri_id": 10, "rfid_uid": "RFID-UID-UNIK", "status": "active" }
}
```

Fingerprint response memakai `fingerprint_id` alih-alih `rfid_uid`. Nilai ini hanya identifier; API tidak menyimpan template atau citra biometrik.

### Kas admin dan biaya layanan

| Method | Path | Kegunaan/input utama |
|---|---|---|
| GET | `/api/admin/cash?page=1&limit=20` | Ringkasan kas, tarif aktif/terjadwal, utang biaya bulan berjalan, dan riwayat |
| POST | `/api/admin/cash/service-fee` | Atur tarif seragam per santri; berlaku tanggal 1 bulan berikutnya |
| POST | `/api/admin/cash/income` | Catat pemasukan luar biaya layanan dengan `category` (sumber), `amount`, `description`, dan `Idempotency-Key` |
| POST | `/api/admin/cash/expenses` | Catat pengeluaran dengan `category`, `amount`, `description` dan `Idempotency-Key`; ditolak dengan `409` jika saldo tidak mencukupi |
| POST | `/api/admin/cash/entries/:id/reverse` | Buat pembalik penuh untuk catatan yang keliru; wajib `reason` dan `Idempotency-Key` |

Pengaturan tarif menerima `{ "amount": 5000 }`; nilai `0` menonaktifkan tagihan mulai periode berikutnya. Job bulanan pada tanggal 1 pukul 00:15 WIB menagih santri aktif. Jika saldo mencukupi, sistem membuat transaksi `biaya_layanan` dan pemasukan kas secara atomik; jika tidak, tagihan berstatus belum tertagih. Top-up pada bulan yang sama akan melunasi tagihan hanya jika saldo setelah top-up mencukupi seluruh tunggakan bulan berjalan. Tunggakan yang belum lunas hangus ketika periode bulan berikutnya diproses. Pengulangan job aman/idempoten.

Pemasukan kas biaya layanan hanya dicatat ketika biaya benar-benar tertagih, bukan saat tagihan dibuat. Pemasukan lain yang benar-benar diterima dapat dicatat melalui `/cash/income` dengan sumber dan keterangan yang jelas. Pengeluaran manual dan koreksi yang mengurangi saldo ditolak bila saldo kas tidak mencukupi; pemeriksaan saldo diserialisasi agar pengeluaran serentak tidak dapat membuat saldo negatif. Pengeluaran, pemasukan manual, dan biaya tertagih disimpan append-only; koreksi membuat catatan pembalik senilai penuh dan catatan asli tetap terlihat. Saldo kas adalah pemasukan dikurangi pengeluaran dan koreksi.

### Kantin dan penugasan kasir

Dokumentasi khusus API kantin yang dilengkapi contoh request/response JSON dan alur UI tersedia di [API_KANTIN.md](./API_KANTIN.md).

| Method | Path | Kegunaan |
|---|---|---|
| GET | `/api/admin/kantin` | Daftar kantin |
| POST | `/api/admin/kantin` | Buat kantin |
| GET | `/api/admin/kantin/:id` | Detail kantin |
| PUT / PATCH | `/api/admin/kantin/:id` | Ubah `nama`, `lokasi`, `status` |
| DELETE | `/api/admin/kantin/:id` | Nonaktifkan kantin |
| GET | `/api/admin/kantin/:id/kasir` | Daftar kasir yang ditugaskan |
| POST | `/api/admin/kantin/:id/kasir` | Tugaskan kasir: `{ "user_id": 12 }` |
| DELETE | `/api/admin/kantin/:id/kasir/:userId` | Cabut penugasan kasir |
| POST | `/api/admin/kantin/:id/penjualan` | Catat penjualan untuk santri |
| GET | `/api/admin/kantin/:id/pencairan/persetujuan-kasir` | Status konfirmasi kasir untuk permintaan admin |
| POST | `/api/admin/kantin/:id/pencairan/persetujuan-kasir` | Minta konfirmasi kasir: `{ "jumlah": 10000, "keterangan": "..." }` |
| POST | `/api/admin/kantin/:id/pencairan` | Cairkan saldo kantin |
| GET | `/api/admin/kantin/:id/transaksi` | Riwayat penjualan/pencairan |

Objek kantin pada API admin: `id`, `nama`, `lokasi`, `status` (`active`/`inactive`), `saldo`, `created_at`. Pengelolaan katalog dan stok tidak tersedia untuk admin. Admin tetap dapat mencatat penjualan nominal manual; ringkasan transaksi admin tidak menyertakan rincian produk.

Kasir terdaftar dalam daftar dengan `{ "id": 12, "username": "kasir_1", "created_at": "..." }`. Penugasan berhasil merespons `{ "message": "...", "data": { "kantin_id": 4, "user_id": 12 } }`.

Penjualan admin memakai body `{ "santri_id": 10, "jumlah": 12000, "keterangan": "Belanja" }` dan hanya mencatat nominal. Header `Idempotency-Key` wajib. Admin tidak menerima atau melihat rincian produk. Kasir yang ditugaskan dapat memilih mode pencatatan nominal atau POS katalog di halaman transaksi bila katalog kantin diaktifkan. Untuk mode POS, kasir mengambil produk melalui `GET /api/kantin/:id/produk` dan mengirim `{ "santri_id": 10, "items": [{ "product_id": 2, "quantity": 2 }], "jumlah": 12000, "keterangan": "Pembelian katalog" }`; server menghitung total dari harga terkini, membandingkan jumlah tampilan, mengunci dan memeriksa stok, lalu menyimpan rincian item serta mutasi stok bersama debit saldo dalam satu transaksi database. Jika harga berubah atau stok tidak cukup, transaksi ditolak dengan `409` tanpa debit saldo maupun perubahan stok. Rincian hanya tersedia di area kasir; laporan dan riwayat admin tetap merangkum nominal transaksi.

Setiap pencairan wajib diajukan oleh admin melalui endpoint persetujuan kasir. Kasir aktif yang ditugaskan mengonfirmasi dari sesi kasirnya sendiri; login kasir mewajibkan MFA. Setelah status konfirmasi `approved`, admin peminta menjalankan pencairan dengan `{ "jumlah": 10000, "keterangan": "Pencairan hasil penjualan", "cashier_approval_id": 21 }`. Jumlah dan keterangan harus sama persis dengan permintaan. Pencairan di atas ambang juga tetap memerlukan `approval_id` persetujuan admin kedua. Keduanya memerlukan `Idempotency-Key`.

```json
{
  "message": "Transaksi belanja berhasil.",
  "data": {
    "santri": { "id": 10, "saldo": "88000.00" },
    "kantin": { "id": 4, "saldo": "12000.00" },
    "transaksi_id": 55
  }
}
```

Permintaan konfirmasi kasir berlaku 24 jam dan hanya dapat diputuskan sekali oleh kasir aktif yang ditugaskan. Kasir hanya dapat melihat permintaan untuk kantin yang menjadi tugasnya. Persetujuan diikat ke admin peminta, kantin, jumlah, dan keterangan; persetujuan terpakai atau kedaluwarsa tidak dapat digunakan lagi. Penjualan ditolak dengan `409` bila saldo santri tidak cukup, limit harian terlampaui, kantin tidak aktif, atau key dipakai untuk payload lain. Pencairan mengembalikan `id`, `kantin_id`, `tipe_transaksi: "pencairan"`, `jumlah`, `saldo_akhir`, `keterangan`; konfirmasi kasir wajib dan saldo kantin tidak cukup menghasilkan `409`. Transaksi baru `201`, retry identik `200` dengan `duplicate: true`.

### Transaksi

| Method | Path | Query |
|---|---|---|
| GET | `/api/admin/transaksi?page=1&limit=20` | `santri_id`, `tipe_transaksi` opsional |
| GET | `/api/admin/kantin/:id/transaksi?page=1&limit=20` | `tipe_transaksi=penjualan` atau `pencairan` |
| GET | `/api/admin/reports/financial` | `start_date`, `end_date` wajib; `santri_id`, `kantin_id` opsional |
| GET | `/api/admin/reports/financial/export.csv` | Filter periode dan santri/kantin yang sama; unduhan CSV UTF-8 |
| GET | `/api/admin/reports/financial/export.pdf` | Filter periode dan santri/kantin yang sama; unduhan PDF |

`GET /api/admin/transaksi` menerima tipe `belanja`, `topup`, `tarik`, atau `biaya_layanan`. Entri transaksi admin berisi `id`, `santri_id`, `kantin_id`, `nama_kantin`, `nis`, `nama_lengkap`, `tipe_transaksi`, `jumlah`, `saldo_akhir`, `keterangan`, `created_at`.

Riwayat admin kantin mengembalikan `{ "data": [...], "pagination": {...} }`; entri memuat `id`, `kantin_id`, `transaksi_id`, `tipe_transaksi`, `jumlah`, `saldo_akhir`, `keterangan`, `created_at`, `santri_id`, `nis`, dan `nama_lengkap`, tanpa rincian produk. Untuk transaksi pencairan, kolom terkait santri dapat bernilai `null`. Riwayat kasir dapat menyertakan array `items` dengan snapshot nama/harga, kuantitas, dan subtotal produk.

Laporan finansial menerima tanggal `YYYY-MM-DD` dengan rentang inklusif maksimal 366 hari. Respons JSON membungkus `period`, filter aktif, `summary`, rekap `students`, rekap belanja `canteens`, serta tren `spending_trend` harian (termasuk hari tanpa transaksi dengan total nol). Filter `santri_id` dan `kantin_id` dapat dipakai sendiri atau bersama-sama. CSV berisi seluruh bagian laporan dan menggunakan BOM UTF-8; PDF memuat ringkasan serta tabel yang dapat berlanjut ke halaman berikutnya. Endpoint ekspor mengirim file unduhan dengan nama yang mencakup tanggal laporan.

### Data wali-santri dan akun orang tua

Endpoint data relasi wali lama:

| Method | Path | Kegunaan/input |
|---|---|---|
| GET | `/api/admin/wali` | Semua relasi |
| POST | `/api/admin/wali` | Buat akun wali dan relasi satu santri |
| GET | `/api/admin/wali/:id` | Detail relasi |
| PUT / PATCH | `/api/admin/wali/:id` | Ubah relasi |
| DELETE | `/api/admin/wali/:id` | Hapus relasi; akun ikut nonaktif bila tak punya relasi lain |

POST menerima `username`, `password`, `santri_id`, dan opsional `no_whatsapp`. PUT/PATCH dapat menerima `santri_id`, `no_whatsapp`; perubahan username harus bersama password. Objek relasi berisi `id`, `user_id`, `username`, `santri_id`, `nis`, `nama_lengkap`, `no_whatsapp`.

Untuk akun orang tua dengan beberapa anak:

| Method | Path | Kegunaan/input |
|---|---|---|
| GET | `/api/admin/wali-akun` | Daftar akun beserta array anak |
| POST | `/api/admin/wali-akun` | Buat akun dan hubungan anak |
| GET | `/api/admin/wali-akun/:id` | Detail akun beserta anak |
| PUT / PATCH | `/api/admin/wali-akun/:id` | Ubah `username`, `password`, `no_whatsapp` |
| DELETE | `/api/admin/wali-akun/:id` | Nonaktifkan akun |
| POST | `/api/admin/wali-akun/:id/anak` | Hubungkan anak |
| DELETE | `/api/admin/wali-akun/:id/anak/:santriId` | Lepaskan hubungan anak |

Pembuatan menerima `{ "username": "...", "password": "...", "santri_ids": [10, 11], "no_whatsapp": "..." }`. `santri_ids` wajib berisi minimal satu ID unik. Respons list/detail akun menggunakan:

```json
{
  "data": {
    "id": 20,
    "username": "orang_tua",
    "created_at": "...",
    "children": [
      {
        "relasi_id": 30,
        "santri_id": 10,
        "nis": "S-0010",
        "nama_lengkap": "Nama Santri",
        "no_whatsapp": "081234567890"
      }
    ]
  }
}
```

Pada daftar, `data` berupa array objek akun dengan struktur akun/`children` yang sama. Respons create berisi `data: { id, username, santri_ids }`. Hubungkan anak menerima `{ "santri_id": 11, "no_whatsapp": "..." }` dan menghasilkan `data: { id, user_id, santri_id, no_whatsapp }`.

### Kredensial RFID/fingerprint

| Method | Path | Kegunaan |
|---|---|---|
| GET | `/api/admin/credentials` | Daftar semua kredensial |
| POST | `/api/admin/credentials` | Buat satu record; satu atau dua identifier |
| GET | `/api/admin/credentials/:id` | Detail |
| PUT / PATCH | `/api/admin/credentials/:id` | Ubah `santri_id`, `rfid_uid`, `fingerprint_id`, `status` |
| DELETE | `/api/admin/credentials/:id` | Blokir credential, tidak menghapus |

Body create: `{ "santri_id": 10, "rfid_uid": "RFID-001", "fingerprint_id": 12345, "status": "active" }`; setidaknya satu identifier harus ada. Status `active` atau `blocked`. Objek berisi `id`, `santri_id`, `rfid_uid`, `fingerprint_id`, `status`; list/detail juga dapat menyertakan `nis` dan `nama_lengkap`. DELETE merespons `{"message":"Kredensial diblokir; data dipertahankan untuk audit."}`.

## API kasir

Semua endpoint `/api/kantin` memerlukan token role `kasir` dengan MFA aktif. Akses detail, lookup, penjualan, dan riwayat dibatasi ke kantin yang ditugaskan.

| Method | Path | Kegunaan |
|---|---|---|
| GET | `/api/kantin` | Kantin aktif yang ditugaskan |
| GET | `/api/kantin/:id` | Detail dan saldo |
| GET | `/api/kantin/:id/saldo` | Detail dan saldo (alias) |
| PATCH | `/api/kantin/:id/katalog` | Mengaktifkan/menonaktifkan katalog: `{ "catalog_enabled": true }` |
| GET | `/api/kantin/:id/produk` | Daftar produk yang ditugaskan pada kantin, termasuk produk nonaktif untuk pengelolaan |
| POST | `/api/kantin/:id/produk` | Tambah produk, harga, stok, SKU/barcode opsional |
| PATCH | `/api/kantin/:id/produk/:productId` | Ubah produk, harga, status, atau stok |
| GET | `/api/kantin/:id/pergerakan-stok` | Riwayat 100 pergerakan stok terakhir |
| GET | `/api/kantin/pencairan/persetujuan` | Permintaan pencairan untuk kantin yang ditugaskan |
| POST | `/api/kantin/pencairan/persetujuan/:id/approve` | Konfirmasi pencairan |
| POST | `/api/kantin/pencairan/persetujuan/:id/reject` | Tolak permintaan pencairan |
| POST | `/api/kantin/:id/santri/lookup` | Cari santri |
| POST | `/api/kantin/:id/penjualan` | Catat transaksi belanja |
| GET | `/api/kantin/:id/transaksi` | Riwayat kantin |

Lookup harus mengirim tepat satu dari `rfid_uid`, `fingerprint_id`, atau `nis`. Hasil:

```json
{
  "data": {
    "id": 10,
    "nis": "S-0010",
    "nama_lengkap": "Nama Santri",
    "asrama": "Asrama A",
    "saldo": "88000.00",
    "limit_harian": "50000.00",
    "belanja_hari_ini": "12000.00",
    "sisa_limit_harian": "38000.00"
  }
}
```

Katalog produk dan stok sepenuhnya dikelola kasir yang ditugaskan. Produk memakai `nama`, `kategori` (default `Umum`), `harga` (> 0), `stok`, `stok_minimum`, `sku`, `barcode`, dan `is_active`. SKU/barcode opsional tetapi harus unik di dalam kantin. Produk dinonaktifkan melalui `PATCH` dengan `{ "is_active": false }`; penyesuaian stok dicatat sebagai pergerakan stok. Kasir dapat memakai pencatatan nominal atau POS produk pada setiap transaksi saat katalog aktif. Scanner USB/Bluetooth yang bertindak sebagai keyboard dapat digunakan pada kolom pencarian: pindai SKU/barcode lalu tekan Enter. Stok dikurangi hanya jika checkout berhasil.

Penjualan memakai body dan output dasar yang sama dengan penjualan admin. Untuk POS, kirim `items` beserta `jumlah`; total akan dihitung kembali dari harga produk saat ini. Jika harga berubah atau stok tidak cukup, transaksi ditolak dengan `409` tanpa debit saldo atau perubahan stok. Header `Idempotency-Key` wajib; gunakan key unik untuk transaksi baru dan key/body yang sama hanya untuk retry transaksi yang hasilnya belum diterima. Riwayat kasir dapat menyertakan rincian produk, sedangkan riwayat dan laporan admin hanya menampilkan jumlah serta total transaksi. Respons riwayat memakai `data` dan `pagination` sebagaimana bagian transaksi admin; filter opsional `tipe_transaksi=penjualan|pencairan`.

## API orang tua/wali

Semua endpoint `/api/wali` memerlukan token role `wali`. Pengguna hanya dapat melihat atau mengubah limit anak yang terhubung ke akunnya.

| Method | Path | Kegunaan |
|---|---|---|
| GET | `/api/wali/me` | Profil akun dan daftar anak |
| GET | `/api/wali/anak` | Daftar anak |
| GET | `/api/wali/anak/:santriId` | Detail anak |
| GET | `/api/wali/anak/:santriId/transaksi` | Riwayat transaksi; filter tipe opsional |
| PATCH / PUT | `/api/wali/anak/:santriId/limit-harian` | Atur limit harian |

Profil membungkus akun dalam `data`; `children` berisi anak dengan `id`, `nis`, `nama_lengkap`, `asrama`, `saldo`, `limit_harian`, `no_whatsapp`, `belanja_hari_ini`, `sisa_limit_harian`. Endpoint daftar anak mengembalikan array objek anak dengan kolom yang sama.

Detail anak memakai `{ "data": { ...anak, "belanja_hari_ini": "...", "sisa_limit_harian": "..." } }`. Riwayat:

```json
{
  "santri": { "id": 10, "nis": "S-0010", "nama_lengkap": "Nama Santri" },
  "data": [
    {
      "id": 55,
      "tipe_transaksi": "belanja",
      "jumlah": "12000.00",
      "saldo_akhir": "88000.00",
      "keterangan": "Makan siang",
      "created_at": "...",
      "nama_kantin": "Kantin Putra"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1 }
}
```

Tipe riwayat yang valid: `belanja`, `topup`, `tarik`. Ubah limit memakai `{ "limit_harian": 30000 }` (nol diperbolehkan). Respons:

```json
{
  "message": "Limit belanja harian berhasil diperbarui.",
  "data": {
    "santri_id": 10,
    "limit_harian": "30000.00",
    "belanja_hari_ini": "12000.00",
    "sisa_limit_harian": "18000.00"
  }
}
```

## Format error dan status HTTP penting

Sebagian besar error menggunakan `{ "message": "Penjelasan" }`; error login dan resource tertentu sengaja tidak membocorkan data sensitif.

| Status | Makna umum |
|---|---|
| 400 | Input/path/query tidak valid, body JSON salah, atau header idempotensi wajib tidak ada |
| 401 | Token hilang, tidak valid/kadaluarsa, sesi telah dicabut, atau login gagal |
| 403 | Role tidak diizinkan, MFA wajib, atau approval finansial diwajibkan |
| 404 | Resource tidak ditemukan atau tidak berada dalam cakupan akses pengguna |
| 409 | Konflik unik, saldo/limit tidak mencukupi, transaksi/idempotensi konflik, atau approval kedaluwarsa/tidak cocok |
| 413 | Request body melampaui 32 KB |
| 415 | Body mutasi bukan `application/json` |
| 429 | Rate limit login, MFA, atau API terlampaui |
| 500 | Kegagalan server; tampilkan pesan umum dan jangan mengasumsikan mutasi berhasil |
| 503 | Konfigurasi autentikasi aman belum tersedia |

## Catatan integrasi UI

- Jangan menampilkan `challenge_token` sebagai token sesi biasa dan jangan simpan secret MFA setelah enrollment. Secret/provisioning URI hanya untuk tampilan setup awal melalui HTTPS.
- Untuk nominal finansial, tampilkan status loading sampai server mengonfirmasi; apabila request timeout, ulangi dengan `Idempotency-Key` dan payload identik, jangan membuat key baru untuk transaksi yang mungkin sudah diproses.
- `DELETE` pada akun, santri, kantin, dan kredensial bermakna menonaktifkan/memblokir. Riwayat transaksi tidak dihapus.
- Password tidak pernah dikembalikan oleh endpoint. Jangan masukkan password, token, RFID/fingerprint, atau body finansial sensitif ke log UI.
- Untuk endpoint yang mengembalikan `pagination`, gunakan `pagination.total` untuk menghitung jumlah halaman dan kirim `page` serta `limit` saat memuat halaman berikutnya.
- Nama field API memakai `snake_case`; pertahankan nama tersebut pada payload kecuali UI memiliki mapping model tersendiri.
