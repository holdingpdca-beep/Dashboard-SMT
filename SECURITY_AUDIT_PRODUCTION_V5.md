# Security Audit v5 — Dashboard SMT (Production)

| | |
|---|---|
| **Tanggal audit** | 23 November 2026 (revisi 3 — menggantikan revisi 2 tanggal 12 November 2026) |
| **Branch / commit** | `main` @ `3296cef3` (Merge PR #10 — termasuk `160fc12a` "Update Dashboard Elektronik SMT") |
| **Riwayat revisi** | rev 1 @ `40225a30` (PR #8, remediasi v4) · rev 2 @ `7364fa7e` (PR #9, katalog publik & nomor `SMT-`) · **rev 3 @ `3296cef3`** (PR #10) |
| **Audit sebelumnya** | v1 [SECURITY_AUDIT_PRODUCTION.md](SECURITY_AUDIT_PRODUCTION.md) · v2 [SECURITY_AUDIT_PRODUCTION_V2.md](SECURITY_AUDIT_PRODUCTION_V2.md) · v3 `SECURITY_AUDIT_PRODUCTION_V3.md` · v4 [SECURITY_AUDIT_PRODUCTION_V4.md](SECURITY_AUDIT_PRODUCTION_V4.md) (@ `47849eac`) |
| **Cakupan** | Seluruh backend & frontend, fokus pada perubahan PR #10: **modul Barang ART baru** (tahap AKTIF/EKSPORT/TERJUAL/DILEBUR, kode otomatis LMN/LMS/EKS, upload foto, lebur), **modul Cukim** (`/api/cukim`), **tabel `kode_counter`**, kolom `vendor` di Elektronik, **detail barang di katalog publik**, perubahan upload OSS; plus status seluruh temuan revisi 2 |
| **Metode** | Review kode manual (diff `7364fa7e..3296cef3` + seluruh route/controller terkait), review skema & dampak `prisma db push`, review konfigurasi deploy |
| **Skala severity** | **Critical** → **High** → **Medium** → **Low** |

### Definisi severity

| Severity | Arti | Target perbaikan |
|---|---|---|
| **Critical** | Dapat langsung dieksploitasi untuk mengambil alih akun admin / sistem, atau kredensial produksi aktif bocor. | Segera (hari ini) |
| **High** | Kebocoran kredensial/data sensitif yang masih mungkin aktif, atau pelanggaran hak akses / kontrol keuangan yang nyata. | ≤ 7 hari |
| **Medium** | Kelemahan yang butuh kondisi tertentu, kebocoran data terbatas, celah jejak audit transaksi keuangan, atau risiko rusaknya catatan keuangan/inventaris saat deploy. | ≤ 30 hari (M-04: **sebelum deploy**) |
| **Low** | Hardening, best practice, risiko kecil. | Backlog |

---

## Ringkasan

PR #10 adalah **perubahan fitur besar** pada modul Barang ART (emas). Ada siklus barang baru (Logam Mulia / Perhiasan → Barang Eksport / Terjual / Dilebur), kode barang otomatis, foto barang, dan modul **Cukim** untuk hasil lebur. Tidak ada temuan revisi 2 yang dikerjakan.

Dari sisi keamanan, modul baru ini **dibangun dengan aman**:
- Seluruh `/api/barang-art` dan `/api/cukim` khusus **ADMIN**.
- Upload foto memakai whitelist MIME, cek *magic bytes*, nama file acak, dan batas 5 MB.
- Guard hapus file diperluas ke folder `barang-art/` tanpa membuka *path traversal*.
- Query Prisma tetap terparameterisasi.

Temuan baru terutama menyangkut **integritas data keuangan/inventaris emas**:

1. **(Medium, baru — tangani SEBELUM deploy) M-04.** Kolom baru `tahap` diisi default `AKTIF` oleh `prisma db push`. Akibatnya **semua Barang ART yang sudah terjual sebelum update ini akan muncul lagi sebagai stok aktif**: bisa dijual, dilebur, atau dieksport ulang, sementara tab History kosong. Perlu satu query *backfill* setelah `db push`.
2. **(Low, baru) L-09.** Perpindahan tahap dan penomoran kode belum benar-benar atomik:
   - nomor kode/Cukim bisa kembar saat dua aksi bersamaan;
   - barang bisa dilebur dua kali;
   - "batal lebur" tidak mengurangi COGS Cukim, dan tetap diizinkan walau Cukim-nya sudah terjual.
3. **M-03 makin terekspos.** Katalog publik kini punya modal "Detail Barang" yang menampilkan `keterangan` **lengkap** ke siapa saja.
4. **M-02 meluas.** Audit "TANDAI TERJUAL CUKIM" mencantumkan semua nomor Cukim dalam kolom 191 karakter, sehingga penjualan ±24+ Cukim sekaligus **tidak tercatat** di audit log.

**C-01 (akun `admin@smt.com` / `admin123`) sudah ditutup** — pemilik sistem mengonfirmasi password sudah diganti (lihat bagian status). **Tidak ada lagi temuan Critical**; satu-satunya High adalah H-01 (kredensial lama di riwayat git).

| Severity | Jumlah |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 4 |
| Low | 10 |
| **Total** | **15** |

| ID | Severity | Judul | Asal |
|---|---|---|---|
| ~~C-01~~ | ~~Critical~~ | ~~Akun ADMIN default `admin@smt.com` dengan password publik `admin123`~~ — **✅ Ditutup** | Sisa rev 2 |
| H-01 | **High** | Riwayat git masih menyimpan `backend/.env` lama; pencabutan kredensial lama belum terkonfirmasi | Sisa rev 2 |
| M-01 | Medium | `Format Excel.xlsx` masih berisi data barang (nomor seri LM) | Sisa rev 2 |
| M-02 | Medium | Audit log gagal diam-diam untuk teks panjang (void struk, **jual Cukim massal**) — kolom `aktivitas` VARCHAR(191) | Sisa rev 2 (**meluas**) |
| M-03 | Medium | Katalog publik membuka kolom `keterangan` ke internet — kini juga lewat modal detail | Sisa rev 2 (**makin terekspos**) |
| M-04 | Medium | Deploy `db push` membuat Barang ART yang sudah terjual kembali berstatus **AKTIF** (tanpa backfill `tahap`) | **Baru** |
| L-01 | Low | Frontend PM2 `:5173` di semua interface; CSP Apache menimpa CSP `/uploads` | Sisa rev 2 |
| L-02 | Low | JWT di `localStorage`; tanpa lockout per akun | Sisa rev 2 |
| L-03 | Low | Operasional: belum ada migrasi, `db push` tanpa backup di `.bat`, `npm audit` belum dianalisis, sisa file di server | Sisa rev 2 |
| L-04 | Low | COGS dapat dihitung balik dari harga; HARGA SMT publik | Sisa rev 2 |
| L-05 | Low | Void struk: harga di-reset tanpa override, input tanpa validator | Sisa rev 2 |
| L-06 | Low | Nomor struk elektronik dapat kembar saat dua penjualan bersamaan | Sisa rev 2 |
| L-07 | Low | Hardening endpoint publik (pencarian tanpa batas panjang, tanpa cache) | Sisa rev 2 |
| L-08 | Low | Minor: oracle nama pelanggan di riwayat, login gagal tanpa pesan, placeholder password, kode invoice mati, dsb. | Sisa rev 2 |
| L-09 | Low | Barang ART & Cukim: penomoran kode tidak atomik, transisi tahap tanpa guard, batal lebur/hapus Cukim merusak COGS, Cukim tanpa validator | **Baru** |
| L-10 | Low | Fallback upload OSS mengarahkan bucket ke **Public Read** — pastikan listing bucket tidak terbuka | **Baru** |

---

## Status temuan revisi 2 (@ `7364fa7e`)

| ID rev 2 | Severity | Status | Keterangan |
|---|---|---|---|
| C-01 | Critical | ✅ Ditutup | Dikonfirmasi pemilik sistem (23 Nov 2026): password `admin@smt.com` sudah diganti. Tetap disarankan: akun ADMIN pribadi per orang, `superuser@smt.com`/`user@smt.com` tetap nonaktif, `fix-password.js` terhapus dari server, audit log akun default sudah diperiksa |
| H-01 | High | ❌ Terbuka | → **H-01** |
| M-01 | Medium | ❌ Terbuka | `Format Excel.xlsx` tidak berubah → **M-01** |
| M-02 | Medium | ❌ Terbuka, meluas | `utils/audit.js` & `voidStruk` tidak berubah; pola sama muncul di Cukim → **M-02** |
| M-03 | Medium | ❌ Terbuka, makin terekspos | `getPublicKatalog` tetap mengirim `keterangan`; frontend menambah modal detail → **M-03** |
| L-01 … L-07 | Low | ❌ Terbuka | Tidak ada perubahan terkait → **L-01 … L-07** |
| L-08 | Low | ❌ Terbuka | `api.js`, `Users.jsx` tidak berubah → **L-08** |

Seluruh kontrol yang sudah ditutup di v1–v4 dan revisi sebelumnya (batas HJ MIN, void khusus ADMIN, masking data pelanggan, bind `127.0.0.1`, API invoice `410`, body JSON 1 MB, upload berlapis, otorisasi whitelist, revoke token, password policy) **tetap utuh**.

---

## CRITICAL

Tidak ada temuan Critical yang terbuka. Catatan C-01 di bawah dipertahankan sebagai arsip.

### C-01 — ✅ DITUTUP — Akun ADMIN default `admin@smt.com` dengan password publik `admin123`

> **Status:** ditutup 23 November 2026 berdasarkan konfirmasi pemilik sistem bahwa password sudah diganti. Rekomendasi 1, 3, 4, 5 di bawah tetap berlaku sebagai praktik baik.

**Lokasi:** database production (tabel `users`); sumber: `backend/fix-password.js` (commit `a4b9d044`, sudah dihapus dari repo di `9487dc6b`, tetapi tertinggal di folder server).

**Temuan (dari pendampingan deploy):** ketiga akun default (`admin@smt.com`, `superuser@smt.com`, `user@smt.com`) ditemukan aktif di production. Ketiganya dikunci, lalu `admin@smt.com` **diaktifkan kembali dengan password `admin123`** (melewati password policy lewat database) karena merupakan satu-satunya akun admin. Belum ada konfirmasi bahwa password ini sudah diganti.

**Dampak:** email dan password tertulis di riwayat repo GitHub, dan halaman login terbuka ke internet. Dengan PR #10, akun ADMIN kini juga mengendalikan **seluruh inventaris emas**: menjual, melebur, membatalkan, dan menghapus Barang ART & Cukim, serta melihat dan meng-export seluruh COGS.

**Rekomendasi (hari ini):**
1. Buat akun ADMIN pribadi (email masing-masing, password ≥ 10 karakter, unik).
2. Login dengan akun baru, lalu **nonaktifkan** `admin@smt.com`, atau minimal Reset Password ke password kuat.
3. Periksa `audit_logs` untuk aktivitas akun default dari IP yang tidak dikenal.
4. Pastikan `backend/fix-password.js` sudah dihapus dari server.
5. Tambahkan halaman **Ganti Password** sendiri (API `PUT /api/auth/change-password` sudah ada).

> Tandai **Ditutup** setelah langkah 1–4 dilakukan dan audit log bersih.

---

## HIGH

### H-01 — Riwayat git masih menyimpan `backend/.env` lama

**Lokasi:** commit `a4b9d044`; repo `smartmulia/Dashboard-SMT` dan fork `holdingpdca-beep`.

**Temuan:** tidak berubah. Riwayat git masih memuat `DATABASE_URL`, `JWT_SECRET`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET` lama, serta `fix-password.js`. Pencabutan kredensial lama dan whitelist RDS belum terkonfirmasi. Relevansi AccessKey OSS meningkat karena bucket kini juga menyimpan **foto barang emas** (`barang-art/`).

**Rekomendasi:**
1. Konfirmasi pencabutan AccessKey OSS lama (RAM console) dan pergantian password user DB lama.
2. **RDS whitelist** hanya berisi IP server aplikasi.
3. `git filter-repo --path backend/.env --path backend/fix-password.js --invert-paths` di repo utama & fork, force-push, clone ulang.
4. Repo/fork private + GitHub Secret Scanning.

> Bila poin 1 & 2 sudah dipastikan, severity turun menjadi **Low**.

---

## MEDIUM

### M-01 — `Format Excel.xlsx` masih berisi data barang

Tidak berubah. File template di root repo masih berisi 7 baris data riil (mis. `LM ANTAM K70596070`, `LM UBS NO SERI : 9A17000712466 - XU00466`, `GMS - KEPRI`).

**Rekomendasi:** kosongkan baris data (sisakan header + 1 baris contoh fiktif), commit ulang; sertakan dalam `git filter-repo` bersama H-01.

### M-02 — Audit log gagal diam-diam untuk teks panjang

**Lokasi:** [utils/audit.js:4-20](backend/src/utils/audit.js#L4-L20), model `AuditLog` (`aktivitas String` → `VARCHAR(191)`):
- [itemController.js:702](backend/src/controllers/itemController.js#L702) (void struk);
- [itemController.js:636](backend/src/controllers/itemController.js#L636) (jual elektronik);
- **baru:** [cukimController.js:173](backend/src/controllers/cukimController.js#L173) (jual Cukim).

**Temuan:** `createAuditLog()` menelan error panjang kolom dan dipanggil **setelah** transaksi selesai. Ada dua kasus yang sudah bisa melewati 191 karakter:
- **Void struk:** `alasan` tanpa batas panjang. Alasan lebih dari ±110 karakter → void tanpa jejak audit.
- **Jual Cukim (baru):** `TANDAI TERJUAL CUKIM (n: CKM01, CKM02, …)` mencantumkan **setiap** nomor Cukim. Mulai sekitar **24 Cukim dalam satu penjualan**, insert audit gagal, sehingga penjualan emas hasil lebur tidak tercatat sama sekali di `audit_logs`.

Audit jual elektronik berada tepat di ambang batas, karena `namaPelanggan` maksimal 150 karakter.

**Rekomendasi:**
1. Di `createAuditLog()`, potong `aktivitas` (`String(aktivitas).slice(0, 190)`) atau ubah kolom menjadi `@db.Text`. Satu perubahan ini menutup semua kasus.
2. Daftar panjang (nomor Cukim, ID barang, alasan) dipindah ke `dataBaru`/`dataLama` (JSON).
3. Validator panjang `alasan` void (mis. 5–300 karakter).
4. Untuk aksi keuangan (jual, void, lebur), tulis audit log di dalam transaksi yang sama.

### M-03 — Katalog publik membuka kolom `keterangan` ke internet

**Lokasi:**
- [itemController.js:1008-1079](backend/src/controllers/itemController.js#L1008-L1079) (`getPublicKatalog`; `keterangan` di [:1063](backend/src/controllers/itemController.js#L1063), pencarian di [:1018](backend/src/controllers/itemController.js#L1018));
- [server.js:137](backend/server.js#L137);
- [KatalogElektronik.jsx:248](frontend/src/pages/KatalogElektronik.jsx#L248).

**Temuan:** tidak berubah di backend, dan **makin terekspos** di frontend. PR #10 menambah modal **"Detail Barang"** yang menampilkan `keterangan` lengkap (`whitespace-pre-wrap`, tanpa pemotongan) kepada pengunjung tanpa login.

Kolom ini catatan internal hasil import/form admin. Data production berisi catatan kondisi barang dan setidaknya satu baris `pass: ……` (kemungkinan sandi/PIN perangkat nasabah). `keterangan` juga bisa dicari dari luar lewat `?search=`.

**Rekomendasi:**
1. **Segera:** keluarkan `keterangan` dari respons publik dan dari pencarian publik. Modal detail cukup menampilkan nama, jenis, grade, dan HARGA SMT.
2. Bila deskripsi untuk pembeli dibutuhkan, tambahkan kolom terpisah (mis. `deskripsiPublik`) yang diisi sadar oleh admin.
3. Bersihkan sandi/PIN perangkat dari kolom `keterangan` di database.

### M-04 — Deploy `db push` membuat Barang ART terjual kembali AKTIF

**Lokasi:** [schema.prisma:243](backend/prisma/schema.prisma#L243) (`tahap TahapArt @default(AKTIF)`), [barangArtController.js:278](backend/src/controllers/barangArtController.js#L278) (`ambilAktif`), `buildWhere` (filter `tahap`).

**Temuan:** PR #10 menambahkan kolom `tahap` di `barang_art` dan memindahkan seluruh logika daftar aktif / History / aksi massal ke kolom tersebut. `prisma db push` akan membuat kolom ini dengan nilai default **`AKTIF` untuk semua baris yang sudah ada**, termasuk barang yang sebelumnya ditandai terjual (`status = 'TERJUAL'`, punya `tanggal_jual`, `nominal_jual`, `nomor_sku`). Tidak ada script *backfill* di repo.

**Dampak setelah deploy:**
- Barang Logam Mulia / Perhiasan yang **sudah terjual** muncul lagi di daftar aktif. Nilai persediaan dan COGS emas di dashboard menggelembung.
- `ambilAktif()` hanya memeriksa `tahap`, sehingga barang yang sudah terjual itu **bisa dijual lagi, dilebur menjadi Cukim** (COGS-nya ikut masuk Cukim), atau dipindah ke Barang Eksport. Data `tanggal_jual`/`nominal_jual` lama akan tertimpa.
- Tab **History** kosong untuk penjualan sebelum update.

**Rekomendasi (wajib saat deploy PR #10):**
1. Backup RDS.
2. Jalankan `./build.sh` (`db push`).
3. **Sebelum aplikasi dipakai**, jalankan backfill:
   ```sql
   UPDATE barang_art SET tahap = 'TERJUAL'
   WHERE status = 'TERJUAL' AND tahap = 'AKTIF';
   ```
4. Cek dengan `SELECT tahap, status, COUNT(*) FROM barang_art GROUP BY tahap, status;`. Seharusnya **tidak ada** baris `AKTIF` + `TERJUAL`.
5. Jangka panjang: buat migrasi Prisma (L-03) agar backfill seperti ini ikut ter-review dan berjalan otomatis bersama perubahan skema.

---

## LOW

### L-01 — Frontend PM2 `:5173` & CSP Apache
Tidak berubah:
- PM2 `serve` ([ecosystem.config.js:47](ecosystem.config.js#L47)) listen di semua interface. Tutup port 5173 di firewall, atau sajikan `frontend/dist` langsung dari Apache.
- Pastikan `HOST` di `backend/.env` tidak `0.0.0.0`.
- CSP VirtualHost ([apache.conf:43](deploy/apache.conf#L43)) menimpa CSP `sandbox` milik `/uploads`.

### L-02 — Token di `localStorage` & tanpa lockout per akun
Tidak berubah. Rekomendasi tetap:
- lockout per akun berbasis audit `LOGIN GAGAL`;
- cookie `HttpOnly; Secure; SameSite=Strict` untuk jangka menengah;
- 2FA untuk ADMIN, yang kini juga mengelola seluruh inventaris emas.

### L-03 — Operasional & deploy
- **Skema berubah besar lagi:** tabel baru `cukim`, `kode_counter`; enum `TahapArt`; kolom baru di `barang_art` (`vendor_asal`, `total_harga`, `bea_lelang`, `tahap`, `tanggal_lebur`, `tanggal_eksport`, `gambar`, `cukim_id`); `kode_barang` menjadi nullable; kolom `vendor` di `elektronik`. Masih **tanpa `prisma/migrations/`**. Backup RDS sebelum deploy, dan lihat M-04.
- `update-database.bat` menjalankan `db push` tanpa pengingat backup.
- Sisa file lama di server: tinjau dengan `git status --ignored` / `git clean -n`.
- `npm audit` server (8 vulnerabilities) belum dianalisis. Gunakan `npm ci --omit=dev` di `build.sh` agar lockfile tidak berubah.

### L-04 — COGS dapat dihitung balik dari harga
Tidak berubah. HJ MIN ke role non-admin (COGS ≈ HJ MIN / 1,17). HARGA SMT publik (COGS ± Rp 8.000). Rumus ada di [Elektronik.jsx:23-24](frontend/src/pages/Elektronik.jsx#L23-L24). Disarankan diterima & didokumentasikan sebagai keputusan bisnis.

### L-05 — Void struk: reset harga & validasi input
Tidak berubah. Void memakai `hitungHarga(b.cogs)` ([:682](backend/src/controllers/itemController.js#L682)), bukan `hargaEfektif()`. Route void tanpa express-validator.

### L-06 — Nomor struk elektronik dapat kembar
Tidak berubah. `generateNomorStruk()` ([:520](backend/src/controllers/itemController.js#L520)) dihitung di luar transaksi. `nomor_struk` tidak unik, sehingga retry `P2002` ([:626](backend/src/controllers/itemController.js#L626)) tidak pernah aktif. Dua penjualan bersamaan bisa berbagi nomor, sehingga struk tercampur dan void ikut membatalkan penjualan lain.

Perbaikan paling sederhana: pakai tabel `kode_counter` yang baru (prefix `SMT-YYYY`) dengan increment atomik (lihat L-09).

### L-07 — Hardening endpoint publik
Tidak berubah:
- `GET /api/katalog-elektronik` hanya dilindungi rate-limit global (100/menit/IP).
- `search` tanpa batas panjang, dipakai untuk `LIKE '%…%'` di 3 kolom.
- `DISTINCT` atas seluruh stok di setiap request, tanpa cache.

Rekomendasi:
- batasi panjang `search`/`kategori`;
- tambahkan `Cache-Control` atau cache singkat;
- rate-limit khusus endpoint publik.

### L-08 — Minor
- [itemController.js:876](backend/src/controllers/itemController.js#L876): `getRiwayat` masih mencari di `namaPelanggan` untuk semua role (oracle).
- [api.js:17-20](frontend/src/utils/api.js#L17-L20): interceptor me-reload ke `/login` pada setiap 401, termasuk login gagal, sehingga pesan error tidak pernah tampil.
- [Users.jsx:203](frontend/src/pages/Users.jsx#L203): placeholder "Minimal 6 karakter", padahal kebijakan minimal 10.
- Kode invoice lama tidak dipakai (`invoiceController.js`, `Invoice.jsx`, `pdfInvoice.js`).
- Error handler meneruskan `err.message` untuk status < 500.
- Google Fonts masih dari pihak ketiga.

### L-09 — Barang ART & Cukim: penomoran, transisi tahap, dan validasi

Modul ini khusus ADMIN, sehingga risikonya kecil. Dampaknya tetap pada catatan inventaris emas.

1. **Penomoran kode tidak atomik:** [barangArtController.js:54-63](backend/src/controllers/barangArtController.js#L54-L63).
   - `allocateKode()` membaca `lastNumber`, lalu menulis nilai absolut `counter.lastNumber + count` ([:61](backend/src/controllers/barangArtController.js#L61)).
   - Di MySQL (REPEATABLE READ), `SELECT` biasa di dalam transaksi tidak mengunci baris. Dua aksi bersamaan bisa mendapat nomor yang sama:
     - **Kode Barang LMN/LMS/EKS kembar**, karena `kode_barang` tidak unik;
     - **lebur gagal** dengan `P2002`, karena `no_cukim` unik.
   - Pembuatan counter pertama kali juga bisa bentrok (`P2002` pada `prefix`).
   - Komentar kode menyebut fungsi ini "ATOMIK … aman dari race", padahal tidak.
   - Perbaikan: `update({ data: { lastNumber: { increment: count } } })` (mengunci baris), lalu `start = updated.lastNumber - count + 1`. Counter dibuat dengan `upsert`.
2. **Transisi tahap tanpa guard:**
   - `markSold`, `leburItems`, `moveToPerhiasan`, `moveToEksport` ([:297-455](backend/src/controllers/barangArtController.js#L297-L455)) memvalidasi `tahap = 'AKTIF'` lewat `ambilAktif()` **di luar** transaksi, lalu `update` per `id` tanpa syarat `tahap`.
   - Akibatnya barang yang sama bisa diproses dua kali bila dua aksi berjalan bersamaan, misalnya dilebur ke dua Cukim sehingga COGS-nya dihitung ganda.
   - Hal yang sama berlaku untuk `markSold` Cukim ([cukimController.js:138](backend/src/controllers/cukimController.js#L138)).
   - Perbaikan: `updateMany({ where: { id, tahap: 'AKTIF' } })` dan cek `count === 1`, pola yang sama seperti `jualItems` elektronik.
3. **Batal lebur & hapus Cukim merusak konsistensi COGS:**
   - `revertToAktif` ([:457](backend/src/controllers/barangArtController.js#L457), [:471](backend/src/controllers/barangArtController.js#L471)) melepas barang dari Cukim **tanpa mengurangi `cogs` Cukim**, dan tetap diizinkan walau Cukim-nya **sudah terjual**. Akibatnya emas yang sama tercatat dua kali: sebagai barang aktif dan sebagai Cukim terjual.
   - `deleteItem` Cukim ([cukimController.js:210](backend/src/controllers/cukimController.js#L210)) boleh menghapus Cukim aktif maupun **terjual**. Barang asalnya tertinggal berstatus DILEBUR tanpa Cukim, dan catatan penjualan emas hilang dari tabel (hanya tersisa di audit log, lihat M-02).
   - Perbaikan:
     - tolak batal lebur bila Cukim sudah terjual;
     - kurangi `cogs` Cukim saat barang dilepas;
     - tolak hapus Cukim yang terjual atau masih punya barang (atau kembalikan barangnya ke AKTIF secara atomik).
4. **Route Cukim tanpa express-validator:** [routes/cukim.js:11-15](backend/src/routes/cukim.js#L11-L15).
   - `vendor`, `nomorSku` tanpa batas panjang (kolom 191 → error 500).
   - `keterangan` tanpa batas.
   - `:id` non-angka → `parseInt` → `NaN` → error Prisma 500.
   - Perbaikan: samakan dengan `markSoldRules` / `moveArtRules` milik Barang ART.

### L-10 — Fallback upload OSS mengarahkan bucket ke Public Read

**Lokasi:** [storage.js:95-112](backend/src/utils/storage.js#L95-L112).

Bila bucket menolak ACL per-objek ("Block Public Access"), upload diulang tanpa ACL. Komentar kode menginstruksikan agar **bucket di-set Public Read** di konsol OSS. Nama file sudah acak (UUID), jadi foto tidak bisa ditebak satu per satu. Tetapi ACL Public Read pada tingkat bucket membuat **seluruh isi bucket** dapat dibaca anonim, termasuk objek lain yang mungkin disimpan di bucket yang sama. Bucket juga bisa ikut terbuka untuk **listing** bila diatur kurang tepat, sehingga daftar foto barang emas dan katalog dapat diambil sekaligus. Fallback ini juga terpicu untuk error 403 lain (mis. kredensial salah), sehingga gejala aslinya tertutup.

**Rekomendasi:**
1. Uji dari luar: `curl -s https://<bucket>.<endpoint>/` harus mengembalikan **AccessDenied** (bukan daftar `<Contents>`).
2. Lebih baik bucket tetap **Private**, lalu gunakan **Bucket Policy** yang hanya mengizinkan `oss:GetObject` anonim untuk prefix `katalog/*` dan `barang-art/*`.
3. Batasi fallback hanya pada pesan "acl is not allowed", bukan semua 403.

---

## Kontrol keamanan yang sudah baik (termasuk pada fitur baru)

- **Otorisasi modul baru:** `router.use(auth, requireRole('ADMIN'))` di `/api/barang-art` dan `/api/cukim`. Route frontend juga dibungkus `AdminRoute`.
- **Upload foto Barang ART** memakai jalur aman yang sudah ada:
  - multer `memoryStorage`, maks 5 MB / 1 file;
  - whitelist MIME (`IMAGE_TYPES`), ekstensi ditentukan server;
  - cek *magic bytes*;
  - nama file `crypto.randomUUID()`;
  - foto lama dihapus hanya setelah foto baru tersimpan.
- **Guard hapus file** diperluas ke `barang-art/` dengan tetap menolak `..` dan membatasi prefix. Path lokal tetap di-resolve dan wajib berada di dalam `uploads/`.
- **Validasi input** Barang ART baru (`createBarangArtRules`, `updateBarangArtRules`, `leburRules`, `moveArtRules`): panjang teks, angka ≥ 0, array ID 1–500 bertipe integer. Kolom `vendor` elektronik dibatasi 100 karakter.
- **Import Excel Barang ART** dibatasi 2.000 baris, membaca kolom lewat `Object.keys` (aman dari kunci `__proto__`), dan insert dalam satu transaksi.
- **Sort** dibatasi whitelist kolom, `limit` maks 100, dan `query parser` `simple` mencegah injeksi operator Prisma.
- Export Excel (Barang ART, Cukim) memakai SheetJS `json_to_sheet` (string tidak dieksekusi sebagai formula) dan tercatat di audit log.
- Seluruh aksi baru (lebur, pindah, upload/hapus foto, jual/batal/hapus Cukim) tercatat di audit log dengan `dataLama`/`dataBaru` (selama panjang `aktivitas` aman, lihat M-02).
- Seluruh kontrol v1–v4 dan revisi sebelumnya tetap berlaku.

---

## Rencana perbaikan yang disarankan

| Prioritas | Item | Estimasi |
|---|---|---|
| **Saat deploy PR #10** | M-04 (backup RDS → `db push` → backfill `tahap` → cek) | 15 menit |
| **Minggu ini** | M-03 (keluarkan `keterangan` dari katalog publik & modal detail) | 30 menit |
| **Minggu ini** | M-02 (potong `aktivitas` di `createAuditLog` / `@db.Text`, validator `alasan`) | 30 menit |
| **Minggu ini** | H-01 (pencabutan kredensial lama, RDS whitelist, `git filter-repo`) | 1 jam |
| **≤ 30 hari** | L-09 (increment atomik `kode_counter`, guard tahap, aturan batal lebur/hapus Cukim, validator Cukim), L-06 (pakai `kode_counter` untuk nomor struk), L-10 (cek bucket OSS) | 1 hari |
| **≤ 30 hari** | M-01, L-01, L-03 (migrasi baseline, `npm audit`), L-07, halaman Ganti Password | 1 hari |
| **Backlog** | L-02, L-04 (risiko diterima), L-05, L-08 | — |

### Catatan batasan audit
- Penutupan C-01 berdasarkan konfirmasi pemilik sistem, tidak diverifikasi langsung ke database production.
- M-04 dinilai dari skema dan kode. Jumlah Barang ART berstatus terjual di production tidak diketahui; jalankan query cek di M-04 sebelum dan sesudah deploy.
- Konfigurasi aktual Apache, firewall/security group ECS, whitelist RDS, ACL/policy bucket OSS, RAM policy Alibaba Cloud, dan `backend/.env` production **tidak** tersedia di workspace.
- Tidak dilakukan pengujian dinamis (penetration test). Temuan berasal dari analisis kode statis, skema, konfigurasi, riwayat git, dan observasi saat deploy.
