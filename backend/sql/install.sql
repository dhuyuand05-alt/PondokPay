-- Instalasi skema baru PondokPay.
-- Jalankan dari direktori backend menggunakan mysql:
-- mysql -u root -p < sql/install.sql
--
-- SOURCE memakai path relatif terhadap direktori kerja mysql client.

CREATE DATABASE IF NOT EXISTS db_cashless_santri
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_cashless_santri;

SOURCE sql/users.sql
SOURCE sql/admin_api.sql

SELECT 'Skema PondokPay selesai dipasang.' AS status;
