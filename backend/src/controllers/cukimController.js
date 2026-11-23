const prisma = require('../utils/prisma');
const { createAuditLog } = require('../utils/audit');
const { toInt } = require('../utils/query');
const XLSX = require('xlsx');

// Cukim dibuat lewat proses Lebur (lihat barangArtController.leburItems).
// Controller ini hanya untuk melihat, mengedit (berat/kadar/keterangan), dan menghapus Cukim.

const parseTanggal = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) { const [, y, mo, d] = iso; return new Date(Date.UTC(+y, +mo - 1, +d, 12, 0, 0)); }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const parseMoney = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  const n = parseFloat(String(raw).replace(/[^\d.,-]/g, '').replace(/,/g, ''));
  return isNaN(n) ? null : n;
};

const buildWhere = (query) => {
  const where = {};
  const search = String(query.search || '').trim();
  if (search) {
    where.OR = [
      { noCukim: { contains: search } },
      { kadarXrf: { contains: search } },
      { keterangan: { contains: search } },
      { vendor: { contains: search } },
      { nomorSku: { contains: search } },
    ];
  }
  // status: 'TERJUAL' (history) | 'BELUM_TERJUAL'/'AKTIF' (aktif)
  const status = String(query.status || '').trim().toUpperCase();
  if (status === 'TERJUAL') where.status = 'TERJUAL';
  else if (status === 'BELUM_TERJUAL' || status === 'AKTIF') where.status = 'BELUM_TERJUAL';
  return where;
};

const getItems = async (req, res, next) => {
  try {
    const { sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const page = toInt(req.query.page, 1, 1, 1e9);
    const limit = toInt(req.query.limit, 20, 1, 100);
    const skip = (page - 1) * limit;
    const where = buildWhere(req.query);

    const SORTABLE = ['createdAt', 'noCukim', 'berat', 'kadarXrf', 'cogs', 'tanggal', 'status', 'tanggalJual', 'nominalJual'];
    const orderCol = SORTABLE.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    // Hitungan tab (Aktif/Terjual) mengikuti pencarian tapi mengabaikan filter status.
    const searchOnly = buildWhere({ search: req.query.search });

    const [total, items, agg, totalAktif, totalTerjual] = await Promise.all([
      prisma.cukim.count({ where }),
      prisma.cukim.findMany({
        where, skip, take: limit, orderBy: { [orderCol]: orderDir },
        include: { _count: { select: { items: true } } },
      }),
      prisma.cukim.aggregate({ where, _sum: { berat: true, cogs: true, nominalJual: true } }),
      prisma.cukim.count({ where: { ...searchOnly, status: 'BELUM_TERJUAL' } }),
      prisma.cukim.count({ where: { ...searchOnly, status: 'TERJUAL' } }),
    ]);

    res.json({
      success: true,
      data: items.map(c => ({ ...c, jumlahBarang: c._count.items })),
      summary: {
        totalCukim: total,
        totalBerat: agg._sum.berat != null ? parseFloat(agg._sum.berat) : 0,
        totalCogs: agg._sum.cogs != null ? parseFloat(agg._sum.cogs) : 0,
        totalNominalJual: agg._sum.nominalJual != null ? parseFloat(agg._sum.nominalJual) : 0,
        totalAktif, totalTerjual,
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const getItemById = async (req, res, next) => {
  try {
    const cukim = await prisma.cukim.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { items: { orderBy: { createdAt: 'desc' } } },
    });
    if (!cukim) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    res.json({ success: true, data: cukim });
  } catch (err) {
    next(err);
  }
};

// Edit Cukim: berat, kadarXrf, keterangan, tanggal. COGS TIDAK diubah manual
// (mengikuti total Payment SMT barang yang dilebur saat pembuatan).
const updateItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.cukim.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    const data = {};
    if (req.body.berat !== undefined && req.body.berat !== '') {
      const berat = parseFloat(String(req.body.berat).replace(',', '.'));
      if (isNaN(berat) || berat <= 0) return res.status(400).json({ success: false, message: 'Berat harus angka > 0' });
      data.berat = berat;
    }
    if (req.body.kadarXrf !== undefined) {
      const kadarXrf = String(req.body.kadarXrf || '').trim();
      if (!kadarXrf) return res.status(400).json({ success: false, message: 'Kadar XRF wajib diisi' });
      data.kadarXrf = kadarXrf;
    }
    if (req.body.keterangan !== undefined) data.keterangan = String(req.body.keterangan || '').trim() || null;
    if (req.body.tanggal !== undefined) data.tanggal = parseTanggal(req.body.tanggal);

    const updated = await prisma.cukim.update({ where: { id }, data });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `EDIT CUKIM (${existing.noCukim})`,
      tabel: 'Cukim', dataLama: existing, dataBaru: updated, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Cukim berhasil diperbarui', data: updated });
  } catch (err) {
    next(err);
  }
};

// Tandai Cukim TERJUAL (satu/banyak) → masuk tab History.
// Body: { tanggalJual, vendor, nomorSku, keterangan, items: [{ id, nominalJual }] }
const markSold = async (req, res, next) => {
  try {
    const { tanggalJual, vendor, nomorSku, keterangan, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: 'Minimal 1 Cukim harus dipilih' });
    const tgl = parseTanggal(tanggalJual);
    if (!tgl) return res.status(400).json({ success: false, message: 'Tanggal Jual wajib diisi' });
    if (!vendor || !String(vendor).trim()) return res.status(400).json({ success: false, message: 'Pembeli wajib diisi' });

    const parsed = [];
    for (const it of items) {
      const id = parseInt(it.id);
      const nominal = parseMoney(it.nominalJual);
      if (!id || nominal === null || nominal < 0) return res.status(400).json({ success: false, message: 'Nominal Jual tiap Cukim wajib diisi dengan angka >= 0' });
      parsed.push({ id, nominal });
    }

    const existing = await prisma.cukim.findMany({ where: { id: { in: parsed.map(p => p.id) } } });
    if (existing.length !== parsed.length) return res.status(400).json({ success: false, message: 'Sebagian Cukim tidak ditemukan' });
    const sudah = existing.filter(c => c.status === 'TERJUAL');
    if (sudah.length) return res.status(400).json({ success: false, message: `Cukim berikut sudah terjual: ${sudah.map(c => c.noCukim).join(', ')}` });

    const vendorClean = String(vendor).trim();
    const skuClean = nomorSku && String(nomorSku).trim() ? String(nomorSku).trim() : null;
    const ketClean = keterangan !== undefined && String(keterangan).trim() !== '' ? String(keterangan).trim() : undefined;

    const updated = await prisma.$transaction(parsed.map(p => prisma.cukim.update({
      where: { id: p.id },
      data: {
        status: 'TERJUAL', tanggalJual: tgl, nominalJual: p.nominal, vendor: vendorClean, nomorSku: skuClean,
        ...(ketClean !== undefined ? { keterangan: ketClean } : {}),
      },
    })));

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `TANDAI TERJUAL CUKIM (${updated.length}: ${updated.map(c => c.noCukim).join(', ')})`,
      tabel: 'Cukim', dataBaru: { ids: parsed.map(p => p.id), vendor: vendorClean, tanggalJual: tgl }, ipAddress: req.ip,
    });

    res.json({ success: true, message: `${updated.length} Cukim ditandai terjual`, data: updated });
  } catch (err) {
    next(err);
  }
};

// Batal jual → kembalikan Cukim ke aktif (kosongkan data penjualan).
const revertToAktif = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.cukim.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    if (existing.status !== 'TERJUAL') return res.status(400).json({ success: false, message: 'Cukim belum terjual' });

    const updated = await prisma.cukim.update({
      where: { id },
      data: { status: 'BELUM_TERJUAL', tanggalJual: null, nominalJual: null, vendor: null, nomorSku: null },
    });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `BATAL JUAL CUKIM (${existing.noCukim})`,
      tabel: 'Cukim', dataLama: existing, dataBaru: updated, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Cukim dikembalikan ke daftar aktif', data: updated });
  } catch (err) {
    next(err);
  }
};

// Hapus Cukim. Barang yang terhubung TIDAK ikut terhapus — tautannya dilepas
// (cukimId→null via onDelete SetNull), barang tetap di History sebagai Dilebur.
const deleteItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.cukim.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    await prisma.cukim.delete({ where: { id } });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `HAPUS CUKIM (${existing.noCukim})`,
      tabel: 'Cukim', dataLama: existing, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Cukim berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

const exportExcel = async (req, res, next) => {
  try {
    const where = buildWhere(req.query);
    const items = await prisma.cukim.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });

    const data = items.map((c, idx) => {
      const berat = parseFloat(c.berat);
      const cogs = c.cogs != null ? parseFloat(c.cogs) : null;
      const cogsPerGram = (berat > 0 && cogs != null) ? Math.round(cogs / berat) : '';
      return {
        No: idx + 1,
        'No Cukim': c.noCukim,
        Tanggal: c.tanggal ? new Date(c.tanggal).toLocaleDateString('id-ID') : '',
        'Berat (gr)': berat,
        'Kadar XRF': c.kadarXrf,
        'COGS (Payment SMT)': cogs != null ? cogs : '',
        'COGS/gram': cogsPerGram,
        'Jumlah Barang': c._count.items,
        Status: c.status === 'TERJUAL' ? 'Terjual' : 'Aktif',
        'Tanggal Jual': c.tanggalJual ? new Date(c.tanggalJual).toLocaleDateString('id-ID') : '',
        'Nominal Jual': c.nominalJual != null ? parseFloat(c.nominalJual) : '',
        Pembeli: c.vendor || '',
        'Nomor SKU': c.nomorSku || '',
        Keterangan: c.keterangan || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cukim');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await createAuditLog({
      userId: req.user.id, namaUser: req.user.nama,
      aktivitas: `EXPORT CUKIM (${items.length} data)`,
      tabel: 'Cukim', ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Cukim-${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

module.exports = { getItems, getItemById, updateItem, markSold, revertToAktif, deleteItem, exportExcel };
