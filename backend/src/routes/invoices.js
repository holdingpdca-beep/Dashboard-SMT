const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// L-01: Alur Invoice lama (buat → approval → cetak) sudah TIDAK DIGUNAKAN, digantikan
// penjualan langsung + struk (lihat routes/items.js). Seluruh endpoint /api/invoices/*
// dinonaktifkan untuk mengurangi permukaan serangan dan mencegah bentrok dengan
// penjualan langsung (barang di invoice DRAFT/WAITING bisa ikut terjual langsung).
//
// Data historis invoice TETAP tersimpan di database (tabel invoices / invoice_items)
// dan bisa diakses langsung bila sewaktu-waktu diperlukan. Controller lama
// (controllers/invoiceController.js) sengaja dibiarkan di repo sebagai arsip.
//
// Bila alur invoice ingin diaktifkan kembali, kembalikan registrasi route lama
// dan terapkan update bersyarat status (lihat catatan L-01 pada audit v4).

router.use(auth);

router.all(/.*/, (req, res) => {
  res.status(410).json({
    success: false,
    message: 'Fitur Invoice sudah tidak digunakan (digantikan penjualan langsung & struk).',
  });
});

module.exports = router;
