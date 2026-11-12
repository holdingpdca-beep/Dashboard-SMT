const express = require('express');
const router = express.Router();
const { getPublicKatalog } = require('../controllers/itemController');

// Katalog elektronik publik — DAPAT DIAKSES SIAPA SAJA (tanpa login).
// Hanya menampilkan barang BELUM TERJUAL dengan field aman saja.
router.get('/', getPublicKatalog);

module.exports = router;
