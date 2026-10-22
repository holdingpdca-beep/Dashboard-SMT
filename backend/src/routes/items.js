const express = require('express');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole, ELEKTRONIK_ROLES } = require('../middleware/roleCheck');
const { handleValidation } = require('../middleware/validate');
const { createItemRules, updateItemRules } = require('../middleware/validators');
const { getItems, getItemById, createItem, updateItem, deleteItem, importExcel, exportExcel, getStats, getRiwayat } = require('../controllers/itemController');

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

// Modul elektronik hanya untuk ADMIN/SUPER_USER/USER — KATALOG_USER dikecualikan (H-01)
router.use(auth, requireRole(...ELEKTRONIK_ROLES));

router.get('/stats', getStats);
router.get('/export', exportExcel);
router.get('/riwayat', getRiwayat);
router.get('/', getItems);
router.get('/:id', getItemById);
router.post('/', requireRole('ADMIN', 'SUPER_USER'), createItemRules, handleValidation, createItem);
router.put('/:id', requireRole('ADMIN', 'SUPER_USER'), updateItemRules, handleValidation, updateItem);
router.delete('/:id', requireRole('ADMIN', 'SUPER_USER'), deleteItem);
router.post('/import/excel', requireRole('ADMIN', 'SUPER_USER'), upload.single('file'), importExcel);

module.exports = router;
