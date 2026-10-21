const express = require('express');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const {
  getItems, getItemById, createItem, updateItem, markSold, revertSold, deleteItem, exportExcel, importExcel,
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
    if (EXCEL_MIME.includes(file.mimetype) || okExt) cb(null, true);
    else cb(new Error('Hanya file Excel (.xlsx, .xls) yang diizinkan'));
  },
});

// Fitur Barang ART dibatasi khusus ADMIN (tahap awal).
router.use(auth, requireRole('ADMIN'));

router.get('/export', exportExcel);
router.post('/import/excel', upload.single('file'), importExcel);
router.get('/', getItems);
router.patch('/jual', markSold);             // tandai terjual (1 atau banyak barang, 1 SKU)
router.get('/:id', getItemById);
router.post('/', createItem);
router.put('/:id', updateItem);
router.patch('/:id/batal-jual', revertSold); // batalkan terjual
router.delete('/:id', deleteItem);

module.exports = router;
