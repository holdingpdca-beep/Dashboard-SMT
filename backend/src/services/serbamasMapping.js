/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PEMETAAN FIELD API TOKO SERBAMAS  →  KATALOG DASHBOARD
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  INI SATU-SATUNYA FILE YANG PERLU DISESUAIKAN kalau nama field dari API
 *  ternyata berbeda. Karena contoh response API belum tersedia saat fitur ini
 *  dibuat, setiap field mencoba BEBERAPA kemungkinan nama (candidate keys).
 *
 *  Cara menyesuaikan nanti (setelah lihat 1 contoh JSON asli dari API):
 *    1. Jalankan endpoint preview:  GET /api/katalog/sync/preview?cabangId=<id>
 *       → akan menampilkan 1-2 data MENTAH dari API + nama-nama field aslinya.
 *    2. Cocokkan nama field asli ke daftar di bawah (cukup taruh di urutan
 *       pertama supaya diprioritaskan).
 *
 *  Pencarian field bersifat CASE-INSENSITIVE, jadi "ProductName",
 *  "productName", dan "PRODUCTNAME" sama saja.
 */

// Daftar kemungkinan nama field dari API untuk tiap data yang kita butuhkan.
// Tinggal tambah/ubah di sini bila nama aslinya berbeda.
const FIELD_CANDIDATES = {
  externalId: ['ProductCode', 'ItemCode', 'SKU', 'Barcode', 'ProductId', 'ItemId', 'Code', 'Kode', 'Id'],
  nama:       ['ProductName', 'ItemName', 'Name', 'ProductDescription', 'Description', 'NamaBarang', 'Nama'],
  kategori:   ['CategoryName', 'Category', 'ProductCategory', 'Kategori', 'Group', 'GroupName'],
  jenis:      ['SubCategory', 'SubCategoryName', 'Type', 'ProductType', 'JenisBarang', 'Jenis', 'CategoryName', 'Category'],
  harga:      ['SellPrice', 'SellingPrice', 'Price', 'UnitPrice', 'RetailPrice', 'HargaJual', 'Harga'],
  gambar:     ['ImageUrl', 'ImageURL', 'Image', 'PhotoUrl', 'PhotoURL', 'Photo', 'Thumbnail', 'Gambar', 'Foto'],
  stok:       ['Stock', 'StockQty', 'StockQuantity', 'Qty', 'Quantity', 'QtyOnHand', 'OnHand', 'Stok'],
  storeName:  ['StoreName', 'Store', 'NamaToko', 'Toko'],
};

// Ambil nilai pertama yang ketemu dari beberapa kemungkinan key (case-insensitive).
function pick(obj, candidates) {
  if (!obj || typeof obj !== 'object') return undefined;
  const lowerMap = {};
  for (const key of Object.keys(obj)) lowerMap[key.toLowerCase()] = obj[key];
  for (const cand of candidates) {
    const val = lowerMap[cand.toLowerCase()];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return undefined;
}

// Bersihkan angka harga dari format teks ("Rp 1.200.000", "1,200,000.00", dll)
function parseHarga(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.,-]/g, '');
  // Buang pemisah ribuan. Asumsi: titik/koma terakhir sbg desimal jika diikuti <=2 digit.
  const normalized = cleaned.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const num = parseFloat(normalized.replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}

// Tentukan kategori enum dashboard (PERHIASAN | LM) dari teks kategori/jenis/nama.
function tentukanKategori(...teksArr) {
  const teks = teksArr.filter(Boolean).join(' ').toLowerCase();
  if (/\b(lm|logam\s*mulia|lantakan|batangan|antam|ubs|bar)\b/.test(teks)) return 'LM';
  return 'PERHIASAN';
}

// Tentukan apakah sebuah data barang masih ada stoknya.
// Dipakai sbg pengaman tambahan; filter utama tetap IsInStock=true di URL API.
function adaStok(raw) {
  const stokVal = pick(raw, FIELD_CANDIDATES.stok);
  // Beberapa API pakai flag boolean IsInStock / InStock
  const flag = pick(raw, ['IsInStock', 'InStock', 'Available', 'Tersedia']);
  if (flag !== undefined) {
    const s = String(flag).toLowerCase();
    if (s === 'false' || s === '0' || s === 'no') return false;
    if (s === 'true' || s === '1' || s === 'yes') return true;
  }
  if (stokVal !== undefined) {
    const n = parseFloat(String(stokVal).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n)) return n > 0;
  }
  // Kalau tidak ada info stok sama sekali, anggap ada (API sudah difilter IsInStock=true)
  return true;
}

/**
 * Ubah 1 data mentah dari API menjadi objek katalog yang siap disimpan ke DB.
 * @param {object} raw - satu item produk dari response API
 * @param {object} cabang - record cabang tujuan (punya id)
 * @returns {object|null} data katalog, atau null bila data tidak valid (tanpa ID unik)
 */
function mapProduk(raw, cabang) {
  const externalId = pick(raw, FIELD_CANDIDATES.externalId);
  if (externalId === undefined) return null; // tanpa ID unik tidak bisa disinkron

  const nama = pick(raw, FIELD_CANDIDATES.nama) || `Barang ${externalId}`;
  const kategoriTeks = pick(raw, FIELD_CANDIDATES.kategori);
  const jenisTeks = pick(raw, FIELD_CANDIDATES.jenis);
  const gambar = pick(raw, FIELD_CANDIDATES.gambar);
  const stokVal = pick(raw, FIELD_CANDIDATES.stok);
  const stokNum = stokVal !== undefined
    ? parseInt(String(stokVal).replace(/[^0-9-]/g, ''), 10)
    : null;

  return {
    externalId: String(externalId),
    cabangId: cabang.id,
    nama: String(nama).trim(),
    kategori: tentukanKategori(kategoriTeks, jenisTeks, nama),
    jenisBarang: String(jenisTeks || kategoriTeks || 'Lainnya').trim(),
    harga: parseHarga(pick(raw, FIELD_CANDIDATES.harga)),
    gambar: gambar ? String(gambar) : null,
    stok: Number.isFinite(stokNum) ? stokNum : null,
    sumber: 'API',
  };
}

module.exports = { FIELD_CANDIDATES, pick, parseHarga, tentukanKategori, adaStok, mapProduk };
