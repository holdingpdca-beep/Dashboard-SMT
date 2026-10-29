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
    // L-06: tandai status 400 agar error handler global membalas 400 (bukan 500)
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(Object.assign(new Error('Hanya file gambar JPG, PNG, atau WEBP yang diizinkan'), { status: 400 }));
  },
});

// ── Sinkronisasi dengan API toko SERBAMAS (didaftarkan sebelum '/:id') ──
// L-01: sinkron manual dibatasi ke ADMIN/SUPER_USER (KATALOG_USER tidak boleh memicu
// beban ke API toko & penghapusan katalog). KATALOG_USER tetap bisa kelola item manual.
router.post('/sync', auth, requireRole('ADMIN', 'SUPER_USER'), syncKatalog);
router.get('/sync/preview', auth, requireRole('ADMIN', 'SUPER_USER'), previewSync);

router.get('/', auth, getKatalog);
router.get('/:id', auth, getKatalogById);
router.post('/', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), upload.single('gambar'), createKatalogRules, handleValidation, createKatalog);
router.put('/:id', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), upload.single('gambar'), updateKatalogRules, handleValidation, updateKatalog);
router.delete('/:id/gambar', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), hapusGambar);
router.delete('/:id', auth, requireRole('ADMIN', 'SUPER_USER', 'KATALOG_USER'), deleteKatalog);

module.exports = router;
