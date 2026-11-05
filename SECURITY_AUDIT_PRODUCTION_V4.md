# Security Audit v4 — Dashboard SMT (Production)

| | |
|---|---|
| **Tanggal audit** | 5 November 2026 |
| **Branch / commit** | `main` @ `47849eac` (Merge PR #6 — termasuk `7702cb48` "Update Dashboard Elektronik") |
| **Audit sebelumnya** | v1 [SECURITY_AUDIT_PRODUCTION.md](SECURITY_AUDIT_PRODUCTION.md) · v2 [SECURITY_AUDIT_PRODUCTION_V2.md](SECURITY_AUDIT_PRODUCTION_V2.md) · v3 [SECURITY_AUDIT_PRODUCTION_V3.md](SECURITY_AUDIT_PRODUCTION_V3.md) (@ `1e12647f`) |
| **Cakupan** | Seluruh backend & frontend, dengan fokus pada perubahan baru: **penjualan langsung + struk** (`POST /api/items/jual`), **harga otomatis dari COGS** (HJ MIN / HJ MAX / HARGA SMT), **Riwayat Penjualan & export**, perubahan import Excel, skema database, file baru di repo; plus status temuan v3 |
| **Metode** | Review kode manual (diff `1e12647f..47849eac` + seluruh route/controller terkait), review konfigurasi deploy, pengecekan file yang ter-track & riwayat git |
| **Skala severity** | **Critical** → **High** → **Medium** → **Low** |

### Definisi severity

| Severity | Arti | Target perbaikan |
|---|---|---|
| **Critical** | Dapat langsung dieksploitasi untuk mengambil alih akun admin / sistem, atau kredensial produksi aktif bocor. | Segera (hari ini) |
| **High** | Kebocoran kredensial/data sensitif yang masih mungkin aktif, atau pelanggaran hak akses / kontrol keuangan yang nyata. | ≤ 7 hari |
| **Medium** | Kelemahan yang butuh kondisi tertentu, atau kebocoran data pribadi terbatas ke pengguna internal. | ≤ 30 hari |
| **Low** | Hardening, best practice, risiko kecil. | Backlog |

---

## Ringkasan

Update kali ini adalah **perubahan fitur** (alur penjualan elektronik diganti dari Invoice + approval menjadi penjualan langsung dengan struk), bukan remediasi. Temuan v3 belum dikerjakan, dan fitur baru membawa dua masalah penting:

1. **Kontrol keuangan melemah:** semua role elektronik (termasuk `USER`) kini dapat menjual barang langsung dengan **harga berapa pun > 0**, tanpa persetujuan ADMIN dan tanpa cara membatalkan penjualan.
2. **Regresi data pribadi:** nama & nomor telepon pelanggan kini terlihat dan dapat di-export oleh semua role elektronik (perbaikan v1 H-02 / v2 L-09 hilang karena data pindah ke tabel `elektronik`).

**Tidak ada temuan Critical.**

| Severity | Jumlah |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 3 |
| Low | 6 |
| **Total** | **11** |

| ID | Severity | Judul | Asal |
|---|---|---|---|
| H-01 | **High** | Riwayat git masih menyimpan `backend/.env` lama; pencabutan kredensial lama belum terkonfirmasi | Sisa v3 H-01 |
| H-02 | **High** | Penjualan langsung tanpa approval, tanpa harga minimum, dan tanpa pembatalan — dapat dilakukan role `USER` | **Baru** |
| M-01 | Medium | Backend & frontend PM2 listen di semua interface → bypass Apache & rate-limit login | Sisa v3 M-01 |
| M-02 | Medium | `Format Excel.xlsx` masih berisi data barang (nomor seri LM); data lama di riwayat git | Sisa v3 M-02 |
| M-03 | Medium | Nama & nomor telepon pelanggan terbuka untuk semua role elektronik (list, detail, riwayat, export) | **Baru** (regresi v1 H-02 / v2 L-09) |
| L-01 | Low | API Invoice lama masih aktif walau menu dihapus; transisi status belum atomik | Sisa v3 L-01 |
| L-02 | Low | CSP Apache menimpa CSP `/uploads`; PM2 `serve` tidak sejalan dengan Apache | Sisa v3 L-02 |
| L-03 | Low | JWT di `localStorage`; tanpa lockout per akun | Sisa v3 L-03 |
| L-04 | Low | Operasional: skema baru butuh `db push`, belum ada migrasi, `node_modules` lokal usang, body JSON 10 MB | Sisa v3 L-04 + baru |
| L-05 | Low | COGS dapat dihitung balik dari HJ MIN / HJ MAX oleh role yang seharusnya tidak melihat COGS | **Baru** |
| L-06 | Low | Minor: objek baris import memakai kunci header bebas, pesan error 4xx diteruskan, Google Fonts eksternal | Baru / sisa |

---

## Status temuan audit v3

| ID v3 | Severity v3 | Status | Keterangan |
|---|---|---|---|
| H-01 | High | ❌ Terbuka | Tidak ada perubahan → **H-01** |
| M-01 | Medium | ❌ Terbuka | [server.js:154](backend/server.js#L154) masih `app.listen(PORT)`; `ecosystem.config.js` tidak berubah → **M-01** |
| M-02 | Medium | ❌ Terbuka | `Format Excel.xlsx` diubah (header ditambah) tetapi 7 baris data LM tetap ada → **M-02** |
| L-01 | Low | ❌ Terbuka | `invoiceController.js` tidak berubah; menu Invoice dihapus dari frontend tetapi API tetap aktif → **L-01** |
| L-02 | Low | ❌ Terbuka | `deploy/apache.conf` tidak berubah → **L-02** |
| L-03 | Low | ❌ Terbuka | → **L-03** |
| L-04 | Low | ❌ Terbuka | → **L-04** |
| L-05 | Low | ❌ Terbuka | → **L-06** |

Semua perbaikan v1–v2 yang sebelumnya sudah ditutup (upload file, otorisasi whitelist, sinkronisasi API, password policy, revoke token, validasi input, dsb.) **tetap utuh** — tidak ada kode terkait yang diubah, kecuali `getRiwayat` (lihat M-03).

---

## HIGH

### H-01 — Riwayat git masih menyimpan `backend/.env` lama

**Lokasi:** commit `a4b9d044` (Initial commit); repo `smartmulia/Dashboard-SMT` dan fork `holdingpdca-beep`.

**Temuan:** Tidak berubah sejak v2/v3. Riwayat git masih memuat `DATABASE_URL`, `JWT_SECRET`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET` lama. Belum ada konfirmasi bahwa AccessKey OSS lama sudah dicabut di RAM console dan password user DB lama sudah tidak berlaku.

Catatan tambahan dari proses deploy terakhir: database production berada di **Alibaba Cloud RDS** (`*.rds.aliyuncs.com`). Bila whitelist IP RDS terbuka lebar, kredensial DB lama yang bocor dapat dipakai langsung dari internet.

**Rekomendasi:**
1. Konfirmasi & catat pencabutan AccessKey OSS lama dan pergantian password user DB lama.
2. Pastikan **RDS whitelist** hanya berisi IP server aplikasi (bukan `0.0.0.0/0`).
3. `git filter-repo --path backend/.env --invert-paths` di repo utama dan fork, force-push, clone ulang.
4. Repo/fork private + GitHub Secret Scanning.

---

### H-02 — Penjualan langsung tanpa approval, tanpa harga minimum, tanpa pembatalan

**Lokasi:**
- [routes/items.js:32](backend/src/routes/items.js#L32) — `POST /api/items/jual` hanya dilindungi `requireRole(...ELEKTRONIK_ROLES)` (ADMIN, SUPER_USER, **USER**)
- [itemController.js:523-623](backend/src/controllers/itemController.js#L523-L623) — `jualItems`
- [validators.js](backend/src/middleware/validators.js) `jualItemsRules` — `items.*.hargaJual` cukup `> 0`
- [Elektronik.jsx:290-294](frontend/src/pages/Elektronik.jsx#L290-L294) — tombol "Jual Barang" tampil untuk semua role

**Temuan:** Sebelumnya, barang hanya berstatus `TERJUAL` setelah invoice **disetujui ADMIN**, dan pembuat invoice tidak boleh menyetujui invoicenya sendiri (*segregation of duties*). Dengan fitur baru:
- Role `USER` dapat langsung menandai barang `TERJUAL` **tanpa persetujuan siapa pun**.
- Harga jual diisi manual dan hanya divalidasi `> 0`. Tidak ada pembanding terhadap COGS, HJ MIN, atau HARGA SMT yang dihitung sistem — barang ber-COGS Rp 5.000.000 dapat "dijual" Rp 1.
- **Tidak ada endpoint untuk membatalkan/void penjualan langsung.** Salah input (barang, harga, pelanggan) hanya bisa diperbaiki lewat akses database langsung. `updateItem` menolak perubahan COGS pada barang `TERJUAL`, dan tidak ada jalur mengembalikan status ke `BELUM_TERJUAL` selain `cancelInvoice` (yang hanya berlaku untuk barang yang terjual via invoice).
- Struk dicetak oleh pengguna yang sama yang menginput harga; satu-satunya kontrol adalah audit log `JUAL n BARANG — Struk …`.

**Dampak:** Risiko kecurangan internal (barang dijual di bawah harga ke pihak terafiliasi, mis. jenis pembeli `KARYAWAN_INTERNAL`), kerugian finansial, dan data penjualan yang salah tidak dapat dikoreksi secara terkontrol. Ini adalah penurunan kontrol dibanding alur invoice sebelumnya.

**Rekomendasi (pilih sesuai kebijakan bisnis):**
1. **Harga minimum di backend:** untuk role selain ADMIN, tolak bila `hargaJual < HJ MIN` (atau `< COGS`):
   ```js
   const { hjMin } = hargaEfektif(b.cogs, { hjMin: b.hjMin, hjMax: b.hjMax, hargaSmt: b.hargaSmt });
   if (!canSeeAll(req.user) && net < hjMin) {
     throw Object.assign(new Error(`Harga ${b.nomorSbg} di bawah HJ MIN`), { status: 400 });
   }
   ```
2. **Approval untuk pengecualian:** penjualan di bawah HJ MIN (atau di atas nilai tertentu / jenis pembeli `KARYAWAN_INTERNAL`) masuk status menunggu persetujuan ADMIN, bukan langsung `TERJUAL`.
3. **Void terkontrol:** tambahkan `POST /api/items/struk/:nomorStruk/void` khusus ADMIN, dengan alasan wajib, mengembalikan barang ke `BELUM_TERJUAL` secara atomik, dan tercatat di audit log (simpan data penjualan lama di `dataLama`).
4. Bila penjualan langsung memang hanya untuk staf tertentu, batasi route dengan `requireRole('ADMIN', 'SUPER_USER')`.

---

## MEDIUM

### M-01 — Port backend & frontend terbuka langsung

**Lokasi:** [backend/server.js:154](backend/server.js#L154) `app.listen(PORT)`; [backend/server.js:40](backend/server.js#L40) `trust proxy 1`; [ecosystem.config.js:41-56](ecosystem.config.js#L41-L56) PM2 `serve` di `:5173`.

**Temuan:** Tidak berubah sejak v3. Bila port 5000/5173 terjangkau dari luar, penyerang dapat mengakses API lewat HTTP tanpa header Apache, dan memalsukan `X-Forwarded-For` untuk mem-bypass rate-limit login (brute-force tanpa batas) serta memalsukan IP di audit log.

**Rekomendasi:** `app.listen(PORT, process.env.HOST || '127.0.0.1')`; hapus proses `smt-frontend` bila Apache menyajikan `dist` langsung; blokir 5000/5173 di firewall / security group ECS; verifikasi `curl -m 5 http://<ip-publik>:5000/api/health` gagal dari luar.

---

### M-02 — `Format Excel.xlsx` masih berisi data barang

**Lokasi:** `Format Excel.xlsx` (di-whitelist `!Format Excel.xlsx` di [.gitignore](.gitignore)).

**Temuan:** File diperbarui pada commit `7702cb48` (kolom "Nomor Seri", "Tanggal Serah Terima" ditambah), tetapi **tetap berisi 7 baris data** termasuk nomor seri logam mulia (`LM ANTAM K7059…`, `LM UBS NO SERI : 9A17…`), COGS, dan asal barang (`GMS - KEPRI`). File data lama (`Data-Elektronik-…xlsx`, `Elektronik TV-2.xlsx`) masih ada di riwayat git.

**Rekomendasi:** kosongkan file menjadi header saja (atau satu baris fiktif), dan sertakan file data lama dalam pembersihan riwayat H-01.

---

### M-03 — Data pribadi pelanggan terbuka untuk semua role elektronik

**Lokasi:**
- Skema baru `Elektronik.namaPelanggan`, `noTelepon`, `namaSales`, `jenisPembeli`, `nomorStruk` ([schema.prisma](backend/prisma/schema.prisma))
- [itemController.js:805-808](backend/src/controllers/itemController.js#L805-L808) `getRiwayat` — hanya `cogs` & `profit` yang dibuang untuk non-admin
- [itemController.js:874-875](backend/src/controllers/itemController.js#L874-L875) `exportRiwayat` — kolom "Pelanggan" & "No. Telepon" ikut ter-export untuk **semua role**
- [itemController.js:147, 187](backend/src/controllers/itemController.js#L147) `getItems` (`?status=TERJUAL`) & `getItemById` — mengembalikan seluruh kolom baru ke non-admin

**Temuan:** Pada v1 (H-02) dan v2 (L-09), nomor telepon customer disembunyikan dari role `USER` dan nama customer hanya ditampilkan untuk transaksi milik user sendiri. Karena data pelanggan kini disimpan langsung di baris `elektronik` (bukan di `invoice`), perlindungan tersebut **hilang**: setiap `USER` dapat melihat dan mengunduh (Excel) nama + nomor telepon **seluruh** pelanggan dari semua sales.

**Dampak:** Kebocoran data pribadi ke pengguna internal yang tidak memerlukannya; relevan terhadap **UU PDP No. 27/2022** (prinsip pembatasan akses & minimisasi data). Export Excel memudahkan data dibawa keluar perusahaan.

**Rekomendasi:**
- Simpan juga **siapa yang menjual** (mis. kolom `soldById` = `req.user.id` di `jualItems`), lalu untuk non-admin tampilkan `namaPelanggan`/`noTelepon` hanya pada penjualan miliknya sendiri; selain itu `null`.
- Terapkan penyaringan yang sama di `getItems`, `getItemById`, `getRiwayat`, dan `exportRiwayat` (satu helper, mis. `sanitizeForRole(item, user)`).
- Pertimbangkan membatasi `GET /riwayat/export` ke ADMIN/SUPER_USER.

---

## LOW

### L-01 — API Invoice lama masih aktif & transisi status belum atomik
Menu Invoice dihapus dari frontend ([App.jsx](frontend/src/App.jsx), [Sidebar.jsx](frontend/src/components/Layout/Sidebar.jsx)), tetapi seluruh endpoint `/api/invoices/*` masih aktif untuk ADMIN/SUPER_USER/USER ([routes/invoices.js:11](backend/src/routes/invoices.js#L11)). Endpoint yang tidak dipakai menambah permukaan serangan, dan dua jalur penjualan (invoice vs langsung) dapat saling bertabrakan: barang yang sedang ada di invoice `DRAFT`/`WAITING_APPROVAL` tetap bisa dijual langsung, meninggalkan invoice yang merujuk barang sudah terjual. Temuan v3 tentang `reject`/`print`/`cancel`/`submit` yang belum memakai update bersyarat juga masih berlaku.
**Rekomendasi:** bila alur invoice sudah tidak dipakai, nonaktifkan route-nya (atau batasi ke ADMIN read-only untuk data historis); bila masih dipakai, terapkan update bersyarat status seperti di `approveInvoice` dan tolak `jualItems` untuk barang yang ada di invoice aktif.

### L-02 — Catatan konfigurasi Apache & PM2
Tidak berubah sejak v3: `Header always set Content-Security-Policy` di VirtualHost menimpa CSP `sandbox` milik `/uploads`; PM2 `serve` di `:5173` tidak diperlukan bila Apache menyajikan `dist`. Gunakan `<LocationMatch>` atau `Header setifempty`, dan selaraskan topologi deploy.

### L-03 — Token di `localStorage` & tanpa lockout per akun
Tidak berubah. Rekomendasi tetap: lockout per akun berbasis audit `LOGIN GAGAL`, cookie `HttpOnly; Secure; SameSite=Strict` jangka menengah, 2FA untuk ADMIN.

### L-04 — Operasional & deploy
- **Skema berubah lagi** (kolom `hj_min`, `hj_max`, `harga_smt`, `tanggal_jual`, `nama_pelanggan`, `no_telepon`, `nama_sales`, `jenis_pembeli`, `nomor_struk`, enum `JenisPembeli`, 2 index). Perubahannya aditif, tetapi deploy berikutnya kembali bergantung pada `prisma db push` karena **belum ada `prisma/migrations/`**. Backup RDS sebelum deploy; buat migrasi baseline agar perubahan skema berikutnya dapat di-review.
- `node_modules` di workspace audit masih usang (`multer 1.4.5-lts.2`, `xlsx 0.18.5`, `node-cron` tidak ada) walau lockfile sudah benar; pastikan server memakai `npm ci --omit=dev` dan verifikasi `npm ls multer xlsx node-cron`.
- Laporan `npm audit` di server saat deploy terakhir (8 vulnerabilities: 4 moderate, 3 high, 1 critical) **belum dianalisis** — jalankan `npm audit --omit=dev` di `backend/` dan `frontend/` lalu tinjau paket yang benar-benar terpakai di runtime.
- `express.json({ limit: '10mb' })` masih bisa diturunkan ke `1mb`.

### L-05 — COGS dapat dihitung balik dari HJ MIN / HJ MAX
[itemController.js:61-73](backend/src/controllers/itemController.js#L61-L73), [:114-120](backend/src/controllers/itemController.js#L114-L120): `withHarga()` sengaja mengirim HJ MIN/HJ MAX/HARGA SMT ke role non-admin setelah COGS dibuang. Karena `HJ MIN = ceil(COGS × 1,17 / 1000) × 1000`, nilai COGS dapat diperkirakan dengan selisih < Rp 1.000 (`COGS ≈ HJ MIN / 1,17`). Rumus juga tertulis di frontend ([Elektronik.jsx:18](frontend/src/pages/Elektronik.jsx#L18)).
**Rekomendasi:** bila COGS memang rahasia dari role `USER`, kirim hanya HARGA SMT (yang dibulatkan ke puluhan ribu sehingga kurang presisi) atau terima risiko ini sebagai keputusan bisnis dan dokumentasikan.

### L-06 — Minor
- [itemController.js:369](backend/src/controllers/itemController.js#L369): objek baris import dibangun dengan `obj[h] = arr[i]` dari teks header Excel. Header seperti `__proto__` tidak mencemari prototipe global (hanya objek baris itu), tetapi praktik aman adalah `Object.create(null)`.
- Error handler meneruskan `err.message` untuk status < 500 (sumber saat ini aman).
- Google Fonts masih dimuat dari pihak ketiga.
- `Kwitansi elektronik.pdf` dan logo baru di root repo: sudah diperiksa — template kosong, tidak berisi data pelanggan.

---

## Kontrol keamanan yang sudah baik (termasuk pada fitur baru)

- `jualItems` memakai transaksi atomik dengan `updateMany({ where: { id, status: 'BELUM_TERJUAL' } })` per barang → mencegah barang terjual ganda saat dua penjualan berjalan bersamaan; nomor struk di-generate server dengan retry pada tabrakan.
- Validasi input penjualan lengkap (`jualItemsRules`: panjang nama/telepon, enum jenis pembeli, maks 500 barang, harga numerik).
- COGS & profit tetap disembunyikan dari role non-admin di list, detail, riwayat, dan kedua export; COGS tidak ikut ke data struk pelanggan.
- Harga jual dihitung server dari COGS (client tidak lagi bisa mengirim `hargaJual`/`offeringPengepul` saat create/update barang).
- Filter `jenisPembeli` di riwayat & export divalidasi terhadap enum; sort riwayat tetap.
- Penjualan & export riwayat tercatat di audit log.
- Seluruh kontrol dari v1–v3 (upload berlapis, otorisasi whitelist, sinkronisasi API aman, revoke token, password policy, validasi input, error handling, audit trail) tetap berlaku.

---

## Rencana perbaikan yang disarankan

| Prioritas | Item | Estimasi |
|---|---|---|
| **Minggu ini** | H-02 (harga minimum di backend + void struk khusus ADMIN; tentukan kebijakan approval) | 0,5 hari |
| **Minggu ini** | H-01 (konfirmasi pencabutan kredensial lama, cek RDS whitelist, `git filter-repo`) | 1 jam |
| **Minggu ini** | M-03 (simpan `soldById`, sembunyikan nama/telepon pelanggan untuk non-admin, batasi export) | 2–3 jam |
| **Minggu ini** | M-01 (`listen 127.0.0.1`, hapus PM2 `serve`, firewall) | 30 menit |
| **≤ 30 hari** | M-02, L-01 (nonaktifkan atau perbaiki API invoice), L-04 (migrasi baseline, `npm audit`) | 0,5 hari |
| **Backlog** | L-02, L-03, L-05, L-06 | — |

### Catatan batasan audit
- Konfigurasi aktual Apache, firewall/security group ECS, whitelist RDS, RAM policy Alibaba Cloud, dan `backend/.env` production **tidak** tersedia di workspace.
- Kebijakan bisnis penjualan (siapa boleh menjual, batas diskon, kebutuhan approval) tidak terdokumentasi di repo; H-02 dinilai berdasarkan kontrol yang sebelumnya diterapkan pada alur invoice.
- Tidak dilakukan pengujian dinamis (penetration test); seluruh temuan berasal dari analisis kode statis, konfigurasi, lockfile, dan riwayat git.
