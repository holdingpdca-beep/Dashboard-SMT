const prisma = require('../utils/prisma');
const { createAuditLog } = require('../utils/audit');
const XLSX = require('xlsx');

const KATEGORI_VALID = ['LOGAM_MULIA', 'PERHIASAN'];
const KATEGORI_LABEL = { LOGAM_MULIA: 'Logam Mulia', PERHIASAN: 'Perhiasan' };

// Parsing tanggal deterministik (disimpan jam 12:00 UTC agar tidak bergeser
// hari di zona waktu manapun). Input utama dari <input type="date"> = yyyy-mm-dd.
function parseTanggal(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
  }
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    return new Date(Date.UTC(+y, +mo - 1, +d, 12, 0, 0));
  }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return new Date(Date.UTC(+y, +mo - 1, +d, 12, 0, 0));
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
  }
  return null;
}

// Validasi & normalisasi kategori dari query/param. Mengembalikan null bila tidak valid.
function normalizeKategori(raw) {
  const k = String(raw || '').trim().toUpperCase();
  return KATEGORI_VALID.includes(k) ? k : null;
}

const buildWhere = (kategori, query) => {
  const { search, status, tanpaKode } = query;
  const where = { kategori };
  if (status) where.status = status;
  // Barang yang Kode Barang-nya belum diisi (mis. hasil import)
  if (tanpaKode === '1' || tanpaKode === 'true' || tanpaKode === true) where.kodeBarang = '';
  if (search) {
    where.OR = [
      { barangAsal: { contains: search } },
      { nomorSbg: { contains: search } },
      { namaBarang: { contains: search } },
      { kodeBarang: { contains: search } },
      { provinsi: { contains: search } },
      { vendor: { contains: search } },
      { nomorSku: { contains: search } },
      { keterangan: { contains: search } },
    ];
  }
  return where;
};

const getItems = async (req, res) => {
  try {
    const kategori = normalizeKategori(req.query.kategori);
    if (!kategori) return res.status(400).json({ success: false, message: 'Kategori tidak valid' });

    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = buildWhere(kategori, req.query);

    // Whitelist kolom sort agar aman (tidak langsung percaya input)
    const SORTABLE = ['createdAt', 'barangAsal', 'nomorSbg', 'namaBarang', 'gramasi', 'karat', 'cogs', 'kodeBarang', 'provinsi', 'tanggalJual', 'nominalJual', 'vendor', 'nomorSku', 'status'];
    const orderCol = SORTABLE.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, items, totalBelum, totalTerjual, totalPerluKode] = await Promise.all([
      prisma.barangArt.count({ where }),
      prisma.barangArt.findMany({ where, skip, take: parseInt(limit), orderBy: { [orderCol]: orderDir } }),
      prisma.barangArt.count({ where: { kategori, status: 'BELUM_TERJUAL' } }),
      prisma.barangArt.count({ where: { kategori, status: 'TERJUAL' } }),
      prisma.barangArt.count({ where: { kategori, kodeBarang: '' } }),
    ]);

    res.json({
      success: true,
      data: items,
      summary: { totalBelum, totalTerjual, totalPerluKode },
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getItemById = async (req, res) => {
  try {
    const item = await prisma.barangArt.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!item) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createItem = async (req, res) => {
  try {
    const kategori = normalizeKategori(req.body.kategori);
    if (!kategori) return res.status(400).json({ success: false, message: 'Kategori tidak valid' });

    const { barangAsal, nomorSbg, provinsi, namaBarang, gramasi, karat, cogs, kodeBarang, keterangan } = req.body;

    if (!barangAsal || !nomorSbg || !provinsi || !namaBarang || gramasi === undefined || gramasi === '' || !karat || cogs === undefined || cogs === '' || !kodeBarang) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    // Satu No SBG boleh dipakai banyak barang → tidak ada pengecekan duplikat.
    // Barang baru selalu berstatus BELUM_TERJUAL. Data penjualan diisi lewat aksi tandai terjual.
    const item = await prisma.barangArt.create({
      data: {
        kategori,
        barangAsal: String(barangAsal).trim(),
        nomorSbg: String(nomorSbg).trim(),
        provinsi: String(provinsi).trim(),
        namaBarang: String(namaBarang).trim(),
        gramasi: parseFloat(gramasi),
        karat: String(karat).trim(),
        cogs: parseFloat(cogs),
        kodeBarang: String(kodeBarang).trim(),
        keterangan: keterangan || null,
        status: 'BELUM_TERJUAL',
      },
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `TAMBAH BARANG ART (${KATEGORI_LABEL[kategori]})`,
      tabel: 'BarangArt', dataBaru: item, ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Data berhasil ditambahkan', data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.barangArt.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    // kategori & status tidak diubah lewat endpoint ini (status via aksi jual/batal-jual)
    const { barangAsal, nomorSbg, provinsi, namaBarang, gramasi, karat, cogs, kodeBarang, keterangan } = req.body;

    const updated = await prisma.barangArt.update({
      where: { id },
      data: {
        barangAsal: barangAsal !== undefined && String(barangAsal).trim() !== '' ? String(barangAsal).trim() : existing.barangAsal,
        nomorSbg: nomorSbg ? String(nomorSbg).trim() : existing.nomorSbg,
        provinsi: provinsi !== undefined ? String(provinsi).trim() : existing.provinsi,
        namaBarang: namaBarang !== undefined ? String(namaBarang).trim() : existing.namaBarang,
        gramasi: gramasi !== undefined && gramasi !== '' ? parseFloat(gramasi) : existing.gramasi,
        karat: karat !== undefined ? String(karat).trim() : existing.karat,
        cogs: cogs !== undefined && cogs !== '' ? parseFloat(cogs) : existing.cogs,
        kodeBarang: kodeBarang !== undefined ? String(kodeBarang).trim() : existing.kodeBarang,
        keterangan: keterangan !== undefined ? keterangan : existing.keterangan,
      },
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `EDIT BARANG ART (${KATEGORI_LABEL[existing.kategori]})`,
      tabel: 'BarangArt', dataLama: existing, dataBaru: updated, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Data berhasil diperbarui', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Aksi: tandai TERJUAL untuk satu atau banyak barang sekaligus.
// Vendor, Nomor SKU, dan Tanggal Jual dipakai sama untuk seluruh batch.
// Nominal Jual diisi per barang (lihat `items`).
// Body: { tanggalJual, vendor, nomorSku, items: [{ id, nominalJual }, ...] }
const markSold = async (req, res) => {
  try {
    const { tanggalJual, vendor, nomorSku, keterangan, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Minimal 1 barang harus dipilih' });
    }
    const tglJual = parseTanggal(tanggalJual);
    if (!tglJual) return res.status(400).json({ success: false, message: 'Tanggal Jual wajib diisi' });
    if (!vendor || !String(vendor).trim()) return res.status(400).json({ success: false, message: 'Vendor wajib diisi' });
    if (!nomorSku || !String(nomorSku).trim()) return res.status(400).json({ success: false, message: 'Nomor SKU wajib diisi' });

    // Normalisasi & validasi tiap baris
    const parsed = [];
    for (const it of items) {
      const id = parseInt(it.id);
      const nominal = it.nominalJual !== undefined && it.nominalJual !== '' ? parseFloat(it.nominalJual) : NaN;
      if (!id || isNaN(nominal) || nominal < 0) {
        return res.status(400).json({ success: false, message: 'Nominal Jual tiap barang wajib diisi dengan angka >= 0' });
      }
      parsed.push({ id, nominal });
    }

    const ids = parsed.map(p => p.id);
    const existingItems = await prisma.barangArt.findMany({ where: { id: { in: ids } } });
    if (existingItems.length !== ids.length) {
      return res.status(404).json({ success: false, message: 'Sebagian barang tidak ditemukan' });
    }

    // Barang tanpa Kode Barang tidak boleh dijual — Kode Barang wajib diisi dulu.
    const tanpaKode = existingItems.filter(i => !i.kodeBarang || String(i.kodeBarang).trim() === '');
    if (tanpaKode.length > 0) {
      const daftar = tanpaKode.map(i => i.nomorSbg).join(', ');
      return res.status(400).json({ success: false, message: `Kode Barang belum diisi untuk: ${daftar}. Isi Kode Barang dulu sebelum menjual.` });
    }

    const vendorClean = String(vendor).trim();
    const skuClean = String(nomorSku).trim();
    // Keterangan opsional & berlaku untuk seluruh batch. Hanya ditimpa bila diisi.
    const ketClean = keterangan !== undefined && String(keterangan).trim() !== '' ? String(keterangan).trim() : null;

    // Semua update dalam satu transaksi (gagal salah satu → batal semua)
    const updated = await prisma.$transaction(
      parsed.map(p => prisma.barangArt.update({
        where: { id: p.id },
        data: {
          status: 'TERJUAL', tanggalJual: tglJual, nominalJual: p.nominal, vendor: vendorClean, nomorSku: skuClean,
          ...(ketClean !== null ? { keterangan: ketClean } : {}),
        },
      }))
    );

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `TANDAI TERJUAL BARANG ART (${updated.length} barang, SKU ${skuClean})`,
      tabel: 'BarangArt', dataBaru: { ids, vendor: vendorClean, nomorSku: skuClean, tanggalJual: tglJual }, ipAddress: req.ip,
    });

    res.json({ success: true, message: `${updated.length} barang ditandai terjual`, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Aksi: batalkan status terjual → kembali BELUM_TERJUAL (kosongkan tanggal & nominal)
const revertSold = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.barangArt.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    const updated = await prisma.barangArt.update({
      where: { id },
      data: { status: 'BELUM_TERJUAL', tanggalJual: null, nominalJual: null, vendor: null, nomorSku: null },
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `BATALKAN TERJUAL BARANG ART (${KATEGORI_LABEL[existing.kategori]})`,
      tabel: 'BarangArt', dataLama: existing, dataBaru: updated, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Status terjual dibatalkan', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.barangArt.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    await prisma.barangArt.delete({ where: { id } });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `HAPUS BARANG ART (${KATEGORI_LABEL[existing.kategori]})`,
      tabel: 'BarangArt', dataLama: existing, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Data berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const exportExcel = async (req, res) => {
  try {
    const kategori = normalizeKategori(req.query.kategori);
    if (!kategori) return res.status(400).json({ success: false, message: 'Kategori tidak valid' });

    const where = buildWhere(kategori, req.query);
    const items = await prisma.barangArt.findMany({ where, orderBy: { createdAt: 'desc' } });

    const data = items.map((item, idx) => ({
      No: idx + 1,
      'Barang Asal': item.barangAsal,
      'No SBG': item.nomorSbg,
      Provinsi: item.provinsi,
      'Nama Barang': item.namaBarang,
      Gramasi: parseFloat(item.gramasi),
      Karat: item.karat,
      COGS: item.cogs != null ? parseFloat(item.cogs) : '',
      'Kode Barang': item.kodeBarang,
      'Tanggal Jual': item.tanggalJual ? new Date(item.tanggalJual).toLocaleDateString('id-ID') : '',
      'Nominal Jual': item.nominalJual != null ? parseFloat(item.nominalJual) : '',
      Vendor: item.vendor || '',
      'Nomor SKU': item.nomorSku || '',
      Keterangan: item.keterangan || '',
      Status: item.status === 'TERJUAL' ? 'Terjual' : 'Belum Terjual',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, KATEGORI_LABEL[kategori]);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `EXPORT BARANG ART ${KATEGORI_LABEL[kategori]} (${items.length} data)`,
      tabel: 'BarangArt', ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Barang-ART-${KATEGORI_LABEL[kategori].replace(/\s+/g, '-')}-${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Ambil nilai kolom berdasarkan nama header (toleran spasi & huruf besar/kecil)
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

// Import dari Excel sesuai template: Barang Asal, No SBG, Provinsi, Nama Barang, Gramasi, Karat, COGS, Kode Barang.
// Kolom Kode Barang opsional: bila di Excel sudah terisi langsung dipakai (barang siap dijual);
// bila kosong, barang tetap masuk tapi Kode Barang wajib diisi manual dulu sebelum bisa dijual.
// Semua baris masuk sebagai BELUM_TERJUAL.
const importExcel = async (req, res) => {
  try {
    const kategori = normalizeKategori(req.body.kategori);
    if (!kategori) return res.status(400).json({ success: false, message: 'Kategori tidak valid' });
    if (!req.file) return res.status(400).json({ success: false, message: 'File Excel tidak ditemukan' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const toCreate = [];
    let gagal = 0;
    let perluKode = 0; // baris berhasil diimport tapi Kode Barang masih kosong (harus diisi sebelum dijual)
    const errors = [];

    rows.forEach((row, i) => {
      const barangAsal = String(pickCol(row, ['Barang Asal'])).trim();
      const nomorSbg = String(pickCol(row, ['No SBG', 'Nomor SBG', 'SBG'])).trim();
      const provinsi = String(pickCol(row, ['Provinsi'])).trim();
      const namaBarang = String(pickCol(row, ['Nama Barang'])).trim();
      const gramasiRaw = pickCol(row, ['Gramasi']);
      const karat = String(pickCol(row, ['Karat'])).trim();
      const cogsRaw = pickCol(row, ['COGS', 'Cogs']);
      const kodeBarang = String(pickCol(row, ['Kode Barang', 'Kode'])).trim();

      // Lewati baris kosong total
      if (!barangAsal && !nomorSbg && !provinsi && !namaBarang && gramasiRaw === '' && !karat && cogsRaw === '' && !kodeBarang) return;

      const gramasi = parseFloat(gramasiRaw);
      const cogs = parseFloat(cogsRaw);

      if (!barangAsal || !nomorSbg || !provinsi || !namaBarang || !karat || isNaN(gramasi) || isNaN(cogs)) {
        gagal++;
        errors.push({ baris: i + 2, nomorSbg, pesan: 'Data tidak lengkap / angka tidak valid' });
        return;
      }

      if (!kodeBarang) perluKode++;

      toCreate.push({
        kategori,
        barangAsal,
        nomorSbg,
        provinsi,
        namaBarang,
        gramasi,
        karat,
        cogs,
        kodeBarang, // dari Excel bila ada; '' bila kosong → diisi manual sebelum bisa dijual
        status: 'BELUM_TERJUAL',
      });
    });

    let berhasil = 0;
    if (toCreate.length > 0) {
      const result = await prisma.barangArt.createMany({ data: toCreate });
      berhasil = result.count;
    }

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `IMPORT BARANG ART ${KATEGORI_LABEL[kategori]} (${berhasil} baru, ${perluKode} perlu kode, ${gagal} gagal)`,
      tabel: 'BarangArt', ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Import selesai',
      data: { total: rows.length, berhasil, perluKode, gagal, errors },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getItems, getItemById, createItem, updateItem, markSold, revertSold, deleteItem, exportExcel, importExcel };
