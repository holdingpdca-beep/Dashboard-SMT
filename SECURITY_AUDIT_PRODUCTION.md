# Security Audit — Dashboard SMT (Production)

| | |
|---|---|
| **Tanggal audit** | 22 Oktober 2026 |
| **Branch / commit** | `development` @ `5d3198b4` ("go live project") |
| **Cakupan** | Backend (Express + Prisma + MySQL), Frontend (React + Vite), konfigurasi deploy (PM2, `build.sh`), repository & riwayat git, dependency |
| **Metode** | Review kode manual seluruh route/controller/middleware, review konfigurasi, pengecekan riwayat git, pengecekan versi dependency terhadap CVE publik |
| **Skala severity** | **Critical** → **High** → **Medium** → **Low** |

### Definisi severity

| Severity | Arti | Target perbaikan |
|---|---|---|
| **Critical** | Dapat langsung dieksploitasi untuk mengambil alih akun admin / sistem, atau kredensial produksi bocor. | **Sebelum / segera setelah go-live (hari ini)** |
| **High** | Kebocoran data sensitif atau pelanggaran hak akses yang nyata oleh user yang sudah login, atau CVE yang dapat dijangkau. | ≤ 7 hari |
| **Medium** | Kelemahan yang memperbesar dampak serangan lain atau butuh kondisi tertentu. | ≤ 30 hari |
| **Low** | Hardening, best practice, risiko kecil. | Backlog |

---

## Ringkasan

| Severity | Jumlah |
|---|---|
| Critical | 3 |
| High | 5 |
| Medium | 9 |
| Low | 8 |
| **Total** | **25** |

| ID | Severity | Judul |
|---|---|---|
| C-01 | **Critical** | Kredensial produksi (`backend/.env`) tersimpan di riwayat git & sudah ter-push ke GitHub |
| C-02 | **Critical** | Upload file katalog tanpa validasi ekstensi → Stored XSS → pencurian token admin |
| C-03 | **Critical** | Akun default `admin123` + script `fix-password.js` yang me-reset semua password |
| H-01 | **High** | Role `KATALOG_USER` mem-bypass semua pengecekan kepemilikan invoice & penyembunyian COGS |
| H-02 | **High** | Data COGS, profit, dan nomor telepon customer bocor ke role `USER` |
| H-03 | **High** | `xlsx@0.18.5` rentan Prototype Pollution & ReDoS (CVE-2023-30533, CVE-2024-22363) |
| H-04 | **High** | `multer@1.4.5-lts.2` rentan DoS / crash proses (CVE-2025-47944, CVE-2025-47935, CVE-2025-48997, CVE-2025-7338) |
| H-05 | **High** | Frontend production tidak punya security header (CSP, X-Frame-Options, HSTS) |
| M-01 | Medium | Pesan error internal (`err.message`) dikirim ke client di semua controller |
| M-02 | Medium | Parameter query tidak dibatasi: `limit` tak terbatas, `sortBy` bebas, objek query diteruskan ke Prisma |
| M-03 | Medium | Race condition: satu barang bisa masuk 2 invoice dan terjual dua kali |
| M-04 | Medium | Tidak ada pengecekan kepemilikan di `submit` dan `print` invoice |
| M-05 | Medium | JWT di `localStorage` & tidak di-revoke saat logout / ganti password |
| M-06 | Medium | Kebijakan password lemah & proteksi brute-force hanya per IP |
| M-07 | Medium | File `backend/.env` bisa dibaca semua user OS (permission `664`) |
| M-08 | Medium | Data bisnis riil (file `.xlsx`) dan file upload ikut ter-commit di repo |
| M-09 | Medium | Celah audit trail (katalog, cabang, edit invoice, login gagal tidak tercatat) |
| L-01 | Low | Endpoint katalog & cabang tanpa validasi input (express-validator) |
| L-02 | Low | Import Excel tanpa batas jumlah baris & tanpa transaksi |
| L-03 | Low | Admin dapat menonaktifkan / menurunkan role dirinya sendiri & admin terakhir |
| L-04 | Low | Rate-limit in-memory & ketergantungan pada `trust proxy` |
| L-05 | Low | Dependency frontend: `jspdf@2.5.2` (CVE-2025-29907) & `xlsx@0.18.5` |
| L-06 | Low | `NODE_ENV=development` di `backend/.env` (bergantung pada PM2 untuk override) |
| L-07 | Low | `prisma db push` dipakai di production deploy |
| L-08 | Low | Informasi minor: user enumeration via timing, Google Fonts eksternal, nama file upload mudah ditebak |

---

## CRITICAL

### C-01 — Kredensial produksi tersimpan di riwayat git & sudah ter-push ke GitHub

**Lokasi:** riwayat git, commit `a4b9d044` (Initial commit, 2026-07-03); remote `origin https://github.com/smartmulia/Dashboard-SMT.git`

**Temuan:**
File `backend/.env` ter-commit pada initial commit dan baru di-untrack pada `304bf889` / `bd8bba74`. Untrack **tidak menghapus** isinya dari riwayat — siapa pun yang punya akses clone repo dapat menjalankan `git log -p` dan memperoleh:

- `DATABASE_URL` (host, user, password MySQL)
- `JWT_SECRET`
- `OSS_ACCESS_KEY_ID` dan `OSS_ACCESS_KEY_SECRET` (Alibaba Cloud)

Perbandingan hash menunjukkan nilai di `backend/.env` saat ini **berbeda** dari semua nilai di riwayat (indikasi sudah diganti). Namun ini perlu dipastikan untuk **setiap** kredensial — terutama AccessKey Alibaba Cloud yang tetap aktif sampai dicabut manual di konsol RAM, walaupun file lokal sudah memakai key baru.

**Dampak:** Dengan `JWT_SECRET` lama yang masih aktif, penyerang dapat membuat token ADMIN sendiri. Dengan AccessKey OSS lama, penyerang dapat membaca/menghapus/menimpa isi bucket (atau lebih, tergantung policy RAM). Dengan kredensial DB, akses penuh ke data bila port MySQL terjangkau.

**Rekomendasi:**
1. Pastikan dan dokumentasikan rotasi: `JWT_SECRET` baru, password user DB `smt_dashboard` baru, **cabut (disable + delete) AccessKey OSS lama** di konsol RAM Alibaba Cloud.
2. Batasi AccessKey OSS baru dengan RAM policy minimal (hanya `oss:PutObject`, `oss:DeleteObject` pada `acs:oss:*:*:<bucket>/katalog/*`).
3. Bersihkan riwayat git: `git filter-repo --path backend/.env --invert-paths`, lalu force-push dan minta semua kolaborator clone ulang.
4. Pastikan repo GitHub berstatus **private**; aktifkan GitHub Secret Scanning / push protection.

---

### C-02 — Upload file katalog tanpa validasi ekstensi → Stored XSS → pengambilalihan akun admin

**Lokasi:**
- [backend/src/routes/katalog.js:10-17](backend/src/routes/katalog.js#L10-L17) — filter hanya `file.mimetype.startsWith('image/')`
- [backend/src/utils/storage.js:48-49](backend/src/utils/storage.js#L48-L49) — ekstensi diambil dari `file.originalname`
- [backend/server.js:82](backend/server.js#L82) — `/uploads` disajikan statis dari origin yang sama dengan aplikasi
- [frontend/src/utils/api.js:9](frontend/src/utils/api.js#L9) — token JWT disimpan di `localStorage`

**Temuan:**
`mimetype` dan `originalname` sepenuhnya dikontrol client. Request multipart dengan `Content-Type: image/png` tetapi `filename="x.html"` (atau `.js`, `.svg`) akan lolos filter dan disimpan sebagai `uploads/katalog/katalog_<timestamp>.html`. Karena Apache mem-proxy `/uploads` ke backend, file tersebut tersaji dari **domain yang sama** dengan dashboard.

CSP default helmet (`script-src 'self'`) tidak menolong: penyerang cukup meng-upload dua file — satu `.js` berisi payload dan satu `.html` yang memuat `<script src="/uploads/katalog/katalog_X.js">` — keduanya dianggap `'self'`.

Endpoint ini terbuka untuk role terendah sekalipun (`KATALOG_USER`).

**Dampak:** `KATALOG_USER` mengirim link file tersebut ke admin → script berjalan di origin dashboard → membaca `localStorage.token` → penyerang memakai token admin (buat user ADMIN baru, approve/cancel invoice, ekspor seluruh data). **Eskalasi hak akses dari role terendah ke ADMIN.**

(Bila memakai OSS, file tersaji dari domain bucket yang berbeda sehingga dampak lebih kecil, tetapi konten berbahaya tetap ter-hosting atas nama perusahaan.)

**Rekomendasi:**
```js
// routes/katalog.js
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
fileFilter: (req, file, cb) =>
  IMAGE_TYPES[file.mimetype] ? cb(null, true) : cb(new Error('Hanya JPG/PNG/WEBP'))

// utils/storage.js — JANGAN pakai ekstensi dari originalname
const ext = IMAGE_TYPES[file.mimetype];
```
Tambahan:
- Verifikasi magic bytes (mis. 8 byte pertama PNG `89 50 4E 47`, JPEG `FF D8 FF`) atau re-encode gambar (mis. `sharp`).
- Tolak SVG.
- Pada `express.static('/uploads')` tambahkan header `Content-Disposition`/`Content-Security-Policy: default-src 'none'; sandbox` untuk semua file di sana, dan hanya layani ekstensi gambar.
- Hapus file non-gambar yang mungkin sudah ada di `backend/uploads/` dan bucket OSS.

---

### C-03 — Akun default `admin123` dan script reset password di repo

**Lokasi:**
- [backend/prisma/seed.js:7](backend/prisma/seed.js#L7) — 3 akun (`admin@smt.com`, `superuser@smt.com`, `user@smt.com`) dengan password `admin123`
- [backend/fix-password.js](backend/fix-password.js) — **me-reset** password ketiga akun ke `admin123` (pakai `upsert … update: { password }`), dan membuat ulang bila sudah dihapus
- [database/03_seed_data.sql](database/03_seed_data.sql), [README.md:151-157](README.md#L151-L157), `CARA MENJALANKAN.txt:110-112` — kredensial terpublikasi

**Dampak:** Bila seed pernah dijalankan di production dan password belum diganti (atau `fix-password.js` dijalankan kapan pun), siapa pun yang membaca README dapat login sebagai ADMIN. Rate-limit login (5x/15 menit) tidak membantu karena tebakan pertama sudah benar.

**Rekomendasi:**
1. Cek DB production sekarang: login dengan `admin@smt.com / admin123`. Bila berhasil → ganti password segera atau nonaktifkan/hapus akun default.
2. Hapus `backend/fix-password.js` dari repo.
3. Ubah `seed.js` agar password admin dibaca dari env (`SEED_ADMIN_PASSWORD`) dan gagal jika tidak di-set; jangan seed akun `superuser`/`user` di production.
4. Hapus tabel kredensial dari README / `CARA MENJALANKAN.txt` / `03_seed_data.sql`.

---

## HIGH

### H-01 — Role `KATALOG_USER` mem-bypass pengecekan kepemilikan invoice & penyembunyian COGS

**Lokasi:** semua pengecekan yang berbentuk `req.user.role === 'USER'`:
- [invoiceController.js:71](backend/src/controllers/invoiceController.js#L71) (`getInvoices`), [:115](backend/src/controllers/invoiceController.js#L115) (`getInvoiceById`), [:203](backend/src/controllers/invoiceController.js#L203) (`updateInvoice`), [:238](backend/src/controllers/invoiceController.js#L238) (`updateInvoiceItems`), [:453](backend/src/controllers/invoiceController.js#L453) (`deleteInvoice`)
- [itemController.js:85](backend/src/controllers/itemController.js#L85), [:103](backend/src/controllers/itemController.js#L103), [:339](backend/src/controllers/itemController.js#L339) (`hideCogs`)
- [routes/invoices.js](backend/src/routes/invoices.js), [routes/items.js:25-29](backend/src/routes/items.js#L25-L29) — tidak ada `requireRole` pada GET/POST invoice dan GET item

**Temuan:** Role `KATALOG_USER` (ditambahkan belakangan) tidak tercakup dalam pengecekan yang hanya membandingkan dengan `'USER'`. Akibatnya `KATALOG_USER`:
- melihat **semua** invoice semua user, termasuk nama & telepon customer;
- dapat **mengedit, mengganti item, menghapus, dan submit** invoice milik siapa pun;
- melihat **COGS** di list item, detail item, dan file export Excel;
- dapat membuat invoice baru.

**Rekomendasi:** Ganti pola blacklist menjadi whitelist.
```js
// roleCheck.js
const canSeeAll = (u) => ['ADMIN', 'SUPER_USER'].includes(u.role);
// controller
if (!canSeeAll(req.user)) where.createdById = req.user.id;
const hideCogs = !canSeeAll(req.user);
```
Dan batasi route modul elektronik/invoice: `requireRole('ADMIN','SUPER_USER','USER')`, sehingga `KATALOG_USER` hanya bisa mengakses `/api/katalog` & `GET /api/cabang`.

---

### H-02 — COGS, profit, dan telepon customer bocor ke role `USER`

**Lokasi:**
- [itemController.js:512-568](backend/src/controllers/itemController.js#L512-L568) `getRiwayat` — tanpa filter role; mengembalikan seluruh kolom `elektronik` (**termasuk `cogs`**), `profit`, serta `namaCustomer` & `noTelepon` dari invoice **semua user**
- [itemController.js:384-510](backend/src/controllers/itemController.js#L384-L510) `getStats` — mengembalikan `totalCogs`, `totalProfit`, `topProfit`, `trendRugi` (berisi `totalCogs`) ke semua role
- [invoiceController.js:111](backend/src/controllers/invoiceController.js#L111) `getInvoiceById` — `include: { elektronik: true }` membawa `cogs`
- [itemController.js:81](backend/src/controllers/itemController.js#L81) — `sortBy=cogs` dapat dipakai sebagai oracle urutan COGS walaupun kolomnya disembunyikan

**Dampak:** Kebijakan "USER tidak boleh melihat COGS" yang sudah diterapkan di `getItems` dapat dielakkan lewat endpoint lain. Data pribadi customer (nomor telepon) terekspos ke semua karyawan — relevan terhadap **UU PDP No. 27/2022**.

**Rekomendasi:**
- `getRiwayat` & `getStats`: `requireRole('ADMIN','SUPER_USER')`, atau buang field `cogs`/`profit`/`noTelepon` untuk role lain.
- `getInvoiceById`: `items: { include: { elektronik: { select: { id: true, nomorSbg: true, jenisBarang: true, detailBarang: true, status: true } } } }`.
- Whitelist `sortBy` (lihat M-02) dan keluarkan `cogs`/`profit` dari whitelist untuk role non-admin.

---

### H-03 — `xlsx@0.18.5` rentan (backend)

**Lokasi:** [backend/package.json:29](backend/package.json#L29), dipakai di [itemController.js:262](backend/src/controllers/itemController.js#L262) (`XLSX.read` pada file upload)

**Temuan:** Versi 0.18.5 adalah versi terakhir di registry npm dan **tidak akan mendapat patch di npm**. CVE yang diketahui:
- **CVE-2023-30533** — Prototype Pollution saat membaca file yang dibuat khusus (diperbaiki 0.19.3)
- **CVE-2024-22363** — ReDoS (diperbaiki 0.20.2)

Dapat dijangkau oleh `SUPER_USER`/`ADMIN` lewat import Excel (atau oleh siapa saja yang mengirim file berbahaya ke mereka untuk di-import).

**Dampak:** Prototype pollution di proses Node dapat mengubah perilaku aplikasi (termasuk bypass logika otorisasi) atau crash; ReDoS dapat membekukan event loop → seluruh API down.

**Rekomendasi:** Ganti ke build resmi SheetJS: `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (atau migrasi ke `exceljs`).

---

### H-04 — `multer@1.4.5-lts.2` rentan DoS / crash proses

**Lokasi:** [backend/package.json:26](backend/package.json#L26), dipakai di `routes/items.js` dan `routes/katalog.js`

**Temuan:** CVE-2025-47944, CVE-2025-47935, CVE-2025-48997, CVE-2025-7338 — request multipart yang malformed dapat menyebabkan unhandled exception (proses Node mati) atau kebocoran memori/file descriptor. Semua diperbaiki di multer **2.x**.

**Dampak:** Satu request dari user mana pun yang login dengan role yang boleh upload (termasuk `KATALOG_USER`) dapat mematikan backend. PM2 akan restart, tetapi serangan berulang = downtime berkelanjutan.

**Rekomendasi:** `npm i multer@^2.0.2` (API `memoryStorage`/`single` kompatibel), lalu uji ulang upload katalog & import Excel.

---

### H-05 — Frontend production tanpa security header

**Lokasi:** [ecosystem.config.js:41-56](ecosystem.config.js#L41-L56) — frontend disajikan via `pm2 serve`; `helmet` hanya terpasang di Express backend.

**Temuan:** Halaman `index.html` dan bundle JS dikirim tanpa `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` — kecuali Apache sudah menambahkannya (belum ada konfigurasi Apache di repo untuk diverifikasi).

**Dampak:** Tidak ada lapisan pertahanan bila terjadi XSS (token di `localStorage` langsung bisa dicuri); halaman dapat di-iframe (clickjacking pada tombol approve/cancel/hapus).

**Rekomendasi:** Tambahkan di VirtualHost Apache (berlaku untuk frontend & backend):
```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Content-Security-Policy "default-src 'self'; img-src 'self' data: blob: https://*.aliyuncs.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
```
Pastikan juga HTTP → HTTPS redirect aktif dan port 5000/5173 hanya listen di `127.0.0.1` / diblok firewall dari luar.

---

## MEDIUM

### M-01 — Pesan error internal dikirim ke client

**Lokasi:** hampir semua `catch` di controller: `res.status(500).json({ success: false, message: err.message })` — `authController`, `userController`, `invoiceController`, `itemController`, `auditController`, `notifikasiController`, `cabangController`.

**Temuan:** Error handler global di [server.js:97-102](backend/server.js#L97-L102) sudah menyembunyikan detail di production, tetapi controller **tidak pernah memanggil `next(err)`** — mereka langsung merespons dengan `err.message`. Error Prisma memuat nama tabel, kolom, constraint, dan potongan query.

**Rekomendasi:** Ganti semua blok tersebut dengan `catch (err) { next(err) }` (tambahkan parameter `next`), sehingga satu error handler global yang memutuskan isi respons dan mencatat ke log.

---

### M-02 — Parameter query tidak dibatasi

**Lokasi:** `getItems`, `getInvoices`, `getAuditLogs`, `getRiwayat`, `buildWhere`, `getKatalog`

**Temuan:**
- `limit` tanpa batas atas → `?limit=10000000` menarik seluruh tabel dalam satu request (DoS + ekstraksi massal). `page`/`limit` non-angka → `NaN` → error 500.
- `sortBy` dimasukkan langsung sebagai key `orderBy` → pengurutan berdasarkan kolom apa pun (lihat H-02).
- Express 4 memakai parser `qs` (extended), sehingga `?status[not]=X` atau `?search[startsWith]=…` menghasilkan **objek**, bukan string, yang diteruskan ke filter Prisma. Pengguna dapat menyusun filter yang tidak dimaksudkan developer.
- `startDate`/`endDate` tidak divalidasi (`Invalid Date` → 500).

**Rekomendasi:**
```js
const toInt = (v, def, max) => Math.min(Math.max(parseInt(v, 10) || def, 1), max);
const limit = toInt(req.query.limit, 20, 100);
const SORTABLE = ['createdAt', 'tanggalLelang', 'nomorSbg', 'grade', 'hargaJual'];
const sortBy = SORTABLE.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
```
Dan set `app.set('query parser', 'simple')` di `server.js` agar semua query param selalu string, atau validasi dengan `query()` dari express-validator (`isIn` untuk enum `status`, `grade`, `perusahaan`).

---

### M-03 — Race condition: barang dapat terjual dua kali

**Lokasi:** [invoiceController.js:35-63](backend/src/controllers/invoiceController.js#L35-L63) (`validasiBarangInvoice`), `createInvoice`, `updateInvoiceItems`, `approveInvoice` [:329-347](backend/src/controllers/invoiceController.js#L329-L347)

**Temuan:** Pengecekan "barang belum dipakai invoice aktif lain" dan pembuatan invoice dilakukan di query terpisah tanpa transaksi/lock. Dua request bersamaan dapat sama-sama lolos validasi untuk barang yang sama. `approveInvoice` juga tidak memeriksa ulang `status === 'BELUM_TERJUAL'` di dalam transaksi, dan update status invoice tidak atomik (`WHERE status = 'WAITING_APPROVAL'`), sehingga double-approve juga mungkin.

**Dampak:** Satu barang tercatat di dua invoice yang sama-sama disetujui → selisih stok dan laporan keuangan.

**Rekomendasi:**
- Di `approveInvoice`, gunakan interactive transaction: `updateMany({ where: { id, status: 'WAITING_APPROVAL' } })` dan pastikan `count === 1`; lalu `elektronik.updateMany({ where: { id: { in: ids }, status: 'BELUM_TERJUAL' } })` dan batalkan transaksi bila `count !== ids.length`.
- Alternatif struktural: kolom `activeInvoiceId` di `elektronik` dengan unique/conditional update.

---

### M-04 — Tidak ada pengecekan kepemilikan pada `submit` & `print` invoice

**Lokasi:** [invoiceController.js:284-321](backend/src/controllers/invoiceController.js#L284-L321) `submitApproval`, [:413-440](backend/src/controllers/invoiceController.js#L413-L440) `printInvoice`

**Temuan:** User mana pun dapat men-submit invoice DRAFT milik orang lain (mengubah alur kerja tanpa persetujuan pembuat) dan menandai invoice APPROVED milik orang lain sebagai PRINTED.

**Rekomendasi:** Tambahkan pengecekan yang sama dengan `updateInvoice` (setelah perbaikan H-01): hanya pembuat atau ADMIN/SUPER_USER.

---

### M-05 — JWT di `localStorage` dan tidak dapat di-revoke

**Lokasi:** [frontend/src/contexts/AuthContext.jsx:31](frontend/src/contexts/AuthContext.jsx#L31), [authController.js:49-61](backend/src/controllers/authController.js#L49-L61) (`logout` hanya mencatat audit)

**Temuan:** Token berlaku 8 jam dan tetap valid setelah logout atau ganti/reset password. (Sisi positif: `auth.js` membaca user & role dari DB setiap request, sehingga **nonaktifkan user** dan **perubahan role** langsung berlaku.) Token di `localStorage` dapat dibaca oleh XSS apa pun (lihat C-02).

**Rekomendasi:**
- Tambah kolom `tokenVersion` (int) di `User`; masukkan ke payload JWT; naikkan nilainya saat logout, change-password, dan reset-password; tolak token bila versi berbeda di `auth.js`.
- Jangka menengah: pindahkan token ke cookie `HttpOnly; Secure; SameSite=Strict`.

---

### M-06 — Kebijakan password lemah & brute-force hanya dibatasi per IP

**Lokasi:** [validators.js:19, 68, 79](backend/src/middleware/validators.js#L19), [server.js:71-79](backend/server.js#L71-L79)

**Temuan:** Minimal 6 karakter tanpa aturan lain; bcrypt cost 10; limiter login berbasis IP saja (penyerang dengan banyak IP tidak terbatas; sebaliknya seluruh kantor di balik satu NAT dapat terkunci bersama).

**Rekomendasi:** Minimal 10–12 karakter, tolak password umum (`admin123`, `password`, dll.), bcrypt cost 12; tambah lockout per akun (mis. 10 gagal → kunci 15 menit) dan catat login gagal di audit log. Pertimbangkan 2FA (TOTP) untuk ADMIN.

---

### M-07 — `backend/.env` dapat dibaca semua user OS

**Lokasi:** `backend/.env` permission `664` (`-rw-rw-r--`)

**Rekomendasi:** `chmod 600 backend/.env` dan pastikan pemiliknya adalah user yang menjalankan PM2. Berlaku juga untuk folder `backend/logs/` (berisi IP & URL akses).

---

### M-08 — Data bisnis riil dan file upload ter-commit di repo

**Lokasi:** `Data-Elektronik-1781861644948 (1).xlsx` (hasil export dengan kolom COGS, Profit, Harga Jual), `Elektronik TV-2.xlsx` (nomor SBG riil + detail barang), `uploads/katalog/*.jpg`, `backend/uploads/katalog/*`

**Temuan:** `.gitignore` mengabaikan `backend/uploads/*`, tetapi file di dalamnya sudah ter-track sebelumnya; folder `uploads/` di root juga ter-track. File Excel berisi data operasional internal.

**Rekomendasi:** `git rm --cached` file-file tersebut, tambahkan `*.xlsx` dan `uploads/` ke `.gitignore`, dan sertakan dalam pembersihan riwayat C-01 bila data dianggap rahasia.

---

### M-09 — Celah audit trail

**Lokasi:** `katalogController.js`, `cabangController.js`, `updateInvoice`, `login` (gagal), [utils/audit.js:16-18](backend/src/utils/audit.js#L16-L18)

**Temuan:**
- Create/update/delete katalog & cabang tidak dicatat sama sekali.
- `updateInvoice` (edit nama customer, telepon, tanggal, perusahaan) tidak dicatat.
- Login gagal tidak dicatat → brute-force tidak terdeteksi.
- Kegagalan menulis audit hanya `console.error` (tidak masuk winston log production).

**Rekomendasi:** Tambahkan `createAuditLog` pada operasi di atas (termasuk `dataLama`/`dataBaru`), catat `LOGIN GAGAL` dengan email & IP, dan ganti `console.error` dengan `logger.error`.

---

## LOW

### L-01 — Endpoint katalog & cabang tanpa validasi input
[routes/katalog.js](backend/src/routes/katalog.js), [routes/cabang.js](backend/src/routes/cabang.js) tidak memakai express-validator. `kategori` tidak divalidasi terhadap enum (`PERHIASAN`/`LM`) → error 500; `harga` dapat bernilai `NaN`/negatif; `cabangId` tidak dicek keberadaannya. Field teks di invoice (`namaCustomer`, `catatan`, `alasan`, `noTelepon`) juga tidak dibatasi panjangnya. **Rekomendasi:** tambahkan rules `isIn`, `isFloat({min:0})`, `isLength({max:…})`.

### L-02 — Import Excel tanpa batas baris & tanpa transaksi
[itemController.js:255-332](backend/src/controllers/itemController.js#L255-L332) — file 10 MB bisa berisi puluhan ribu baris, diproses dengan 2 query per baris secara berurutan (request sangat lama, membebani DB). Import yang gagal di tengah menyisakan data setengah jadi; `errors[]` mengembalikan `e.message` mentah. **Rekomendasi:** batasi jumlah baris (mis. 2.000), bungkus dalam transaksi, dan sanitasi pesan error.

### L-03 — Admin dapat mengunci diri / menghapus admin terakhir
[userController.js:54-92](backend/src/controllers/userController.js#L54-L92) — `updateUser` mengizinkan admin menonaktifkan atau menurunkan role dirinya sendiri, dan tidak ada pengecekan "minimal satu ADMIN aktif". `isActive` tidak divalidasi bertipe boolean. **Rekomendasi:** tolak perubahan role/isActive pada diri sendiri, dan cegah operasi yang membuat jumlah ADMIN aktif = 0.

### L-04 — Rate-limit in-memory & `trust proxy`
[server.js:39, 61-79](backend/server.js#L39) — store in-memory hilang saat restart PM2 dan tidak berbagi antar instance. `trust proxy 1` benar hanya bila tepat satu reverse proxy (Apache) di depan; bila ada CDN/LB tambahan, IP klien dapat dipalsukan via `X-Forwarded-For` sehingga rate-limit dan IP audit log tidak akurat. **Rekomendasi:** verifikasi topologi; pertimbangkan store Redis bila scale-out.

### L-05 — Dependency frontend
`jspdf@2.5.2` — CVE-2025-29907 (ReDoS, diperbaiki 3.0.1); `xlsx@0.18.5` di frontend (hanya memproses file milik user sendiri di browser → risiko rendah). **Rekomendasi:** upgrade `jspdf@^3`, ganti `xlsx` ke build CDN SheetJS 0.20.3. Jalankan `npm audit` di kedua folder secara rutin (CI).

### L-06 — `NODE_ENV=development` di `backend/.env`
PM2 meng-inject `NODE_ENV=production` sehingga saat dijalankan via `ecosystem.config.js` aman (dotenv tidak menimpa env yang sudah ada). Namun bila backend dijalankan manual (`npm start`/`node server.js`), aplikasi berjalan dalam mode development: logging query Prisma, pesan error detail, pengecekan `FRONTEND_URL` & panjang `JWT_SECRET` dilewati. **Rekomendasi:** set `NODE_ENV=production` di `.env` server production.

### L-07 — `prisma db push` di production
[build.sh:39](build.sh#L39) — `db push` tidak menyimpan riwayat migrasi dan dapat gagal/meminta data-loss pada perubahan skema destruktif. **Rekomendasi:** gunakan `prisma migrate deploy` dengan folder migration ter-versioning, dan backup DB sebelum deploy.

### L-08 — Informasi minor
- **User enumeration via timing:** [authController.js:13-21](backend/src/controllers/authController.js#L13-L21) melewati `bcrypt.compare` bila email tidak ada (respons lebih cepat). Lakukan compare terhadap hash dummy.
- **Google Fonts eksternal** di [frontend/index.html](frontend/index.html) — IP pengguna dikirim ke pihak ketiga; self-host font bila diperlukan.
- **Nama file upload mudah ditebak** (`katalog_<timestamp>`) dan objek OSS `public-read` — dapat diterima untuk gambar katalog publik, tetapi gunakan UUID (`uuid` sudah terpasang) agar tidak bisa dienumerasi.
- **Script Windows/dev** (`*.bat`, `dev.sh`, `fix-prisma.bat`) ikut ter-deploy ke server — tidak berbahaya, tetapi sebaiknya tidak ada di direktori production.

---

## Kontrol keamanan yang sudah baik

- `helmet`, CORS dibatasi ke `FRONTEND_URL`, body limit diturunkan ke 10 MB.
- Rate-limit global (100/menit) dan khusus login (5/15 menit).
- Validasi env wajib saat startup; `JWT_SECRET` ≥ 32 karakter di production (nilai saat ini 96 karakter).
- Middleware `auth` memuat user dari DB setiap request → nonaktifkan user & perubahan role berlaku seketika.
- Password di-hash dengan bcrypt; field `password` tidak pernah dikembalikan di respons.
- Prisma (query terparameter) — tidak ditemukan SQL injection; `$queryRaw` memakai tagged template.
- Segregation of duties: pembuat invoice tidak dapat menyetujui invoicenya sendiri.
- Status barang hanya berubah lewat alur invoice; barang TERJUAL tidak dapat diubah harganya / di-overwrite via import.
- Audit log untuk operasi utama elektronik, invoice, user; hanya ADMIN/SUPER_USER yang dapat membacanya.
- Tidak ditemukan `dangerouslySetInnerHTML` / `eval` di frontend.
- `backend/.env` sudah dikeluarkan dari tracking git.

---

## Rencana perbaikan yang disarankan

| Prioritas | Item | Estimasi |
|---|---|---|
| **Hari ini** | C-01 (verifikasi rotasi + cabut AccessKey OSS lama), C-03 (cek & ganti akun default, hapus `fix-password.js`), M-07 (`chmod 600`) | < 1 jam |
| **Hari ini** | C-02 (whitelist mime → ekstensi server-side, bersihkan folder upload) | 1–2 jam |
| **Minggu ini** | H-01, H-02, M-04 (refactor pengecekan role ke whitelist) | 2–4 jam |
| **Minggu ini** | H-03, H-04 (upgrade `xlsx` & `multer`, uji regresi import/upload) | 1–2 jam |
| **Minggu ini** | H-05 (header keamanan di Apache), L-06 | < 1 jam |
| **≤ 30 hari** | M-01, M-02, M-03, M-05, M-06, M-08, M-09 | 1–2 hari |
| **Backlog** | L-01 s.d. L-08 | — |

### Catatan batasan audit
- Konfigurasi Apache, firewall, MySQL server, dan RAM policy Alibaba Cloud **tidak** tersedia di repo, sehingga tidak diverifikasi langsung.
- Tidak dilakukan pengujian dinamis (penetration test) terhadap server production; seluruh temuan berasal dari analisis kode statis dan konfigurasi.
- Status CVE dependency diperiksa berdasarkan versi yang terpasang di `node_modules`; jalankan `npm audit` di server untuk konfirmasi terbaru.
