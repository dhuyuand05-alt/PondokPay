# Panduan Instalasi PondokPay di VPS dan Domain

Panduan ini memasang PondokPay pada satu VPS Ubuntu 24.04 dengan MySQL, Node.js, Nginx, dan sertifikat HTTPS Let's Encrypt. Frontend dan API disajikan pada domain yang sama; Nginx mengirim `/api` ke backend Node.js, sehingga tidak perlu mengaktifkan CORS lintas origin.

> Lakukan instalasi dan pengujian lebih dahulu pada staging. Aplikasi mengelola saldo finansial; siapkan backup, uji pemulihan, dua akun admin untuk alur approval, serta prosedur pemantauan sebelum menerima transaksi nyata.

## 1. Prasyarat dan persiapan domain

Siapkan:

- VPS Ubuntu 24.04 dengan alamat IPv4 publik, akses SSH `sudo`, dan storage yang cukup.
- Nama domain yang Anda miliki, misalnya `pondokpay.example.id`.
- Akses DNS untuk domain tersebut.
- Repository GitHub PondokPay yang dapat dibaca VPS.
- Nilai kebijakan nominal pada `FINANCIAL_DUAL_APPROVAL_THRESHOLD`.

Di panel DNS, buat record:

| Jenis | Nama | Nilai |
|---|---|---|
| `A` | `@` atau subdomain aplikasi | IPv4 VPS |
| `A` | `www` bila dipakai | IPv4 VPS |
| `AAAA` | nama yang sama | IPv6 VPS hanya jika server benar-benar dikonfigurasi untuk IPv6 |

Jangan menambahkan `AAAA` ke IPv6 yang tidak aktif. Tunggu propagasi DNS sebelum meminta sertifikat. Perintah berikut dapat memeriksa hasil dari komputer lokal atau VPS:

```bash
dig +short pondokpay.example.id A
dig +short www.pondokpay.example.id A
```

Ganti semua contoh domain, alamat IP, nama database, dan nilai konfigurasi pada langkah berikut dengan nilai milik deployment Anda.

## 2. Amankan VPS dan pasang paket dasar

Masuk melalui SSH menggunakan akun administrator VPS, lalu perbarui sistem dan pasang firewall serta utilitas:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git gnupg openssl ufw nginx mysql-server
```

Izinkan SSH sebelum mengaktifkan firewall agar akses administrasi tidak terputus. Buka HTTP/HTTPS, tetapi jangan membuka port MySQL `3306` atau port Node `3000` ke internet:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Pastikan firewall/security group pada panel penyedia VPS juga hanya mengizinkan SSH, HTTP, dan HTTPS sesuai kebutuhan.

## 3. Pasang Node.js LTS

Contoh ini menggunakan Node.js 22 LTS dari repository resmi NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
npm --version
```

Pastikan `node` minimal versi 20 sebelum memasang dependency frontend/backend.

## 4. Buat akun service dan ambil source code

Buat akun Linux tanpa login interaktif, lalu siapkan direktori aplikasi:

```bash
sudo adduser --system --group --home /opt/pondokpay --shell /usr/sbin/nologin pondokpay
sudo install -d -o pondokpay -g pondokpay /opt/pondokpay
```

Klon repository. Jika repository publik:

```bash
sudo -u pondokpay git clone https://github.com/dhuyuand05-alt/PondokPay.git /opt/pondokpay
```

Jika repository privat, pasang read-only deploy key untuk akun `pondokpay`, tambahkan public key sebagai deploy key di GitHub, verifikasi host key GitHub, lalu klon menggunakan SSH:

```bash
sudo -u pondokpay git clone git@github.com:dhuyuand05-alt/PondokPay.git /opt/pondokpay
```

Jangan menaruh token GitHub di URL remote, source, atau file yang dapat dibaca publik. Untuk pembaruan, gunakan akun deploy yang berwenang; jangan menjalankan `git pull` sebagai service account jika proses deploy tidak memerlukannya.

## 5. Konfigurasikan MySQL dengan TLS lokal

Backend mode produksi mensyaratkan `DB_SSL_CA`. Untuk MySQL pada VPS yang sama, bagian ini membuat CA lokal dan sertifikat server dengan SAN `localhost` serta `127.0.0.1`, lalu mewajibkan koneksi TCP database menggunakan TLS.

Buat CA dan sertifikat server:

```bash
sudo install -d -o root -g mysql -m 750 /etc/mysql/pondokpay-ssl
sudo openssl genrsa -out /etc/mysql/pondokpay-ssl/ca-key.pem 4096
sudo openssl req -x509 -new -nodes \
  -key /etc/mysql/pondokpay-ssl/ca-key.pem \
  -sha256 -days 3650 \
  -out /etc/mysql/pondokpay-ssl/ca.pem \
  -subj "/CN=PondokPay MySQL CA"
sudo openssl genrsa -out /etc/mysql/pondokpay-ssl/server-key.pem 2048
sudo openssl req -new \
  -key /etc/mysql/pondokpay-ssl/server-key.pem \
  -out /etc/mysql/pondokpay-ssl/server.csr \
  -subj "/CN=localhost"
```

Buat ekstensi sertifikat server dan tanda tangani dengan CA:

```bash
sudo tee /etc/mysql/pondokpay-ssl/server-ext.cnf >/dev/null <<'EOF'
[server_cert]
subjectAltName = DNS:localhost,IP:127.0.0.1
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
EOF

sudo openssl x509 -req \
  -in /etc/mysql/pondokpay-ssl/server.csr \
  -CA /etc/mysql/pondokpay-ssl/ca.pem \
  -CAkey /etc/mysql/pondokpay-ssl/ca-key.pem \
  -CAcreateserial \
  -out /etc/mysql/pondokpay-ssl/server-cert.pem \
  -days 825 -sha256 \
  -extfile /etc/mysql/pondokpay-ssl/server-ext.cnf \
  -extensions server_cert
sudo chown mysql:mysql /etc/mysql/pondokpay-ssl/server-key.pem /etc/mysql/pondokpay-ssl/server-cert.pem
sudo chmod 640 /etc/mysql/pondokpay-ssl/server-key.pem
sudo chmod 644 /etc/mysql/pondokpay-ssl/server-cert.pem
sudo openssl verify -CAfile /etc/mysql/pondokpay-ssl/ca.pem /etc/mysql/pondokpay-ssl/server-cert.pem
```

Jaga `ca-key.pem` tetap rahasia dan jangan menyalinnya ke aplikasi. Berikan aplikasi hanya sertifikat publik CA:

```bash
sudo install -d -o root -g root -m 755 /etc/pondokpay
sudo install -o root -g root -m 644 \
  /etc/mysql/pondokpay-ssl/ca.pem /etc/pondokpay/mysql-ca.pem
```

Tambahkan konfigurasi server MySQL:

```bash
sudo tee /etc/mysql/mysql.conf.d/pondokpay-tls.cnf >/dev/null <<'EOF'
[mysqld]
bind-address = 127.0.0.1
require_secure_transport = ON
ssl-ca = /etc/mysql/pondokpay-ssl/ca.pem
ssl-cert = /etc/mysql/pondokpay-ssl/server-cert.pem
ssl-key = /etc/mysql/pondokpay-ssl/server-key.pem
EOF

sudo systemctl enable --now mysql
sudo systemctl restart mysql
sudo systemctl status mysql --no-pager
```

Uji koneksi lokal melalui socket administratif dan pastikan TLS aktif:

```bash
sudo mysql -e "SHOW VARIABLES LIKE 'require_secure_transport'; SHOW STATUS LIKE 'Ssl_server_not%';"
```

Jika MySQL gagal mulai, baca `sudo journalctl -u mysql -n 100 --no-pager` dan periksa hak baca file sertifikat serta log MySQL sebelum melanjutkan.

## 6. Pasang seluruh skema database

Skrip lengkap membuat database `db_cashless_santri`, tabel aplikasi, indeks, foreign key, serta trigger proteksi ledger, audit, dan approval. Jalankan dari direktori backend agar perintah `SOURCE` di skrip menemukan dua file SQL pendukung:

```bash
cd /opt/pondokpay/backend
sudo mysql < sql/install.sql
sudo mysql db_cashless_santri -e "SHOW TABLES;"
```

Tabel utama yang dibuat adalah `users`, `santri`, `kantin`, `credentials_auth`, `transaksi`, `kantin_transaksi`, `kantin_kasir`, `wali_santri`, `audit_logs`, `financial_approvals`, dan `security_rate_limits`.

Skrip menggunakan `CREATE TABLE IF NOT EXISTS` untuk tabel; trigger dengan nama yang sama akan dibuat ulang. Skrip bukan alat upgrade penuh untuk tabel lama yang memiliki kolom berbeda dan tidak menghapus data. Untuk schema lama, buat backup terlebih dahulu lalu jalankan migrasi aplikasi secara terkontrol.

## 7. Buat user database terpisah

Buat dua password acak hex agar aman digunakan di literal SQL dan file environment:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Simpan hasilnya di password manager. Masuk ke MySQL administratif:

```bash
sudo mysql
```

Ganti placeholder di bawah dengan password berbeda yang baru dibuat:

```sql
CREATE USER 'pondokpay_app'@'127.0.0.1' IDENTIFIED BY 'GANTI_DENGAN_PASSWORD_APLIKASI';
GRANT SELECT, INSERT, UPDATE ON db_cashless_santri.* TO 'pondokpay_app'@'127.0.0.1';
GRANT DELETE ON db_cashless_santri.wali_santri TO 'pondokpay_app'@'127.0.0.1';
GRANT DELETE ON db_cashless_santri.kantin_kasir TO 'pondokpay_app'@'127.0.0.1';
GRANT DELETE ON db_cashless_santri.security_rate_limits TO 'pondokpay_app'@'127.0.0.1';

CREATE USER 'pondokpay_migrator'@'127.0.0.1' IDENTIFIED BY 'GANTI_DENGAN_PASSWORD_MIGRATOR';
GRANT ALL PRIVILEGES ON db_cashless_santri.* TO 'pondokpay_migrator'@'127.0.0.1';

CREATE USER 'pondokpay_backup'@'127.0.0.1' IDENTIFIED BY 'GANTI_DENGAN_PASSWORD_BACKUP';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT, LOCK TABLES
    ON db_cashless_santri.* TO 'pondokpay_backup'@'127.0.0.1';

EXIT;
```

User `pondokpay_app` digunakan oleh API dan provisioning admin; user ini tidak dapat mengubah skema atau menghapus ledger. User `pondokpay_migrator` hanya digunakan saat migrasi, lalu tidak dipasang sebagai kredensial runtime. Sesuaikan strategi rotasi dan izin dengan kebijakan operasional.

User backup hanya untuk `mysqldump`. Jika versi MySQL menolak pembacaan definisi stored routine, berikan privilege `SHOW_ROUTINE` yang didukung versi MySQL tersebut hanya setelah meninjau cakupan privilege; jangan menggantinya dengan hak administrator. Script backup juga memerlukan program `mysqldump`, yang disediakan paket MySQL server/client pada VPS.

## 8. Pasang dependency dan siapkan environment backend

Install dependency yang dikunci lockfile:

```bash
sudo -u pondokpay npm ci --prefix /opt/pondokpay/backend
sudo install -o root -g pondokpay -m 640 /dev/null /etc/pondokpay/backend.env
sudo nano /etc/pondokpay/backend.env
```

Isi file environment dengan nilai produksi, tanpa komentar atau placeholder:

```dotenv
NODE_ENV=production
PORT=3000
TRUST_PROXY_HOPS=1
DB_AUTO_MIGRATE=false

JWT_SECRET=GANTI_DENGAN_MINIMAL_32_BYTE_ACAK
MFA_ENCRYPTION_KEY=GANTI_DENGAN_64_KARAKTER_HEX
BACKUP_ENCRYPTION_KEY=GANTI_DENGAN_KUNCI_HEX_64_KARAKTER_LAIN
FINANCIAL_DUAL_APPROVAL_THRESHOLD=500000

DB_HOST=127.0.0.1
DB_NAME=db_cashless_santri
DB_USER=pondokpay_app
DB_PASSWORD=GANTI_DENGAN_PASSWORD_APLIKASI
DB_SSL_CA=/etc/pondokpay/mysql-ca.pem

MIGRATION_DB_USER=pondokpay_migrator
MIGRATION_DB_PASSWORD=GANTI_DENGAN_PASSWORD_MIGRATOR

BACKUP_DB_USER=pondokpay_backup
BACKUP_DB_PASSWORD=GANTI_DENGAN_PASSWORD_BACKUP
BACKUP_DIR=/var/backups/pondokpay
```

Buat kunci independen menggunakan generator kriptografis, misalnya:

```bash
openssl rand -hex 32
```

Gunakan hasil terpisah untuk `MFA_ENCRYPTION_KEY` dan `BACKUP_ENCRYPTION_KEY`; simpan cadangan kunci secara aman di luar VPS. `JWT_SECRET` minimal 32 byte acak, dapat diisi dengan hasil `openssl rand -hex 32`. Atur threshold sesuai kebijakan lembaga dan mata uang database. Kunci MFA/backup yang hilang tidak dapat dipulihkan dari ciphertext.

Simpan file dengan izin ketat:

```bash
sudo chown root:pondokpay /etc/pondokpay/backend.env
sudo chmod 640 /etc/pondokpay/backend.env
```

Pastikan password pada `BACKUP_DB_PASSWORD` cocok dengan user backup di database. Simpan kredensial backup di file environment yang sama hanya jika dibatasi aksesnya, atau gunakan unit/tugas backup terpisah dengan file rahasia yang dilindungi.

## 9. Jalankan migrasi dan tes koneksi backend

Skema SQL sudah dibuat pada langkah sebelumnya. Jalankan migrator untuk memastikan skema sesuai versi aplikasi. Perintah berikut memuat kredensial dari file environment ke proses shell sementara:

```bash
cd /opt/pondokpay/backend
sudo -u pondokpay bash -c '
  set -a
  . /etc/pondokpay/backend.env
  set +a
  npm run migrate
'
```

Pastikan file environment berisi format assignment sederhana yang dapat dibaca shell: jangan gunakan karakter shell khusus yang tidak di-quote dengan benar. Contoh kunci hex dan path pada panduan ini aman digunakan.

Jika gagal koneksi TLS, pastikan `DB_HOST=127.0.0.1` cocok dengan SAN sertifikat, file CA dapat dibaca, MySQL mewajibkan TLS, dan user MySQL host-nya `127.0.0.1`.

## 10. Provision admin pertama

Pembuatan akun admin tidak otomatis dilakukan oleh startup. Buat file sementara dengan izin terbatas yang berisi kredensial koneksi aplikasi dan admin provisioning:

```bash
sudo install -o pondokpay -g pondokpay -m 600 /dev/null /run/pondokpay-seed.env
sudo nano /run/pondokpay-seed.env
```

Isi dengan variabel `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_CA`, `ADMIN_USERNAME`, dan `ADMIN_PASSWORD`. Pilih password admin unik, minimal 12 byte dan maksimal 72 byte; jangan memakai password contoh atau mengirimkannya melalui chat/log. Jalankan provisioning sebagai one-shot service:

```bash
sudo systemd-run --wait --pipe --collect \
  --unit=pondokpay-seed \
  --property=User=pondokpay \
  --property=WorkingDirectory=/opt/pondokpay/backend \
  --property=EnvironmentFile=/run/pondokpay-seed.env \
  /usr/bin/node scripts/seedAdmin.js
sudo rm -f /run/pondokpay-seed.env
```

Pastikan hasil perintah menyatakan admin berhasil dibuat. Login pertama admin akan meminta enrollment MFA; daftarkan authenticator lewat HTTPS dan simpan recovery/akses authenticator sesuai prosedur lembaga. Buat akun admin kedua melalui halaman pengelolaan user untuk kebutuhan persetujuan dua pihak, lalu selesaikan enrollment MFA akun tersebut juga.

## 11. Build frontend untuk production

Frontend menggunakan `/api` sebagai default base URL. Karena Nginx menyajikan frontend dan proxy API pada origin yang sama, biarkan `VITE_API_BASE_URL` tidak disetel:

```bash
sudo -u pondokpay npm ci --prefix /opt/pondokpay/frontend
sudo -u pondokpay npm run build --prefix /opt/pondokpay/frontend
test -f /opt/pondokpay/frontend/dist/index.html
```

`VITE_API_BASE_URL` adalah konfigurasi build-time dan nilainya masuk bundle browser; jangan taruh rahasia backend di variabel berawalan `VITE_`.

## 12. Daftarkan backend sebagai service systemd

Buat unit service:

```bash
sudo tee /etc/systemd/system/pondokpay.service >/dev/null <<'EOF'
[Unit]
Description=PondokPay API
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=pondokpay
Group=pondokpay
WorkingDirectory=/opt/pondokpay/backend
EnvironmentFile=/etc/pondokpay/backend.env
ExecStart=/usr/bin/node index.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/backups/pondokpay

[Install]
WantedBy=multi-user.target
EOF
```

Buat direktori backup sebelum menjalankan service dan berikan akses ke akun service hanya jika backend benar-benar melakukan backup:

```bash
sudo install -d -o pondokpay -g pondokpay -m 750 /var/backups/pondokpay
sudo systemctl daemon-reload
sudo systemctl enable --now pondokpay
sudo systemctl status pondokpay --no-pager
sudo journalctl -u pondokpay -n 100 --no-pager
```

Tes backend dari VPS sebelum mengatur Nginx:

```bash
curl --fail http://127.0.0.1:3000/
```

Jika service tidak aktif, periksa konfigurasi environment, migrasi, izin database, CA TLS, dan journal. Port `3000` tidak perlu dibuka di firewall.

Sebelum menerima data nyata, uji backup terenkripsi ke direktori yang terlindungi:

```bash
sudo -u pondokpay bash -c '
  set -a
  . /etc/pondokpay/backend.env
  set +a
  cd /opt/pondokpay/backend
  npm run backup
'
```

Jadwalkan backup terenkripsi dan salinan off-site menggunakan mekanisme terkelola di lingkungan Anda. Uji pemulihannya ke database staging baru, bukan database produksi.

## 13. Konfigurasikan Nginx untuk domain dan SPA

Ganti `pondokpay.example.id` pada konfigurasi dengan domain sebenarnya:

```bash
sudo tee /etc/nginx/sites-available/pondokpay >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name pondokpay.example.id www.pondokpay.example.id;

    root /opt/pondokpay/frontend/dist;
    index index.html;
    client_max_body_size 1m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/pondokpay /etc/nginx/sites-enabled/pondokpay
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Gunakan `listen [::]:80` hanya bila IPv6 telah diaktifkan dengan benar pada VPS dan DNS. Verifikasi domain mengarah ke VPS dan halaman dapat diakses melalui HTTP sebelum melanjutkan.

## 14. Aktifkan HTTPS dan kaitkan domain

Pasang Certbot dan minta sertifikat untuk nama domain yang benar-benar diarahkan ke VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pondokpay.example.id -d www.pondokpay.example.id
```

Ikuti prompt Certbot untuk alamat email, persetujuan, dan redirect HTTP ke HTTPS. Jika tidak menggunakan `www`, hilangkan hostname `www` dari DNS, Nginx, dan perintah Certbot. Tes pembaruan otomatis:

```bash
sudo certbot renew --dry-run
```

Sesudah sertifikat aktif, cek `https://pondokpay.example.id`, refresh halaman dalam route SPA, lalu login dan periksa request API. Pastikan request `/api/...` tetap menuju origin domain yang sama.

Middleware backend produksi memeriksa HTTPS melalui `X-Forwarded-Proto`; konfigurasi Nginx di atas meneruskan nilai `$scheme`, dan `TRUST_PROXY_HOPS=1` mempercayai tepat satu proxy di depan Node. Jangan menaikkan nilai ini kecuali topologi proxy benar-benar memerlukannya.

## 15. Verifikasi instalasi sebelum digunakan

Lakukan pemeriksaan berikut:

1. `https://pondokpay.example.id` menampilkan aplikasi, termasuk setelah refresh pada route seperti `/admin`.
2. Endpoint `https://pondokpay.example.id/api/...` hanya dapat diakses melalui API dan responsnya sesuai.
3. Port publik yang dibuka hanya SSH, HTTP, dan HTTPS; MySQL dan Node tidak dapat diakses dari internet.
4. Admin dapat login dan menyelesaikan MFA melalui HTTPS; buat dan uji login kasir serta wali di staging.
5. Dua admin berbeda dapat mengajukan dan memutuskan approval; transaksi membutuhkan approval yang cocok jika di atas ambang.
6. Lakukan transaksi staging dan periksa saldo, ledger, audit, dan perilaku retry `Idempotency-Key`.
7. Jalankan backup terenkripsi, kemudian restore ke database staging kosong dan verifikasi rekonsiliasi. Jangan menguji restore di database production.
8. Uji pemulihan VPS dan database dari backup sesuai target waktu pemulihan organisasi.

Daftar endpoint, payload, status error, dan perilaku idempotensi terdapat di [API_DOCUMENTATION.md](./API_DOCUMENTATION.md). Kebijakan database, audit, backup, dan hardening tambahan terdapat di [SECURITY_OPERATIONS.md](./SECURITY_OPERATIONS.md).

## 16. Operasi harian dan pembaruan aplikasi

Log dan status service:

```bash
sudo systemctl status pondokpay --no-pager
sudo journalctl -u pondokpay -f
sudo nginx -t
```

Untuk memperbarui source setelah meninjau perubahan pada branch yang dideploy:

```bash
sudo systemctl stop pondokpay
sudo -u pondokpay git -C /opt/pondokpay fetch origin
sudo -u pondokpay git -C /opt/pondokpay pull --ff-only origin main
sudo -u pondokpay npm ci --prefix /opt/pondokpay/backend
sudo -u pondokpay npm ci --prefix /opt/pondokpay/frontend
sudo -u pondokpay bash -c '
  set -a
  . /etc/pondokpay/backend.env
  set +a
  cd /opt/pondokpay/backend
  npm run migrate
'
sudo -u pondokpay npm run build --prefix /opt/pondokpay/frontend
sudo systemctl start pondokpay
sudo systemctl status pondokpay --no-pager
```

Sebelum pembaruan, baca perubahan skema dan backup database. Jangan jalankan migrasi otomatis pada startup produksi (`DB_AUTO_MIGRATE` harus tetap `false`). Jika deploy gagal, periksa journal dan ikuti prosedur rollback aplikasi/database yang sudah diuji; jangan membatalkan perubahan skema secara manual tanpa backup.

## 17. Pemecahan masalah umum

| Gejala | Pemeriksaan |
|---|---|
| Certbot gagal validasi | Pastikan DNS A mengarah ke VPS, port 80 dibuka di firewall/security group, dan server block Nginx benar |
| Nginx menampilkan 502 | Periksa `systemctl status pondokpay`, journal, port `3000`, serta env backend |
| API menolak HTTP di belakang Nginx | Periksa `X-Forwarded-Proto $scheme` dan `TRUST_PROXY_HOPS=1` |
| API gagal koneksi MySQL/TLS | Periksa sertifikat CA, SAN `127.0.0.1`, `DB_HOST`, user/host MySQL, dan journal MySQL |
| Browser gagal memuat API | Periksa proxy `/api/`, HTTPS, Nginx error log, serta base URL hasil build |
| Login admin tidak bisa selesai | Periksa waktu VPS (`timedatectl`), MFA enrollment, dan kecocokan kunci MFA |
| Migrasi gagal permission | Gunakan kredensial migrator hanya untuk `npm run migrate`; jangan menambah hak schema ke user runtime |
| Pemulihan gagal tag AES-GCM | Backup berubah/rusak atau kunci salah; jangan meneruskan hasil dekripsi ke MySQL |

Jangan membagikan isi file environment, token, secret MFA, password database/admin, private key, atau dump database saat meminta bantuan.
