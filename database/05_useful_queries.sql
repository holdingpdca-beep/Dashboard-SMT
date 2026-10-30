-- ================================================================
-- DASHBOARD SMT ELEKTRONIK
-- Script 05: Query Berguna untuk Operasional
-- ================================================================

USE `dashboard_smt`;

-- ================================================================
-- BAGIAN A: QUERY MONITORING DASHBOARD
-- ================================================================

-- A1. Ringkasan keseluruhan
SELECT * FROM v_dashboard_stats;

-- A2. Statistik per perusahaan
SELECT * FROM v_stats_per_perusahaan;

-- A3. Distribusi grade barang
SELECT * FROM v_distribusi_grade;

-- A4. Top 10 profit tertinggi
SELECT * FROM v_top10_profit;

-- A5. Trend masuk 30 hari terakhir
SELECT * FROM v_trend_30_hari;

-- A6. Jalankan stored procedure (semua perusahaan)
CALL sp_dashboard_stats(NULL);

-- A7. Jalankan stored procedure (Volary saja)
CALL sp_dashboard_stats('VOLARY');

-- A8. Jalankan stored procedure (Serba Mas saja)
CALL sp_dashboard_stats('SERBA_MAS');


-- ================================================================
-- BAGIAN B: QUERY DATA ELEKTRONIK
-- ================================================================

-- B1. Semua barang belum terjual, diurutkan dari profit tertinggi
SELECT
  nomor_sbg, grade, jenis_barang, detail_barang,
  FORMAT(cogs, 0, 'id_ID')         AS cogs,
  FORMAT(harga_jual, 0, 'id_ID')   AS harga_jual,
  FORMAT(profit, 0, 'id_ID')       AS profit,
  perusahaan
FROM elektronik
WHERE status = 'BELUM_TERJUAL'
ORDER BY profit DESC;

-- B2. Cari barang by nomor SBG
SELECT * FROM elektronik WHERE nomor_sbg LIKE '%SBG-2024%';

-- B3. Filter barang by grade dan perusahaan
SELECT * FROM elektronik WHERE grade = 'A' AND perusahaan = 'SERBA_MAS';

-- B4. Summary per bulan
SELECT
  DATE_FORMAT(tanggal_masuk, '%Y-%m') AS bulan,
  COUNT(*)                             AS jumlah_masuk,
  SUM(IFNULL(profit, 0))               AS total_profit,
  SUM(CASE WHEN status='TERJUAL' THEN 1 ELSE 0 END) AS terjual
FROM elektronik
GROUP BY DATE_FORMAT(tanggal_masuk, '%Y-%m')
ORDER BY bulan DESC;

-- B5. Barang dengan profit margin di atas 20%
SELECT
  nomor_sbg, jenis_barang,
  FORMAT(harga_jual, 0, 'id_ID')                         AS harga_jual,
  FORMAT(profit, 0, 'id_ID')                             AS profit,
  ROUND(profit / harga_jual * 100, 1)                    AS margin_persen
FROM elektronik
WHERE harga_jual > 0
  AND ROUND(profit / harga_jual * 100, 1) > 20
ORDER BY margin_persen DESC;


-- ================================================================
-- BAGIAN C: QUERY INVOICE
-- ================================================================

-- C1. Semua invoice beserta total
SELECT * FROM v_invoice_summary ORDER BY created_at DESC;

-- C2. Invoice menunggu approval
SELECT
  nomor_invoice, nama_customer, no_telepon,
  perusahaan, dibuat_oleh, grand_total, created_at
FROM v_invoice_summary
WHERE status = 'WAITING_APPROVAL'
ORDER BY created_at ASC;

-- C3. Detail invoice beserta item barang
SELECT
  i.nomor_invoice, i.nama_customer, i.tanggal_invoice,
  i.perusahaan, i.status,
  ii.nomor_sbg, ii.jenis_barang, ii.detail_barang,
  FORMAT(ii.harga_jual, 0, 'id_ID')  AS harga_jual,
  FORMAT(ii.ppn, 0, 'id_ID')         AS ppn,
  FORMAT(ii.total_harga, 0, 'id_ID') AS total_harga
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
ORDER BY i.id DESC, ii.id ASC;

-- C4. Total penjualan per bulan (dari invoice PRINTED)
SELECT
  DATE_FORMAT(i.tanggal_invoice, '%Y-%m') AS bulan,
  COUNT(DISTINCT i.id)                     AS jumlah_invoice,
  COUNT(ii.id)                             AS jumlah_item,
  FORMAT(SUM(ii.total_harga), 0, 'id_ID') AS total_penjualan
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
WHERE i.status = 'PRINTED'
GROUP BY DATE_FORMAT(i.tanggal_invoice, '%Y-%m')
ORDER BY bulan DESC;


-- ================================================================
-- BAGIAN D: QUERY AUDIT LOG
-- ================================================================

-- D1. Semua aktivitas hari ini
SELECT
  al.created_at, al.nama_user, u.role,
  al.aktivitas, al.tabel, al.ip_address
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE DATE(al.created_at) = CURDATE()
ORDER BY al.created_at DESC;

-- D2. Aktivitas login 7 hari terakhir
SELECT
  DATE(created_at) AS tanggal,
  COUNT(*)         AS jumlah_login
FROM audit_logs
WHERE aktivitas = 'LOGIN'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(created_at)
ORDER BY tanggal DESC;

-- D3. Siapa yang paling banyak aktivitas?
SELECT
  nama_user,
  COUNT(*) AS total_aktivitas,
  MAX(created_at) AS terakhir_aktif
FROM audit_logs
WHERE nama_user IS NOT NULL
GROUP BY nama_user
ORDER BY total_aktivitas DESC;

-- D4. Riwayat perubahan barang tertentu (ganti nomor SBG)
SELECT
  al.created_at, al.nama_user, al.aktivitas,
  al.data_lama, al.data_baru
FROM audit_logs al
WHERE al.tabel = 'Elektronik'
  AND (
    JSON_EXTRACT(al.data_lama, '$.nomorSbg') = 'SBG-2024-001'
    OR
    JSON_EXTRACT(al.data_baru, '$.nomorSbg') = 'SBG-2024-001'
  )
ORDER BY al.created_at DESC;


-- ================================================================
-- BAGIAN E: QUERY MAINTENANCE
-- ================================================================

-- E1. Recalculate semua nilai PPN, Total, Profit
CALL sp_recalculate_all();

-- E2. Cek integritas data (barang terjual tapi tidak ada di invoice printed)
SELECT e.nomor_sbg, e.jenis_barang, e.status
FROM elektronik e
WHERE e.status = 'TERJUAL'
  AND e.id NOT IN (
    SELECT ii.elektronik_id
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.status = 'PRINTED'
  );

-- E3. Ukuran tabel
SELECT
  TABLE_NAME                              AS tabel,
  TABLE_ROWS                              AS estimasi_baris,
  ROUND(DATA_LENGTH / 1024 / 1024, 2)    AS data_MB,
  ROUND(INDEX_LENGTH / 1024 / 1024, 2)   AS index_MB
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'dashboard_smt'
ORDER BY DATA_LENGTH DESC;

-- E4. Reset password akun
-- CATATAN KEAMANAN (H-02): JANGAN set password lewat SQL (melewati kebijakan password
-- aplikasi & berisiko menanam hash yang dikenal publik). Reset password dilakukan oleh
-- ADMIN lewat aplikasi (menu Pengguna → Reset Password), atau untuk admin pertama
-- lewat seed:  SEED_ADMIN_PASSWORD=<password-kuat> npm run seed
