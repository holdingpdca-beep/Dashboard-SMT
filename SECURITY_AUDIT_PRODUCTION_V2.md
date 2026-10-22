# Security Audit v2 — Dashboard SMT (Production)

| | |
|---|---|
| **Tanggal audit** | 22 Oktober 2026 |
| **Branch / commit** | `development` @ `cf9e92ef` (Merge PR #6 — "Fix Prisma database schema sync") |
| **Audit sebelumnya** | [SECURITY_AUDIT_PRODUCTION.md](SECURITY_AUDIT_PRODUCTION.md) @ `5d3198b4` |
| **Cakupan** | Seluruh backend (Express + Prisma + MySQL), frontend (React + Vite), fitur baru **Barang ART** dan **Sinkronisasi Katalog API SERBAMAS**, konfigurasi deploy, script database, repository & riwayat git, dependency (lockfile) |
| **Metode** | Review kode manual seluruh route/controller/middleware/service, diff terhadap audit sebelumnya, review konfigurasi & dokumentasi, pengecekan riwayat git, pengecekan versi dependency di `package-lock.json` terhadap CVE publik |
| **Skala severity** | **Critical** → **High** → **Medium** → **Low** |

### Definisi severity

| Severity | Arti | Target perbaikan |
|---|---|---|
| **Critical** | Dapat langsung dieksploitasi untuk mengambil alih akun admin / sistem, atau kredensial produksi aktif bocor. | Segera (hari ini) |
| **High** | Kebocoran data sensitif / kredensial yang masih mungkin aktif, atau pelanggaran hak akses nyata. | ≤ 7 hari |
| **Medium** | Kelemahan yang butuh kondisi tertentu atau memperbesar dampak serangan lain. | ≤ 30 hari |
| **Low** | Hardening, best practice, risiko kecil. | Backlog |

---

## Ringkasan

Sebagian besar temuan audit sebelumnya **sudah diperbaiki dengan baik**: upload file (C-02), kebocoran COGS & bypass role (H-01/H-02), dependency rentan (H-03/H-04), error leak, pembatasan query, race condition approval, revoke token, kebijakan password, dan audit trail. **Tidak ada lagi temuan Critical.**

Temuan yang tersisa: sisa perbaikan yang belum lengkap (riwayat git & script SQL lama masih berisi kredensial/akun default) dan risiko baru dari **fitur sinkronisasi katalog API SERBAMAS**.

| Severity | Jumlah |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 4 |
| Low | 9 |
| **Total** | **15** |

| ID | Severity | Judul | Asal |
|---|---|---|---|
| H-01 | **High** | Riwayat git masih menyimpan `backend/.env` lama; pencabutan AccessKey OSS belum terverifikasi | Sisa C-01 |
| H-02 | **High** | Script SQL & dokumentasi database masih membuat 3 akun default dengan password `admin123` | Sisa C-03 |
| M-01 | Medium | Hapus gambar katalog hasil sinkron API rentan path traversal → penghapusan file arbitrer di server | **Baru** (sync API) |
| M-02 | Medium | Sinkronisasi menghapus seluruh katalog API cabang bila respons API kosong / formatnya berubah | **Baru** (sync API) |
| M-03 | Medium | Security header frontend (CSP, X-Frame-Options, HSTS) belum terverifikasi | Sisa H-05 |
| M-04 | Medium | File Excel data bisnis & file upload masih ter-track di git walau sudah di `.gitignore` | Sisa M-08 |
| L-01 | Low | Sync manual dapat dipicu `KATALOG_USER` tanpa lock; detail error API eksternal dikirim ke client | **Baru** |
| L-02 | Low | Barang ART: tanpa validasi input & "tandai terjual" tidak memeriksa status | **Baru** |
| L-03 | Low | User enumeration via timing masih mungkin (dummy hash cost 10 vs hash user cost 12) | Sisa L-08 |
| L-04 | Low | JWT masih di `localStorage`; tidak ada lockout per akun | Sisa M-05/M-06 |
| L-05 | Low | URL gambar dari API eksternal disimpan & dirender tanpa validasi skema/domain | **Baru** |
| L-06 | Low | Celah validasi kecil: panjang `alasan`, batas `itemIds` saat edit, query param ganda, error multer → 500 | Baru / sisa |
| L-07 | Low | Operasional: `node_modules` lokal usang, `.env` permission, `NODE_ENV`, `prisma db push`, rate-limit in-memory | Sisa L-04/L-06/L-07/M-07 |
| L-08 | Low | Username & URL API SERBAMAS ter-hardcode di kode dan dokumentasi | **Baru** |
| L-09 | Low | Role `USER` masih melihat nama customer semua invoice di Riwayat | Sisa H-02 (residual) |

---

## Status temuan audit sebelumnya

| ID lama | Severity lama | Status | Keterangan |
|---|---|---|---|
| C-01 | Critical | ⚠️ **Sebagian** | `.env` di-untrack & nilai secret saat audit v1 sudah berbeda dari riwayat. Riwayat git **belum dibersihkan**; pencabutan AccessKey OSS lama tidak dapat diverifikasi → **H-01** |
| C-02 | Critical | ✅ **Selesai** | Whitelist mimetype, ekstensi ditentukan server, verifikasi magic bytes, nama file `randomUUID`, `/uploads` hanya menyajikan ekstensi gambar dengan `CSP: default-src 'none'; sandbox` + `nosniff` |
| C-03 | Critical | ⚠️ **Sebagian** | `fix-password.js` dihapus, `seed.js` wajib `SEED_ADMIN_PASSWORD`, README & `03_seed_data.sql` bersih, `admin123` masuk daftar password terlarang. Tetapi `00_JALANKAN_SEMUA.sql` & `CARA IMPORT DATABASE.txt` masih → **H-02** |
| H-01 | High | ✅ Selesai | Whitelist `canSeeAll` / `ELEKTRONIK_ROLES`; `KATALOG_USER` diblok di route items & invoices |
| H-02 | High | ✅ Selesai | COGS/profit/telepon disembunyikan di stats, riwayat, detail invoice, export; `sortBy` di-whitelist per role (residual kecil → L-09) |
| H-03 | High | ✅ Selesai | `xlsx` 0.20.3 dari CDN SheetJS (lockfile backend & frontend) |
| H-04 | High | ✅ Selesai | `multer` 2.4.0 (lockfile) |
| H-05 | High | ❓ Belum terverifikasi | Konfigurasi Apache tidak ada di repo → **M-03** |
| M-01 | Medium | ✅ Selesai | Controller memakai `next(err)`; error handler global menyembunyikan detail di production |
| M-02 | Medium | ✅ Selesai | `query parser: simple`, `toInt` dengan batas 100, `pickSort`, `safeDate` |
| M-03 | Medium | ✅ Selesai | `approveInvoice` memakai interactive transaction + `updateMany` bersyarat status |
| M-04 | Medium | ✅ Selesai | Cek kepemilikan di `submit` & `print` |
| M-05 | Medium | ⚠️ Sebagian | `tokenVersion` (revoke saat logout/ganti/reset password) sudah ada; token masih di `localStorage` → **L-04** |
| M-06 | Medium | ⚠️ Sebagian | Min 10 karakter, huruf+angka, blacklist, bcrypt 12; belum ada lockout per akun → **L-04** |
| M-07 | Medium | ❓ Belum terverifikasi | `backend/.env` tidak ada di workspace audit → cek di server (**L-07**) |
| M-08 | Medium | ⚠️ Sebagian | `*.xlsx` & `uploads/` sudah di `.gitignore`, tapi file lama masih ter-track → **M-04** |
| M-09 | Medium | ✅ Selesai | Audit untuk katalog, cabang, edit invoice, login gagal; kegagalan audit ke winston |
| L-01 | Low | ✅ Selesai | Validator katalog & cabang |
| L-02 | Low | ✅ Selesai | Batas 2.000 baris import, pesan error disanitasi |
| L-03 | Low | ✅ Selesai | Tidak bisa ubah role/nonaktifkan diri sendiri; minimal 1 ADMIN aktif |
| L-04 | Low | ❌ Terbuka | Rate-limit in-memory → **L-07** |
| L-05 | Low | ✅ Selesai | `jspdf` 3.0.4, `xlsx` 0.20.3 |
| L-06 | Low | ❌ Terbuka | `.env.example` masih `NODE_ENV=development` → **L-07** |
| L-07 | Low | ❌ Terbuka | `build.sh` masih `prisma db push` → **L-07** |
| L-08 | Low | ⚠️ Sebagian | Nama file UUID ✅; dummy hash timing belum seimbang → **L-03**; Google Fonts masih eksternal |

---

## HIGH

### H-01 — Riwayat git masih menyimpan `backend/.env` lama

**Lokasi:** commit `a4b9d044` (Initial commit) — dihapus dari tracking pada `304bf889` / `bd8bba74`, tetapi isinya tetap ada di riwayat. Remote: `github.com/smartmulia/Dashboard-SMT` (dan fork `holdingpdca-beep` sesuai riwayat merge).

**Temuan:** `git log -p -- backend/.env` masih menampilkan `DATABASE_URL`, `JWT_SECRET`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`. Pada audit v1, nilai di `.env` lokal sudah berbeda dari semua nilai di riwayat (indikasi sudah dirotasi). Yang **tidak dapat diverifikasi** dari kode:
- apakah AccessKey OSS lama sudah **dicabut** di konsol RAM Alibaba Cloud (key lama tetap aktif walaupun aplikasi sudah memakai key baru);
- apakah password DB lama sudah diganti di MySQL server (bukan hanya di file `.env`).

Repo juga kini memiliki lebih dari satu fork/remote, sehingga salinan riwayat tersebar.

**Dampak:** Bila salah satu kredensial lama masih aktif → akses penuh ke bucket OSS / database.

**Rekomendasi:**
1. Konfirmasi tertulis: AccessKey OSS lama berstatus *Disabled/Deleted* di RAM console; password user DB lama sudah tidak berlaku.
2. Bersihkan riwayat: `git filter-repo --path backend/.env --invert-paths` di repo utama **dan** fork, lalu force-push.
3. Pastikan semua repo/fork **private**; aktifkan GitHub Secret Scanning + push protection.
4. Setelah butir 1 terkonfirmasi, temuan ini turun menjadi **Low**.

---

### H-02 — Script SQL & dokumentasi masih membuat akun default `admin123`

**Lokasi:**
- [database/00_JALANKAN_SEMUA.sql:159-167](database/00_JALANKAN_SEMUA.sql#L159-L167) — `INSERT` 3 akun (`admin@smt.com`, `superuser@smt.com`, `user@smt.com`) dengan hash bcrypt `admin123`
- [database/CARA IMPORT DATABASE.txt:81-87](database/CARA%20IMPORT%20DATABASE.txt#L81-L87) — mencantumkan akun & password default
- [database/05_useful_queries.sql:195-198](database/05_useful_queries.sql#L195-L198) — query (dikomentari) untuk me-reset semua password ke `admin123`

**Temuan:** Perbaikan C-03 sudah diterapkan di `seed.js`, README, dan `03_seed_data.sql`, tetapi file `00_JALANKAN_SEMUA.sql` — yang namanya mengarahkan operator untuk "menjalankan semua" — masih membuat tiga akun aktif dengan password yang dikenal publik. Validasi password baru di aplikasi tidak berlaku karena akun dibuat langsung via SQL.

**Dampak:** Bila operator men-setup/me-restore database production memakai `00_JALANKAN_SEMUA.sql`, siapa pun dapat login sebagai ADMIN dengan `admin@smt.com / admin123`.

**Rekomendasi:**
1. Hapus blok `INSERT INTO users` dari `00_JALANKAN_SEMUA.sql` (samakan dengan `03_seed_data.sql`) dan hapus query reset di `05_useful_queries.sql`.
2. Perbarui `CARA IMPORT DATABASE.txt` agar mengarah ke `npm run seed` dengan `SEED_ADMIN_PASSWORD`.
3. Cek DB production sekarang: `SELECT email FROM users WHERE email IN ('admin@smt.com','superuser@smt.com','user@smt.com');` — bila ada, coba login dengan `admin123`; bila berhasil, reset password / nonaktifkan.

---

## MEDIUM

### M-01 — Path traversal pada penghapusan gambar katalog hasil sinkron API

**Lokasi:**
- [backend/src/services/serbamasMapping.js:95, 108](backend/src/services/serbamasMapping.js#L95) — `gambar` diambil mentah dari respons API (`String(gambar)`)
- [backend/src/services/serbamasSync.js:145, 162](backend/src/services/serbamasSync.js#L145) — disimpan ke kolom `gambar` tanpa validasi
- [backend/src/utils/storage.js:130-133](backend/src/utils/storage.js#L130-L133) — `if (gambar.startsWith('/uploads/')) fs.unlinkSync(path.join(LOCAL_ROOT, gambar))`
- Dipanggil dari `deleteKatalog`, `hapusGambar`, dan `updateKatalog` ([katalogController.js:105, 147, 170](backend/src/controllers/katalogController.js#L105)) — dapat diakses `KATALOG_USER`

**Temuan:** `path.join` menormalisasi `..`, sehingga nilai `gambar` seperti `/uploads/../.env` atau `/uploads/../server.js` menunjuk ke file di luar folder upload. Bila API toko (atau pihak yang mampu memanipulasi respons API) mengirim nilai seperti itu, item katalog hasil sinkron akan menyimpannya, dan ketika user menghapus item / gambarnya, server menghapus file tersebut. Pola serupa berlaku di cabang OSS: URL yang diawali `ossPublicBase` akan menghapus key apa pun di bucket.

**Dampak:** Penghapusan file konfigurasi/kode backend (mis. `.env`, `server.js`) → aplikasi gagal start setelah restart; atau penghapusan objek OSS lain. Membutuhkan data API yang berbahaya (API kompromi / salah konfigurasi), sehingga severity Medium.

**Rekomendasi:**
```js
// utils/storage.js — hapusGambar, cabang lokal
const uploadsRoot = path.join(LOCAL_ROOT, 'uploads') + path.sep;
const localPath = path.resolve(LOCAL_ROOT, '.' + gambar);
if (!localPath.startsWith(uploadsRoot)) return; // tolak traversal
```
Tambahan:
- Di controller, hanya hapus file bila `existing.sumber === 'MANUAL'` (gambar API bukan milik server ini).
- Di `mapProduk`, terima `gambar` hanya bila berupa URL `https://` absolut (lihat L-05).
- Pada cabang OSS, pastikan key diawali `katalog/` dan tidak mengandung `..`.

---

### M-02 — Sinkronisasi dapat menghapus seluruh katalog API satu cabang

**Lokasi:** [backend/src/services/serbamasSync.js:59-72, 121-182](backend/src/services/serbamasSync.js#L121-L182)

**Temuan:** Setelah fetch sukses, semua item `sumber: 'API'` yang tidak ada di `seenExternalIds` dihapus permanen. `seenExternalIds` akan **kosong** — dan seluruh item API cabang terhapus — bila:
- respons API berstatus 200 tetapi formatnya berubah (`extractList` tidak menemukan array → `[]`);
- nama field ID berubah sehingga `mapProduk` mengembalikan `null` untuk semua baris;
- `storeName` cabang salah ketik sehingga API mengembalikan daftar kosong;
- API mengembalikan error dalam body 200 (mis. `{ "message": "token expired" }`).

Proses ini dapat dipicu manual oleh `KATALOG_USER` dan otomatis tiap jam oleh scheduler.

**Dampak:** Hilangnya data katalog secara massal tanpa peringatan (integritas & ketersediaan). Gambar OSS terkait tidak ikut terhapus (sampah tersisa).

**Rekomendasi:**
- Bila `rawList.length === 0` **atau** jumlah item ter-mapping = 0 sementara cabang masih punya item API → batalkan penghapusan dan catat warning.
- Tambahkan ambang aman, mis. tolak penghapusan > 50% item dalam satu kali sinkron kecuali di-override ADMIN.
- Validasi struktur respons (wajib array & minimal satu field ID ditemukan).
- Pertimbangkan *soft delete* (`tersedia = false`) daripada hapus permanen.

---

### M-03 — Security header frontend belum terverifikasi

**Lokasi:** [ecosystem.config.js:41-56](ecosystem.config.js#L41-L56) (`pm2 serve`), konfigurasi Apache tidak ada di repo.

**Temuan:** Tidak berubah sejak audit v1. `helmet` hanya melindungi respons API; `index.html` & bundle SPA disajikan PM2 tanpa CSP, `X-Frame-Options`/`frame-ancestors`, HSTS, `Referrer-Policy`. Severity turun dari High ke Medium karena vektor XSS utama (C-02) sudah ditutup, tetapi token tetap di `localStorage` sehingga XSS apa pun di masa depan langsung berujung pencurian sesi; clickjacking pada tombol approve/cancel juga masih mungkin.

**Rekomendasi:** Tambahkan di VirtualHost Apache (sesuaikan `img-src` dengan domain gambar API toko & OSS):
```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Content-Security-Policy "default-src 'self'; img-src 'self' data: blob: https://*.aliyuncs.com https://serbamas.cuan.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
```
Verifikasi dengan `curl -sI https://<domain>/` setelah diterapkan, dan simpan konfigurasi Apache ke repo (mis. `deploy/apache.conf`).

---

### M-04 — File Excel data bisnis & upload masih ter-track di git

**Lokasi:** `git ls-files` masih memuat:
- `Data-Elektronik-1781861644948 (1).xlsx` (berisi kolom COGS, Profit, Harga Jual)
- `Elektronik TV-2.xlsx` (nomor SBG riil + detail barang)
- `Format Excel.xlsx` (baru ditambahkan)
- `uploads/katalog/*.jpg`, `backend/uploads/katalog/*`

**Temuan:** `.gitignore` sudah menambahkan `*.xlsx`, `*.xls`, `uploads/`, tetapi `.gitignore` tidak berlaku untuk file yang **sudah** ter-track. File tetap ikut setiap clone/fork.

**Rekomendasi:**
```bash
git rm --cached "Data-Elektronik-1781861644948 (1).xlsx" "Elektronik TV-2.xlsx"
git rm --cached -r uploads backend/uploads/katalog
```
Bila `Format Excel.xlsx` adalah template kosong yang memang dibutuhkan, pindahkan ke folder khusus (mis. `docs/templates/`) dengan pengecualian `!docs/templates/*.xlsx`. Sertakan file data bisnis dalam pembersihan riwayat H-01 bila dianggap rahasia.

---

## LOW

### L-01 — Sync manual tanpa lock & detail error API bocor ke client
- [routes/katalog.js:27](backend/src/routes/katalog.js#L27): `POST /api/katalog/sync` boleh dipanggil `KATALOG_USER`. Flag `sedangJalan` hanya ada di scheduler, sehingga beberapa sync manual (atau manual + terjadwal) bisa berjalan bersamaan → race pada create (`P2002` unique `cabang_external`), beban ganda ke API toko (timeout 60 detik per cabang).
- [serbamasSync.js:108](backend/src/services/serbamasSync.js#L108): potongan body error API (200 karakter) dimasukkan ke pesan error yang dikirim ke client (`error[]` di respons sync) dan disimpan di audit log.

**Rekomendasi:** pakai satu lock bersama (modul-level) untuk manual & terjadwal, kembalikan 409 bila sedang berjalan; batasi sync manual ke ADMIN/SUPER_USER atau beri rate-limit khusus; kirim pesan generik ke client dan simpan detail hanya di log server.

### L-02 — Barang ART: validasi input & status penjualan
[barangArtController.js](backend/src/controllers/barangArtController.js) (khusus ADMIN):
- Tidak ada express-validator: panjang teks tak dibatasi, `cogs`/`gramasi` negatif diterima, nilai non-angka menghasilkan `NaN` → error 500; `status` query tidak divalidasi enum.
- `markSold` ([:190-252](backend/src/controllers/barangArtController.js#L190-L252)) tidak memeriksa `status === 'BELUM_TERJUAL'` → barang yang sudah terjual dapat "dijual ulang" dan data penjualan lama (vendor, SKU, nominal) tertimpa; array `items` tidak dibatasi jumlahnya.
- `revertSold` tidak mencatat data penjualan lama selain di `dataLama` audit (sudah ada — baik).

**Rekomendasi:** tambahkan rules (`isFloat({min:0})`, `isLength({max})`, `isIn` status), batasi `items` (mis. ≤ 500), dan di `markSold` gunakan `updateMany({ where: { id: { in: ids }, status: 'BELUM_TERJUAL' } })` dengan pengecekan `count`.

### L-03 — User enumeration via timing masih mungkin
[authController.js:9](backend/src/controllers/authController.js#L9): `DUMMY_HASH` dibuat dengan cost **10**, sedangkan password baru di-hash dengan cost **12** (`BCRYPT_COST`). Login ke email yang tidak ada ±4× lebih cepat daripada ke email terdaftar (yang password-nya sudah diganti). Login gagal untuk email tak terdaftar juga menulis baris audit log (dibatasi rate-limit IP 5/15 menit).
**Rekomendasi:** `bcrypt.hashSync('...', BCRYPT_COST)`; rehash password lama ke cost 12 saat login sukses.

### L-04 — Token di `localStorage` & tanpa lockout per akun
Revoke token sudah ada (`tokenVersion`), tetapi token masih dapat dibaca JavaScript. Limiter login hanya per IP. **Rekomendasi jangka menengah:** cookie `HttpOnly; Secure; SameSite=Strict`; lockout per akun (mis. 10 gagal → kunci 15 menit) memanfaatkan data `LOGIN GAGAL` yang kini sudah tercatat; 2FA untuk ADMIN.

### L-05 — URL gambar dari API eksternal tanpa validasi
`gambar` dari API disimpan apa adanya dan dirender di `<img src>` untuk semua user ([Katalog.jsx:43](frontend/src/pages/Katalog.jsx#L43)). Nilai `http://` (mixed content), domain pihak ketiga (tracking IP karyawan), atau path relatif yang aneh akan diterima. React tidak mengeksekusi `javascript:` di `img src`, jadi risiko XSS rendah. **Rekomendasi:** terima hanya `https://` dengan whitelist domain (domain CDN toko/OSS); selaraskan dengan CSP `img-src` di M-03.

### L-06 — Celah validasi kecil
- `alasan` pada reject/cancel invoice tidak dibatasi panjang ([invoiceController.js](backend/src/controllers/invoiceController.js) `rejectInvoice`, `cancelInvoice`).
- `updateInvoiceItemsRules` tidak punya batas maksimum `itemIds` (create sudah `max: 500`).
- Dengan `query parser: simple`, parameter ganda (`?status=A&status=B`) menjadi array → Prisma validation error → 500 (bukan injeksi, hanya respons tidak rapi).
- Error dari `fileFilter`/`MulterError` (file terlalu besar / tipe salah) jatuh ke handler global → 500 "Terjadi kesalahan pada server" di production; sebaiknya 400 dengan pesan jelas.
- `katalogController` & handler sync masih `console.error` (tidak masuk `logs/error.log` winston).

### L-07 — Operasional & deploy
- **`node_modules` lokal usang:** di workspace ini terpasang `multer 1.4.5-lts.2`, `xlsx 0.18.5`, dan `node-cron` belum ada, padahal lockfile sudah `multer 2.4.0` / `xlsx 0.20.3` / `node-cron 3.0.3`. Pastikan server production menjalankan `npm ci` lalu verifikasi `npm ls multer xlsx node-cron`.
- `backend/.env` tidak tersedia di workspace audit → verifikasi di server: `chmod 600`, `NODE_ENV=production`, `JWT_SECRET` ≥ 64 karakter, `SERBAMAS_API_TOKEN` hanya ada di `.env`.
- [.env.example:13](backend/.env.example#L13) masih `NODE_ENV=development` (PM2 meng-override, tapi `node server.js` manual berjalan mode dev).
- [build.sh:39](build.sh#L39) masih `prisma db push` — tanpa riwayat migrasi; perubahan skema besar terakhir (`BarangArt`, kolom sync, `tokenVersion`) sebaiknya lewat `prisma migrate deploy` + backup DB sebelum deploy.
- Rate-limit in-memory (reset tiap restart PM2); `trust proxy 1` hanya benar bila tepat satu reverse proxy.

### L-08 — Username & URL API SERBAMAS ter-hardcode
[serbamasSync.js:20-22](backend/src/services/serbamasSync.js#L20-L22), [.env.example:31-32](backend/.env.example#L31-L32), [SINKRONISASI-KATALOG.md](SINKRONISASI-KATALOG.md): username akun integrasi `SYNCRECONSERBAMAS` dan endpoint internal tercantum di kode & dokumentasi repo. Bukan secret, tetapi mengurangi usaha penyerang (separuh kredensial Basic Auth). **Rekomendasi:** hapus default di kode (wajib dari env), ganti contoh di `.env.example`/dokumentasi dengan placeholder.

### L-09 — Nama customer tetap terlihat role `USER` di Riwayat
[itemController.js](backend/src/controllers/itemController.js) `getRiwayat`: nomor telepon sudah di-null-kan untuk non-admin, tetapi `namaCustomer` dari **semua** invoice (termasuk milik user lain) tetap dikirim. **Rekomendasi:** bila tidak dibutuhkan operasional, sembunyikan `namaCustomer` untuk invoice yang bukan milik user, atau batasi Riwayat untuk role `USER` hanya ke invoice miliknya.

---

## Kontrol keamanan yang sudah baik

- Upload gambar berlapis: whitelist mimetype → ekstensi dari server → magic bytes → nama UUID → `/uploads` hanya ekstensi gambar + `CSP sandbox` + `nosniff`.
- Otorisasi berbasis whitelist (`canSeeAll`, `ELEKTRONIK_ROLES`) di route level (`router.use`) dan controller; `KATALOG_USER` terisolasi dari modul elektronik, invoice, dan Barang ART.
- Barang ART dibatasi khusus ADMIN di level router.
- Revoke token via `tokenVersion` (logout, ganti password, reset password); user nonaktif & perubahan role berlaku seketika.
- Kebijakan password: min 10 karakter, huruf+angka, blacklist password umum, bcrypt cost 12; seed admin wajib password dari env.
- Approval invoice atomik (transaksi + update bersyarat) mencegah double-approve dan barang terjual ganda.
- `query parser: simple`, pagination dibatasi 100, sort di-whitelist, tanggal divalidasi.
- Error internal tidak lagi dikirim ke client (`next(err)` → handler global).
- Audit trail lengkap: elektronik, invoice (termasuk edit), user, katalog, cabang, sync, Barang ART, login sukses & gagal.
- Dependency rentan sudah di-upgrade di lockfile (`multer` 2.4.0, `xlsx` 0.20.3, `jspdf` 3.0.4).
- Tidak ditemukan SQL injection (Prisma + tagged template `$queryRaw`), `eval`, atau `dangerouslySetInnerHTML`.
- Sinkronisasi API: kredensial dari env, timeout 60 detik, fetch gagal → tidak ada penghapusan, item `MANUAL` tidak disentuh.

---

## Rencana perbaikan yang disarankan

| Prioritas | Item | Estimasi |
|---|---|---|
| **Minggu ini** | H-02 (hapus akun default dari `00_JALANKAN_SEMUA.sql` & dokumentasi, cek DB production) | < 30 menit |
| **Minggu ini** | H-01 (konfirmasi pencabutan AccessKey OSS & password DB lama, `git filter-repo` di repo + fork) | 1 jam |
| **Minggu ini** | M-01 (guard path di `hapusGambar` + hanya hapus gambar `MANUAL`) | 30 menit |
| **Minggu ini** | M-02 (pengaman mass-delete sinkronisasi) | 1 jam |
| **Minggu ini** | L-07 butir pertama (`npm ci` di server + verifikasi versi) | 15 menit |
| **≤ 30 hari** | M-03 (header Apache), M-04 (`git rm --cached`), L-01, L-02, L-05 | 0,5–1 hari |
| **Backlog** | L-03, L-04, L-06, L-08, L-09, sisa L-07 | — |

### Catatan batasan audit
- Konfigurasi Apache, firewall, MySQL server, RAM policy Alibaba Cloud, dan `backend/.env` production **tidak** tersedia di workspace, sehingga tidak diverifikasi langsung.
- Kontrak/format respons API SERBAMAS belum diketahui (pemetaan field masih berbasis tebakan menurut `serbamasMapping.js`); risiko M-01/M-02/L-05 dinilai dengan asumsi data API dapat berubah atau tidak tervalidasi.
- Tidak dilakukan pengujian dinamis (penetration test) terhadap server production; seluruh temuan berasal dari analisis kode statis, konfigurasi, dan lockfile.
