-- ================================================================
-- DASHBOARD SMT ELEKTRONIK
-- Script Master — Jalankan Semua Sekaligus
-- ================================================================
-- CARA PAKAI:
-- 1. Buka phpMyAdmin / MySQL Workbench / HeidiSQL
-- 2. Login ke MySQL
-- 3. Buka file ini dan jalankan (Execute All / Ctrl+Enter)
-- ================================================================

-- ============================================
-- LANGKAH 1: Buat database
-- ============================================
CREATE DATABASE IF NOT EXISTS `dashboard_smt`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `dashboard_smt`;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- LANGKAH 2: Drop tabel lama (jika ada)
-- Hati-hati! Ini akan hapus semua data!
-- Uncomment baris di bawah jika ingin reset total
-- ============================================
-- DROP TABLE IF EXISTS `audit_logs`;
-- DROP TABLE IF EXISTS `invoice_items`;
-- DROP TABLE IF EXISTS `invoices`;
-- DROP TABLE IF EXISTS `elektronik`;
-- DROP TABLE IF EXISTS `users`;

-- ============================================
-- LANGKAH 3: Buat tabel users
-- ============================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`         INT           NOT NULL AUTO_INCREMENT,
  `nama`       VARCHAR(150)  NOT NULL,
  `email`      VARCHAR(150)  NOT NULL,
  `password`   VARCHAR(255)  NOT NULL,
  `role`       ENUM('ADMIN','SUPER_USER','USER') NOT NULL DEFAULT 'USER',
  `is_active`  TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  INDEX `idx_users_role`  (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LANGKAH 4: Buat tabel elektronik
-- ============================================
CREATE TABLE IF NOT EXISTS `elektronik` (
  `id`               INT              NOT NULL AUTO_INCREMENT,
  `nomor_sbg`        VARCHAR(100)     NOT NULL,
  `grade`            ENUM('A','B','C','D') NOT NULL,
  `jenis_barang`     VARCHAR(200)     NOT NULL,
  `detail_barang`    VARCHAR(500)     NOT NULL,
  `keterangan`       TEXT             NULL,
  `cogs`             DECIMAL(15,2)    NOT NULL DEFAULT 0.00,
  `offering_pengepul`DECIMAL(15,2)    NULL,
  `harga_jual`       DECIMAL(15,2)    NULL,
  `ppn`              DECIMAL(15,2)    NULL,
  `total_harga`      DECIMAL(15,2)    NULL,
  `profit`           DECIMAL(15,2)    NULL,
  `status`           ENUM('BELUM_TERJUAL','TERJUAL') NOT NULL DEFAULT 'BELUM_TERJUAL',
  `perusahaan`       ENUM('VOLARY','SERBA_MAS') NOT NULL DEFAULT 'SERBA_MAS',
  `tanggal_masuk`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_elektronik_nomor_sbg`  (`nomor_sbg`),
  INDEX `idx_elektronik_grade`          (`grade`),
  INDEX `idx_elektronik_status`         (`status`),
  INDEX `idx_elektronik_perusahaan`     (`perusahaan`),
  INDEX `idx_elektronik_jenis`          (`jenis_barang`),
  INDEX `idx_elektronik_tgl_masuk`      (`tanggal_masuk`),
  INDEX `idx_elektronik_profit`         (`profit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LANGKAH 5: Buat tabel invoices
-- ============================================
CREATE TABLE IF NOT EXISTS `invoices` (
  `id`               INT           NOT NULL AUTO_INCREMENT,
  `nomor_invoice`    VARCHAR(100)  NOT NULL,
  `nama_customer`    VARCHAR(200)  NOT NULL,
  `no_telepon`       VARCHAR(20)   NOT NULL,
  `tanggal_invoice`  DATE          NOT NULL,
  `perusahaan`       ENUM('VOLARY','SERBA_MAS') NOT NULL DEFAULT 'SERBA_MAS',
  `status`           ENUM('DRAFT','WAITING_APPROVAL','APPROVED','REJECTED','PRINTED') NOT NULL DEFAULT 'DRAFT',
  `catatan`          TEXT          NULL,
  `approved_by_id`   INT           NULL,
  `approved_by_nama` VARCHAR(150)  NULL,
  `approved_at`      DATETIME      NULL,
  `rejected_at`      DATETIME      NULL,
  `rejected_reason`  TEXT          NULL,
  `printed_at`       DATETIME      NULL,
  `created_by_id`    INT           NOT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invoices_nomor`     (`nomor_invoice`),
  INDEX `idx_invoices_status`        (`status`),
  INDEX `idx_invoices_created_by`    (`created_by_id`),
  INDEX `idx_invoices_tanggal`       (`tanggal_invoice`),
  CONSTRAINT `fk_invoices_created_by`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LANGKAH 6: Buat tabel invoice_items
-- ============================================
CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `invoice_id`    INT           NOT NULL,
  `elektronik_id` INT           NOT NULL,
  `nomor_sbg`     VARCHAR(100)  NOT NULL,
  `jenis_barang`  VARCHAR(200)  NOT NULL,
  `detail_barang` VARCHAR(500)  NOT NULL,
  `harga_jual`    DECIMAL(15,2) NOT NULL,
  `ppn`           DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_harga`   DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  INDEX `idx_inv_items_invoice`    (`invoice_id`),
  INDEX `idx_inv_items_elektronik` (`elektronik_id`),
  CONSTRAINT `fk_inv_items_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_inv_items_elektronik`
    FOREIGN KEY (`elektronik_id`) REFERENCES `elektronik`(`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LANGKAH 7: Buat tabel audit_logs
-- ============================================
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`         INT           NOT NULL AUTO_INCREMENT,
  `user_id`    INT           NULL,
  `nama_user`  VARCHAR(150)  NULL,
  `aktivitas`  VARCHAR(300)  NOT NULL,
  `tabel`      VARCHAR(100)  NULL,
  `data_lama`  JSON          NULL,
  `data_baru`  JSON          NULL,
  `ip_address` VARCHAR(50)   NULL,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_audit_user_id`   (`user_id`),
  INDEX `idx_audit_created_at`(`created_at`),
  INDEX `idx_audit_aktivitas` (`aktivitas`(100)),
  CONSTRAINT `fk_audit_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- LANGKAH 8: Isi data awal
-- ============================================
-- CATATAN KEAMANAN (H-02): akun pengguna TIDAK dibuat lewat script SQL ini.
-- Membuat akun via SQL akan melewati kebijakan password aplikasi dan dulu
-- menanamkan password default yang dikenal publik.
--
-- Buat akun admin pertama lewat seed resmi dengan password dari environment:
--
--   cd backend
--   SEED_ADMIN_EMAIL=admin@smt.com SEED_ADMIN_PASSWORD=<password-kuat> npm run seed
--
-- (password minimal 12 karakter, divalidasi oleh aplikasi).

INSERT INTO `elektronik`
  (`nomor_sbg`,`grade`,`jenis_barang`,`detail_barang`,`keterangan`,`cogs`,`offering_pengepul`,`harga_jual`,`ppn`,`total_harga`,`profit`,`status`,`perusahaan`) VALUES
  ('SBG-2024-001','A','Laptop',     'Asus ROG Zephyrus G14 Ryzen 9 16GB RTX 4060', 'Lengkap dus',  7500000, 8000000,  9500000, 104500,  9604500, 2000000,'BELUM_TERJUAL','SERBA_MAS'),
  ('SBG-2024-002','B','Smartphone', 'iPhone 13 Pro Max 256GB Pacific Blue',          'Goresan halus',8000000, 8500000, 10500000, 115500, 10615500, 2500000,'BELUM_TERJUAL','SERBA_MAS'),
  ('SBG-2024-003','A','TV',         'Samsung Neo QLED 65 Inch 4K Smart TV',          'Box ada remote',9000000,9500000, 12000000, 132000, 12132000, 3000000,'TERJUAL',      'SERBA_MAS'),
  ('SBG-2024-004','C','Laptop',     'Lenovo ThinkPad X1 Carbon Gen 10',              'Dead pixel',   4500000, 4800000,  5800000,  63800,  5863800, 1300000,'BELUM_TERJUAL','SERBA_MAS'),
  ('SBG-2024-005','A','Kamera',     'Sony Alpha A7IV Full Frame + Lensa Kit',         'Kondisi 95%', 15000000,15500000, 18500000, 203500, 18703500, 3500000,'BELUM_TERJUAL','VOLARY'),
  ('SBG-2024-006','B','Tablet',     'iPad Pro 12.9 M2 256GB WiFi+Cell',              'Lecet frame',  9500000,10000000, 12500000, 137500, 12637500, 3000000,'BELUM_TERJUAL','VOLARY'),
  ('SBG-2024-007','A','Laptop',     'MacBook Pro 14 M3 Pro 512GB Space Black',        'Garansi 6bln',19000000,19500000, 23000000, 253000, 23253000, 4000000,'BELUM_TERJUAL','VOLARY'),
  ('SBG-2024-008','D','Smartphone', 'Samsung Galaxy S23 Ultra 256GB',                 'Layar retak',  3000000, 3200000,  4000000,  44000,  4044000, 1000000,'BELUM_TERJUAL','SERBA_MAS'),
  ('SBG-2024-009','B','Smartwatch', 'Apple Watch Ultra 2 GPS+Cell 49mm',              'Baterai 90%',  5500000, 5800000,  7200000,  79200,  7279200, 1700000,'BELUM_TERJUAL','SERBA_MAS'),
  ('SBG-2024-010','A','Drone',      'DJI Mavic 3 Pro Fly More Combo 3 Baterai',       'Koper DJI',   17000000,17500000, 21000000, 231000, 21231000, 4000000,'BELUM_TERJUAL','VOLARY')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- LANGKAH 9: Buat views penting
-- ============================================
CREATE OR REPLACE VIEW `v_dashboard_stats` AS
SELECT
  COUNT(*)                                              AS total_sbg,
  SUM(cogs)                                             AS total_cogs,
  SUM(IFNULL(harga_jual,0))                             AS total_harga_jual,
  SUM(IFNULL(profit,0))                                 AS total_profit,
  CASE WHEN SUM(harga_jual)>0 THEN ROUND(SUM(profit)/SUM(harga_jual)*100,2) ELSE 0 END AS persen_profit,
  SUM(CASE WHEN status='TERJUAL' THEN 1 ELSE 0 END)    AS total_terjual,
  SUM(CASE WHEN status='BELUM_TERJUAL' THEN 1 ELSE 0 END) AS total_belum_terjual
FROM `elektronik`;

CREATE OR REPLACE VIEW `v_invoice_summary` AS
SELECT
  i.id, i.nomor_invoice, i.nama_customer, i.no_telepon,
  i.tanggal_invoice, i.perusahaan, i.status,
  u.nama AS dibuat_oleh,
  i.approved_by_nama, i.approved_at, i.rejected_reason, i.printed_at,
  COUNT(ii.id) AS jumlah_item,
  SUM(ii.total_harga) AS grand_total,
  i.created_at
FROM invoices i
LEFT JOIN users u ON u.id = i.created_by_id
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
GROUP BY i.id;

-- ============================================
-- SELESAI — Tampilkan ringkasan
-- ============================================
SELECT '=== SETUP DATABASE SELESAI ===' AS info;

SELECT
  'users'         AS tabel, COUNT(*) AS data FROM users        UNION ALL
SELECT 'elektronik',                           COUNT(*)        FROM elektronik UNION ALL
SELECT 'invoices',                             COUNT(*)        FROM invoices   UNION ALL
SELECT 'invoice_items',                        COUNT(*)        FROM invoice_items UNION ALL
SELECT 'audit_logs',                           COUNT(*)        FROM audit_logs;

SELECT '=== DAFTAR AKUN (buat lewat: npm run seed) ===' AS info;
SELECT email, role FROM users ORDER BY id;

SELECT '=== STATISTIK AWAL ===' AS info;
SELECT * FROM v_dashboard_stats;
