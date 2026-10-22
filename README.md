# Dashboard SMT — Serba Mulia Group

Aplikasi web internal untuk manajemen barang elektronik, invoice penjualan, dan katalog emas Serba Mulia Group.

---

## Fitur Utama

| Modul | Keterangan |
|---|---|
| **Dashboard** | Statistik ringkasan, trend profit & rugi per bulan, top profit, top harga jual |
| **Data Elektronik** | CRUD barang, import Excel, export/download Excel, tracking COGS–Harga Jual–Profit |
| **Invoice** | Buat invoice, pilih barang (per grade / semua / satu-satu), alur approval, cetak & download PDF |
| **Katalog Emas** | Katalog produk emas per cabang, mode layar penuh (tampilan buku katalog) |
| **Manajemen User** | CRUD akun dengan 4 role berbeda |
| **Audit Log** | Rekam jejak seluruh aktivitas pengguna |
| **Notifikasi** | Notifikasi real-time untuk request dan hasil approval invoice |

---

## Tech Stack

### Frontend
- **React 18** + **Vite 5**
- **Tailwind CSS 3** — styling utility-first
- **ApexCharts** — grafik interaktif
- **jsPDF + jspdf-autotable** — generate PDF invoice
- **Axios** — HTTP client
- **Lucide React** — icon set
- **React Router v6** — client-side routing
- **React Hot Toast** — notifikasi toast

### Backend
- **Node.js + Express 4**
- **Prisma ORM 5** — database access layer
- **MySQL 8** — database utama
- **JWT (jsonwebtoken)** — autentikasi token
- **bcryptjs** — enkripsi password
- **Multer** — upload file gambar
- **xlsx** — import/export Excel

---

## Struktur Proyek

```
Dashboard Elektronik/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Skema database
│   │   └── seed.js             # Data awal (admin, user)
│   ├── src/
│   │   ├── controllers/        # Logic bisnis per modul
│   │   ├── middleware/         # auth.js, roleCheck.js
│   │   ├── routes/             # Definisi endpoint API
│   │   └── utils/              # prisma.js, audit.js
│   ├── uploads/                # File gambar katalog (auto-created)
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/         # Layout, Dashboard, shared UI
│   │   ├── contexts/           # AuthContext, ThemeContext
│   │   ├── pages/              # Dashboard, Elektronik, Invoice, Katalog, dst.
│   │   └── utils/              # api.js, format.js, pdfInvoice.js
│   ├── public/logos/           # Logo perusahaan untuk PDF
│   └── package.json
├── schema.sql                  # SQL schema siap pakai
└── README.md
```

---

## Role & Hak Akses

| Role | Dashboard | Data Elektronik | Invoice | Katalog Emas | User Mgmt | COGS |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **ADMIN** | ✓ | ✓ Full | ✓ + Approve | ✓ Full | ✓ | ✓ |
| **SUPER_USER** | ✓ | ✓ Full | ✓ | ✓ Full | — | ✓ |
| **USER** | ✓ | ✓ View | ✓ | ✓ View | — | — |
| **KATALOG_USER** | — | — | — | ✓ Full | — | — |

> `KATALOG_USER` hanya dapat mengakses halaman Katalog Emas (tambah, edit, sembunyikan, hapus item).  
> `USER` tidak dapat melihat kolom COGS di seluruh aplikasi.

---

## Cara Instalasi & Menjalankan

### Prasyarat
- Node.js v18+
- MySQL 8+
- npm

### 1. Siapkan Database

```sql
CREATE DATABASE dashboard_smt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Atau jalankan `schema.sql` yang sudah tersedia:

```bash
mysql -u root -p dashboard_smt < schema.sql
```

### 2. Setup Backend

```bash
cd backend
npm install
```

Buat file `.env`:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/dashboard_smt"
JWT_SECRET=ganti_dengan_secret_yang_kuat
PORT=5000
```

Jalankan migrasi dan seed data awal:

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run seed
```

Jalankan server:

```bash
npm run dev       # development (nodemon)
npm start         # production
```

### 3. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

Aplikasi berjalan di `http://localhost:5173`.

---

## Akun Admin Awal (Seed)

Seed hanya membuat **satu** akun ADMIN. Password **tidak** disimpan di repo —
wajib di-set lewat environment variable saat menjalankan seed:

```bash
SEED_ADMIN_EMAIL=admin@smt.com SEED_ADMIN_PASSWORD='<password-kuat-min-12-karakter>' npm run seed
```

> Password minimal 12 karakter. Jangan pernah memakai password default/umum.
> Akun SUPER_USER / USER dibuat manual lewat menu Manajemen User oleh ADMIN.

---

## API Endpoint Utama

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/items` | Daftar barang elektronik |
| GET | `/api/items/stats` | Statistik dashboard |
| POST | `/api/items/import` | Import dari Excel |
| GET | `/api/invoices` | Daftar invoice |
| POST | `/api/invoices` | Buat invoice baru |
| POST | `/api/invoices/:id/submit` | Submit untuk approval |
| POST | `/api/invoices/:id/approve` | Approve invoice (ADMIN) |
| POST | `/api/invoices/:id/reject` | Tolak invoice (ADMIN) |
| GET | `/api/katalog` | Daftar katalog emas |
| GET | `/api/cabang` | Daftar cabang |
| GET | `/api/notifikasi` | Notifikasi user aktif |
| PATCH | `/api/notifikasi/baca-semua` | Tandai semua sudah dibaca |
| GET | `/api/users` | Daftar user (ADMIN) |
| GET | `/api/audit` | Log aktivitas (ADMIN) |

---

## Alur Invoice

```
DRAFT → WAITING_APPROVAL → APPROVED → PRINTED
  │                     ↘ REJECTED       │
  ↓ (hapus)                              ↓
 [terhapus]              APPROVED/PRINTED → CANCELLED (barang kembali BELUM_TERJUAL)
```

1. **USER/SUPER_USER** membuat invoice (status `DRAFT`)
   - Barang harus sudah punya harga jual > 0
   - Barang tidak boleh sudah ada di invoice aktif lain (cegah double-counting)
2. Invoice `DRAFT` bisa **dihapus** oleh pembuatnya jika salah input
3. Klik **Submit** → status `WAITING_APPROVAL`, notifikasi dikirim ke semua ADMIN
4. **ADMIN** menyetujui → status `APPROVED`, barang ditandai `TERJUAL`, notifikasi ke pembuat
   - ADMIN tidak dapat menyetujui invoice yang dibuat sendiri (segregation of duties)
5. **ADMIN** menolak → status `REJECTED` dengan alasan, notifikasi ke pembuat
6. Invoice yang di-approve dapat dicetak/download PDF → status `PRINTED`
7. **ADMIN** dapat **membatalkan** invoice `APPROVED`/`PRINTED` → status `CANCELLED`, seluruh barang dikembalikan ke `BELUM_TERJUAL`

---

## Perusahaan yang Didukung

| Kode | Nama |
|---|---|
| `SERBA_MAS` | Serba Mas Tentram |
| `VOLARY` | Volary |

Filter perusahaan tersedia di Dashboard, Data Elektronik, dan Invoice.

---

## Kalkulasi Profit & Rugi

```
Profit = Harga Jual - COGS          → jika Harga Jual > COGS
Rugi   = COGS - Harga Jual          → jika Harga Jual < COGS
PPN    = Harga Jual × 1.1%
Total  = Harga Jual + PPN
```

Dashboard menampilkan trend profit (garis hijau) dan rugi (garis merah) dalam satu grafik per bulan.

---

## Dark Mode

Aplikasi mendukung dark/light mode. Toggle tersedia di navbar kanan atas. Preferensi disimpan di `localStorage`.
