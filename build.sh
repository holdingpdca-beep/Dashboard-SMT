#!/usr/bin/env bash
#
# build.sh — Setup & deploy PRODUCTION dari nol (atau update).
# Jalankan di server:  ./build.sh
#
# Yang dilakukan:
#   1. Install dependency backend & frontend
#   2. Generate Prisma Client + sinkronkan skema ke database (db push)
#   3. Build frontend (menghasilkan frontend/dist)
#   4. Start/Reload proses via PM2 (ecosystem.config.js)
#   5. Simpan daftar proses PM2
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo "==================================================="
echo "  Dashboard SMT — Deploy PRODUCTION"
echo "==================================================="

# ── Prasyarat ──
command -v node >/dev/null || { echo "ERROR: Node.js belum terinstall." >&2; exit 1; }
command -v pm2  >/dev/null || { echo "ERROR: PM2 belum terinstall. Jalankan: npm install -g pm2" >&2; exit 1; }
if [ ! -f "$BACKEND/.env" ]; then
  echo "ERROR: $BACKEND/.env tidak ditemukan. Buat & isi dulu (DATABASE_URL, JWT_SECRET, FRONTEND_URL, NODE_ENV=production)." >&2
  exit 1
fi

# ── 1. Backend ──
echo ""
echo "[1/5] Install dependency backend ..."
cd "$BACKEND"
npm install --omit=dev

echo "[2/5] Prisma generate + sinkron skema database ..."
npx prisma generate
# L-07: utamakan migrasi terkontrol di production. Jika sudah ada folder migrations,
# pakai 'migrate deploy' (punya riwayat, bisa di-review). Bila belum ada, fallback ke
# 'db push' tetapi INGATKAN untuk backup DB dulu — db push bisa mengubah skema tanpa riwayat.
if [ -d "$BACKEND/prisma/migrations" ]; then
  npx prisma migrate deploy
else
  echo "PERINGATAN: belum ada folder prisma/migrations. Memakai 'prisma db push'."
  echo "            Disarankan BACKUP DATABASE dulu, lalu buat migrasi awal:"
  echo "              mysqldump -u <user> -p dashboard_smt > backup-\$(date +%F).sql"
  echo "              npx prisma migrate dev --name init   # (di mesin dev, sekali saja)"
  read -r -p "Lanjutkan dengan 'prisma db push'? [y/N] " _ans
  case "$_ans" in
    [yY]|[yY][eE][sS]) npx prisma db push ;;
    *) echo "Dibatalkan oleh operator."; exit 1 ;;
  esac
fi

# Seed akun default HANYA jika tabel user masih kosong (idempoten via upsert).
# Baris di bawah aman diulang; hapus '#' jika ingin otomatis seed saat deploy pertama.
# npm run seed

# ── 2. Frontend ──
echo ""
echo "[3/5] Install dependency frontend ..."
cd "$FRONTEND"
npm install --legacy-peer-deps

echo "[4/5] Build frontend (vite build) ..."
npm run build

# ── 3. PM2 ──
echo ""
echo "[5/5] Menjalankan via PM2 ..."
cd "$ROOT"
mkdir -p "$BACKEND/logs"
# reload jika sudah ada, start jika belum
if pm2 describe smt-backend >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js --update-env
fi
pm2 save

echo ""
echo "==================================================="
echo "  Deploy selesai."
echo "  Backend  : http://127.0.0.1:5000"
echo "  Frontend : http://127.0.0.1:5173"
echo "  Cek status : pm2 status"
echo "  Lihat log  : pm2 logs"
echo ""
echo "  Agar PM2 auto-start saat server reboot (sekali saja):"
echo "    pm2 startup    # jalankan perintah yang ditampilkannya, lalu:"
echo "    pm2 save"
echo "==================================================="
