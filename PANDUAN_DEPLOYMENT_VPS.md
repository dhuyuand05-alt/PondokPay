# Panduan Instalasi PondokPay di VPS Hostinger dan Domain

Panduan ini memasang PondokPay pada VPS Ubuntu Hostinger menggunakan MySQL, Node.js, Nginx, dan HTTPS Let's Encrypt. Seluruh source code dan hasil build frontend disimpan di `/var/www/pondokpay`. Frontend dan API disajikan pada domain yang sama; Nginx mengirim `/api/` ke backend Node.js sehingga tidak perlu CORS lintas origin.

Contoh pada panduan ini disesuaikan untuk:

- IP VPS: `187.77.125.178`
- Domain: `pondokpay.alhikamlimbangan.org` (tanpa `www`)
- Repository: `https://github.com/dhuyuand05-alt/PondokPay.git`
- Direktori aplikasi: `/var/www/pondokpay`

Jika IP/domain berbeda saat panduan dijalankan, ubah nilai tersebut sebelum menyalin perintah.

> Lakukan instalasi dan pengujian lebih dahulu pada staging. Aplikasi mengelola saldo finansial; siapkan backup, uji pemulihan, dua akun admin untuk alur approval, serta prosedur pemantauan sebelum menerima transaksi nyata.

## 1. Prasyarat dan persiapan domain

Siapkan:

- VPS Hostinger Ubuntu 22.04 atau 24.04 dengan akses SSH ke akun yang dapat menjalankan `sudo` dan storage yang cukup. Perintah administrasi pada panduan ini dijalankan sebagai `root`.
- Domain `pondokpay.alhikamlimbangan.org` dan akses panel DNS domain.
- Akses DNS untuk domain tersebut.
- Repository GitHub PondokPay yang dapat dibaca VPS (repository saat ini publik).
- Nilai kebijakan nominal pada `FINANCIAL_DUAL_APPROVAL_THRESHOLD`.

Di panel DNS, buat record:

| Jenis | Nama | Nilai |
|---|---|---|
| `A` | `pondokpay` | `187.77.125.178` |

Tidak perlu record `www` untuk konfigurasi panduan ini. Jangan menambahkan `AAAA` kecuali IPv6 VPS benar-benar aktif dan diarahkan dengan benar. Domain sebelumnya sudah terdeteksi mengarah ke IP VPS, tetapi cek lagi dari VPS sebelum meminta sertifikat:

```bash
apt update && apt install -y dnsutils
dig +short pondokpay.alhikamlimbangan.org A
```

Hasil A record harus `187.77.125.178`. Jika tidak, perbaiki record di panel DNS dan tunggu propagasi.

## 2. Amankan VPS dan pasang paket dasar

Pada percobaan sebelumnya, login SSH sebagai `root` ditolak. Banyak image VPS menonaktifkan login root langsung; gunakan nama user SSH yang diberikan Hostinger (atau buka Console dari hPanel), lalu naikkan hak menjadi root:

```powershell
ssh USER_SSH_HOSTINGER@187.77.125.178
```

Di terminal VPS:

```bash
sudo -i
```

Lanjutkan panduan setelah prompt menunjukkan root. Jika user SSH tidak memiliki `sudo`, aktifkan/atur akses melalui Console atau Recovery pada hPanel; jangan mengaktifkan login root/password SSH ke internet sebagai jalan pintas. Perintah berikut mengasumsikan shell sudah root.

Periksa sistem dan layanan yang sudah berjalan sebelum mengubah firewall atau konfigurasi server:

```bash
whoami
. /etc/os-release && echo "$PRETTY_NAME"
df -h /
free -h
systemctl --no-pager --type=service --state=running
ss -lntup
```

Jika VPS sudah melayani website lain, jangan menghapus konfigurasi Nginx atau mengubah firewall secara membabi buta; tambahkan virtual host PondokPay secara terpisah. Perbarui sistem dan pasang paket:

```bash
apt update
apt upgrade -y
apt install -y ca-certificates curl git gnupg openssl nginx mysql-server dnsutils
```

**Jangan aktifkan UFW sebelum memastikan port SSH Hostinger yang benar.** Jika SSH memakai port selain `22`, izinkan port tersebut lebih dahulu atau kelola firewall dari Hostinger hPanel. Jangan membuka MySQL `3306` atau Node `3000` ke internet. Jika SSH menggunakan port 22:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw status
```

Aktifkan `ufw enable` hanya setelah aturan SSH di atas sesuai port aktual dan Anda memiliki akses console/recovery Hostinger. Pastikan firewall/security group hPanel juga mengizinkan SSH, HTTP, dan HTTPS.

## 3. Pasang Node.js LTS

Contoh ini menggunakan Node.js 22 LTS dari repository resmi NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
bash /tmp/nodesource_setup.sh
apt install -y nodejs
node --version
npm --version
```

Pastikan `node` minimal versi 20 sebelum memasang dependency frontend/backend.

## 4. Buat akun service dan ambil source code

Buat akun Linux tanpa login interaktif agar proses Node tidak berjalan sebagai root. Source code dan hasil build akan berada di `/var/www/pondokpay`, tetapi konfigurasi rahasia tetap berada di `/etc/pondokpay`:

```bash
adduser --system --group --home /var/www/pondokpay --shell /usr/sbin/nologin pondokpay
install -d -o pondokpay -g pondokpay /var/www/pondokpay
```

Klon repository publik:

```bash
runuser -u pondokpay -- git clone https://github.com/dhuyuand05-alt/PondokPay.git /var/www/pondokpay
```

Jika muncul pesan `destination path ... already exists and is not an empty directory`, cek dulu isi direktori dengan `ls -la /var/www/pondokpay`. Jangan menghapus direktori jika berisi website atau data; pilih direktori deploy baru atau amankan data sebelum membersihkan.

Pastikan source sudah tersedia: `ls -la /var/www/pondokpay` dan `git -C /var/www/pondokpay status --short --branch`.

Jika perintah ini gagal karena akun `pondokpay` sudah ada, jangan menghapus akun. Pastikan akunnya memang service account proyek (`getent passwd pondokpay`) dan lanjutkan hanya jika direktori `/var/www/pondokpay` berisi repository PondokPay yang benar.

## 5. Konfigurasikan MySQL dengan TLS lokal

Backend mode produksi mensyaratkan `DB_SSL_CA`. Untuk MySQL pada VPS yang sama, bagian ini membuat CA lokal dan sertifikat server dengan SAN `localhost` serta `127.0.0.1`, lalu mewajibkan koneksi TCP database menggunakan TLS.

Buat CA dan sertifikat server:

```bash
install -d -o root -g mysql -m 750 /etc/mysql/pondokpay-ssl
openssl genrsa -out /etc/mysql/pondokpay-ssl/ca-key.pem 4096
openssl req -x509 -new -nodes \
  -key /etc/mysql/pondokpay-ssl/ca-key.pem \
  -sha256 -days 3650 \
  -out /etc/mysql/pondokpay-ssl/ca.pem \
  -subj "/CN=PondokPay MySQL CA"
chmod 600 /etc/mysql/pondokpay-ssl/ca-key.pem
openssl genrsa -out /etc/mysql/pondokpay-ssl/server-key.pem 2048
openssl req -new \
  -key /etc/mysql/pondokpay-ssl/server-key.pem \
  -out /etc/mysql/pondokpay-ssl/server.csr \
  -subj "/CN=localhost"
```

Buat ekstensi sertifikat server dan tanda tangani dengan CA:

```bash
tee /etc/mysql/pondokpay-ssl/server-ext.cnf >/dev/null <<'EOF'
[server_cert]
subjectAltName = DNS:localhost,IP:127.0.0.1
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl x509 -req \
  -in /etc/mysql/pondokpay-ssl/server.csr \
  -CA /etc/mysql/pondokpay-ssl/ca.pem \
  -CAkey /etc/mysql/pondokpay-ssl/ca-key.pem \
  -CAcreateserial \
  -out /etc/mysql/pondokpay-ssl/server-cert.pem \
  -days 825 -sha256 \
  -extfile /etc/mysql/pondokpay-ssl/server-ext.cnf \
  -extensions server_cert
chown mysql:mysql /etc/mysql/pondokpay-ssl/server-key.pem /etc/mysql/pondokpay-ssl/server-cert.pem
chmod 640 /etc/mysql/pondokpay-ssl/server-key.pem
chmod 644 /etc/mysql/pondokpay-ssl/server-cert.pem
openssl verify -CAfile /etc/mysql/pondokpay-ssl/ca.pem /etc/mysql/pondokpay-ssl/server-cert.pem
```

Jaga `ca-key.pem` tetap rahasia dan jangan menyalinnya ke aplikasi. Berikan aplikasi hanya sertifikat publik CA:

```bash
install -d -o root -g root -m 755 /etc/pondokpay
install -o root -g root -m 644 \
  /etc/mysql/pondokpay-ssl/ca.pem /etc/pondokpay/mysql-ca.pem
```

Tambahkan konfigurasi server MySQL:

```bash
tee /etc/mysql/mysql.conf.d/pondokpay-tls.cnf >/dev/null <<'EOF'
[mysqld]
bind-address = 127.0.0.1
require_secure_transport = ON
ssl-ca = /etc/mysql/pondokpay-ssl/ca.pem
ssl-cert = /etc/mysql/pondokpay-ssl/server-cert.pem
ssl-key = /etc/mysql/pondokpay-ssl/server-key.pem
EOF

systemctl enable --now mysql
systemctl restart mysql
systemctl status mysql --no-pager
```

Uji koneksi lokal melalui socket administratif dan pastikan TLS aktif:

```bash
mysql -e "SHOW VARIABLES LIKE 'require_secure_transport'; SHOW VARIABLES LIKE 'have_ssl';"
```

Jika MySQL gagal mulai, baca `journalctl -u mysql -n 100 --no-pager` dan periksa hak baca file sertifikat serta log MySQL sebelum melanjutkan. Jangan meneruskan ke langkah berikutnya sebelum service MySQL berstatus `active`.

## 6. Pasang seluruh skema database

Skrip lengkap membuat database `db_cashless_santri`, tabel aplikasi, indeks, foreign key, serta trigger proteksi ledger, audit, dan approval. Jalankan dari direktori backend agar perintah `SOURCE` di skrip menemukan dua file SQL pendukung:

```bash
cd /var/www/pondokpay/backend
mysql < sql/install.sql
mysql db_cashless_santri -e "SHOW TABLES;"
```

Tabel utama yang dibuat adalah `users`, `institution_settings`, `parent_notification_settings`, `whatsapp_notification_outbox`, `santri`, `kantin`, `credentials_auth`, `transaksi`, `midtrans_topup_payments`, `kantin_transaksi`, `kantin_kasir`, `canteen_payout_approvals`, `canteen_products`, `canteen_sale_items`, `canteen_stock_movements`, `canteen_shifts`, `canteen_held_carts`, `canteen_sale_refunds`, `wali_santri`, `audit_logs`, `financial_approvals`, dan `security_rate_limits`. `institution_settings` diisi dengan nilai contoh; ganti profil, nama aplikasi PWA, dan unggah logo dari menu Pengaturan pondok setelah admin dibuat. Migrator aplikasi menyesuaikan schema instalasi lama, termasuk tabel POS kantin dan tipe transaksi refund.

Untuk notifikasi WhatsApp Baileys, admin memindai QR dari halaman Pengaturan pondok. Sediakan direktori sesi persisten privat untuk akun layanan backend; QR hanya tersedia bagi admin yang sudah login. Gunakan nomor khusus bot karena Baileys memakai protokol WhatsApp Web tidak resmi dan koneksi/nomor dapat dibatasi. Uji pairing, pengiriman notifikasi opt-in, restart backend, dan pemulihan staging sebelum digunakan.

Untuk top-up QRIS, masukkan kredensial Midtrans Sandbox di Pengaturan pondok dan uji alur penuh dari akun wali. Top-up menggunakan Core API QRIS langsung, bukan halaman kanal Snap; aktivasi Core API Production harus diminta ke Midtrans. Daftarkan Payment Notification URL `https://<domain-api>/api/midtrans/notification` di dashboard Midtrans untuk tiap lingkungan. Pastikan webhook dapat diakses publik; `localhost` tidak dapat menerima notifikasi Midtrans kecuali diekspos lewat tunnel publik. Setelah QRIS dan Core API aktif untuk merchant, masukkan kredensial pasangan Production dan daftarkan URL notifikasi Production. Server Key terenkripsi menggunakan `MFA_ENCRYPTION_KEY`; simpan cadangan kunci dengan aman karena kehilangannya membuat Server Key tersimpan tidak dapat dibaca. Biaya QRIS ditanggung pondok dan tidak ditambahkan ke nominal top-up wali.

Skrip menggunakan `CREATE TABLE IF NOT EXISTS` untuk tabel; trigger dengan nama yang sama akan dibuat ulang. Skrip bukan alat upgrade penuh untuk tabel lama yang memiliki kolom berbeda dan tidak menghapus data. Untuk schema lama, buat backup terlebih dahulu lalu jalankan migrasi aplikasi secara terkontrol.

## 7. Buat user database terpisah

Buat password database yang berbeda dan kunci kriptografis. Jalankan perintah berikut satu per satu; simpan hasilnya dengan label yang sesuai di password manager:

```bash
echo "Password DB aplikasi:"; openssl rand -hex 32
echo "Password DB migrator:"; openssl rand -hex 32
echo "Password DB backup:"; openssl rand -hex 32
echo "JWT_SECRET:"; openssl rand -hex 32
echo "MFA_ENCRYPTION_KEY:"; openssl rand -hex 32
echo "BACKUP_ENCRYPTION_KEY:"; openssl rand -hex 32
```

Direktori logo dan sesi WhatsApp harus tetap tersedia setelah deploy ulang dan dapat ditulis oleh akun layanan. Simpan keduanya di luar source tree:

```bash
install -d -o pondokpay -g pondokpay -m 750 /var/lib/pondokpay/uploads
install -d -o pondokpay -g pondokpay -m 700 /var/lib/pondokpay/whatsapp-auth
```

Tambahkan `UPLOAD_DIR=/var/lib/pondokpay/uploads` dan `WHATSAPP_AUTH_DIR=/var/lib/pondokpay/whatsapp-auth` pada `/etc/pondokpay/backend.env`. Folder sesi berisi kredensial tertaut WhatsApp; jangan sajikan ke web server atau masukkan ke backup source biasa. Jika folder sesi hilang, admin harus menghubungkan ulang dengan QR.

Simpan hasilnya di password manager. Masuk ke MySQL administratif:

```bash
mysql
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
runuser -u pondokpay -- npm ci --prefix /var/www/pondokpay/backend
install -o root -g pondokpay -m 640 /dev/null /etc/pondokpay/backend.env
nano /etc/pondokpay/backend.env
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
UPLOAD_DIR=/var/lib/pondokpay/uploads
WHATSAPP_AUTH_DIR=/var/lib/pondokpay/whatsapp-auth

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
chown root:pondokpay /etc/pondokpay/backend.env
chmod 640 /etc/pondokpay/backend.env
```

Pastikan password pada `BACKUP_DB_PASSWORD` cocok dengan user backup di database. Simpan kredensial backup di file environment yang sama hanya jika dibatasi aksesnya, atau gunakan unit/tugas backup terpisah dengan file rahasia yang dilindungi.

## 9. Jalankan migrasi dan tes koneksi backend

Skema SQL sudah dibuat pada langkah sebelumnya. Buat dan verifikasi backup database sebelum menjalankan migrator; migrasi dapat menambah/mengubah enum dan membuat tabel POS kantin untuk shift, keranjang tertahan, refund, serta audit stok. Jalankan migrator sebelum deploy kode yang memakai endpoint tersebut. Perintah berikut memuat kredensial dari file environment ke proses shell sementara:

```bash
cd /var/www/pondokpay/backend
runuser -u pondokpay -- bash -c '
  set -a
  . /etc/pondokpay/backend.env
  set +a
  cd /var/www/pondokpay/backend
  npm run migrate
'
```

Pastikan file environment berisi format assignment sederhana yang dapat dibaca shell: jangan gunakan karakter shell khusus yang tidak di-quote dengan benar. Contoh kunci hex dan path pada panduan ini aman digunakan.

Jika gagal koneksi TLS, pastikan `DB_HOST=127.0.0.1` cocok dengan SAN sertifikat, file CA dapat dibaca, MySQL mewajibkan TLS, dan user MySQL host-nya `127.0.0.1`.

## 10. Provision admin pertama

Pembuatan akun admin tidak otomatis dilakukan oleh startup. Buat file sementara dengan izin terbatas yang berisi kredensial koneksi aplikasi dan admin provisioning:

```bash
install -o pondokpay -g pondokpay -m 600 /dev/null /run/pondokpay-seed.env
nano /run/pondokpay-seed.env
```

Isi dengan variabel `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_CA`, `ADMIN_USERNAME`, dan `ADMIN_PASSWORD`. Pilih password admin unik, minimal 12 byte dan maksimal 72 byte; jangan memakai password contoh atau mengirimkannya melalui chat/log. Jalankan provisioning sebagai one-shot service:

```bash
systemd-run --wait --pipe --collect \
  --unit=pondokpay-seed \
  --property=User=pondokpay \
  --property=WorkingDirectory=/var/www/pondokpay/backend \
  --property=EnvironmentFile=/run/pondokpay-seed.env \
  /usr/bin/node scripts/seedAdmin.js
rm -f /run/pondokpay-seed.env
```

Pastikan hasil perintah menyatakan admin berhasil dibuat. Login pertama admin akan meminta enrollment MFA; daftarkan authenticator lewat HTTPS dan simpan recovery/akses authenticator sesuai prosedur lembaga. Buat akun admin kedua melalui halaman pengelolaan user untuk kebutuhan persetujuan dua pihak, lalu selesaikan enrollment MFA akun tersebut juga.

## 11. Build frontend untuk production

Frontend menggunakan `/api` sebagai default base URL. Karena Nginx menyajikan frontend dan proxy API pada origin yang sama, biarkan `VITE_API_BASE_URL` tidak disetel:

```bash
runuser -u pondokpay -- npm ci --prefix /var/www/pondokpay/frontend
runuser -u pondokpay -- npm run build --prefix /var/www/pondokpay/frontend
test -f /var/www/pondokpay/frontend/dist/index.html
```

`VITE_API_BASE_URL` adalah konfigurasi build-time dan nilainya masuk bundle browser; jangan taruh rahasia backend di variabel berawalan `VITE_`.

Nginx harus bisa membaca file frontend. Pastikan direktori hasil build dapat dilalui/dibaca:

```bash
namei -l /var/www/pondokpay/frontend/dist/index.html
chmod o+x /var/www/pondokpay /var/www/pondokpay/frontend
chmod -R o+rX /var/www/pondokpay/frontend/dist
```

## 12. Daftarkan backend sebagai service systemd

Buat unit service:

```bash
tee /etc/systemd/system/pondokpay.service >/dev/null <<'EOF'
[Unit]
Description=PondokPay API
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=pondokpay
Group=pondokpay
WorkingDirectory=/var/www/pondokpay/backend
EnvironmentFile=/etc/pondokpay/backend.env
ExecStart=/usr/bin/node index.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/backups/pondokpay /var/lib/pondokpay/uploads /var/lib/pondokpay/whatsapp-auth

[Install]
WantedBy=multi-user.target
EOF
```

Buat direktori backup sebelum menjalankan service dan berikan akses ke akun service hanya jika backend benar-benar melakukan backup:

```bash
install -d -o pondokpay -g pondokpay -m 750 /var/backups/pondokpay
install -d -o pondokpay -g pondokpay -m 750 /var/lib/pondokpay/uploads
install -d -o pondokpay -g pondokpay -m 700 /var/lib/pondokpay/whatsapp-auth
systemctl daemon-reload
systemctl enable --now pondokpay
systemctl status pondokpay --no-pager
journalctl -u pondokpay -n 100 --no-pager
```

Tes backend dari VPS sebelum mengatur Nginx:

```bash
curl --fail -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/
```

Jika service tidak aktif, periksa konfigurasi environment, migrasi, izin database, CA TLS, dan journal. Port `3000` tidak perlu dibuka di firewall.

Sebelum menerima data nyata, uji backup terenkripsi ke direktori yang terlindungi:

```bash
runuser -u pondokpay -- bash -c '
  set -a
  . /etc/pondokpay/backend.env
  set +a
  cd /var/www/pondokpay/backend
  npm run backup
'
```

Jadwalkan backup terenkripsi dan salinan off-site menggunakan mekanisme terkelola di lingkungan Anda. Uji pemulihannya ke database staging baru, bukan database produksi.

## 13. Konfigurasikan Nginx untuk domain dan SPA

Konfigurasi berikut hanya melayani `pondokpay.alhikamlimbangan.org`. Backup file konfigurasi bernama sama jika sudah ada, lalu periksa agar konfigurasi website lain tidak tertimpa:

```bash
if [ -e /etc/nginx/sites-available/pondokpay ]; then
  cp -a /etc/nginx/sites-available/pondokpay "/etc/nginx/sites-available/pondokpay.bak.$(date +%Y%m%d%H%M%S)"
fi

tee /etc/nginx/sites-available/pondokpay >/dev/null <<'EOF'
server {
    listen 80;
    server_name pondokpay.alhikamlimbangan.org;

    root /var/www/pondokpay/frontend/dist;
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

if [ ! -e /etc/nginx/sites-enabled/pondokpay ]; then
  ln -s /etc/nginx/sites-available/pondokpay /etc/nginx/sites-enabled/pondokpay
fi
nginx -t
systemctl reload nginx
```

Jangan hapus konfigurasi default atau virtual host website lain. Nginx memilih `server_name` yang cocok; bila file site PondokPay sudah aktif, cukup edit setelah membuat salinan. Verifikasi domain mengarah ke VPS dan halaman dapat diakses melalui HTTP sebelum melanjutkan.

## 14. Aktifkan HTTPS dan kaitkan domain

Pasang Certbot dan minta sertifikat untuk nama domain yang benar-benar diarahkan ke VPS:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d pondokpay.alhikamlimbangan.org
```

Ikuti prompt Certbot untuk alamat email, persetujuan, dan redirect HTTP ke HTTPS. Tes pembaruan otomatis:

```bash
certbot renew --dry-run
```

Sesudah sertifikat aktif, cek `https://pondokpay.alhikamlimbangan.org`, refresh halaman dalam route SPA, lalu login dan periksa request API. Pastikan request `/api/...` tetap menuju origin domain yang sama.

Middleware backend produksi memeriksa HTTPS melalui `X-Forwarded-Proto`; konfigurasi Nginx di atas meneruskan nilai `$scheme`, dan `TRUST_PROXY_HOPS=1` mempercayai tepat satu proxy di depan Node. Jangan menaikkan nilai ini kecuali topologi proxy benar-benar memerlukannya.

## 15. Verifikasi instalasi sebelum digunakan

Lakukan pemeriksaan berikut:

1. `https://pondokpay.alhikamlimbangan.org` menampilkan aplikasi, termasuk setelah refresh pada route seperti `/admin`.
2. Endpoint `https://pondokpay.alhikamlimbangan.org/api/...` hanya dapat diakses melalui API dan responsnya sesuai.
3. Port publik yang dibuka hanya SSH, HTTP, dan HTTPS; MySQL dan Node tidak dapat diakses dari internet.
4. Admin dapat login dan menyelesaikan MFA melalui HTTPS; buat dan uji login kasir serta wali di staging.
5. Uji permintaan pencairan kantin: admin mengajukan, kasir aktif yang ditugaskan mengonfirmasi dari sesi MFA miliknya, lalu admin menjalankan pencairan; jumlah/keterangan yang berbeda atau approval yang dipakai ulang harus ditolak. Uji pula persetujuan admin kedua untuk jumlah di atas ambang.
6. Lakukan transaksi staging dan periksa saldo, ledger, audit, dan perilaku retry `Idempotency-Key`.
7. Jalankan backup terenkripsi, kemudian restore ke database staging kosong dan verifikasi rekonsiliasi. Jangan menguji restore di database production.
8. Uji pemulihan VPS dan database dari backup sesuai target waktu pemulihan organisasi.

Daftar endpoint, payload, status error, dan perilaku idempotensi terdapat di [API_DOCUMENTATION.md](./backend/API_DOCUMENTATION.md). Kebijakan database, audit, backup, dan hardening tambahan terdapat di [SECURITY_OPERATIONS.md](./backend/SECURITY_OPERATIONS.md).

## 16. Operasi harian dan pembaruan aplikasi

Log dan status service:

```bash
systemctl status pondokpay --no-pager
journalctl -u pondokpay -f
nginx -t
```

Untuk memperbarui source setelah meninjau perubahan pada branch yang dideploy:

```bash
systemctl stop pondokpay
runuser -u pondokpay -- git -C /var/www/pondokpay fetch origin
runuser -u pondokpay -- git -C /var/www/pondokpay pull --ff-only origin main
runuser -u pondokpay -- npm ci --prefix /var/www/pondokpay/backend
runuser -u pondokpay -- npm ci --prefix /var/www/pondokpay/frontend
runuser -u pondokpay -- bash -c '
  set -a
  . /etc/pondokpay/backend.env
  set +a
  cd /var/www/pondokpay/backend
  npm run migrate
'
runuser -u pondokpay -- npm run build --prefix /var/www/pondokpay/frontend
chmod -R o+rX /var/www/pondokpay/frontend/dist
systemctl start pondokpay
systemctl status pondokpay --no-pager
```

Sebelum pembaruan, baca perubahan skema dan backup database. Jangan jalankan migrasi otomatis pada startup produksi (`DB_AUTO_MIGRATE` harus tetap `false`). Jika deploy gagal, periksa journal dan ikuti prosedur rollback aplikasi/database yang sudah diuji; jangan membatalkan perubahan skema secara manual tanpa backup.

## 17. Pemecahan masalah umum

| Gejala | Pemeriksaan |
|---|---|
| SSH `Permission denied (publickey)` untuk root | Gunakan username SSH yang ditampilkan di hPanel atau Console VPS; periksa SSH key yang terpasang dan jalankan `sudo -i` setelah berhasil masuk |
| Clone GitHub gagal | Pastikan VPS memiliki DNS/internet keluar; periksa apakah `/var/www/pondokpay` sudah berisi file dari percobaan sebelumnya sebelum mengulang clone |
| `adduser` mengatakan user sudah ada | Periksa `getent passwd pondokpay`; gunakan akun yang sudah ada hanya jika dipastikan milik deployment ini |
| `mysql < sql/install.sql` gagal | Jalankan dari `/var/www/pondokpay/backend`, pastikan MySQL aktif dan user memiliki izin membuat database serta tabel, lalu baca pesan error lengkap dari MySQL |
| `npm ci` gagal | Periksa `node --version` (minimal 20), ruang disk, DNS, dan permission direktori `/var/www/pondokpay` |
| Nginx `permission denied` membaca `index.html` | Jalankan `namei -l /var/www/pondokpay/frontend/dist/index.html` dan pastikan setiap direktori dapat dilalui serta berkas dapat dibaca oleh `www-data` |
| Certbot gagal validasi | Pastikan DNS A mengarah ke VPS, port 80 dibuka di firewall/security group, dan server block Nginx benar |
| Nginx menampilkan 502 | Periksa `systemctl status pondokpay`, journal, port `3000`, serta env backend |
| API menolak HTTP di belakang Nginx | Periksa `X-Forwarded-Proto $scheme` dan `TRUST_PROXY_HOPS=1` |
| API gagal koneksi MySQL/TLS | Periksa sertifikat CA, SAN `127.0.0.1`, `DB_HOST`, user/host MySQL, dan journal MySQL |
| Browser gagal memuat API | Periksa proxy `/api/`, HTTPS, Nginx error log, serta base URL hasil build |
| Login admin tidak bisa selesai | Periksa waktu VPS (`timedatectl`), MFA enrollment, dan kecocokan kunci MFA |
| Migrasi gagal permission | Gunakan kredensial migrator hanya untuk `npm run migrate`; jangan menambah hak schema ke user runtime |
| Pemulihan gagal tag AES-GCM | Backup berubah/rusak atau kunci salah; jangan meneruskan hasil dekripsi ke MySQL |

Jangan membagikan isi file environment, token, secret MFA, password database/admin, private key, atau dump database saat meminta bantuan.

Jika masih gagal, kumpulkan pesan error yang lengkap dari perintah yang gagal beserta keluaran `systemctl status pondokpay --no-pager`, `journalctl -u pondokpay -n 80 --no-pager`, `nginx -t`, dan `journalctl -u mysql -n 80 --no-pager`. Periksa dan hapus dahulu password, token, alamat email privat, serta nilai rahasia sebelum membagikan log.
