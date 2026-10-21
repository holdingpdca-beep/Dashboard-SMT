require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const logger = require('./src/utils/logger');

const authRoutes = require('./src/routes/auth');
const itemRoutes = require('./src/routes/items');
const invoiceRoutes = require('./src/routes/invoices');
const userRoutes = require('./src/routes/users');
const auditRoutes = require('./src/routes/audit');
const katalogRoutes = require('./src/routes/katalog');
const notifikasiRoutes = require('./src/routes/notifikasi');
const cabangRoutes = require('./src/routes/cabang');
const barangArtRoutes = require('./src/routes/barangArt');

// ── Validasi environment variable wajib saat startup ──
const requiredEnv = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`FATAL: Environment variable wajib tidak ditemukan: ${missingEnv.join(', ')}`);
  process.exit(1);
}
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.FRONTEND_URL) {
  console.error('FATAL: FRONTEND_URL wajib di-set pada environment production');
  process.exit(1);
}
if (isProduction && process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET terlalu lemah untuk production (minimal 32 karakter)');
  process.exit(1);
}

const app = express();

// Diperlukan agar req.ip akurat di belakang reverse proxy (Nginx)
app.set('trust proxy', 1);

// ── Security headers ──
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // izinkan gambar katalog di-load frontend
}));

// ── CORS ──
const allowedOrigin = process.env.FRONTEND_URL || (isProduction ? false : 'http://localhost:5173');
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));

// ── HTTP access log (morgan → winston, tersimpan di logs/combined.log) ──
app.use(morgan(isProduction ? 'combined' : 'dev', { stream: logger.stream }));

// ── Body parser (limit diturunkan dari 50mb ke 10mb) ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate limiting global ──
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan, coba lagi nanti.' },
});
app.use('/api', apiLimiter);

// ── Rate limiting ketat khusus login (brute-force protection) ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
});
app.use('/api/auth/login', loginLimiter);

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/katalog', katalogRoutes);
app.use('/api/notifikasi', notifikasiRoutes);
app.use('/api/cabang', cabangRoutes);
app.use('/api/barang-art', barangArtRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Dashboard SMT Backend Running', timestamp: new Date() });
});

app.use((err, req, res, next) => {
  logger.error(err.stack || err.message || String(err));
  // Jangan bocorkan detail error internal di production
  const message = isProduction ? 'Terjadi kesalahan pada server' : (err.message || 'Internal Server Error');
  res.status(err.status || 500).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`Server berjalan di port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  // Nyalakan penjadwal sinkronisasi katalog otomatis (jika diaktifkan di .env)
  try {
    require('./src/services/scheduler').startSchedulers();
  } catch (err) {
    logger.error(`Gagal memulai penjadwal: ${err.message}`);
  }
});

// ── Graceful shutdown ──
const prisma = require('./src/utils/prisma');
const shutdown = async (signal) => {
  logger.info(`${signal} diterima, menutup server dengan graceful...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Server dan koneksi database ditutup.');
    process.exit(0);
  });
  // Paksa keluar jika tidak selesai dalam 10 detik
  setTimeout(() => {
    logger.error('Tidak bisa menutup dengan bersih, memaksa keluar.');
    process.exit(1);
  }, 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
