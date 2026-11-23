const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { handleValidation } = require('../middleware/validate');
const { cukimMarkSoldRules, cukimUpdateRules, idParamRule } = require('../middleware/validators');
const { getItems, getItemById, updateItem, markSold, revertToAktif, deleteItem, exportExcel } = require('../controllers/cukimController');

// Fitur Cukim dibatasi khusus ADMIN (sama seperti Barang ART).
router.use(auth, requireRole('ADMIN'));

router.get('/export', exportExcel);
router.patch('/jual', cukimMarkSoldRules, handleValidation, markSold);            // tandai terjual (satu/banyak) → History
router.get('/', getItems);
router.get('/:id', idParamRule, handleValidation, getItemById);
router.put('/:id', cukimUpdateRules, handleValidation, updateItem);
router.patch('/:id/aktifkan', idParamRule, handleValidation, revertToAktif); // batal jual → kembali aktif
router.delete('/:id', idParamRule, handleValidation, deleteItem);

module.exports = router;
