const express = require('express');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { getKatalog, getKatalogById, createKatalog, updateKatalog, deleteKatalog, hapusGambar, syncKatalog, previewSync } = require('../controllers/katalogController');

// Gambar ditampung di memori lalu diserahkan ke util storage
// (upload ke Alibaba Cloud OSS bila dikonfigurasi, atau disk lokal sebagai fallback).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar yang diizinkan'));
  },
});

// ── Sinkronisasi dengan API toko SERBAMAS (didaftarkan sebelum '/:id') ──
router.post('/sync', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), syncKatalog);
router.get('/sync/preview', auth, requireRole('ADMIN', 'SUPER_USER'), previewSync);

router.get('/', auth, getKatalog);
router.get('/:id', auth, getKatalogById);
router.post('/', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), upload.single('gambar'), createKatalog);
router.put('/:id', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), upload.single('gambar'), updateKatalog);
router.delete('/:id/gambar', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), hapusGambar);
router.delete('/:id', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), deleteKatalog);

module.exports = router;
