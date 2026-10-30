const { body } = require('express-validator');

// Kumpulan aturan validasi input untuk endpoint POST/PUT utama.
// Dipasang di route sebelum handleValidation. Melengkapi (bukan mengganti)
// pengecekan logika bisnis yang tetap ada di controller.

const GRADES = ['A', 'B', 'C', 'D'];
const PERUSAHAAN = ['SERBA_MAS', 'VOLARY'];
const ROLES = ['ADMIN', 'SUPER_USER', 'USER', 'KATALOG_USER'];
const KATEGORI_EMAS = ['PERHIASAN', 'LM'];

// Pesan kebijakan password (M-06): sinkron dengan utils/password.validatePassword
const PW_MSG = 'Password minimal 10 karakter serta mengandung huruf dan angka';

// ── Auth ──
const loginRules = [
  body('email').trim().isEmail().withMessage('Email tidak valid'),
  body('password').notEmpty().withMessage('Password wajib diisi'),
];

const changePasswordRules = [
  body('passwordLama').notEmpty().withMessage('Password lama wajib diisi'),
  body('passwordBaru').isLength({ min: 10, max: 128 }).withMessage(PW_MSG),
];

// ── Elektronik ──
const createItemRules = [
  body('nomorSbg').trim().notEmpty().withMessage('Nomor SBG wajib diisi'),
  body('grade').isIn(GRADES).withMessage('Grade harus salah satu dari A, B, C, D'),
  body('jenisBarang').trim().notEmpty().withMessage('Jenis barang wajib diisi'),
  body('detailBarang').trim().notEmpty().withMessage('Detail barang wajib diisi'),
  body('cogs').exists().withMessage('COGS wajib diisi').bail().isFloat({ min: 0 }).withMessage('COGS harus angka >= 0'),
  body('hargaJual').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Harga jual harus angka >= 0'),
  body('offeringPengepul').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Offering pengepul harus angka >= 0'),
  body('perusahaan').optional({ nullable: true, checkFalsy: true }).isIn(PERUSAHAAN).withMessage('Perusahaan tidak valid'),
];

const updateItemRules = [
  body('nomorSbg').optional().trim().notEmpty().withMessage('Nomor SBG tidak boleh kosong'),
  body('grade').optional().isIn(GRADES).withMessage('Grade harus salah satu dari A, B, C, D'),
  body('jenisBarang').optional().trim().notEmpty().withMessage('Jenis barang tidak boleh kosong'),
  body('detailBarang').optional().trim().notEmpty().withMessage('Detail barang tidak boleh kosong'),
  body('cogs').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('COGS harus angka >= 0'),
  body('hargaJual').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Harga jual harus angka >= 0'),
  body('offeringPengepul').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Offering pengepul harus angka >= 0'),
  body('perusahaan').optional({ nullable: true, checkFalsy: true }).isIn(PERUSAHAAN).withMessage('Perusahaan tidak valid'),
];

// ── Invoice ──
const createInvoiceRules = [
  body('namaCustomer').trim().notEmpty().withMessage('Nama customer wajib diisi').bail().isLength({ max: 150 }).withMessage('Nama customer maksimal 150 karakter'),
  body('noTelepon').optional({ nullable: true, checkFalsy: true }).isLength({ max: 30 }).withMessage('Nomor telepon maksimal 30 karakter'),
  body('catatan').optional({ nullable: true }).isLength({ max: 1000 }).withMessage('Catatan maksimal 1000 karakter'),
  body('tanggalInvoice').notEmpty().withMessage('Tanggal invoice wajib diisi'),
  body('perusahaan').optional({ nullable: true, checkFalsy: true }).isIn(PERUSAHAAN).withMessage('Perusahaan tidak valid'),
  body('itemIds').isArray({ min: 1, max: 500 }).withMessage('Minimal 1 barang harus dipilih (maks 500)'),
  body('itemIds.*').isInt().withMessage('ID barang tidak valid'),
];

const updateInvoiceRules = [
  body('namaCustomer').optional().trim().notEmpty().withMessage('Nama customer tidak boleh kosong').bail().isLength({ max: 150 }).withMessage('Nama customer maksimal 150 karakter'),
  body('noTelepon').optional({ nullable: true, checkFalsy: true }).isLength({ max: 30 }).withMessage('Nomor telepon maksimal 30 karakter'),
  body('catatan').optional({ nullable: true }).isLength({ max: 1000 }).withMessage('Catatan maksimal 1000 karakter'),
  body('perusahaan').optional({ nullable: true, checkFalsy: true }).isIn(PERUSAHAAN).withMessage('Perusahaan tidak valid'),
];

const updateInvoiceItemsRules = [
  body('itemIds').isArray({ min: 1, max: 500 }).withMessage('Minimal 1 barang harus dipilih (maks 500)'),
  body('itemIds.*').isInt().withMessage('ID barang tidak valid'),
];

// Alasan reject/cancel invoice — opsional tapi dibatasi panjangnya (L-06)
const rejectInvoiceRules = [
  body('alasan').optional({ nullable: true }).isLength({ max: 500 }).withMessage('Alasan maksimal 500 karakter'),
];

// ── User ──
const createUserRules = [
  body('nama').trim().notEmpty().withMessage('Nama wajib diisi').bail().isLength({ max: 100 }).withMessage('Nama maksimal 100 karakter'),
  body('email').trim().isEmail().withMessage('Email tidak valid'),
  body('password').isLength({ min: 10, max: 128 }).withMessage(PW_MSG),
  body('role').optional({ nullable: true, checkFalsy: true }).isIn(ROLES).withMessage('Role tidak valid'),
];

const updateUserRules = [
  body('nama').optional().trim().notEmpty().withMessage('Nama tidak boleh kosong').bail().isLength({ max: 100 }).withMessage('Nama maksimal 100 karakter'),
  body('email').optional().trim().isEmail().withMessage('Email tidak valid'),
  body('role').optional({ nullable: true, checkFalsy: true }).isIn(ROLES).withMessage('Role tidak valid'),
  body('isActive').optional().isBoolean().withMessage('isActive harus true atau false'),
];

const resetPasswordRules = [
  body('passwordBaru').isLength({ min: 10, max: 128 }).withMessage(PW_MSG),
];

// ── Katalog Emas (L-01) ──
const createKatalogRules = [
  body('kategori').isIn(KATEGORI_EMAS).withMessage('Kategori harus PERHIASAN atau LM'),
  body('jenisBarang').trim().notEmpty().withMessage('Jenis barang wajib diisi').bail().isLength({ max: 100 }).withMessage('Jenis barang maksimal 100 karakter'),
  body('nama').trim().notEmpty().withMessage('Nama wajib diisi').bail().isLength({ max: 150 }).withMessage('Nama maksimal 150 karakter'),
  body('deskripsi').optional({ nullable: true }).isLength({ max: 1000 }).withMessage('Deskripsi maksimal 1000 karakter'),
  body('harga').notEmpty().withMessage('Harga wajib diisi').bail().isFloat({ min: 0 }).withMessage('Harga harus angka >= 0'),
  body('urutan').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).withMessage('Urutan harus angka >= 0'),
  body('cabangId').optional({ nullable: true, checkFalsy: true }).isInt().withMessage('Cabang tidak valid'),
];

const updateKatalogRules = [
  body('kategori').optional().isIn(KATEGORI_EMAS).withMessage('Kategori harus PERHIASAN atau LM'),
  body('jenisBarang').optional().trim().notEmpty().withMessage('Jenis barang tidak boleh kosong').bail().isLength({ max: 100 }).withMessage('Jenis barang maksimal 100 karakter'),
  body('nama').optional().trim().notEmpty().withMessage('Nama tidak boleh kosong').bail().isLength({ max: 150 }).withMessage('Nama maksimal 150 karakter'),
  body('deskripsi').optional({ nullable: true }).isLength({ max: 1000 }).withMessage('Deskripsi maksimal 1000 karakter'),
  body('harga').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Harga harus angka >= 0'),
  body('urutan').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).withMessage('Urutan harus angka >= 0'),
  body('cabangId').optional({ nullable: true }).custom((v) => v === null || v === '' || Number.isInteger(Number(v))).withMessage('Cabang tidak valid'),
];

// ── Cabang (L-01) ──
const createCabangRules = [
  body('nama').trim().notEmpty().withMessage('Nama cabang wajib diisi').bail().isLength({ max: 100 }).withMessage('Nama maksimal 100 karakter'),
  body('alamat').optional({ nullable: true }).isLength({ max: 500 }).withMessage('Alamat maksimal 500 karakter'),
  body('storeName').optional({ nullable: true }).isLength({ max: 150 }).withMessage('Nama toko maksimal 150 karakter'),
];

const updateCabangRules = [
  body('nama').optional().trim().notEmpty().withMessage('Nama cabang tidak boleh kosong').bail().isLength({ max: 100 }).withMessage('Nama maksimal 100 karakter'),
  body('alamat').optional({ nullable: true }).isLength({ max: 500 }).withMessage('Alamat maksimal 500 karakter'),
  body('storeName').optional({ nullable: true }).isLength({ max: 150 }).withMessage('Nama toko maksimal 150 karakter'),
  body('aktif').optional().isBoolean().withMessage('aktif harus true atau false'),
];

// ── Barang ART (L-02) ──
const KATEGORI_ART = ['LOGAM_MULIA', 'PERHIASAN'];

const createBarangArtRules = [
  body('kategori').isIn(KATEGORI_ART).withMessage('Kategori harus LOGAM_MULIA atau PERHIASAN'),
  body('barangAsal').trim().notEmpty().withMessage('Barang asal wajib diisi').bail().isLength({ max: 150 }).withMessage('Barang asal maksimal 150 karakter'),
  body('nomorSbg').trim().notEmpty().withMessage('Nomor SBG wajib diisi').bail().isLength({ max: 100 }).withMessage('Nomor SBG maksimal 100 karakter'),
  body('provinsi').trim().notEmpty().withMessage('Provinsi wajib diisi').bail().isLength({ max: 100 }).withMessage('Provinsi maksimal 100 karakter'),
  body('namaBarang').trim().notEmpty().withMessage('Nama barang wajib diisi').bail().isLength({ max: 200 }).withMessage('Nama barang maksimal 200 karakter'),
  body('gramasi').exists().withMessage('Gramasi wajib diisi').bail().isFloat({ min: 0 }).withMessage('Gramasi harus angka >= 0'),
  body('karat').trim().notEmpty().withMessage('Karat wajib diisi').bail().isLength({ max: 50 }).withMessage('Karat maksimal 50 karakter'),
  body('cogs').exists().withMessage('COGS wajib diisi').bail().isFloat({ min: 0 }).withMessage('COGS harus angka >= 0'),
  body('kodeBarang').trim().notEmpty().withMessage('Kode barang wajib diisi').bail().isLength({ max: 100 }).withMessage('Kode barang maksimal 100 karakter'),
  body('keterangan').optional({ nullable: true }).isLength({ max: 1000 }).withMessage('Keterangan maksimal 1000 karakter'),
];

const updateBarangArtRules = [
  body('barangAsal').optional().trim().notEmpty().withMessage('Barang asal tidak boleh kosong').bail().isLength({ max: 150 }).withMessage('Barang asal maksimal 150 karakter'),
  body('nomorSbg').optional().trim().notEmpty().withMessage('Nomor SBG tidak boleh kosong').bail().isLength({ max: 100 }).withMessage('Nomor SBG maksimal 100 karakter'),
  body('provinsi').optional().trim().notEmpty().withMessage('Provinsi tidak boleh kosong').bail().isLength({ max: 100 }).withMessage('Provinsi maksimal 100 karakter'),
  body('namaBarang').optional().trim().notEmpty().withMessage('Nama barang tidak boleh kosong').bail().isLength({ max: 200 }).withMessage('Nama barang maksimal 200 karakter'),
  body('gramasi').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Gramasi harus angka >= 0'),
  body('karat').optional().trim().notEmpty().withMessage('Karat tidak boleh kosong').bail().isLength({ max: 50 }).withMessage('Karat maksimal 50 karakter'),
  body('cogs').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('COGS harus angka >= 0'),
  body('kodeBarang').optional().trim().isLength({ max: 100 }).withMessage('Kode barang maksimal 100 karakter'),
  body('keterangan').optional({ nullable: true }).isLength({ max: 1000 }).withMessage('Keterangan maksimal 1000 karakter'),
];

const markSoldRules = [
  body('tanggalJual').notEmpty().withMessage('Tanggal jual wajib diisi'),
  body('vendor').trim().notEmpty().withMessage('Vendor wajib diisi').bail().isLength({ max: 150 }).withMessage('Vendor maksimal 150 karakter'),
  body('nomorSku').trim().notEmpty().withMessage('Nomor SKU wajib diisi').bail().isLength({ max: 100 }).withMessage('Nomor SKU maksimal 100 karakter'),
  body('keterangan').optional({ nullable: true }).isLength({ max: 1000 }).withMessage('Keterangan maksimal 1000 karakter'),
  body('items').isArray({ min: 1, max: 500 }).withMessage('Minimal 1 barang harus dipilih (maks 500)'),
  body('items.*.id').isInt().withMessage('ID barang tidak valid'),
  body('items.*.nominalJual').isFloat({ min: 0 }).withMessage('Nominal jual harus angka >= 0'),
];

module.exports = {
  loginRules,
  changePasswordRules,
  createItemRules,
  updateItemRules,
  createInvoiceRules,
  updateInvoiceRules,
  updateInvoiceItemsRules,
  rejectInvoiceRules,
  createUserRules,
  updateUserRules,
  resetPasswordRules,
  createKatalogRules,
  updateKatalogRules,
  createCabangRules,
  updateCabangRules,
  createBarangArtRules,
  updateBarangArtRules,
  markSoldRules,
};
