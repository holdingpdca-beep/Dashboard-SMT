const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { handleValidation } = require('../middleware/validate');
const { createCabangRules, updateCabangRules } = require('../middleware/validators');
const { getCabang, createCabang, updateCabang, deleteCabang } = require('../controllers/cabangController');

router.get('/', auth, getCabang);
router.post('/', auth, requireRole('ADMIN'), createCabangRules, handleValidation, createCabang);
router.put('/:id', auth, requireRole('ADMIN'), updateCabangRules, handleValidation, updateCabang);
router.delete('/:id', auth, requireRole('ADMIN'), deleteCabang);

module.exports = router;
