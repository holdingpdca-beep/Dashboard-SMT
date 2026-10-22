#!/usr/bin/env bash
#
# dev.sh — Menjalankan backend + frontend sekaligus untuk DEVELOPMENT lokal.
# Cukup satu perintah:  ./dev.sh
# Tekan Ctrl+C sekali untuk menghentikan keduanya.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo "==================================================="
echo "  Dashboard SMT — Menjalankan (development)"
echo "==================================================="

# ── Cek .env backend ──
if [ ! -f "$BACKEND/.env" ]; then
  echo "ERROR: $BACKEND/.env tidak ditemukan. Salin dari .env.example lalu isi DATABASE_URL, JWT_SECRET, FRONTEND_URL." >&2
  exit 1
fi

# ── Install dependency bila belum ada ──
if [ ! -d "$BACKEND/node_modules" ]; then
  echo "[backend] npm install ..."
  (cd "$BACKEND" && npm install)
  (cd "$BACKEND" && npx prisma generate)
fi
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "[frontend] npm install ..."
  (cd "$FRONTEND" && npm install --legacy-peer-deps)
fi

# ── Bersihkan proses anak saat script dihentikan ──
PIDS=()
cleanup() {
  echo ""
  echo "Menghentikan backend & frontend ..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# ── Jalankan backend ──
echo "[backend]  http://localhost:5000  (npm run dev)"
(cd "$BACKEND" && npm run dev) &
PIDS+=($!)

# ── Jalankan frontend ──
echo "[frontend] http://localhost:5173  (npm run dev)"
(cd "$FRONTEND" && npm run dev) &
PIDS+=($!)

echo "---------------------------------------------------"
echo "Keduanya berjalan. Buka http://localhost:5173"
echo "Tekan Ctrl+C untuk berhenti."
echo "---------------------------------------------------"

# Tunggu; jika salah satu proses mati, hentikan semuanya
wait -n
cleanup
