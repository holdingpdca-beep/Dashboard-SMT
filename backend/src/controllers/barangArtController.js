const prisma = require('../utils/prisma');
const { createAuditLog } = require('../utils/audit');
const { toInt } = require('../utils/query');
const { simpanGambar, hapusGambar: hapusFileGambar } = require('../utils/storage');
const XLSX = require('xlsx');

const MAX_IMPORT_ROWS = 2000; // Batas baris import Excel sekali proses (L-02)

const KATEGORI_VALID = ['LOGAM_MULIA', 'PERHIASAN'];
const KATEGORI_LABEL = { LOGAM_MULIA: 'Logam Mulia', PERHIASAN: 'Perhiasan' };
const TAHAP_VALID = ['AKTIF', 'EKSPORT', 'TERJUAL', 'DILEBUR'];
const TAHAP_LABEL = { AKTIF: 'Aktif', EKSPORT: 'Eksport', TERJUAL: 'Terjual', DILEBUR: 'Dilebur' };

// ── Pemetaan Vendor → prefix Kode Barang ──
// Gadai Mas → LMN, Gadai Mulia → LMS. Cek "mulia" dulu agar tidak tertangkap "mas".
const VENDOR_PREFIX = [
  { match: /mulia/i, prefix: 'LMS' }, // Gadai Mulia
  { match: /mas/i, prefix: 'LMN' },   // Gadai Mas
];
const VENDOR_OPTIONS = [
  { value: 'Gadai Mas', prefix: 'LMN' },
  { value: 'Gadai Mulia', prefix: 'LMS' },
];
function resolvePrefix(vendorAsal) {
  const v = String(vendorAsal || '').trim();
  if (!v) return null;
  for (const r of VENDOR_PREFIX) if (r.match.test(v)) return r.prefix;
  return null;
}
// Format kode: prefix + nomor berjalan (minimal 2 digit, tumbuh otomatis). Mis. LMN01, LMN02 ... LMN100
function formatKode(prefix, num) {
  const s = String(num);
  return prefix + (s.length < 2 ? s.padStart(2, '0') : s);
}

// Nomor suffix tertinggi yang pernah ada di tabel untuk prefix (seed awal counter).
async function maxSuffix(client, prefix) {
  const rows = await client.barangArt.findMany({
    where: { kodeBarang: { startsWith: prefix } },
    select: { kodeBarang: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = String(r.kodeBarang || '').slice(prefix.length).match(/^(\d+)/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return max;
}

// Alokasikan `count` nomor berjalan untuk prefix secara ATOMIK via KodeCounter.
// Mengembalikan nomor AWAL; kode yang dipakai = start .. start+count-1.
// Counter hanya bertambah → nomor tak pernah dipakai ulang (walau barang terjual/pindah/dihapus).
// `client` = prisma atau tx (dipanggil di dalam $transaction agar aman dari race).
async function allocateKode(client, prefix, count = 1) {
  // Pastikan baris counter ada. upsert aman bila dua proses membuat counter prefix
  // yang sama bersamaan (yang kalah tidak menimpa nilai yang sudah ada).
  const existing = await client.kodeCounter.findUnique({ where: { prefix } });
  if (!existing) {
    const seed = await maxSuffix(client, prefix); // mulai dari data lama bila ada
    await client.kodeCounter.upsert({ where: { prefix }, create: { prefix, lastNumber: seed }, update: {} });
  }
  // Increment ATOMIK: UPDATE ... SET lastNumber = lastNumber + count mengunci baris di
  // MySQL, sehingga dua alokasi paralel mendapat rentang nomor yang berbeda (tidak kembar).
  const updated = await client.kodeCounter.update({ where: { prefix }, data: { lastNumber: { increment: count } } });
  return updated.lastNumber - count + 1;
}

// Parsing angka uang toleran format Excel: " 32,093,000.00 " → 32093000, " -   " → null(→0).
function parseMoney(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  let s = String(raw).trim();
  if (s === '' || s === '-') return null;
  s = s.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Klasifikasi kategori dari karat: tepat 24 karat → Logam Mulia, selain itu → Perhiasan.
function kategoriFromKarat(karat) {
  const k = parseFloat(String(karat).replace(',', '.'));
  return (!isNaN(k) && Math.round(k) === 24) ? 'LOGAM_MULIA' : 'PERHIASAN';
}

// Parsing tanggal deterministik (disimpan jam 12:00 UTC agar tidak bergeser hari).
function parseTanggal(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
  }
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) { const [, y, mo, d] = iso; return new Date(Date.UTC(+y, +mo - 1, +d, 12, 0, 0)); }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return new Date(Date.UTC(+y, +mo - 1, +d, 12, 0, 0)); }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
  return null;
}

function normalizeKategori(raw) {
  const k = String(raw || '').trim().toUpperCase();
  return KATEGORI_VALID.includes(k) ? k : null;
}

// Susun filter WHERE dari query. tahap:'HISTORY' → TERJUAL+DILEBUR.
const buildWhere = (query) => {
  const where = {};
  const kategori = normalizeKategori(query.kategori);
  if (kategori) where.kategori = kategori;

  const tahap = String(query.tahap || '').trim().toUpperCase();
  if (tahap === 'HISTORY') where.tahap = { in: ['TERJUAL', 'DILEBUR'] };
  else if (TAHAP_VALID.includes(tahap)) where.tahap = tahap;

  const { search } = query;
  if (search) {
    where.OR = [
      { nomorSbg: { contains: search } },
      { namaBarang: { contains: search } },
      { kodeBarang: { contains: search } },
      { provinsi: { contains: search } },
      { vendorAsal: { contains: search } },
      { vendor: { contains: search } },
      { nomorSku: { contains: search } },
      { keterangan: { contains: search } },
    ];
  }
  return where;
};

const getItems = async (req, res, next) => {
  try {
    const { sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const page = toInt(req.query.page, 1, 1, 1e9);
    const limit = toInt(req.query.limit, 20, 1, 100);
    const skip = (page - 1) * limit;
    const where = buildWhere(req.query);

    const SORTABLE = ['createdAt', 'nomorSbg', 'namaBarang', 'gramasi', 'karat', 'cogs', 'totalHarga', 'beaLelang', 'kodeBarang', 'provinsi', 'tanggalJual', 'tanggalLebur', 'tanggalEksport', 'nominalJual', 'vendorAsal', 'vendor', 'nomorSku', 'kategori', 'tahap', 'status'];
    const orderCol = SORTABLE.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    // Hitung ringkasan tahap dalam konteks kategori yang sama (bila ada).
    const base = where.kategori ? { kategori: where.kategori } : {};
    const [total, items, totalAktif, totalEksport, totalTerjual, totalDilebur] = await Promise.all([
      prisma.barangArt.count({ where }),
      prisma.barangArt.findMany({ where, skip, take: limit, orderBy: { [orderCol]: orderDir } }),
      prisma.barangArt.count({ where: { ...base, tahap: 'AKTIF' } }),
      prisma.barangArt.count({ where: { ...base, tahap: 'EKSPORT' } }),
      prisma.barangArt.count({ where: { ...base, tahap: 'TERJUAL' } }),
      prisma.barangArt.count({ where: { ...base, tahap: 'DILEBUR' } }),
    ]);

    res.json({
      success: true,
      data: items,
      summary: { totalAktif, totalEksport, totalTerjual, totalDilebur },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const getItemById = async (req, res, next) => {
  try {
    const item = await prisma.barangArt.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!item) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

const createItem = async (req, res, next) => {
  try {
    const { vendorAsal, nomorSbg, provinsi, namaBarang, gramasi, karat, totalHarga, beaLelang, cogs, keterangan } = req.body;

    if (!vendorAsal || !nomorSbg || !provinsi || !namaBarang || gramasi === undefined || gramasi === '' || !karat) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    // Kategori otomatis dari karat (24 = Logam Mulia, selain itu Perhiasan). Bisa dipaksa via body.kategori.
    const kategori = normalizeKategori(req.body.kategori) || kategoriFromKarat(karat);

    // Hanya Logam Mulia yang berkode (LMN/LMS dari vendor). Perhiasan TIDAK berkode.
    let prefix = null;
    if (kategori === 'LOGAM_MULIA') {
      prefix = resolvePrefix(vendorAsal);
      if (!prefix) return res.status(400).json({ success: false, message: 'Vendor tidak dikenali. Gunakan "Gadai Mas" atau "Gadai Mulia".' });
    }

    // Payment SMT (COGS) = input langsung bila ada, selain itu Total Harga + Bea Lelang.
    const th = parseMoney(totalHarga) ?? 0;
    const bl = parseMoney(beaLelang) ?? 0;
    const cogsVal = (cogs !== undefined && cogs !== '' && cogs !== null) ? parseMoney(cogs) : (th + bl);
    if (cogsVal === null || isNaN(cogsVal)) return res.status(400).json({ success: false, message: 'Nilai COGS/Payment SMT tidak valid' });

    // Alokasi kode + create atomik (hanya untuk Logam Mulia).
    const item = await prisma.$transaction(async (tx) => {
      let kodeBarang = null;
      if (prefix) kodeBarang = formatKode(prefix, await allocateKode(tx, prefix, 1));
      return tx.barangArt.create({
        data: {
          kategori,
          vendorAsal: String(vendorAsal).trim(),
          nomorSbg: String(nomorSbg).trim(),
          provinsi: String(provinsi).trim(),
          namaBarang: String(namaBarang).trim(),
          gramasi: parseFloat(gramasi),
          karat: String(karat).trim(),
          totalHarga: th,
          beaLelang: bl,
          cogs: cogsVal,
          kodeBarang,
          keterangan: keterangan || null,
          tahap: 'AKTIF',
          status: 'BELUM_TERJUAL',
        },
      });
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `TAMBAH BARANG ART (${KATEGORI_LABEL[kategori]}${item.kodeBarang ? ', ' + item.kodeBarang : ''})`,
      tabel: 'BarangArt', dataBaru: item, ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: item.kodeBarang ? `Data ditambahkan — Kode ${item.kodeBarang}` : 'Data perhiasan ditambahkan', data: item });
  } catch (err) {
    next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.barangArt.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    const { vendorAsal, nomorSbg, provinsi, namaBarang, gramasi, karat, totalHarga, beaLelang, cogs, keterangan } = req.body;

    // Hitung ulang COGS bila Total/Bea/COGS dikirim.
    const th = totalHarga !== undefined && totalHarga !== '' ? parseMoney(totalHarga) : (existing.totalHarga != null ? parseFloat(existing.totalHarga) : null);
    const bl = beaLelang !== undefined && beaLelang !== '' ? parseMoney(beaLelang) : (existing.beaLelang != null ? parseFloat(existing.beaLelang) : null);
    let cogsVal = existing.cogs != null ? parseFloat(existing.cogs) : null;
    if (cogs !== undefined && cogs !== '' && cogs !== null) cogsVal = parseMoney(cogs);
    else if (totalHarga !== undefined || beaLelang !== undefined) cogsVal = (th || 0) + (bl || 0);

    // Kode barang TIDAK diubah di edit (nomor berjalan tetap stabil).
    const updated = await prisma.barangArt.update({
      where: { id },
      data: {
        vendorAsal: vendorAsal !== undefined && String(vendorAsal).trim() !== '' ? String(vendorAsal).trim() : existing.vendorAsal,
        nomorSbg: nomorSbg ? String(nomorSbg).trim() : existing.nomorSbg,
        provinsi: provinsi !== undefined ? String(provinsi).trim() : existing.provinsi,
        namaBarang: namaBarang !== undefined ? String(namaBarang).trim() : existing.namaBarang,
        gramasi: gramasi !== undefined && gramasi !== '' ? parseFloat(gramasi) : existing.gramasi,
        karat: karat !== undefined ? String(karat).trim() : existing.karat,
        totalHarga: th,
        beaLelang: bl,
        cogs: cogsVal != null ? cogsVal : existing.cogs,
        keterangan: keterangan !== undefined ? keterangan : existing.keterangan,
      },
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `EDIT BARANG ART (${KATEGORI_LABEL[existing.kategori]}, ${existing.kodeBarang})`,
      tabel: 'BarangArt', dataLama: existing, dataBaru: updated, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Data berhasil diperbarui', data: updated });
  } catch (err) {
    next(err);
  }
};

// Ambil daftar barang AKTIF yang valid dari array id (dipakai aksi massal).
async function ambilAktif(ids, { kategori } = {}) {
  const items = await prisma.barangArt.findMany({ where: { id: { in: ids } } });
  if (items.length !== ids.length) return { error: 'Sebagian barang tidak ditemukan' };
  const bukanAktif = items.filter(i => i.tahap !== 'AKTIF');
  if (bukanAktif.length > 0) return { error: `Barang berikut tidak berada di daftar aktif: ${bukanAktif.map(i => i.kodeBarang || i.nomorSbg).join(', ')}` };
  if (kategori) {
    const salah = items.filter(i => i.kategori !== kategori);
    if (salah.length > 0) return { error: `Barang berikut bukan ${KATEGORI_LABEL[kategori]}: ${salah.map(i => i.kodeBarang || i.nomorSbg).join(', ')}` };
  }
  return { items };
}

function parseIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(x => parseInt(x)).filter(x => !isNaN(x));
}

// Aksi: tandai TERJUAL (Logam Mulia) untuk satu/banyak barang. → masuk History.
// Body: { tanggalJual, vendor, nomorSku, keterangan, items: [{ id, nominalJual }] }
const markSold = async (req, res, next) => {
  try {
    const { tanggalJual, vendor, nomorSku, keterangan, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: 'Minimal 1 barang harus dipilih' });
    const tglJual = parseTanggal(tanggalJual);
    if (!tglJual) return res.status(400).json({ success: false, message: 'Tanggal Jual wajib diisi' });
    if (!vendor || !String(vendor).trim()) return res.status(400).json({ success: false, message: 'Vendor pembeli wajib diisi' });
    if (!nomorSku || !String(nomorSku).trim()) return res.status(400).json({ success: false, message: 'Nomor SKU wajib diisi' });

    const parsed = [];
    for (const it of items) {
      const id = parseInt(it.id);
      const nominal = it.nominalJual !== undefined && it.nominalJual !== '' ? parseFloat(it.nominalJual) : NaN;
      if (!id || isNaN(nominal) || nominal < 0) return res.status(400).json({ success: false, message: 'Nominal Jual tiap barang wajib diisi dengan angka >= 0' });
      parsed.push({ id, nominal });
    }

    const { items: existingItems, error } = await ambilAktif(parsed.map(p => p.id));
    if (error) return res.status(400).json({ success: false, message: error });

    const vendorClean = String(vendor).trim();
    const skuClean = String(nomorSku).trim();
    const ketClean = keterangan !== undefined && String(keterangan).trim() !== '' ? String(keterangan).trim() : null;

    // Guard atomik (L-09): updateMany dengan syarat tahap='AKTIF' + cek count,
    // agar barang yang sama tidak bisa diproses dua kali oleh aksi paralel.
    const updatedCount = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const p of parsed) {
        const r = await tx.barangArt.updateMany({
          where: { id: p.id, tahap: 'AKTIF' },
          data: {
            tahap: 'TERJUAL', status: 'TERJUAL', tanggalJual: tglJual, nominalJual: p.nominal, vendor: vendorClean, nomorSku: skuClean,
            ...(ketClean !== null ? { keterangan: ketClean } : {}),
          },
        });
        if (r.count !== 1) throw Object.assign(new Error('Sebagian barang berubah status saat diproses, muat ulang halaman & coba lagi'), { status: 409 });
        n++;
      }
      return n;
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `TANDAI TERJUAL BARANG ART (${updatedCount} barang, SKU ${skuClean})`,
      tabel: 'BarangArt', dataBaru: { ids: parsed.map(p => p.id), vendor: vendorClean, nomorSku: skuClean, tanggalJual: tglJual }, ipAddress: req.ip,
    });

    res.json({ success: true, message: `${updatedCount} barang ditandai terjual`, data: { count: updatedCount } });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ success: false, message: err.message });
    next(err);
  }
};

// Aksi: LEBUR perhiasan (satu/banyak) → jadi 1 Cukim, barang masuk History sebagai DILEBUR.
// Body: { tanggalLebur, keterangan, berat, kadarXrf, ids: [...] }
// Cukim: No CKM## otomatis, Berat & Kadar XRF manual, COGS = total Payment SMT barang yang dilebur.
const leburItems = async (req, res, next) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'Minimal 1 barang harus dipilih' });
    const tglLebur = parseTanggal(req.body.tanggalLebur) || new Date();
    const ketClean = req.body.keterangan !== undefined && String(req.body.keterangan).trim() !== '' ? String(req.body.keterangan).trim() : null;

    // Validasi data Cukim (berat & kadar XRF wajib).
    const berat = parseFloat(String(req.body.berat).replace(',', '.'));
    if (isNaN(berat) || berat <= 0) return res.status(400).json({ success: false, message: 'Berat Cukim wajib diisi dengan angka > 0' });
    const kadarXrf = String(req.body.kadarXrf || '').trim();
    if (!kadarXrf) return res.status(400).json({ success: false, message: 'Kadar XRF wajib diisi' });

    const { items, error } = await ambilAktif(ids);
    if (error) return res.status(400).json({ success: false, message: error });

    // COGS cukim = total Payment SMT (cogs) seluruh barang yang dilebur.
    const totalCogs = items.reduce((s, i) => s + (i.cogs != null ? parseFloat(i.cogs) : 0), 0);

    const { cukim, updatedCount } = await prisma.$transaction(async (tx) => {
      const noCukim = formatKode('CKM', await allocateKode(tx, 'CKM', 1));
      const cukim = await tx.cukim.create({
        data: { noCukim, berat, kadarXrf, cogs: totalCogs, tanggal: tglLebur, keterangan: ketClean },
      });
      let updatedCount = 0;
      for (const i of items) {
        // Guard atomik (L-09): hanya lebur bila barang masih AKTIF, agar tidak bisa
        // dilebur dua kali (COGS ganda) oleh aksi paralel.
        const r = await tx.barangArt.updateMany({
          where: { id: i.id, tahap: 'AKTIF' },
          data: { tahap: 'DILEBUR', tanggalLebur: tglLebur, cukimId: cukim.id, ...(ketClean !== null ? { keterangan: ketClean } : {}) },
        });
        if (r.count !== 1) throw Object.assign(new Error('Sebagian barang berubah status saat dilebur, muat ulang halaman & coba lagi'), { status: 409 });
        updatedCount++;
      }
      return { cukim, updatedCount };
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `LEBUR BARANG ART (${updatedCount} barang → Cukim ${cukim.noCukim})`,
      tabel: 'BarangArt', dataBaru: { ids, tanggalLebur: tglLebur, cukim }, ipAddress: req.ip,
    });

    res.json({ success: true, message: `${updatedCount} barang dilebur menjadi Cukim ${cukim.noCukim}`, data: { cukim, updatedCount } });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ success: false, message: err.message });
    next(err);
  }
};

// Aksi: pindah Logam Mulia → Perhiasan (satu/banyak). Kode Barang tetap.
// Body: { ids: [...] }
const moveToPerhiasan = async (req, res, next) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'Minimal 1 barang harus dipilih' });

    const { items, error } = await ambilAktif(ids, { kategori: 'LOGAM_MULIA' });
    if (error) return res.status(400).json({ success: false, message: error });

    // Jadi perhiasan → tidak berkode lagi (kode LMN/LMS dilepas; nomornya tak dipakai ulang).
    // Guard atomik (L-09): hanya proses bila masih AKTIF & Logam Mulia.
    const updatedCount = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const i of items) {
        const r = await tx.barangArt.updateMany({
          where: { id: i.id, tahap: 'AKTIF', kategori: 'LOGAM_MULIA' },
          data: { kategori: 'PERHIASAN', kodeBarang: null },
        });
        if (r.count !== 1) throw Object.assign(new Error('Sebagian barang berubah status saat diproses, muat ulang halaman & coba lagi'), { status: 409 });
        n++;
      }
      return n;
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `PINDAH KE PERHIASAN (${updatedCount} barang)`,
      tabel: 'BarangArt', dataBaru: { ids }, ipAddress: req.ip,
    });

    res.json({ success: true, message: `${updatedCount} barang dipindah ke Perhiasan`, data: { count: updatedCount } });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ success: false, message: err.message });
    next(err);
  }
};

// Aksi: pindah Perhiasan → Barang Eksport (satu/banyak).
// Body: { ids: [...], tanggalEksport? }
const moveToEksport = async (req, res, next) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'Minimal 1 barang harus dipilih' });
    const tgl = parseTanggal(req.body.tanggalEksport) || new Date();

    const { items, error } = await ambilAktif(ids, { kategori: 'PERHIASAN' });
    if (error) return res.status(400).json({ success: false, message: error });

    // Saat masuk Barang Eksport, kode EKS## dibuat otomatis (nomor berjalan).
    const updatedCount = await prisma.$transaction(async (tx) => {
      const start = await allocateKode(tx, 'EKS', items.length);
      let n = 0;
      for (let idx = 0; idx < items.length; idx++) {
        // Guard atomik (L-09): hanya proses bila masih AKTIF & Perhiasan. Bila ada yang
        // gagal, seluruh transaksi di-rollback termasuk alokasi nomor EKS (tidak bolong).
        const r = await tx.barangArt.updateMany({
          where: { id: items[idx].id, tahap: 'AKTIF', kategori: 'PERHIASAN' },
          data: { tahap: 'EKSPORT', tanggalEksport: tgl, kodeBarang: formatKode('EKS', start + idx) },
        });
        if (r.count !== 1) throw Object.assign(new Error('Sebagian barang berubah status saat diproses, muat ulang halaman & coba lagi'), { status: 409 });
        n++;
      }
      return n;
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `PINDAH KE BARANG EKSPORT (${updatedCount} barang)`,
      tabel: 'BarangArt', dataBaru: { ids }, ipAddress: req.ip,
    });

    res.json({ success: true, message: `${updatedCount} barang dipindah ke Barang Eksport`, data: { count: updatedCount } });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ success: false, message: err.message });
    next(err);
  }
};

// Aksi: kembalikan barang ke AKTIF (batal jual / batal lebur / batal eksport). Mengosongkan field terkait.
const revertToAktif = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.barangArt.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    if (existing.tahap === 'AKTIF') return res.status(400).json({ success: false, message: 'Barang sudah aktif' });

    const updated = await prisma.$transaction(async (tx) => {
      // Batal lebur (L-09): barang terhubung ke sebuah Cukim.
      if (existing.tahap === 'DILEBUR' && existing.cukimId) {
        const cukim = await tx.cukim.findUnique({ where: { id: existing.cukimId } });
        if (cukim) {
          // Tolak bila Cukim-nya sudah terjual — melepas barang akan merusak catatan penjualan.
          if (cukim.status === 'TERJUAL') {
            throw Object.assign(new Error(`Tidak bisa batal lebur: Cukim ${cukim.noCukim} sudah terjual. Batalkan penjualan Cukim dulu.`), { status: 400 });
          }
          // Kurangi COGS Cukim sebesar Payment SMT barang yang dilepas (agar tidak double-count).
          const cogsBarang = existing.cogs != null ? parseFloat(existing.cogs) : 0;
          const cogsCukimBaru = Math.max(0, parseFloat(cukim.cogs) - cogsBarang);
          await tx.cukim.update({ where: { id: cukim.id }, data: { cogs: cogsCukimBaru } });
        }
      }
      // Guard atomik: hanya ubah bila tahap belum berpindah.
      const r = await tx.barangArt.updateMany({
        where: { id, tahap: existing.tahap },
        data: {
          tahap: 'AKTIF', status: 'BELUM_TERJUAL',
          tanggalJual: null, nominalJual: null, vendor: null, nomorSku: null,
          tanggalLebur: null, tanggalEksport: null,
          // Batal lebur → lepas tautan ke Cukim (barang keluar dari gabungan cukim).
          ...(existing.tahap === 'DILEBUR' ? { cukimId: null } : {}),
          // Dari Barang Eksport → kembali jadi perhiasan tanpa kode (kode EKS dilepas).
          ...(existing.tahap === 'EKSPORT' ? { kodeBarang: null } : {}),
        },
      });
      if (r.count !== 1) throw Object.assign(new Error('Status barang berubah saat diproses, muat ulang halaman & coba lagi'), { status: 409 });
      return tx.barangArt.findUnique({ where: { id } });
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `KEMBALIKAN KE AKTIF dari ${TAHAP_LABEL[existing.tahap]} (${existing.kodeBarang})`,
      tabel: 'BarangArt', dataLama: existing, dataBaru: updated, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Barang dikembalikan ke daftar aktif', data: updated });
  } catch (err) {
    if (err.status === 400 || err.status === 409) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// Upload / ganti foto barang. Simpan gambar baru DULU, baru hapus yang lama bila sukses.
const uploadGambar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.barangArt.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    if (!req.file) return res.status(400).json({ success: false, message: 'File gambar tidak ditemukan' });

    let gambarBaru;
    try {
      gambarBaru = await simpanGambar(req.file, 'barang-art');
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message || 'Gambar tidak valid' });
    }
    // Hapus foto lama hanya setelah yang baru tersimpan sukses.
    if (existing.gambar) await hapusFileGambar(existing.gambar);

    const updated = await prisma.barangArt.update({ where: { id }, data: { gambar: gambarBaru } });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `UPLOAD FOTO BARANG ART (${existing.kodeBarang || existing.nomorSbg})`,
      tabel: 'BarangArt', ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Foto berhasil diunggah', data: updated });
  } catch (err) {
    next(err);
  }
};

// Hapus foto barang.
const hapusGambarItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.barangArt.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    if (existing.gambar) await hapusFileGambar(existing.gambar);

    const updated = await prisma.barangArt.update({ where: { id }, data: { gambar: null } });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `HAPUS FOTO BARANG ART (${existing.kodeBarang || existing.nomorSbg})`,
      tabel: 'BarangArt', ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Foto berhasil dihapus', data: updated });
  } catch (err) {
    next(err);
  }
};

const deleteItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.barangArt.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    // Hapus foto terkait (bila ada) agar tidak jadi file yatim.
    if (existing.gambar) await hapusFileGambar(existing.gambar);

    await prisma.barangArt.delete({ where: { id } });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `HAPUS BARANG ART (${KATEGORI_LABEL[existing.kategori]}, ${existing.kodeBarang})`,
      tabel: 'BarangArt', dataLama: existing, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Data berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

// Aksi: hapus BANYAK barang sekaligus (hapus permanen). Body: { ids: [...] }
const deleteItems = async (req, res, next) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'Minimal 1 barang harus dipilih' });

    const existing = await prisma.barangArt.findMany({ where: { id: { in: ids } } });
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    // Hapus record dulu (transaksi), lalu bersihkan file foto agar tidak jadi file yatim.
    const result = await prisma.$transaction(async (tx) => {
      return tx.barangArt.deleteMany({ where: { id: { in: existing.map(i => i.id) } } });
    });

    for (const item of existing) {
      if (item.gambar) {
        try { await hapusFileGambar(item.gambar); } catch { /* abaikan kegagalan hapus file */ }
      }
    }

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `HAPUS MASSAL BARANG ART (${result.count} barang)`,
      tabel: 'BarangArt', dataLama: { ids: existing.map(i => i.id), kodeBarang: existing.map(i => i.kodeBarang) }, ipAddress: req.ip,
    });

    res.json({ success: true, message: `${result.count} barang berhasil dihapus`, data: { count: result.count } });
  } catch (err) {
    next(err);
  }
};

const exportExcel = async (req, res, next) => {
  try {
    const where = buildWhere(req.query);
    const items = await prisma.barangArt.findMany({ where, orderBy: { createdAt: 'desc' } });

    const data = items.map((item, idx) => ({
      No: idx + 1,
      'Kode Barang': item.kodeBarang,
      Provinsi: item.provinsi,
      Vendor: item.vendorAsal || '',
      'No SBG': item.nomorSbg,
      Keterangan: item.keterangan || '',
      Barang: item.namaBarang,
      Berat: parseFloat(item.gramasi),
      Karat: item.karat,
      'Total Harga': item.totalHarga != null ? parseFloat(item.totalHarga) : '',
      'Bea Lelang': item.beaLelang != null ? parseFloat(item.beaLelang) : '',
      'Payment SMT': item.cogs != null ? parseFloat(item.cogs) : '',
      Kategori: KATEGORI_LABEL[item.kategori],
      Tahap: TAHAP_LABEL[item.tahap],
      'Tanggal Jual': item.tanggalJual ? new Date(item.tanggalJual).toLocaleDateString('id-ID') : '',
      'Nominal Jual': item.nominalJual != null ? parseFloat(item.nominalJual) : '',
      'Vendor Pembeli': item.vendor || '',
      'Nomor SKU': item.nomorSku || '',
      'Tanggal Lebur': item.tanggalLebur ? new Date(item.tanggalLebur).toLocaleDateString('id-ID') : '',
      'Tanggal Eksport': item.tanggalEksport ? new Date(item.tanggalEksport).toLocaleDateString('id-ID') : '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Barang ART');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `EXPORT BARANG ART (${items.length} data)`,
      tabel: 'BarangArt', ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Barang-ART-${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

// Ambil nilai kolom berdasarkan nama header (toleran spasi & huruf besar/kecil).
function pickCol(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = alias.toLowerCase().replace(/\s+/g, '');
    const found = keys.find(k => String(k).toLowerCase().replace(/\s+/g, '') === target);
    if (found !== undefined) {
      const v = row[found];
      return v === null || v === undefined ? '' : v;
    }
  }
  return '';
}

// Import dari Excel format ART baru:
// Kolom: Kode Barang (diabaikan, dibuat otomatis) · Provinsi · Vendor · No SBG · Keterangan · Barang · Berat · Karat · Total Harga · Bea Lelang · Payment SMT
// Kategori otomatis dari Karat (24 → Logam Mulia, selain itu Perhiasan).
// Kode Barang otomatis dari Vendor (Gadai Mas → LMN, Gadai Mulia → LMS), nomor berjalan.
const importExcel = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File Excel tidak ditemukan' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ success: false, message: `Jumlah baris (${rows.length}) melebihi batas ${MAX_IMPORT_ROWS}. Bagi file menjadi beberapa bagian.` });
    }

    const toCreate = []; // tiap item punya _prefix (LMN/LMS) utk Logam Mulia, null utk Perhiasan
    let gagal = 0, logamMulia = 0, perhiasan = 0;
    const errors = [];

    rows.forEach((row, i) => {
      const vendorAsal = String(pickCol(row, ['Vendor'])).trim();
      const nomorSbg = String(pickCol(row, ['No SBG', 'Nomor SBG', 'SBG'])).trim();
      const provinsi = String(pickCol(row, ['Provinsi'])).trim();
      const keterangan = String(pickCol(row, ['Keterangan'])).trim();
      const namaBarang = String(pickCol(row, ['Barang', 'Nama Barang'])).trim();
      const gramasiRaw = pickCol(row, ['Berat', 'Gramasi']);
      const karat = String(pickCol(row, ['Karat'])).trim();
      const totalHarga = parseMoney(pickCol(row, ['Total Harga', 'Total']));
      const beaLelang = parseMoney(pickCol(row, ['Bea Lelang', 'Bea']));
      const paymentRaw = pickCol(row, ['Payment SMT', 'Payment', 'COGS']);

      // Lewati baris kosong total.
      if (!vendorAsal && !nomorSbg && !provinsi && !namaBarang && gramasiRaw === '' && !karat) return;

      const gramasi = parseFloat(String(gramasiRaw).toString().replace(',', '.'));
      let cogs = parseMoney(paymentRaw);
      if (cogs === null) cogs = (totalHarga || 0) + (beaLelang || 0);

      if (!vendorAsal || !nomorSbg || !provinsi || !namaBarang || !karat || isNaN(gramasi) || !cogs) {
        gagal++;
        errors.push({ baris: i + 2, nomorSbg, pesan: 'Data tidak lengkap / angka tidak valid' });
        return;
      }

      const kategori = kategoriFromKarat(karat);

      // Logam Mulia WAJIB vendor dikenali (utk kode LMN/LMS). Perhiasan tidak berkode.
      let prefix = null;
      if (kategori === 'LOGAM_MULIA') {
        prefix = resolvePrefix(vendorAsal);
        if (!prefix) {
          gagal++;
          errors.push({ baris: i + 2, nomorSbg, pesan: `Vendor "${vendorAsal}" tidak dikenali untuk Logam Mulia (hanya Gadai Mas / Gadai Mulia)` });
          return;
        }
        logamMulia++;
      } else {
        perhiasan++;
      }

      toCreate.push({
        _prefix: prefix,
        kategori, vendorAsal, nomorSbg, provinsi, keterangan: keterangan || null, namaBarang,
        gramasi, karat, totalHarga: totalHarga || 0, beaLelang: beaLelang || 0, cogs,
        kodeBarang: null, tahap: 'AKTIF', status: 'BELUM_TERJUAL',
      });
    });

    let berhasil = 0;
    if (toCreate.length > 0) {
      berhasil = await prisma.$transaction(async (tx) => {
        // Alokasi blok nomor untuk tiap prefix LM, lalu bagikan berurutan.
        const countLMN = toCreate.filter(r => r._prefix === 'LMN').length;
        const countLMS = toCreate.filter(r => r._prefix === 'LMS').length;
        let nLMN = countLMN > 0 ? await allocateKode(tx, 'LMN', countLMN) : 0;
        let nLMS = countLMS > 0 ? await allocateKode(tx, 'LMS', countLMS) : 0;
        for (const r of toCreate) {
          if (r._prefix === 'LMN') r.kodeBarang = formatKode('LMN', nLMN++);
          else if (r._prefix === 'LMS') r.kodeBarang = formatKode('LMS', nLMS++);
          delete r._prefix;
        }
        const result = await tx.barangArt.createMany({ data: toCreate });
        return result.count;
      });
    }

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `IMPORT BARANG ART (${berhasil} baru: ${logamMulia} logam mulia, ${perhiasan} perhiasan, ${gagal} gagal)`,
      tabel: 'BarangArt', ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Import selesai',
      data: { total: rows.length, berhasil, logamMulia, perhiasan, gagal, errors },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getItems, getItemById, createItem, updateItem,
  markSold, leburItems, moveToPerhiasan, moveToEksport, revertToAktif,
  deleteItem, deleteItems, exportExcel, importExcel,
  uploadGambar, hapusGambarItem,
};
