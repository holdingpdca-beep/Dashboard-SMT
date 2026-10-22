-- ================================================================
-- DASHBOARD SMT ELEKTRONIK
-- Script 03: Data Awal (Seed)
-- ================================================================

USE `dashboard_smt`;

-- ================================================================
-- AKUN ADMIN AWAL
-- ================================================================
-- Akun admin TIDAK dibuat lewat file ini (tidak ada kredensial di repo).
-- Buat akun admin lewat seed resmi dengan password dari environment variable:
--
--   SEED_ADMIN_EMAIL=admin@smt.com SEED_ADMIN_PASSWORD=<password-kuat> npm run seed
--
-- (password minimal 12 karakter). Catatan: contoh audit_logs di bawah
-- mengacu user_id 1 — jalankan hanya setelah akun admin pertama dibuat.


-- ================================================================
-- INSERT DATA CONTOH ELEKTRONIK
-- ================================================================
INSERT INTO `elektronik`
  (`nomor_sbg`, `grade`, `jenis_barang`, `detail_barang`, `keterangan`,
   `cogs`, `offering_pengepul`, `harga_jual`, `ppn`, `total_harga`, `profit`,
   `status`, `perusahaan`, `tanggal_masuk`)
VALUES
  ('SBG-2024-001', 'A', 'Laptop', 'Asus ROG Zephyrus G14, Ryzen 9, 16GB RAM, RTX 4060', 'Unit masih mulus, lengkap dus',
   7500000, 8000000, 9500000, 104500, 9604500, 2000000, 'BELUM_TERJUAL', 'SERBA_MAS', '2024-01-15'),

  ('SBG-2024-002', 'B', 'Smartphone', 'iPhone 13 Pro Max 256GB Pacific Blue', 'Ada goresan halus di bodi belakang',
   8000000, 8500000, 10500000, 115500, 10615500, 2500000, 'BELUM_TERJUAL', 'SERBA_MAS', '2024-01-20'),

  ('SBG-2024-003', 'A', 'TV', 'Samsung Neo QLED 65 Inch 4K Smart TV', 'Box masih ada, remote lengkap',
   9000000, 9500000, 12000000, 132000, 12132000, 3000000, 'TERJUAL', 'SERBA_MAS', '2024-02-01'),

  ('SBG-2024-004', 'C', 'Laptop', 'Lenovo ThinkPad X1 Carbon Gen 10', 'Layar ada dead pixel kecil di sudut',
   4500000, 4800000, 5800000, 63800, 5863800, 1300000, 'BELUM_TERJUAL', 'SERBA_MAS', '2024-02-10'),

  ('SBG-2024-005', 'A', 'Kamera', 'Sony Alpha A7IV Full Frame Mirrorless + Lensa Kit', 'Set lengkap, kondisi 95%',
   15000000, 15500000, 18500000, 203500, 18703500, 3500000, 'BELUM_TERJUAL', 'VOLARY', '2024-02-15'),

  ('SBG-2024-006', 'B', 'Tablet', 'iPad Pro 12.9" M2 Chip 256GB WiFi+Cell', 'Ada lecet tipis di frame',
   9500000, 10000000, 12500000, 137500, 12637500, 3000000, 'BELUM_TERJUAL', 'VOLARY', '2024-03-01'),

  ('SBG-2024-007', 'A', 'Laptop', 'MacBook Pro 14" M3 Pro 512GB Space Black', 'Kondisi sempurna, garansi sisa 6 bulan',
   19000000, 19500000, 23000000, 253000, 23253000, 4000000, 'BELUM_TERJUAL', 'VOLARY', '2024-03-05'),

  ('SBG-2024-008', 'D', 'Smartphone', 'Samsung Galaxy S23 Ultra 256GB', 'Layar retak, masih bisa digunakan',
   3000000, 3200000, 4000000, 44000, 4044000, 1000000, 'BELUM_TERJUAL', 'SERBA_MAS', '2024-03-10'),

  ('SBG-2024-009', 'B', 'Smartwatch', 'Apple Watch Ultra 2 GPS+Cell 49mm', 'Tali bawaan masih bagus, baterai 90%',
   5500000, 5800000, 7200000, 79200, 7279200, 1700000, 'BELUM_TERJUAL', 'SERBA_MAS', '2024-03-15'),

  ('SBG-2024-010', 'A', 'Drone', 'DJI Mavic 3 Pro Fly More Combo', 'Lengkap 3 baterai, koper DJI',
   17000000, 17500000, 21000000, 231000, 21231000, 4000000, 'BELUM_TERJUAL', 'VOLARY', '2024-03-20')
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP;


-- ================================================================
-- INSERT CONTOH AUDIT LOG
-- ================================================================
INSERT INTO `audit_logs` (`user_id`, `nama_user`, `aktivitas`, `tabel`, `ip_address`)
VALUES
  (1, 'Administrator', 'LOGIN', NULL, '127.0.0.1'),
  (1, 'Administrator', 'TAMBAH DATA ELEKTRONIK', 'elektronik', '127.0.0.1'),
  (2, 'Super User',    'LOGIN', NULL, '127.0.0.1'),
  (3, 'User Biasa',    'LOGIN', NULL, '192.168.1.10');


-- ================================================================
-- Verifikasi data berhasil
-- ================================================================
SELECT
  'users'      AS tabel, COUNT(*) AS jumlah_data FROM users
UNION ALL
SELECT
  'elektronik' AS tabel, COUNT(*) AS jumlah_data FROM elektronik
UNION ALL
SELECT
  'audit_logs' AS tabel, COUNT(*) AS jumlah_data FROM audit_logs;

SELECT 'Data awal berhasil dimasukkan!' AS keterangan;
