const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { getItems, getItemById, updateItem, markSold, revertToAktif, deleteItem, exportExcel } = require('../controllers/cukimController');

// Fitur Cukim dibatasi khusus ADMIN (sama seperti Barang ART).
router.use(auth, requireRole('ADMIN'));

router.get('/export', exportExcel);
router.patch('/jual', markSold);            // tandai terjual (satu/banyak) → History
router.get('/', getItems);
router.get('/:id', getItemById);
router.put('/:id', updateItem);
router.patch('/:id/aktifkan', revertToAktif); // batal jual → kembali aktif
router.delete('/:id', deleteItem);

module.exports = router;
