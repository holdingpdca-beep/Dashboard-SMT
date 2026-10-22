const express = require('express');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { handleValidation } = require('../middleware/validate');
const { createKatalogRules, updateKatalogRules } = require('../middleware/validators');
const { IMAGE_TYPES } = require('../utils/storage');
const { getKatalog, getKatalogById, createKatalog, updateKatalog, deleteKatalog, hapusGambar, syncKatalog, previewSync } = require('../controllers/katalogController');

// Gambar ditampung di memori lalu diserahkan ke util storage
// (upload ke Alibaba Cloud OSS bila dikonfigurasi, atau disk lokal sebagai fallback).
//
// C-02: whitelist mimetype yang ketat. mimetype & originalname dikontrol client,
// jadi ini hanya saringan awal; ekstensi final ditentukan server dari mimetype,
// dan isi file diverifikasi via magic bytes di utils/storage (simpanGambar).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error('Hanya file gambar JPG, PNG, atau WEBP yang diizinkan'));
  },
});

// ── Sinkronisasi dengan API toko SERBAMAS (didaftarkan sebelum '/:id') ──
router.post('/sync', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), syncKatalog);
router.get('/sync/preview', auth, requireRole('ADMIN', 'SUPER_USER'), previewSync);

router.get('/', auth, getKatalog);
router.get('/:id', auth, getKatalogById);
router.post('/', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), upload.single('gambar'), createKatalogRules, handleValidation, createKatalog);
router.put('/:id', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), upload.single('gambar'), updateKatalogRules, handleValidation, updateKatalog);
router.delete('/:id/gambar', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), hapusGambar);
router.delete('/:id', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), deleteKatalog);

module.exports = router;
