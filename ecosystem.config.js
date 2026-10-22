// ecosystem.config.js — Konfigurasi PM2 untuk PRODUCTION.
//
// Dua proses terpisah (masing-masing satu port):
//   • smt-backend  → Express API  di port 5000
//   • smt-frontend → hasil build React (statis) di port 5173 (PM2 serve, mode SPA)
//
// Apache2 (reverse proxy) di depan mengarahkan:
//   /api, /uploads  → 127.0.0.1:5000  (backend)
//   selain itu      → 127.0.0.1:5173  (frontend)
//
// Perintah:
//   pm2 start ecosystem.config.js      # jalankan kedua proses
//   pm2 reload ecosystem.config.js     # reload tanpa downtime (setelah update)
//   pm2 save                           # simpan daftar proses agar auto-start
//   pm2 logs                           # lihat log
//
// Path dibangun dari __dirname → aman dijalankan dari folder mana pun.

const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'smt-backend',
      cwd: path.join(ROOT, 'backend'),
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        // PORT & kredensial lain dibaca dari backend/.env (dotenv).
        // PENTING: set FRONTEND_URL di backend/.env ke domain publik produksi.
      },
      error_file: path.join(ROOT, 'backend', 'logs', 'pm2-backend-error.log'),
      out_file: path.join(ROOT, 'backend', 'logs', 'pm2-backend-out.log'),
      time: true,
    },
    {
      name: 'smt-frontend',
      // 'serve' adalah static server bawaan PM2 (tidak perlu install paket tambahan).
      script: 'serve',
      env: {
        PM2_SERVE_PATH: path.join(ROOT, 'frontend', 'dist'),
        PM2_SERVE_PORT: 5173,
        PM2_SERVE_SPA: 'true',            // fallback ke index.html untuk React Router
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
      autorestart: true,
      max_memory_restart: '200M',
      error_file: path.join(ROOT, 'backend', 'logs', 'pm2-frontend-error.log'),
      out_file: path.join(ROOT, 'backend', 'logs', 'pm2-frontend-out.log'),
      time: true,
    },
  ],
};
