# Dokumentasi API Kantin

Dokumen ini menjelaskan kontrak API kantin yang tersedia untuk aplikasi admin dan kasir, termasuk contoh request dan response JSON. Contoh ID, nama, nominal, dan waktu hanya ilustrasi; respons aktual mengikuti data database.

## Daftar isi

1. [Konvensi umum](#konvensi-umum)
2. [Hak akses dan perbedaan tampilan](#hak-akses-dan-perbedaan-tampilan)
3. [API admin](#api-admin)
4. [API kasir](#api-kasir)
5. [Alur transaksi yang direkomendasikan](#alur-transaksi-yang-direkomendasikan)
6. [Kode error dan penanganannya](#kode-error-dan-penanganannya)
7. [Contoh data untuk desain UI](#contoh-data-untuk-desain-ui)

## Konvensi umum

- Base URL lokal: `http://localhost:3000`.
- Semua endpoint di bawah memakai prefix `/api`.
- Request JSON mengirim header `Content-Type: application/json`.
- Endpoint terlindungi memerlukan header `Authorization: Bearer <access_token>`.
- Login admin dan kasir memerlukan MFA. Gunakan access token hasil verifikasi MFA.
- Kasir hanya dapat mengakses kantin yang ditugaskan kepadanya.
- JSON error umumnya berbentuk `{ "message": "..." }`.
- Nilai uang database bertipe desimal dan biasanya dikembalikan sebagai string dua digit desimal, misalnya `"12500.00"`.
- Timestamp mengikuti serialisasi JSON dari backend, umumnya ISO-8601, misalnya `"2026-10-23T06:00:00.000Z"`.
- Daftar transaksi mendukung `page` dan `limit`: default `page=1`, `limit=20`, maksimum `limit=100`.
- Status kantin: `active`, `inactive`.
- Tipe transaksi kantin: `penjualan`, `pencairan`, `refund`.
- Referensi API lain: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

## Hak akses dan perbedaan tampilan

| Kemampuan | Admin | Kasir ditugaskan |
|---|---:|---:|
| Melihat dan mengelola data kantin | Ya | Melihat kantin aktif yang ditugaskan |
| Menugaskan / mencabut kasir | Ya | Tidak |
| Memilih mode katalog aktif untuk kantin | Tidak | Ya |
| Mengelola produk, harga, dan stok | Tidak | Ya |
| Mencatat transaksi nominal | Ya | Ya |
| Menggunakan POS dengan item produk | Tidak | Ya, jika katalog kantin aktif |
| Melihat rekap transaksi dan saldo kantin | Ya | Ya, untuk kantin yang ditugaskan |
| Melihat detail produk pada riwayat | Tidak | Ya |
| Mengajukan pencairan saldo | Ya | Tidak |
| Menyetujui / menolak pengajuan pencairan admin | Tidak | Ya, jika ditugaskan dan MFA aktif |
| Membuka / menutup giliran kasir | Tidak | Ya |
| Menahan keranjang POS lintas perangkat pada akun yang sama | Tidak | Ya |
| Memproses refund penuh dengan alasan | Tidak | Ya, oleh kasir pencatat transaksi asal |
| Melihat laporan penjualan dan ekspor CSV | Ya | Tidak |

Admin melihat jumlah dan nilai transaksi saja. Endpoint admin tidak mengembalikan rincian item produk. Nama item, harga snapshot, kuantitas, dan subtotal hanya tersedia pada alur kasir.

## API admin

Semua endpoint pada bagian ini memerlukan role `admin` dan prefix `/api/admin`.

### Ringkasan endpoint

| Method | Path | Kegunaan |
|---|---|---|
| `GET` | `/api/admin/kantin` | Daftar semua kantin |
| `POST` | `/api/admin/kantin` | Membuat kantin |
| `GET` | `/api/admin/kantin/:id` | Melihat detail kantin |
| `PUT` / `PATCH` | `/api/admin/kantin/:id` | Memperbarui nama, lokasi, atau status |
| `DELETE` | `/api/admin/kantin/:id` | Menonaktifkan kantin, bukan menghapus riwayat |
| `GET` | `/api/admin/kantin/:id/kasir` | Melihat kasir yang ditugaskan |
| `POST` | `/api/admin/kantin/:id/kasir` | Menugaskan kasir |
| `DELETE` | `/api/admin/kantin/:id/kasir/:userId` | Mencabut penugasan kasir |
| `POST` | `/api/admin/kantin/:id/penjualan` | Mencatat transaksi nominal manual |
| `GET` | `/api/admin/kantin/:id/transaksi` | Riwayat saldo kantin |
| `GET` | `/api/admin/kantin/:id/laporan` | Laporan penjualan/refund dengan filter tanggal, kasir, dan produk |
| `GET` | `/api/admin/kantin/:id/giliran` | Riwayat giliran kasir |
| `GET` | `/api/admin/kantin/:id/produk` | Katalog untuk filter laporan |
| `GET` | `/api/admin/kantin/:id/pencairan/persetujuan-kasir` | Melihat status persetujuan kasir atas pencairan |
| `POST` | `/api/admin/kantin/:id/pencairan/persetujuan-kasir` | Meminta konfirmasi kasir untuk pencairan |
| `POST` | `/api/admin/kantin/:id/pencairan` | Mencairkan saldo setelah persetujuan |

### Daftar kantin

`GET /api/admin/kantin`

Response `200`:

```json
{
  "data": [
    {
      "id": 4,
      "nama": "Kantin Putra",
      "lokasi": "Area asrama putra",
      "status": "active",
      "saldo": "1250000.00",
      "created_at": "2026-10-01T02:00:00.000Z"
    },
    {
      "id": 5,
      "nama": "Kantin Putri",
      "lokasi": null,
      "status": "inactive",
      "saldo": "0.00",
      "created_at": "2026-10-03T02:00:00.000Z"
    }
  ]
}
```

`GET /api/admin/kantin/:id` merespons `{ "data": { ...objek kantin... } }` dengan bentuk objek yang sama. Jika ID tidak ditemukan, status `404`.

### Membuat dan memperbarui kantin

`POST /api/admin/kantin`

Request:

```json
{
  "nama": "Kantin Putra",
  "lokasi": "Area asrama putra",
  "status": "active"
}
```

`nama` wajib. `lokasi` boleh `null` atau tidak dikirim. `status` default `active`.

Response `201`:

```json
{
  "message": "Data kantin berhasil dibuat.",
  "data": {
    "id": 4,
    "nama": "Kantin Putra",
    "lokasi": "Area asrama putra",
    "status": "active",
    "saldo": "0.00",
    "created_at": "2026-10-23T06:00:00.000Z"
  }
}
```

`PUT` atau `PATCH /api/admin/kantin/:id` menerima satu atau beberapa field yang ingin diubah:

```json
{
  "nama": "Kantin Utama",
  "lokasi": "Dekat masjid",
  "status": "active"
}
```

Response `200` menggunakan `{ "message": "...", "data": { ...kantin terbaru... } }`.

`DELETE /api/admin/kantin/:id` menonaktifkan kantin. Response `200`:

```json
{
  "message": "Kantin dinonaktifkan; saldo dan riwayat tetap disimpan."
}
```

### Penugasan kasir

`GET /api/admin/kantin/:id/kasir`

Response `200`:

```json
{
  "data": [
    {
      "id": 12,
      "username": "kasir_putra",
      "created_at": "2026-10-01T02:10:00.000Z"
    }
  ]
}
```

`POST /api/admin/kantin/:id/kasir` request:

```json
{
  "user_id": 12
}
```

Response `201`:

```json
{
  "message": "Kasir berhasil ditugaskan ke kantin.",
  "data": {
    "kantin_id": 4,
    "user_id": 12
  }
}
```

`DELETE /api/admin/kantin/:id/kasir/:userId` response `200`:

```json
{
  "message": "Penugasan kasir berhasil dihapus."
}
```

### Penjualan nominal manual oleh admin

`POST /api/admin/kantin/:id/penjualan`

Request:

```json
{
  "santri_id": 391,
  "jumlah": 12500,
  "keterangan": "Belanja kantin"
}
```

Endpoint admin hanya mencatat nominal. Mengirim `items` ditolak dengan `403`.

Response `201`:

```json
{
  "message": "Transaksi belanja berhasil.",
  "data": {
    "santri": {
      "id": 391,
      "saldo": "87500.00"
    },
    "kantin": {
      "id": 4,
      "saldo": "1262500.00"
    },
    "transaksi_id": 908,
    "jumlah": "12500.00"
  }
}
```

Retry request yang berhasil sebelumnya dengan `Idempotency-Key` dan payload yang sama merespons `200`, dengan `duplicate: true` di `data`.

### Riwayat transaksi admin kantin

`GET /api/admin/kantin/:id/transaksi?page=1&limit=20&tipe_transaksi=penjualan`

- `tipe_transaksi` opsional: `penjualan` atau `pencairan`.
- Tanpa filter, endpoint mengembalikan kedua jenis transaksi.

Response `200`:

```json
{
  "data": [
    {
      "id": 908,
      "kantin_id": 4,
      "transaksi_id": 908,
      "tipe_transaksi": "penjualan",
      "jumlah": "12500.00",
      "saldo_akhir": "1262500.00",
      "keterangan": "Belanja kantin",
      "created_at": "2026-10-23T06:20:00.000Z",
      "santri_id": 391,
      "nis": "S-0391",
      "nama_lengkap": "Ahmad Fulan"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Riwayat admin tidak memuat `items`, `nama_produk`, atau rincian harga produk. Untuk riwayat transaksi seluruh lembaga, admin dapat memakai `GET /api/admin/transaksi` dengan query `page`, `limit`, `santri_id` dan/atau `tipe_transaksi`.

### Konfirmasi kasir untuk pencairan saldo

Pencairan admin memerlukan persetujuan kasir aktif yang ditugaskan. Pengajuan berlaku 24 jam.

`POST /api/admin/kantin/:id/pencairan/persetujuan-kasir`

Request:

```json
{
  "jumlah": 500000,
  "keterangan": "Pencairan hasil penjualan minggu ini"
}
```

Response `201`:

```json
{
  "message": "Permintaan pencairan dikirim ke kasir yang ditugaskan.",
  "data": {
    "id": 31,
    "kantin_id": 4,
    "amount": "500000.00",
    "keterangan": "Pencairan hasil penjualan minggu ini",
    "status": "pending"
  }
}
```

`GET /api/admin/kantin/:id/pencairan/persetujuan-kasir` response `200`:

```json
{
  "data": [
    {
      "id": 31,
      "kantin_id": 4,
      "amount": "500000.00",
      "keterangan": "Pencairan hasil penjualan minggu ini",
      "requester_id": 2,
      "requester_username": "admin",
      "cashier_id": 12,
      "cashier_username": "kasir_putra",
      "status": "approved",
      "expires_at": "2026-10-24T06:20:00.000Z",
      "decided_at": "2026-10-23T06:25:00.000Z",
      "consumed_at": null,
      "created_at": "2026-10-23T06:20:00.000Z"
    }
  ]
}
```

Status yang dapat muncul: `pending`, `approved`, `rejected`, `expired`, `consumed`.

`POST /api/admin/kantin/:id/pencairan` request:

```json
{
  "jumlah": 500000,
  "keterangan": "Pencairan hasil penjualan minggu ini",
  "cashier_approval_id": 31
}
```

Untuk pencairan yang melewati ambang persetujuan finansial, sertakan juga `approval_id` dari API persetujuan finansial admin.

Header wajib: `Idempotency-Key: <unik-untuk-operasi-ini>`.

Response `201`:

```json
{
  "message": "Pencairan saldo kantin berhasil.",
  "data": {
    "id": 72,
    "kantin_id": 4,
    "tipe_transaksi": "pencairan",
    "jumlah": "500000.00",
    "saldo_akhir": "762500.00",
    "keterangan": "Pencairan hasil penjualan minggu ini"
  }
}
```

## API kasir

Semua endpoint bagian ini memerlukan role `kasir`. Base path: `/api/kantin`. Endpoint detail, produk, lookup, transaksi, dan stok hanya dapat digunakan untuk kantin yang ditugaskan pada akun kasir tersebut.

### Ringkasan endpoint

| Method | Path | Kegunaan |
|---|---|---|
| `GET` | `/api/kantin` | Daftar kantin aktif yang ditugaskan |
| `GET` | `/api/kantin/:id` | Detail saldo dan mode katalog |
| `GET` | `/api/kantin/:id/saldo` | Alias detail saldo |
| `PATCH` | `/api/kantin/:id/katalog` | Mengubah mode katalog untuk kantin |
| `GET` | `/api/kantin/:id/produk` | Daftar semua produk untuk pengelolaan |
| `POST` | `/api/kantin/:id/produk` | Menambahkan produk |
| `PATCH` | `/api/kantin/:id/produk/:productId` | Memperbarui data produk, harga, minimum stok, atau status |
| `POST` | `/api/kantin/:id/produk/:productId/stok` | Penerimaan atau penyesuaian stok beralasan |
| `GET` | `/api/kantin/:id/pergerakan-stok` | Riwayat pergerakan stok |
| `GET` | `/api/kantin/:id/pemasok` | Daftar pemasok kantin |
| `POST` | `/api/kantin/:id/pemasok` | Menambahkan pemasok |
| `PATCH` | `/api/kantin/:id/pemasok/:supplierId` | Memperbarui kontak atau status pemasok |
| `GET` | `/api/kantin/:id/pembelian` | Daftar faktur, pembayaran, dan sisa utang |
| `POST` | `/api/kantin/:id/pembelian` | Menerima faktur, menambah stok, dan mencatat utang |
| `GET` | `/api/kantin/:id/pembelian/:purchaseId` | Detail faktur dan riwayat pembayaran |
| `POST` | `/api/kantin/:id/pembelian/:purchaseId/pembayaran` | Mencatat pembayaran tunai/transfer eksternal |
| `GET` | `/api/kantin/:id/giliran/aktif` | Giliran aktif dan rekap sementara |
| `GET` | `/api/kantin/:id/giliran/riwayat` | Riwayat giliran kasir |
| `POST` | `/api/kantin/:id/giliran/buka` | Membuka giliran sebelum penjualan |
| `POST` | `/api/kantin/:id/giliran/:shiftId/tutup` | Menutup giliran dan mengembalikan rekap |
| `GET` | `/api/kantin/:id/keranjang-tertahan` | Keranjang tersimpan milik kasir |
| `POST` | `/api/kantin/:id/keranjang-tertahan` | Menahan keranjang |
| `PUT` | `/api/kantin/:id/keranjang-tertahan/:cartId` | Memperbarui keranjang tertahan |
| `DELETE` | `/api/kantin/:id/keranjang-tertahan/:cartId` | Menghapus keranjang tertahan |
| `POST` | `/api/kantin/:id/santri/lookup` | Memverifikasi santri |
| `POST` | `/api/kantin/:id/penjualan` | Menyimpan transaksi manual atau POS |
| `POST` | `/api/kantin/:id/transaksi/:transactionId/refund` | Refund penuh untuk transaksi kasir |
| `GET` | `/api/kantin/:id/transaksi` | Riwayat penjualan, refund, dan pencairan |
| `GET` | `/api/kantin/pencairan/persetujuan` | Daftar pengajuan pencairan yang perlu diputuskan |
| `POST` | `/api/kantin/pencairan/persetujuan/:id/approve` | Menyetujui pengajuan pencairan |
| `POST` | `/api/kantin/pencairan/persetujuan/:id/reject` | Menolak pengajuan pencairan |

### Pemasok, faktur, dan pembayaran

Semua operasi pemasok dan pembelian hanya tersedia untuk kasir yang ditugaskan pada kantin di URL. Kasir dapat membuat/mengubah pemasok, menerima faktur, dan mencatat beberapa pembayaran untuk satu faktur.

`GET /api/kantin/:id/pemasok` hanya menampilkan pemasok aktif. Tambahkan `?include_inactive=true` untuk menyertakan pemasok nonaktif. `POST` menerima `name` (wajib) serta `contact_name`, `phone`, `email`, `address`, dan `notes` (opsional). `PATCH` menerima subset field tersebut atau `is_active` bertipe boolean. Pemasok yang dinonaktifkan tetap dapat ditemukan pada faktur lama, tetapi tidak dapat dipilih untuk penerimaan faktur baru.

`POST /api/kantin/:id/pembelian` memerlukan header `Idempotency-Key` unik (8–64 karakter). Penerimaan faktur dan penambahan stok adalah satu transaksi database: kegagalan validasi atau penyimpanan membatalkan seluruh perubahan. Nomor faktur harus unik untuk pemasok yang sama di kantin tersebut.

Request:

```json
{
  "supplier_id": 8,
  "invoice_number": "INV-2026-031",
  "invoice_date": "2026-10-23",
  "due_date": "2026-11-22",
  "note": "Pengiriman mingguan",
  "items": [
    { "product_id": 23, "quantity": 24, "unit_cost": "3500.00" }
  ]
}
```

Harga pokok produk dihitung dengan rata-rata tertimbang berdasarkan stok dan nilai yang telah diketahui, tanpa mengubah harga jual. Stok awal dan penambahan stok manual tanpa harga modal menandai biaya produk sebagai tidak diketahui; status ini baru pulih setelah stok tersebut habis dan penerimaan berfaktur berikutnya memberikan basis biaya baru. Sistem tidak mengarang biaya historis. Snapshot HPP disimpan pada item penjualan baru. Penjualan lama dan transaksi nominal manual tidak memiliki margin yang dapat dipastikan.

`POST /api/kantin/:id/pembelian/:purchaseId/pembayaran` juga mewajibkan `Idempotency-Key`. `amount` harus positif dan tidak boleh melebihi saldo utang. Pembayaran sebagian dapat dilakukan berkali-kali. `method` bernilai `cash`, `bank_transfer`, atau `other`; `reference_code` dan `note` opsional.

Request:

```json
{
  "amount": "25000.00",
  "method": "bank_transfer",
  "reference_code": "TRF-7781",
  "note": "Cicilan pertama"
}
```

Response berhasil mencakup catatan pembayaran, `outstanding` setelah pembayaran, dan `balance_effect: "external_cash_or_bank_only"`. `GET /api/kantin/:id/pembelian` mengembalikan `data`, ringkasan total faktur/pembayaran/utang, serta `pagination`. Status faktur (`unpaid`, `partial`, `paid`) dan saldo utang dihitung dari total faktur dikurangi catatan pembayaran yang append-only.

Pembayaran pemasok dicatat sebagai arus kas/bank eksternal; endpoint ini **tidak mengubah `kantin.saldo`, `kantin_transaksi`, atau saldo santri**. Untuk item penjualan yang HPP-nya tersedia, biaya pokok diambil dari snapshot saat penjualan, sehingga perubahan rata-rata harga berikutnya tidak mengubah nilai historis.

### Kantin yang ditugaskan

`GET /api/kantin`

Response `200`:

```json
{
  "data": [
    {
      "id": 4,
      "nama": "Kantin Putra",
      "lokasi": "Area asrama putra",
      "status": "active",
      "saldo": "1250000.00",
      "catalog_enabled": 1
    }
  ]
}
```

`catalog_enabled` bernilai truthy saat fitur katalog boleh digunakan. Kasir tetap dapat memilih mode nominal manual pada setiap transaksi. Jika katalog tidak diaktifkan, halaman transaksi hanya menggunakan mode nominal.

`GET /api/kantin/:id` dan alias `/api/kantin/:id/saldo` merespons:

```json
{
  "data": {
    "id": 4,
    "nama": "Kantin Putra",
    "lokasi": "Area asrama putra",
    "status": "active",
    "saldo": "1250000.00",
    "catalog_enabled": 1
  }
}
```

### Mengubah mode katalog

`PATCH /api/kantin/:id/katalog`

Request:

```json
{
  "catalog_enabled": true
}
```

Response `200`:

```json
{
  "message": "Kasir produk diaktifkan.",
  "data": {
    "kantin_id": 4,
    "catalog_enabled": true
  }
}
```

Untuk mematikan katalog, gunakan `"catalog_enabled": false`. Data produk dan riwayat stok tetap tersimpan. Perubahan ini mengatur ketersediaan mode POS, bukan memaksa kasir memilihnya.

### Katalog produk

`GET /api/kantin/:id/produk`

Mengembalikan semua produk kantin, termasuk produk nonaktif agar kasir dapat mengelolanya. POS hanya menampilkan `is_active` truthy.

Response `200`:

```json
{
  "data": [
    {
      "id": 23,
      "kantin_id": 4,
      "nama": "Air mineral 600 ml",
      "kategori": "Minuman",
      "sku": "MIN-001",
      "barcode": "8991234567890",
      "harga": "4000.00",
      "stok": 36,
      "stok_minimum": 8,
      "is_active": 1,
      "created_at": "2026-10-20T02:00:00.000Z",
      "updated_at": "2026-10-23T06:00:00.000Z"
    }
  ]
}
```

`POST /api/kantin/:id/produk`

Request:

```json
{
  "nama": "Air mineral 600 ml",
  "kategori": "Minuman",
  "sku": "MIN-001",
  "barcode": "8991234567890",
  "harga": 4000,
  "stok": 40,
  "stok_minimum": 8,
  "is_active": true
}
```

- Field wajib: `nama`, `harga`.
- Default: `kategori="Umum"`, `stok=0`, `stok_minimum=5`, `is_active=true`.
- `sku` dan `barcode` opsional, tetapi masing-masing harus unik pada kantin yang sama.
- Produk dinonaktifkan, bukan dihapus permanen.

Response `201`:

```json
{
  "message": "Produk berhasil ditambahkan.",
  "data": {
    "id": 23,
    "kantin_id": 4,
    "nama": "Air mineral 600 ml",
    "kategori": "Minuman",
    "sku": "MIN-001",
    "barcode": "8991234567890",
    "harga": "4000.00",
    "stok": 40,
    "stok_minimum": 8,
    "is_active": 1,
    "created_at": "2026-10-23T06:00:00.000Z",
    "updated_at": "2026-10-23T06:00:00.000Z"
  }
}
```

`PATCH /api/kantin/:id/produk/:productId` menerima field parsial untuk data produk, harga, stok minimum, dan status. Stok tidak dapat diubah melalui endpoint ini agar semua perubahan stok tercatat. Contoh mengubah harga:

```json
{
  "harga": 4500
}
```

Contoh menonaktifkan produk:

```json
{
  "is_active": false
}
```

Response `200`:

```json
{
  "message": "Produk berhasil diperbarui.",
  "data": {
    "id": 23,
    "kantin_id": 4,
    "nama": "Air mineral 600 ml",
    "kategori": "Minuman",
    "sku": "MIN-001",
    "barcode": "8991234567890",
    "harga": "4500.00",
    "stok": 35,
    "stok_minimum": 8,
    "is_active": 1,
    "created_at": "2026-10-20T02:00:00.000Z",
    "updated_at": "2026-10-23T06:10:00.000Z"
  }
}
```

`stok_minimum` bilangan bulat non-negatif; harga harus positif. Batas panjang: nama 120 karakter, kategori 80, SKU 40, barcode 80. Untuk stok awal produk, endpoint pembuatan mencatat pergerakan stok awal.

### Penerimaan dan penyesuaian stok

`POST /api/kantin/:id/produk/:productId/stok` menerima perubahan stok dengan alasan yang wajib dicatat.

Penerimaan barang:

```json
{
  "movement_type": "receipt",
  "quantity_change": 20,
  "note": "Penerimaan faktur INV-104"
}
```

Penyesuaian stok (selisih boleh positif atau negatif):

```json
{
  "movement_type": "adjustment",
  "quantity_change": -2,
  "note": "Dua barang rusak saat pemeriksaan"
}
```

Alasan harus sepanjang 5-255 karakter. Stok tidak boleh turun di bawah nol atau melampaui batas `INT UNSIGNED`. Perubahan stok dan catatan pergerakannya disimpan dalam satu transaksi database.

### Pergerakan stok

`GET /api/kantin/:id/pergerakan-stok?product_id=23`

`product_id` opsional. Tanpa filter, endpoint mengembalikan sampai 100 pergerakan terbaru untuk kantin tersebut.

Response `200`:

```json
{
  "data": [
    {
      "id": 154,
      "product_id": 23,
      "nama_produk": "Air mineral 600 ml",
      "transaksi_id": null,
      "movement_type": "adjustment",
      "quantity_change": 10,
      "stock_after": 40,
      "note": "Penyesuaian stok produk oleh petugas kantin",
      "created_at": "2026-10-23T06:00:00.000Z",
      "username": "kasir_putra"
    },
    {
      "id": 153,
      "product_id": 23,
      "nama_produk": "Air mineral 600 ml",
      "transaksi_id": 907,
      "movement_type": "sale",
      "quantity_change": -2,
      "stock_after": 30,
      "note": "Penjualan melalui kasir",
      "created_at": "2026-10-23T05:45:00.000Z",
      "username": "kasir_putra"
    }
  ]
}
```

`movement_type`: `adjustment` untuk perubahan manual atau stok awal produk, `receipt` untuk barang masuk, `sale` untuk pengurangan checkout, dan `refund` untuk restok barang refund. `quantity_change` negatif berarti stok berkurang.

### Verifikasi santri sebelum transaksi

`POST /api/kantin/:id/santri/lookup`

Kirim tepat satu metode identifikasi:

```json
{
  "rfid_uid": "RFID-839104"
}
```

atau:

```json
{
  "fingerprint_id": 39102
}
```

atau:

```json
{
  "nis": "S-0391"
}
```

Response `200`:

```json
{
  "data": {
    "id": 391,
    "nis": "S-0391",
    "nama_lengkap": "Ahmad Fulan",
    "asrama": "Asrama Al-Falah",
    "saldo": "100000.00",
    "limit_harian": "50000.00",
    "belanja_hari_ini": "7500.00",
    "sisa_limit_harian": "42500.00"
  }
}
```

Untuk rancangan UI, identifier RFID/fingerprint harus diperlakukan sebagai kredensial: input dapat disamarkan dan jangan dicantumkan kembali dalam riwayat atau layar konfirmasi.

### Menyimpan penjualan: nominal manual

Header wajib:

```http
Idempotency-Key: sale-20261023-0001
```

Request `POST /api/kantin/:id/penjualan`:

```json
{
  "santri_id": 391,
  "jumlah": 12500,
  "keterangan": "Belanja kantin"
}
```

Response `201`:

```json
{
  "message": "Transaksi belanja berhasil.",
  "data": {
    "santri": {
      "id": 391,
      "saldo": "87500.00"
    },
    "kantin": {
      "id": 4,
      "saldo": "1262500.00"
    },
    "transaksi_id": 908,
    "jumlah": "12500.00"
  }
}
```

Nominal harus positif. Server memvalidasi saldo santri, limit harian, status kantin, dan idempotensi. Jangan mengirim `items` saat mode nominal.

### Menyimpan penjualan: POS katalog

POS hanya dapat digunakan jika `catalog_enabled` aktif. Harga pada server adalah sumber kebenaran; jumlah produk dan total dihitung ulang saat checkout.

Request `POST /api/kantin/:id/penjualan`:

```json
{
  "santri_id": 391,
  "items": [
    {
      "product_id": 23,
      "quantity": 2
    },
    {
      "product_id": 24,
      "quantity": 1
    }
  ],
  "jumlah": 10000,
  "keterangan": "Pembelian katalog"
}
```

`jumlah` adalah total tampilan yang dihitung dari katalog frontend; jika harga sudah berubah, server menolak dan kasir perlu memuat ulang produk/keranjang. `items` berisi produk aktif dalam kantin tersebut dan kuantitas bilangan bulat positif.

Response `201` sama dengan penjualan manual:

```json
{
  "message": "Transaksi belanja berhasil.",
  "data": {
    "santri": {
      "id": 391,
      "saldo": "90000.00"
    },
    "kantin": {
      "id": 4,
      "saldo": "1260000.00"
    },
    "transaksi_id": 909,
    "jumlah": "10000.00"
  }
}
```

`Idempotency-Key` harus unik untuk transaksi baru. Jika request berhasil tetapi respons tidak diterima, ulangi payload yang sama dengan key yang sama. Respons retry identik `200` dan `data.duplicate` bernilai `true`; key sama untuk payload lain menghasilkan `409`.

### Giliran kasir dan keranjang tertahan

Kasir wajib membuka giliran aktif sebelum melakukan penjualan atau refund. Status giliran dan rekap sementara:

- `GET /api/kantin/:id/giliran/aktif` mengembalikan `data: null` jika belum ada giliran aktif, atau giliran beserta `sales_total`, `refunds_total`, `net_total`, dan jumlah transaksi.
- `POST /api/kantin/:id/giliran/buka` menerima `{ "opening_note": "Mulai shift pagi" }`; catatan opsional.
- `POST /api/kantin/:id/giliran/:shiftId/tutup` menerima `{ "closing_note": "Kasir selesai" }`; respons berisi rekap final.
- `GET /api/kantin/:id/giliran/riwayat` mengembalikan riwayat 20 giliran terakhir.

`GET /api/kantin/:id/keranjang-tertahan` menampilkan keranjang milik akun kasir tersebut. Keranjang dapat dibuat dengan `POST` atau diperbarui dengan `PUT` ke endpoint yang sama:

```json
{
  "label": "Pesanan asrama A",
  "items": [{ "product_id": 23, "quantity": 2 }]
}
```

Simpan dan pulihkan keranjang hanya pada kantin tempat produk aktif. Maksimal 50 keranjang per akun kasir dan kantin; keranjang hanya dibagikan lintas perangkat oleh akun kasir yang sama, bukan antar-kasir. `DELETE /api/kantin/:id/keranjang-tertahan/:cartId` menghapusnya. Stok dan harga selalu divalidasi ulang oleh server ketika checkout.

### Riwayat kasir

`GET /api/kantin/:id/transaksi?page=1&limit=20&tipe_transaksi=penjualan`

Filter `tipe_transaksi` opsional: `penjualan`, `refund`, atau `pencairan`.

Response `200`:

```json
{
  "data": [
    {
      "id": 908,
      "transaksi_id": 908,
      "tipe_transaksi": "penjualan",
      "jumlah": "10000.00",
      "saldo_akhir": "1260000.00",
      "keterangan": "Pembelian katalog",
      "created_at": "2026-10-23T06:20:00.000Z",
      "santri_id": 391,
      "nis": "S-0391",
      "nama_lengkap": "Ahmad Fulan",
      "items": [
        {
          "transaksi_id": 908,
          "nama_produk": "Air mineral 600 ml",
          "harga_satuan": "4000.00",
          "quantity": 2,
          "subtotal": "8000.00"
        },
        {
          "transaksi_id": 908,
          "nama_produk": "Roti cokelat",
          "harga_satuan": "2000.00",
          "quantity": 1,
          "subtotal": "2000.00"
        }
      ]
    },
    {
      "id": 909,
      "transaksi_id": 909,
      "tipe_transaksi": "penjualan",
      "jumlah": "12500.00",
      "saldo_akhir": "1272500.00",
      "keterangan": "Belanja nominal",
      "created_at": "2026-10-23T06:15:00.000Z",
      "santri_id": 392,
      "nis": "S-0392",
      "nama_lengkap": "Siti Fulanah",
      "items": []
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2
  }
}
```

Untuk transaksi pencairan, `santri_id`, `nis`, dan `nama_lengkap` bernilai `null`; `items` tidak ditambahkan jika tidak ada transaksi penjualan terkait. Riwayat refund mengacu pada item transaksi penjualan asal dan menyertakan alasan refund serta status restok.

### Refund penuh

Hanya kasir pencatat transaksi penjualan yang boleh memproses refund, dan kasir harus mempunyai giliran aktif. Refund bersifat penuh dan hanya dapat dilakukan sekali untuk satu penjualan. Tidak ada approval admin kedua; alasan tetap wajib dicatat.

`POST /api/kantin/:id/transaksi/:transactionId/refund` memerlukan header `Idempotency-Key` dan body:

```json
{
  "reason": "Barang dikembalikan utuh",
  "restock": true
}
```

Alasan harus 5-500 karakter. `restock` wajib boolean dan hanya mengembalikan kuantitas ke stok jika barang benar-benar diterima kembali. Refund mengkredit saldo santri dan mengurangi saldo kantin secara atomik; refund ditolak dengan `409` bila saldo kantin tidak cukup atau saldo santri tidak dapat menampung pengembalian. Retry harus memakai key dan body yang sama; refund kedua dengan key berbeda ditolak.

### Laporan penjualan kantin (admin)

`GET /api/admin/kantin/:id/laporan?from=2026-10-01&to=2026-10-31&page=1&limit=20` menerima tanggal ISO kalender yang valid, inklusif, dengan rentang maksimal 366 hari. Filter opsional: `cashier_id` dan `product_id`. Respons JSON menyertakan `data`, `summary` (total dan jumlah penjualan/refund, nilai bersih, serta `margin`), dan `pagination`. Ringkasan `margin` memuat penjualan item yang HPP-nya diketahui, refund item terukur, HPP bersih setelah retur stok, laba kotor, persentase margin, jumlah transaksi terukur, dan transaksi tanpa HPP yang dapat dihitung. Transaksi nominal manual dan penjualan lama tanpa snapshot HPP tidak disajikan sebagai margin terukur. Untuk ekspor seluruh transaksi pada rentang yang sama, tambahkan `format=csv`; ekspor dibatasi 20.000 baris dan menetralkan teks formula spreadsheet.

`GET /api/admin/kantin/:id/giliran?limit=20` mengembalikan rekap per giliran (batas maksimal 100). Admin dapat memakai `GET /api/admin/kantin/:id/produk` untuk mengisi filter produk. Laporan admin tidak mengembalikan rincian item per transaksi; filter produk hanya membatasi transaksi yang relevan.

Jika filter produk digunakan, transaksi penjualan/refund dicantumkan apabila item transaksi asal memuat produk tersebut; nominal laporan tetap merupakan nilai transaksi penuh, bukan subtotal produk.

### Persetujuan pengajuan pencairan oleh kasir

`GET /api/kantin/pencairan/persetujuan`

Response `200`:

```json
{
  "data": [
    {
      "id": 31,
      "kantin_id": 4,
      "kantin_nama": "Kantin Putra",
      "amount": "500000.00",
      "keterangan": "Pencairan hasil penjualan minggu ini",
      "requester_id": 2,
      "requester_username": "admin",
      "expires_at": "2026-10-24T06:20:00.000Z",
      "created_at": "2026-10-23T06:20:00.000Z"
    }
  ]
}
```

Permintaan yang ditampilkan hanya yang masih `pending` dan belum kedaluwarsa, untuk kantin yang ditugaskan pada kasir.

`POST /api/kantin/pencairan/persetujuan/:id/approve` atau `/reject` tidak memerlukan body.

Response approve `200`:

```json
{
  "message": "Pencairan berhasil dikonfirmasi.",
  "data": {
    "id": 31,
    "status": "approved"
  }
}
```

Response reject `200`:

```json
{
  "message": "Permintaan pencairan ditolak.",
  "data": {
    "id": 31,
    "status": "rejected"
  }
}
```

Keputusan hanya dapat dilakukan sekali oleh kasir aktif yang ditugaskan, dan kasir harus memiliki MFA aktif.

## Alur transaksi yang direkomendasikan

### Penjualan kasir

1. Muat `GET /api/kantin` dan pilih kantin jika kasir ditugaskan ke lebih dari satu kantin.
2. Periksa `catalog_enabled`. Jika aktif, tampilkan pilihan **Kasir produk** dan **Catat nominal**. Jika nonaktif, gunakan nominal manual saja.
3. POS: muat produk dari `GET /api/kantin/:id/produk`, saring produk aktif dan stok tersedia. Manual: input jumlah belanja secara langsung.
4. Verifikasi santri dengan `POST /api/kantin/:id/santri/lookup`.
5. Tampilkan nama, NIS, saldo, limit harian tersisa, total transaksi, dan konfirmasi.
6. Kirim transaksi ke `POST /api/kantin/:id/penjualan` dengan `Idempotency-Key`. Sertakan `items` hanya untuk mode POS.
7. Pada `409` terkait stok/harga, perbarui katalog/keranjang dan minta konfirmasi ulang. Jangan menganggap transaksi gagal jaringan sebagai alasan membuat key baru sebelum mengecek/mengulang dengan key lama.
8. Setelah sukses, tampilkan bukti transaksi dan saldo terkini; perbarui katalog dan riwayat.

### Pengelolaan katalog

1. Kasir memuat kantin dan produk yang ditugaskan.
2. Di halaman produk, kasir dapat mengaktifkan/nonaktifkan mode katalog kantin.
3. Kasir dapat mencari produk menurut nama, kategori, SKU, atau barcode; scanner yang berfungsi sebagai keyboard dapat mengisi kolom pencarian.
4. Produk dibuat/diperbarui melalui endpoint produk; input perubahan stok menghasilkan entri audit stok.
5. Produk nonaktif tetap muncul pada layar pengelolaan, tetapi tidak ditawarkan pada POS.

### Pencairan saldo

Alur yang saat ini disediakan untuk pencairan dijalankan admin, dengan keputusan kasir:

1. Admin membuat pengajuan melalui `/api/admin/kantin/:id/pencairan/persetujuan-kasir`.
2. Kasir melihatnya dari `/api/kantin/pencairan/persetujuan`.
3. Kasir menyetujui atau menolak pengajuan dari endpoint keputusan.
4. Setelah persetujuan, admin memuat status dan mencairkan melalui `/api/admin/kantin/:id/pencairan` menggunakan `cashier_approval_id`, nominal, keterangan yang sama, serta `Idempotency-Key`.
5. Jika memerlukan approval finansial tambahan, sertakan `approval_id`.

## Kode error dan penanganannya

| HTTP | Kondisi umum | Perilaku UI yang disarankan |
|---|---|---|
| `400` | ID, field, nominal, filter, atau body tidak valid; `Idempotency-Key` wajib tetapi tidak ada | Tampilkan validasi dekat field terkait; minta input diperbaiki |
| `401` | Access token tidak valid atau kedaluwarsa | Arahkan login kembali |
| `403` | Role tidak sesuai, akses role ditolak, MFA atau persetujuan diperlukan | Tampilkan alasan dan langkah yang diperlukan |
| `404` | Kantin/produk/santri/penugasan/pengajuan tidak ditemukan atau bukan dalam cakupan akses | Refresh data dan tampilkan notifikasi |
| `409` | Stok tidak cukup, produk nonaktif, harga berubah, saldo/limit tidak cukup, duplikasi key berbeda payload, atau persetujuan sudah tidak berlaku | Pertahankan pilihan jika aman, muat data terbaru, minta konfirmasi ulang |
| `500` | Kegagalan server | Tampilkan pesan gagal; jangan mengarang hasil sukses atau menghapus data form secara otomatis |

Contoh respons error:

```json
{
  "message": "Harga produk berubah. Muat ulang katalog dan periksa keranjang."
}
```

Kesalahan saldo atau limit transaksi:

```json
{
  "message": "Transaksi melebihi limit belanja harian santri."
}
```

Persetujuan pencairan kasir dibutuhkan:

```json
{
  "message": "Konfirmasi kasir diperlukan untuk pencairan saldo kantin.",
  "cashier_approval_required": true
}
```

## Contoh data untuk desain UI

Berikut satu objek ringkas yang dapat digunakan sebagai fixture/mock untuk tampilan kasir:

```json
{
  "canteen": {
    "id": 4,
    "nama": "Kantin Putra",
    "lokasi": "Area asrama putra",
    "status": "active",
    "saldo": "1250000.00",
    "catalog_enabled": 1
  },
  "cashier": {
    "id": 12,
    "username": "kasir_putra",
    "role": "kasir"
  },
  "products": [
    {
      "id": 23,
      "nama": "Air mineral 600 ml",
      "kategori": "Minuman",
      "sku": "MIN-001",
      "barcode": "8991234567890",
      "harga": "4000.00",
      "stok": 36,
      "stok_minimum": 8,
      "is_active": 1
    },
    {
      "id": 24,
      "nama": "Roti cokelat",
      "kategori": "Makanan",
      "sku": "MAK-014",
      "barcode": null,
      "harga": "2000.00",
      "stok": 12,
      "stok_minimum": 5,
      "is_active": 1
    }
  ],
  "student": {
    "id": 391,
    "nis": "S-0391",
    "nama_lengkap": "Ahmad Fulan",
    "asrama": "Asrama Al-Falah",
    "saldo": "100000.00",
    "limit_harian": "50000.00",
    "belanja_hari_ini": "7500.00",
    "sisa_limit_harian": "42500.00"
  },
  "cart": [
    {
      "product_id": 23,
      "quantity": 2,
      "nama": "Air mineral 600 ml",
      "harga_satuan": "4000.00",
      "subtotal": "8000.00"
    },
    {
      "product_id": 24,
      "quantity": 1,
      "nama": "Roti cokelat",
      "harga_satuan": "2000.00",
      "subtotal": "2000.00"
    }
  ],
  "totals": {
    "item_count": 3,
    "amount": "10000.00",
    "student_balance_after": "90000.00",
    "daily_limit_remaining_after": "32500.00"
  }
}
```

Data `cart` dan `totals` di atas adalah model tampilan frontend, bukan response dari satu endpoint. Total dan harga selalu diverifikasi ulang oleh server saat checkout.
