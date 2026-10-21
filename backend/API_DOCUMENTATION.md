# Dokumentasi API Pondok

Dokumen ini merangkum endpoint yang saat ini tersedia di backend untuk membantu perencanaan UI. Contoh respons menunjukkan bentuk JSON yang dikembalikan API; nilai dan waktu di dalamnya hanya contoh.

## Dasar penggunaan

- Base URL lokal: `http://localhost:3000`
- Semua path di bawah menggunakan prefix `/api`.
- `GET /` adalah endpoint status tanpa autentikasi; respons berisi `message` dan objek `endpoints` dengan beberapa route utama.
- Request dengan body harus mengirim `Content-Type: application/json`.
- Kecuali endpoint login dan MFA setup/verify, endpoint terlindungi memerlukan `Authorization: Bearer <access_token>`.
- Endpoint admin hanya untuk role `admin`; kasir hanya dapat mengakses kantin yang ditugaskan kepadanya; wali hanya dapat mengakses santri yang terhubung dengan akun tersebut.
- Role yang tersedia: `santri`, `kasir`, `wali`, `admin`. API yang terdokumentasi di sini tidak menyediakan endpoint khusus UI santri; autentikasi santri tetap tersedia.
- Nominal uang memakai mata uang yang dikonfigurasi lembaga. Database menyimpan nominal dua angka desimal; nilai `DECIMAL` umumnya diterima/dikirim sebagai string seperti `"50000.00"`. Kirim nominal sebagai angka atau string desimal dengan maksimal dua angka desimal.
- Password baru minimal 12 byte dan maksimal 72 byte. Password disimpan dalam bentuk hash, tidak pernah dikembalikan oleh API.
- Access token berlaku 1 jam; challenge MFA berlaku 5 menit. Tidak ada endpoint logout khusus; perubahan password, role, atau status akun mencabut sesi aktif.
- Endpoint daftar yang mendukung pagination menggunakan `?page=1&limit=20`. Nilai default `page=1`, `limit=20`; limit maksimum 100.
- JSON error umum berbentuk `{"message":"..."}`. Error autentikasi/validasi tertentu juga mengembalikan `approval_required`.

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

### Dashboard, audit, dan persetujuan finansial

| Method | Path | Request/query |
|---|---|---|
| GET | `/api/admin/dashboard` | — |
| GET | `/api/admin/audit-logs?page=1&limit=50` | `page`, `limit` |
| POST | `/api/admin/financial-approvals` | Buat permintaan approval |
| POST | `/api/admin/financial-approvals/:id/approve` | Admin kedua menyetujui |
| POST | `/api/admin/financial-approvals/:id/reject` | Admin kedua menolak |

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

### Santri

| Method | Path | Kegunaan/input utama |
|---|---|---|
| GET | `/api/admin/santri?page=1&limit=20&search=...` | Daftar/cari berdasarkan NIS, nama, asrama, username |
| POST | `/api/admin/santri` | Buat santri dan akun login |
| GET | `/api/admin/santri/:id` | Detail |
| PUT / PATCH | `/api/admin/santri/:id` | Ubah sebagian/seluruh properti |
| DELETE | `/api/admin/santri/:id` | Nonaktifkan santri dan akun |
| POST | `/api/admin/santri/:id/topup` | Top up saldo |
| POST | `/api/admin/santri/:id/tarik` | Penarikan saldo |
| POST | `/api/admin/santri/:id/kartu` | Daftarkan RFID |
| POST | `/api/admin/santri/:id/sidik-jari` | Daftarkan ID fingerprint |

Buat santri memerlukan `username`, `password`, `nis`, `nama_lengkap`; `asrama` opsional dan `limit_harian` default `50000`.

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

### Kantin dan penugasan kasir

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
| POST | `/api/admin/kantin/:id/pencairan` | Cairkan saldo kantin |
| GET | `/api/admin/kantin/:id/transaksi` | Riwayat penjualan/pencairan |

Objek kantin: `id`, `nama`, `lokasi`, `status` (`active`/`inactive`), `saldo`, `created_at`. POST membuat kantin menggunakan `nama` wajib; `lokasi` opsional; `status` default `active`. Respons list memakai `{ "data": [...] }`, detail memakai `{ "data": {...} }`. DELETE menonaktifkan kantin dan mempertahankan saldo/riwayat.

Kasir terdaftar dalam daftar dengan `{ "id": 12, "username": "kasir_1", "created_at": "..." }`. Penugasan berhasil merespons `{ "message": "...", "data": { "kantin_id": 4, "user_id": 12 } }`.

Penjualan admin memakai body `{ "santri_id": 10, "jumlah": 12000, "keterangan": "Belanja" }`; pencairan memakai `{ "jumlah": 10000, "keterangan": "Pencairan hasil penjualan", "approval_id": 21 }`. Keduanya memerlukan `Idempotency-Key`.

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

Penjualan ditolak dengan `409` bila saldo santri tidak cukup, limit harian terlampaui, kantin tidak aktif, atau key dipakai untuk payload lain. Pencairan mengembalikan `id`, `kantin_id`, `tipe_transaksi: "pencairan"`, `jumlah`, `saldo_akhir`, `keterangan`; saldo kantin tidak cukup menghasilkan `409`. Transaksi baru `201`, retry identik `200` dengan `duplicate: true`.

### Transaksi

| Method | Path | Query |
|---|---|---|
| GET | `/api/admin/transaksi?page=1&limit=20` | `santri_id`, `tipe_transaksi` opsional |
| GET | `/api/admin/kantin/:id/transaksi?page=1&limit=20` | `tipe_transaksi=penjualan` atau `pencairan` |

`GET /api/admin/transaksi` menerima tipe `belanja`, `topup`, atau `tarik`. Entri transaksi admin berisi `id`, `santri_id`, `kantin_id`, `nama_kantin`, `nis`, `nama_lengkap`, `tipe_transaksi`, `jumlah`, `saldo_akhir`, `keterangan`, `created_at`.

Riwayat kantin mengembalikan `{ "data": [...], "pagination": {...} }`; entri memiliki `id`, `kantin_id`, `transaksi_id`, `tipe_transaksi`, `jumlah`, `saldo_akhir`, `keterangan`, `created_at`, `santri_id`, `nis`, `nama_lengkap`. Untuk transaksi pencairan, kolom terkait santri dapat bernilai `null`.

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

Penjualan menggunakan body dan output yang sama dengan penjualan admin. Header `Idempotency-Key` wajib; gunakan key unik untuk transaksi baru dan key/body yang sama hanya untuk retry transaksi yang hasilnya belum diterima. Respons riwayat memakai `data` dan `pagination` sebagaimana bagian transaksi admin; filter opsional `tipe_transaksi=penjualan|pencairan`.

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
