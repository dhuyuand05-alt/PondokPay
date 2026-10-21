# Dokumentasi Frontend PondokPay

Dokumen ini menjelaskan aplikasi web PondokPay: cara menjalankan dan membangunnya, struktur halaman, integrasi API, serta perilaku sesi dan transaksi. Dokumentasi backend dan API tersedia di [backend/DOKUMENTASI.md](../backend/DOKUMENTASI.md) dan [backend/API_DOCUMENTATION.md](../backend/API_DOCUMENTATION.md).

## 1. Gambaran umum

Frontend adalah aplikasi single-page berbasis React 18, React Router, Vite, Tailwind CSS, dan `lucide-react`. Aplikasi menyediakan portal admin, kasir, serta wali. Seluruh data dan validasi otoritatif berasal dari backend; UI tidak menggantikan autentikasi, otorisasi, ataupun aturan finansial server.

Peran yang memiliki antarmuka saat ini:

- **Admin:** dashboard dan pengelolaan data serta operasi pondok.
- **Kasir:** verifikasi santri, input dan konfirmasi pembelian, akun, serta riwayat kantin.
- **Wali:** ringkasan anak, transaksi, dan pengaturan limit harian.

Peran `santri` belum mempunyai halaman khusus. Jika akun tersebut login, aplikasi menampilkan pesan bahwa halaman belum tersedia dan menyediakan tindakan keluar.

## 2. Persyaratan dan menjalankan lokal

Diperlukan Node.js dan `npm`. Backend perlu berjalan di `http://localhost:3000` agar proxy development bekerja.

```powershell
cd E:\project-akhir\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Buka URL yang dicetak Vite, biasanya `http://localhost:5173`. Secara default, request `/api` diproxy ke `http://localhost:3000`. Jika backend lokal menggunakan alamat lain, atur `VITE_API_PROXY_TARGET` di file `.env` frontend.

## 3. Perintah npm

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Menjalankan server development Vite |
| `npm run build` | Membuat bundle production ke `dist/` |
| `npm run preview` | Menyajikan hasil build secara lokal untuk pemeriksaan |
| `npm run format` | Memformat file komponen di `src/components/` menggunakan Prettier |

Contoh build:

```powershell
cd E:\project-akhir\frontend
npm run build
npm run preview
```

Folder `dist/` adalah hasil build statis yang dapat di-host di web server/CDN. Konfigurasikan server hosting agar route SPA kembali menyajikan `index.html`, serta pasang HTTPS. Preview Vite ditujukan untuk verifikasi lokal, bukan server produksi.

## 4. Konfigurasi API

Konfigurasi opsional berada di `frontend/.env.example`:

| Variabel | Kegunaan |
|---|---|
| `VITE_API_PROXY_TARGET` | Origin backend tujuan proxy Vite saat development; default `http://localhost:3000` |
| `VITE_API_BASE_URL` | Base URL API yang dibundel ke aplikasi saat build, misalnya `https://api.example.com/api` |

Bila `VITE_API_BASE_URL` tidak disetel, frontend menggunakan `/api`. Tetapkan nilai production sebelum menjalankan `npm run build`. Semua variabel dengan prefix `VITE_` dapat dibaca dari browser dan bundle; jangan pernah menyimpan token rahasia, password, atau kunci backend di sana.

Jika frontend dan API berada pada origin berbeda, origin frontend harus diizinkan oleh konfigurasi CORS di API atau reverse proxy. Pastikan komunikasi menggunakan HTTPS dan jangan menonaktifkan pemeriksaan sertifikat atau keamanan browser. Konfigurasi Vite hanya mengatur proxy development; konfigurasi CORS production dilakukan pada lapisan hosting/API.

## 5. Struktur kode

| Lokasi | Tanggung jawab |
|---|---|
| `src/main.jsx` | Mount React, router browser, dan stylesheet |
| `src/App.jsx` | Login, enrollment/verifikasi MFA, pemulihan sesi, dan route berdasar role |
| `src/api.js` | Klien `fetch`, header bearer/idempotensi, parsing response, dan `ApiError` |
| `src/hooks.js` | Hook UI bersama |
| `src/ui.jsx` | Layout, komponen UI, navigasi, dan elemen tampilan umum |
| `src/styles.css` | Style global dan pengaturan Tailwind |
| `src/components/admin/` | Modul halaman admin |
| `src/components/cashier/` | Modul halaman kasir |
| `src/components/parent/` | Modul halaman wali |
| `vite.config.js` | Plugin React/Tailwind dan proxy API development |
| `desain_UI_PondokPay/` | Referensi desain layar dalam bentuk gambar |

Komponen peran diekspor melalui file `index.js` masing-masing direktori. Helper dan komponen bersama diletakkan di `shared.jsx` agar perilaku form/tabel/format tampilan konsisten.

## 6. Halaman dan alur peran

### Login dan MFA

Halaman masuk menerima username dan password. Login wali mendapat token akses langsung bila kredensial valid. Untuk admin dan kasir, backend mengembalikan challenge MFA; frontend kemudian menampilkan salah satu alur:

1. Enrollment pertama: meminta backend membuat provisioning URI dan secret untuk authenticator.
2. Login biasa: pengguna memasukkan kode TOTP enam digit dari authenticator.

Setelah verifikasi berhasil, pengguna diarahkan ke route sesuai role. Jika token sesi yang dipulihkan tidak lagi valid (`401`), frontend menghapus sesi lokal dan kembali ke halaman login.

### Admin

Prefix halaman: `/admin`.

| Route | Halaman |
|---|---|
| `/admin` | Ringkasan dashboard dan transaksi terbaru |
| `/admin/santri` | Daftar, pencarian, dan pembuatan santri |
| `/admin/santri/:id` | Detail santri, akun/kredensial, transaksi, top-up, penarikan, dan pendaftaran identifier |
| `/admin/kantin` | Pengelolaan kantin, penugasan kasir, transaksi, dan pencairan |
| `/admin/wali` | Akun wali dan relasi dengan anak |
| `/admin/transaksi` | Riwayat transaksi |
| `/admin/users` | Pengelolaan akun dan role |
| `/admin/credentials` | Kelola kredensial RFID/fingerprint |
| `/admin/approvals` | Ajukan, setujui, atau tolak persetujuan finansial sesuai peran admin |
| `/admin/audit` | Log aktivitas untuk pemantauan |

### Kasir

Prefix halaman: `/kasir`.

| Route | Halaman |
|---|---|
| `/kasir` | Pilih kantin yang ditugaskan, cari/verifikasi santri, masukkan nominal, konfirmasi pembelian, dan lihat hasil transaksi |
| `/kasir/history` | Riwayat transaksi kantin |
| `/kasir/account` | Profil, kantin yang ditugaskan, informasi keamanan akun, dan keluar |

Lookup santri dapat memakai identifier yang didukung API, seperti RFID, fingerprint ID, atau NIS. Daftar kantin dan transaksi dibatasi oleh penugasan kasir di backend.

### Wali

Prefix halaman: `/wali`.

| Route | Halaman |
|---|---|
| `/wali` | Anak terhubung, saldo, limit harian, dan transaksi terbaru |
| `/wali/history` | Riwayat transaksi anak yang dipilih |
| `/wali/limit` | Perubahan limit belanja harian |

Data anak dan izin memperbarui limit dibatasi server hanya pada relasi wali tersebut.

## 7. Klien API dan penanganan error

`src/api.js` membungkus `fetch` dalam helper `request` dan objek `api` (`get`, `post`, `put`, `patch`, `delete`). Payload JSON dikirim dengan `Content-Type: application/json`. Jika ada sesi, token dikirim pada header autentikasi HTTP dengan skema Bearer; operasi finansial mengirim `Idempotency-Key`.

Response dibaca sebagai teks lalu diparse sebagai JSON. Kegagalan HTTP menjadi `ApiError` yang membawa pesan, status, dan body response. Kegagalan jaringan ditampilkan sebagai pesan koneksi; `AbortError` diteruskan agar pemanggil dapat menangani pembatalan. Komponen sebaiknya menampilkan pesan error backend dan tidak menganggap operasi berhasil jika request gagal atau timeout.

Bentuk field API mengikuti `snake_case`. Nilai saldo/nominal biasanya string desimal sehingga pemformatan angka untuk tampilan harus tidak mengubah nilai yang dikirim kembali ke API.

## 8. Sesi dan keamanan sisi browser

- Access token dan informasi user disimpan di `sessionStorage`, berlaku untuk tab sesi browser dan dihapus saat logout.
- Challenge MFA hanya disimpan di state aplikasi selama alur MFA; jangan menyimpannya sebagai access token.
- Secret/provisioning URI MFA tampil pada halaman enrollment untuk dipindai atau dimasukkan manual. Perlakukan sebagai rahasia: gunakan HTTPS, jangan screenshot/log/menyimpan di tempat lain, dan selesaikan enrollment segera.
- Request profil `/auth/me` memvalidasi ulang sesi saat aplikasi memulihkan token dari `sessionStorage`.
- Jangan menambahkan secret backend ke variabel `VITE_`, local storage, source code, atau log browser.
- Gunakan HTTPS production, batasi origin API, dan pastikan otorisasi tetap diperiksa oleh backend.

`sessionStorage` membatasi persistensi token dibanding penyimpanan permanen browser, tetapi token tetap dapat diakses JavaScript pada halaman yang sama. Pertahankan dependency dan kode UI dari sumber tepercaya serta hindari injeksi HTML tak tepercaya.

## 9. Integritas transaksi dan perilaku UX

Pembelian dan operasi saldo dapat berdampak finansial. UI menunggu konfirmasi server sebelum menampilkan status berhasil. Gunakan key idempotensi untuk menghindari transaksi ganda saat retry:

- Untuk pengiriman baru, gunakan key unik.
- Jika hasil request tidak diketahui karena timeout/koneksi, ulangi request dengan key dan payload yang sama.
- Jangan membuat key baru untuk retry transaksi yang mungkin telah diproses.
- Key yang sama dengan payload berbeda akan ditolak backend.

Backend dapat meminta approval finansial untuk nominal tertentu. Jika response menyatakan approval diperlukan, ikuti alur approval yang disediakan, bukan mencoba mengirim transaksi berulang kali. Format status dan payload lengkap ada di [dokumentasi API](../backend/API_DOCUMENTATION.md).

## 10. Tampilan responsif dan komponen

Layout admin menggunakan navigasi dan tabel/form untuk pengelolaan data. Kasir dan wali memakai `MobileLayout` yang dioptimalkan untuk alur penggunaan ponsel. `ui.jsx` menyediakan komponen layout dan elemen visual umum; helper admin mendukung tabel, pagination, form mutasi, pencarian santri, dan modal. Komponen memakai state React untuk loading, validasi input, error, dan konfirmasi aksi.

Saat mengubah UI, jaga agar pesan loading/error/kosong tetap terlihat; tombol submit tidak boleh mengizinkan pengiriman ganda saat mutasi sedang berlangsung. Pertahankan tampilan mobile dan desktop serta label yang dapat dipahami pengguna.

## 11. Validasi perubahan

Jalankan build untuk memastikan bundler dan import berhasil:

```powershell
cd E:\project-akhir\frontend
npm run build
```

Skrip format saat ini hanya memproses file JavaScript/JSX di `src/components/`:

```powershell
npm run format
```

Belum ada skrip test frontend pada `package.json`. Karena itu, untuk perubahan UI verifikasi juga secara manual di browser: login per role, MFA admin/kasir, navigasi route, tampilan ukuran layar ponsel, kondisi loading/error/kosong, dan alur transaksi pada environment nonproduksi.

## 12. Pemecahan masalah

| Gejala | Pemeriksaan awal |
|---|---|
| Request API tidak tersambung saat development | Pastikan backend aktif pada port `3000` atau perbarui `VITE_API_PROXY_TARGET` lalu restart Vite |
| CORS/network error pada deployment lintas origin | Periksa `VITE_API_BASE_URL`, HTTPS, serta allowlist CORS backend |
| Login berhasil tetapi kembali ke login | Periksa status token melalui `/api/auth/me`, masa berlaku token, dan waktu server |
| Admin/kasir tidak dapat melanjutkan login | Selesaikan enrollment atau verifikasi kode MFA; challenge memiliki masa berlaku terbatas |
| Route menuju halaman awal role | Route dilindungi dan wildcard mengarahkan kembali ke dashboard role; periksa role akun |
| Build masih memakai URL API lama | Ubah environment build `VITE_API_BASE_URL`, lalu jalankan ulang `npm run build` |
| Transaksi tidak pasti berhasil setelah timeout | Jangan membuat key baru; ulangi dengan `Idempotency-Key` dan payload identik atau periksa riwayat transaksi |
