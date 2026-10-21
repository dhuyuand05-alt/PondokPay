# Operasi Keamanan

API ini menangani saldo riil. Jangan mengeksposnya ke internet publik hingga daftar centang (*checklist*) penerapan di bawah ini selesai dan alur pemulihan/persetujuan (*restore/approval*) telah diuji di *staging*.

## Kredensial Rahasia (Secrets) dan Penyediaan Administrator

- `JWT_SECRET` harus terdiri dari minimal 32 bita acak secara kriptografis. Mengubahnya akan membatalkan setiap token akses aktif dan token tantangan MFA.
- `MFA_ENCRYPTION_KEY` dan `BACKUP_ENCRYPTION_KEY` masing-masing harus berupa kunci acak independen sepanjang 32 bita yang dikodekan sebagai 64 karakter heksadesimal. Simpan kunci-kunci ini di pengelola rahasia (*secret manager*), bukan di kontrol sumber (*source control*) atau cadangan database. Kehilangan kunci MFA memerlukan pengaturan ulang MFA terkontrol; kehilangan kunci cadangan membuat cadangan terenkripsi tidak dapat dipulihkan.
- Akun bawaan `admin` / `admin123` yang dikenal dinonaktifkan selama migrasi. Tidak ada administrator bawaan yang dibuat saat awal berjalan (*startup*). Buat administrator hanya setelah migrasi menggunakan `ADMIN_USERNAME` dan `ADMIN_PASSWORD` unik dengan panjang minimal 12 bita dan tidak melebihi batas 72 bita dari bcrypt:

  ```powershell
  $env:ADMIN_USERNAME = "nama-admin-anda"
  $securePassword = Read-Host "Masukkan kata sandi satu kali yang kuat" -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    npm run seed:admin
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
  }
  ```

  Untuk menyetel ulang akun warisan `admin` yang sudah dinonaktifkan, atur `ADMIN_RESET_EXISTING=true` untuk perintah penyediaan. Penyetelan ulang akan menghapus pendaftaran MFA, menaikkan versi token, dan memerlukan pengaturan MFA baru. Jangan masukkan kata sandi sekali pakai ke dalam riwayat *shell*, contoh REST, atau log.
- Akun kasir dan admin tidak dapat menggunakan API hingga TOTP MFA didaftarkan. Respon masuk (*login*) berisi `challenge_token` berumur pendek; gunakan token tersebut dengan `POST /api/auth/mfa/setup`, daftarkan rahasia/URI yang dikembalikan ke dalam aplikasi autentikator, lalu kirimkan kode enam digit ke `POST /api/auth/mfa/verify`. Tampilkan rahasia pendaftaran hanya melalui HTTPS serta jangan mencatat atau menyimpannya secara persisten di sisi klien.
- Token akses berlaku selama satu jam. Keberhasilan masuk dengan MFA akan menaikkan `token_version`; mengubah kata sandi, peran, atau status aktif juga akan menaikkannya. Akun yang dinonaktifkan akan langsung ditolak. Kode MFA hanya diterima sekali per langkah waktu (*time step*).

## Konfigurasi Produksi dan Hak Akses Database

Atur `NODE_ENV=production`, kunci independen yang kuat, `DB_AUTO_MIGRATE=false`, `DB_SSL_CA` ke sertifikat CA database yang tepercaya, dan `TRUST_PROXY_HOPS` ke jumlah pasti proksi yang mengakhiri TLS (*TLS-terminating proxy*) yang tepercaya. API menolak HTTP biasa di lingkungan produksi. Konfigurasikan proksi terbalik (*reverse proxy*) untuk mengalihkan HTTP ke HTTPS, meneruskan `X-Forwarded-Proto`, dan memberlakukan batas laju (*rate limit*) terdistribusinya sendiri. Pembatas API umum dalam proses bersifat per instans; batas masuk/MFA didukung oleh database dan dibagikan di antara berbagai instans.

Jalankan `npm run migrate` dengan akun `MIGRATION_DB_USER` terpisah sebelum menerapkan aplikasi. Batasi akun database waktu jalan (*runtime*) hanya pada DML yang diperlukan; akun tersebut tidak boleh memiliki hak istimewa skema/pemicu (*schema/trigger*). Akun waktu jalan tidak boleh dapat menghapus pengguna, santri, kantin, kredensial, baris buku besar keuangan, log audit, atau catatan persetujuan. Berikan izin baca/tulis aplikasi secara luas hanya jika aplikasi menggunakan database khusus yang tidak berisi tabel yang tidak terkait; berikan izin hapus hanya untuk penghubung relasi dan pembersihan batas laju:

```sql
GRANT SELECT, INSERT, UPDATE ON db_cashless_santri.* TO 'cashless_app'@'%';
GRANT DELETE ON db_cashless_santri.wali_santri TO 'cashless_app'@'%';
GRANT DELETE ON db_cashless_santri.kantin_kasir TO 'cashless_app'@'%';
GRANT DELETE ON db_cashless_santri.security_rate_limits TO 'cashless_app'@'%';
```

Aplikasi menonaktifkan akun/santri/kantin dan memblokir kredensial alih-alih menghapusnya. Tabel buku besar keuangan juga memiliki pemicu database yang menolak pembaruan dan penghapusan. Jaga agar kredensial migrasi tetap terpisah, dikontrol secara ketat, dan tidak dapat diakses oleh proses API yang sedang berjalan. Gunakan akun MySQL yang berbeda untuk setiap lingkungan dan batasi akses jaringan ke akun tersebut.

## Kontrol Keuangan dan Audit

- `FINANCIAL_DUAL_APPROVAL_THRESHOLD` adalah jumlah dalam mata uang database di mana pengisian saldo (*top-up*) santri, penarikan saldo santri, dan penarikan kantin memerlukan admin aktif kedua yang berbeda. Nilai bawaannya adalah `500000`; atur nilainya sesuai kebijakan yang disetujui institusi sebelum penerapan.
- Pemohon membuat `POST /api/admin/financial-approvals`; admin lain yang diautentikasi dengan MFA menyetujui atau menolaknya. Pemohon kemudian mengirimkan operasi keuangan yang cocok dengan menyertakan `approval_id`. Jumlah, target, tindakan, dan deskripsi harus cocok; persetujuan kedaluwarsa setelah 24 jam dan digunakan secara atomik bersama pembaruan saldo.
- Penjualan kasir, pengisian saldo oleh admin, penarikan santri, dan penarikan kantin bersifat atomik dan memerlukan `Idempotency-Key` yang unik. Menggunakan kembali kunci yang sama dengan payload yang cocok akan mengembalikan hasil asli tanpa mengubah saldo; menggunakannya kembali untuk operasi lain akan ditolak. Jangan pernah mencoba ulang transaksi dengan kunci baru sebelum status sebelumnya diketahui.
- Permintaan terautentikasi yang melakukan mutasi akan diaudit sebelum dieksekusi; jika penyisipan audit gagal, mutasi akan ditolak. Entri audit mengabaikan badan permintaan (*request body*), kata sandi, token, nilai RFID, dan pengenal sidik jari. Hasil autentikasi dicatat tanpa kredensial. Baris audit tidak dapat dihapus atau ditulis ulang melalui aplikasi.
- Lakukan rekonsiliasi saldo santri/kantin terhadap buku besar *append-only* secara berkala. Berikan peringatan jika terjadi kegagalan penulisan audit, lonjakan percobaan masuk yang ditolak, perubahan saldo yang tak terduga, aktivitas persetujuan, dan kegagalan API yang berulang. Batasi akses log audit dan tentukan masa retensi sesuai dengan ketentuan keuangan/privasi yang berlaku.
- Nilai RFID/sidik jari dalam skema ini adalah pengenal, bukan templat biometrik. Jangan menyimpan gambar/templat sidik jari di sini; simpan templat biometrik pada perangkat/penyedia dan gunakan pengenal yang dapat dicabut saja (*revocable identifiers*).

## Cadangan Terenkripsi dan Uji Pemulihan (*Restore*)

Instal alat klien MySQL (`mysqldump` dan `mysql`) pada host cadangan. Atur `BACKUP_DIR` ke jalur terlindungi di luar pohon sumber (*source tree*) dan gunakan `BACKUP_ENCRYPTION_KEY` terpisah. Konfigurasikan `BACKUP_DB_USER` sebagai akun khusus untuk *dump* dengan hak istimewa MySQL yang diperlukan untuk melakukan *dump*, bukan sebagai pengguna waktu jalan atau migrasi. Perintah `npm run backup` membuat *dump* terenkripsi AES-256-GCM; simpan salinannya di luar lokasi (*off-site*) dengan akses terbatas dan simpan kunci dekripsinya secara terpisah.

Pada interval yang dijadwalkan, pulihkan cadangan ke dalam database *staging* baru yang kosong (jangan pernah ke database produksi):

Skrip pemulihan memverifikasi tag autentikasi AES-GCM sebelum menjalankan MySQL. SQL yang telah didekripsi disimpan sementara di direktori temporer dan direktori tersebut dihapus setelah pemulihan; pastikan penyimpanan temporer host terlindungi.

```powershell
mysql --host=$env:DB_HOST --user=$env:MIGRATION_DB_USER -e "CREATE DATABASE cashless_restore_test"
npm run restore -- "C:\secure-backups\cashless-latest.csbk" cashless_restore_test
```

Verifikasi jumlah baris, rekonsiliasi buku besar ke saldo, masuk/MFA, dan pembacaan transaksi perwakilan di *staging*. Catat durasi pemulihan dan hasilnya. Cadangan tidak dianggap valid hingga uji pemulihan berhasil dilakukan.

## Catatan Operasional

- Batas laju menggunakan jendela waktu 15 menit: maksimal 5 percobaan kata sandi per pasang IP/nama pengguna, 30 per IP, dan 10 percobaan MFA per IP. Kunci *bucket* persetujuan di-hash menggunakan HMAC; kata sandi mentah dan nama pengguna tidak disimpan di tabel batas laju.
- Jaga agar log aplikasi bebas dari badan permintaan dan rahasia. Amankan dan rotasi file `.env`; jangan pernah memasukkannya ke kontrol sumber (*commit*).
- Rotasi kunci JWT sebagai bagian dari penanganan insiden atau prosedur berkala. Rotasi kunci enkripsi MFA hanya boleh dilakukan dengan migrasi dekripsi/enkripsi ulang yang terencana serta cadangan yang telah diverifikasi.