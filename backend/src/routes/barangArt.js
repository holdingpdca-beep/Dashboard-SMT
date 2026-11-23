const express = require('express');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { handleValidation } = require('../middleware/validate');
const { createBarangArtRules, updateBarangArtRules, markSoldRules, leburRules, moveArtRules } = require('../middleware/validators');
const { IMAGE_TYPES } = require('../utils/storage');
const {
  getItems, getItemById, createItem, updateItem,
  markSold, leburItems, moveToPerhiasan, moveToEksport, revertToAktif,
  deleteItem, exportExcel, importExcel,
  uploadGambar, hapusGambarItem,
} = require('../controllers/barangArtController');

// Whitelist tipe file Excel untuk import
const EXCEL_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okExt = /\.(xlsx|xls)$/i.test(file.originalname);
    // L-06: tandai status 400 agar error handler global membalas 400 (bukan 500)
    if (EXCEL_MIME.includes(file.mimetype) || okExt) cb(null, true);
    else cb(Object.assign(new Error('Hanya file Excel (.xlsx, .xls) yang diizinkan'), { status: 400 }));
  },
});

// Upload foto barang — ditampung di memori lalu diserahkan ke util storage (OSS/disk).
// Ekstensi final & validasi isi (magic bytes) ditentukan server di utils/storage.
const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(Object.assign(new Error('Hanya file gambar JPG, PNG, atau WEBP yang diizinkan'), { status: 400 }));
  },
});

// Fitur Barang ART dibatasi khusus ADMIN (tahap awal).
router.use(auth, requireRole('ADMIN'));

router.get('/export', exportExcel);
router.post('/import/excel', upload.single('file'), importExcel);
router.get('/', getItems);
router.patch('/jual', markSoldRules, handleValidation, markSold);          // tandai terjual (Logam Mulia) → History
router.patch('/lebur', leburRules, handleValidation, leburItems);          // lebur (Perhiasan) → History
router.patch('/pindah-perhiasan', moveArtRules, handleValidation, moveToPerhiasan); // Logam Mulia → Perhiasan
router.patch('/pindah-eksport', moveArtRules, handleValidation, moveToEksport);     // Perhiasan → Barang Eksport
router.post('/:id/gambar', uploadFoto.single('gambar'), uploadGambar); // upload/ganti foto barang
router.delete('/:id/gambar', hapusGambarItem);                        // hapus foto barang
router.get('/:id', getItemById);
router.post('/', createBarangArtRules, handleValidation, createItem);
router.put('/:id', updateBarangArtRules, handleValidation, updateItem);
router.patch('/:id/aktifkan', revertToAktif);   // kembalikan ke AKTIF (batal jual/lebur/eksport)
router.patch('/:id/batal-jual', revertToAktif); // alias lama
router.delete('/:id', deleteItem);

module.exports = router;
