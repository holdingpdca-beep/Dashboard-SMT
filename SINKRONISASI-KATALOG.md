# Sinkronisasi Katalog Emas dengan API Toko SERBAMAS

Fitur ini membuat Katalog Emas di dashboard **mengikuti stok toko secara otomatis**.
Barang yang masih ada stok ditarik dari API toko; barang yang **stoknya habis** (hilang
dari API) akan **otomatis terhapus** dari dashboard.

> Item yang di-input **manual** (sumber = MANUAL) **tidak** tersentuh oleh sinkronisasi.
> Hanya item hasil sinkron (sumber = API) yang bisa otomatis ditambah/diperbarui/dihapus.

---

## 1. Aktivasi pertama kali (sekali saja)

Hentikan dulu backend bila sedang berjalan (tekan `Ctrl + C` di jendela backend), lalu:

```bash
cd "Dashboard Elektronik/backend"
npm install                 # memasang paket baru: node-cron
npx prisma generate         # perbarui Prisma Client (field baru)
npx prisma db push          # tambah kolom baru ke database (aman, tidak hapus data)
```

Lalu isi **kredensial API** di file `backend/.env` (minta ke tim SERBAMAS/IT):

```
# Mode default (bearer):
SERBAMAS_API_TOKEN=<token_dari_tim_SERBAMAS>

# Atau mode basic:
# SERBAMAS_AUTH_MODE=basic
# SERBAMAS_API_USERNAME=<username_integrasi>
# SERBAMAS_API_PASSWORD=<password_integrasi>
```

> Kredensial & username akun integrasi hanya disimpan di `.env`, tidak di-hardcode
> dalam kode atau dokumentasi (L-08).

Jalankan ulang backend:

```bash
npm run dev
```

---

## 2. Petakan cabang ke Nama Toko

1. Buka halaman **Katalog** → tombol **Kelola Cabang** (khusus Admin).
2. Pada tiap cabang, isi kolom **"Nama Toko (untuk Sinkronisasi API)"** dengan nama toko
   **persis** seperti di sistem SERBAMAS, contoh: `TOKO CABANG AMPENAN`.
3. Simpan. Cabang yang sudah dipetakan akan diberi tanda hijau "Sinkron: ...".

Cabang yang kolom Nama Toko-nya kosong tidak akan disinkronkan.

---

## 3. Menjalankan sinkronisasi

- **Manual:** di halaman Katalog, klik tombol hijau **"Sinkronkan Sekarang"**.
- **Otomatis:** berjalan sendiri sesuai jadwal di `.env`:
  - `SERBAMAS_SYNC_ENABLED=true` → nyalakan jadwal otomatis.
  - `SERBAMAS_SYNC_CRON=0 * * * *` → setiap jam (ubah sesuai kebutuhan).

---

## 4. Menyesuaikan pemetaan field (bila perlu)

Fitur ini dibuat sebelum contoh data asli API terlihat, jadi nama-nama field ditebak.
Untuk memastikan cocok dengan data asli:

1. Login sebagai Admin/Super User, panggil endpoint berikut di browser/Postman
   (ganti `<id>` dengan ID cabang):

   ```
   GET /api/katalog/sync/preview?cabangId=<id>
   ```

   Hasilnya menampilkan: field asli dari API, data mentah, dan hasil pemetaannya.

2. Bila ada field yang belum terbaca (mis. harga/nama/stok kosong), buka file:

   ```
   backend/src/services/serbamasMapping.js
   ```

   lalu tambahkan nama field asli ke daftar `FIELD_CANDIDATES` (taruh di urutan depan).
   Hanya file ini yang perlu diubah — tidak perlu menyentuh logika lainnya.

---

## Catatan teknis

- Barang dicocokkan berdasarkan **ID unik** (`externalId`) per cabang. Pastikan API
  mengirim kode/SKU unik; bila tidak, sinkronisasi tidak bisa mencocokkan barang.
- Pengaman: bila panggilan API **gagal** (password salah, server down, dll),
  sinkronisasi untuk cabang itu **dibatalkan** dan **tidak ada** barang yang dihapus —
  mencegah katalog terhapus karena error sementara.
- Log aktivitas sinkronisasi tersimpan di **Audit Log** dan `backend/logs/combined.log`.
