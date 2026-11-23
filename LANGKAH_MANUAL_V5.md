# Langkah Manual — Remediasi Security Audit V5

> Dokumen ini berisi langkah-langkah yang **TIDAK bisa dikerjakan lewat kode** dan harus
> dilakukan sendiri oleh pemilik sistem (di server, Alibaba Cloud, GitHub, atau database
> production). Dibuat 23 November 2026, menyertai perbaikan kode V5.
>
> Referensi lengkap: [SECURITY_AUDIT_PRODUCTION_V5.md](SECURITY_AUDIT_PRODUCTION_V5.md)

---

## 0. Yang sudah diperbaiki lewat kode (tidak perlu Anda lakukan)

Perbaikan berikut **sudah ada di kode** dan hanya butuh **deploy** (restart backend + rebuild
frontend). **Tidak ada perubahan database** untuk item-item ini:

- **M-03** — kolom `keterangan` tidak lagi dikirim ke katalog publik (respons, pencarian, modal detail).
- **M-02** — audit log tidak lagi gagal diam-diam (teks `aktivitas` dipotong 190 karakter).
- **L-05** — void struk memakai `hargaEfektif()` + validator alasan (5–300 karakter).
- **L-07** — batas panjang pencarian/kategori, `Cache-Control`, rate-limit katalog publik.
- **L-10** — fallback upload OSS hanya untuk error "acl is not allowed".
- **L-08** (sebagian) — placeholder password, oracle nama pelanggan, interceptor 401.

### Cara deploy perbaikan kode V5
1. `git pull` di server.
2. Backend: `cd backend && npm ci --omit=dev` lalu restart PM2 (`pm2 restart ecosystem.config.js` atau sesuai setup).
3. Frontend: `cd frontend && npm ci && npm run build`.
4. (Tidak perlu `prisma db push` untuk perbaikan V5 ini — tidak ada kolom baru.)

> ⚠️ Kalau deploy ini **digabung** dengan PR #10 (modul Barang ART) yang menambah kolom
> `tahap`, maka **wajib** ikuti langkah **M-04** di bawah.

---

## 1. H-01 — Cabut kredensial lama (High) 🔴 PALING PENTING

Riwayat git masih menyimpan `backend/.env` lama berisi `DATABASE_URL`, `JWT_SECRET`,
`OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, dan file `fix-password.js`.

**Langkah:**
1. **Alibaba Cloud RAM Console** → cabut/nonaktifkan **AccessKey OSS lama**, buat yang baru,
   update `backend/.env` di server dengan AccessKey baru.
2. **Database** → ganti password user DB lama (yang pernah tertulis di `.env`), update
   `DATABASE_URL` di `backend/.env` server.
3. **RDS whitelist** → pastikan hanya IP server aplikasi yang diizinkan connect ke database.
4. **Bersihkan riwayat git** (di repo utama `smartmulia/Dashboard-SMT` **dan** fork `holdingpdca-beep`):
   ```bash
   git filter-repo --path backend/.env --path backend/fix-password.js --path "Format Excel.xlsx" --invert-paths
   git push --force --all
   git push --force --tags
   ```
   Lalu semua anggota tim **clone ulang** repo.
5. Jadikan repo & fork **private** + aktifkan **GitHub Secret Scanning**.

---

## 2. C-01 (lanjutan) — Akun admin

Password `admin@smt.com` sudah diganti (dikonfirmasi). Praktik baik yang masih disarankan:
1. Buat **akun ADMIN pribadi** per orang (email masing-masing, password ≥ 10 karakter, unik).
2. Login dengan akun baru → **nonaktifkan** `admin@smt.com` (atau minimal reset ke password kuat).
3. Pastikan `superuser@smt.com` & `user@smt.com` tetap **nonaktif**.
4. Pastikan `backend/fix-password.js` sudah **terhapus dari server**.
5. Cek `audit_logs` untuk aktivitas akun default dari IP tak dikenal.

---

## 3. M-04 — Backfill `tahap` Barang ART (WAJIB saat deploy PR #10)

> Hanya relevan bila deploy ini menyertakan modul Barang ART (kolom `tahap`).
> Kalau tidak, lewati.

`prisma db push` mengisi kolom baru `tahap` dengan `AKTIF` untuk **semua** baris lama —
termasuk Barang ART yang sudah terjual. Akibatnya barang terjual muncul lagi sebagai stok
aktif dan bisa dijual/dilebur ulang. **Harus di-backfill sebelum aplikasi dipakai.**

**Urutan (jangan dibalik):**
1. **Backup database RDS** dulu.
2. Jalankan `./build.sh` (menjalankan `db push`).
3. **Sebelum aplikasi dipakai**, jalankan SQL ini:
   ```sql
   UPDATE barang_art SET tahap = 'TERJUAL'
   WHERE status = 'TERJUAL' AND tahap = 'AKTIF';
   ```
4. Verifikasi — seharusnya **tidak ada** baris `AKTIF` + `TERJUAL`:
   ```sql
   SELECT tahap, status, COUNT(*) FROM barang_art GROUP BY tahap, status;
   ```

---

## 4. M-01 — Bersihkan file `Format Excel.xlsx`

File `Format Excel.xlsx` di root repo masih berisi **7 baris data emas asli** (nomor seri LM,
No SBG, vendor). Sudah ada template kosong `Format Excel (TEMPLATE KOSONG).xlsx`.

**Langkah:**
1. Buka `Format Excel.xlsx`, hapus semua baris data, sisakan **header + 1 baris contoh fiktif**.
   Contoh baris aman yang bisa dipakai:

   | Tanggal Serah Terima | No SBG | Barng Asal | Nama Barang | Nomor Seri | Gramasi | Karat | COGS | Kode Barang |
   |---|---|---|---|---|---|---|---|---|
   | 1-Jan-26 | 0000000000000 | CONTOH - KOTA | LM CONTOH 1 GRAM | | 1.00 | 24.00 | 1,000,000.00 | X 001 |

2. Simpan & commit ulang.
3. Sertakan file ini dalam perintah `git filter-repo` di langkah **H-01** (sudah dimasukkan
   di contoh perintah di atas) agar data lama hilang dari riwayat git.

---

## 5. L-01 & L-03 — Operasional server & deploy

**L-01:**
- Tutup **port 5173** (frontend PM2 `serve`) di firewall, atau sajikan `frontend/dist` langsung
  dari Apache. Jangan biarkan terbuka ke internet.
- Pastikan `HOST` di `backend/.env` **bukan** `0.0.0.0` (idealnya `127.0.0.1`).
- Perbaiki `deploy/apache.conf` agar CSP VirtualHost tidak menimpa CSP `sandbox` milik `/uploads`.

**L-03:**
- **Backup RDS sebelum setiap `db push`.** `update-database.bat` belum mengingatkan backup.
- Analisis `npm audit` di server (dilaporkan 8 kerentanan). Pakai `npm ci --omit=dev` di `build.sh`
  agar lockfile tidak berubah saat deploy.
- Bersihkan sisa file lama di server: tinjau dengan `git status --ignored` / `git clean -n`.
- Jangka panjang: buat baseline migrasi Prisma (`prisma/migrations/`) agar perubahan skema
  + backfill ikut ter-review dan jalan otomatis (hindari `db push` manual seperti M-04).

**L-10 (cek di konsol OSS):**
- Uji dari luar: `curl -s https://<bucket>.<endpoint>/` harus mengembalikan **AccessDenied**,
  bukan daftar `<Contents>`.
- Idealnya bucket di-set **Private** + **Bucket Policy** yang hanya mengizinkan `oss:GetObject`
  anonim untuk prefix `katalog/*` dan `barang-art/*`.

---

## Ringkasan prioritas

| Kapan | Item |
|---|---|
| **Saat deploy** | M-04 (backup → db push → backfill → cek) — hanya bila ada modul Barang ART |
| **Secepatnya** | H-01 (cabut kredensial, RDS whitelist, git filter-repo), C-01 lanjutan |
| **Minggu ini** | M-01 (bersihkan Excel), L-01 (firewall 5173), L-10 (cek bucket OSS) |
| **≤ 30 hari** | L-03 (backup, npm audit, migrasi baseline) |

> Belum dikerjakan di kode (butuh sesi lanjutan, berisiko): **L-09** (atomic Barang ART/Cukim),
> **L-06** (nomor struk atomik). **L-02 / L-04** = backlog (diterima sebagai risiko bisnis).
