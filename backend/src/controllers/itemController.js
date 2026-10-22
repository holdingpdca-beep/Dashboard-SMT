const prisma = require('../utils/prisma');
const { createAuditLog } = require('../utils/audit');
const { canSeeAll } = require('../middleware/roleCheck');
const { toInt, pickSort, sortOrderOf, safeDate } = require('../utils/query');
const XLSX = require('xlsx');

// Kolom yang boleh dipakai untuk sortBy (M-02 / H-02).
// cogs & profit HANYA untuk ADMIN/SUPER_USER agar tidak jadi oracle urutan COGS.
const SORTABLE_BASE = ['createdAt', 'updatedAt', 'tanggalLelang', 'tanggalMasuk', 'nomorSbg', 'grade', 'hargaJual'];
const SORTABLE_ADMIN = [...SORTABLE_BASE, 'cogs', 'profit'];

// Batas maksimum baris import Excel sekali proses (L-02)
const MAX_IMPORT_ROWS = 2000;

// Parsing tanggal secara deterministik (tanpa pengaruh zona waktu).
// Disimpan pada jam 12:00 UTC agar tanggal tidak pernah bergeser hari
// saat ditampilkan di zona waktu manapun (WIB, dsb).
function parseTanggal(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  // Angka serial Excel (mis. 45802) — konversi via SSF, bebas zona waktu
  if (typeof raw === 'number') {
    const o = XLSX.SSF.parse_date_code(raw);
    if (!o || !o.y) return null;
    return new Date(Date.UTC(o.y, o.m - 1, o.d, 12, 0, 0));
  }

  // Objek Date (jika terbaca sebagai Date) — pakai komponen lokalnya
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
  }

  const s = String(raw).trim();
  // Format Indonesia dd/mm/yyyy atau dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return new Date(Date.UTC(+y, +mo - 1, +d, 12, 0, 0));
  }
  // Format ISO yyyy-mm-dd atau lainnya
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    return new Date(Date.UTC(+y, +mo - 1, +d, 12, 0, 0));
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
  }
  return null;
}

const buildWhere = (query, userRole) => {
  const { search, grade, status, startDate, endDate, jenisBarang, perusahaan } = query;
  const where = {};

  if (search) {
    where.OR = [
      { nomorSbg: { contains: search } },
      { jenisBarang: { contains: search } },
      { detailBarang: { contains: search } },
      { keterangan: { contains: search } },
    ];
  }
  if (grade) where.grade = grade;
  if (status) where.status = status; // jika kosong → tampilkan semua status
  if (perusahaan) where.perusahaan = perusahaan;
  if (jenisBarang) where.jenisBarang = { contains: jenisBarang };
  // Filter rentang tanggal lelang (tanggal tak valid diabaikan, cegah crash — M-02)
  const sd = safeDate(startDate);
  const ed = safeDate(endDate ? endDate + 'T23:59:59' : null);
  if (sd || ed) {
    where.tanggalLelang = {};
    if (sd) where.tanggalLelang.gte = sd;
    if (ed) where.tanggalLelang.lte = ed;
  }
  return where;
};

const getItems = async (req, res, next) => {
  try {
    const page = toInt(req.query.page, 1, 1, 1e9);
    const limit = toInt(req.query.limit, 20, 1, 100);
    const allowedSort = canSeeAll(req.user) ? SORTABLE_ADMIN : SORTABLE_BASE;
    const sortBy = pickSort(req.query.sortBy, allowedSort, 'createdAt');
    const sortOrder = sortOrderOf(req.query.sortOrder);
    const skip = (page - 1) * limit;
    const where = buildWhere(req.query, req.user.role);

    const [total, items] = await Promise.all([
      prisma.elektronik.count({ where }),
      prisma.elektronik.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    const hideCogs = !canSeeAll(req.user);
    const data = hideCogs ? items.map(i => { const { cogs, profit, ...rest } = i; return rest; }) : items;

    res.json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const getItemById = async (req, res, next) => {
  try {
    const item = await prisma.elektronik.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!item) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    if (!canSeeAll(req.user)) {
      const { cogs, profit, ...rest } = item;
      return res.json({ success: true, data: rest });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

const createItem = async (req, res, next) => {
  try {
    const { nomorSbg, grade, jenisBarang, detailBarang, keterangan, cogs, offeringPengepul, hargaJual, perusahaan, tanggalLelang } = req.body;

    if (!nomorSbg || !grade || !jenisBarang || !detailBarang || cogs === undefined) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    const existing = await prisma.elektronik.findUnique({ where: { nomorSbg } });
    if (existing) return res.status(400).json({ success: false, message: 'Nomor SBG sudah ada' });

    const cogsNum = parseFloat(cogs);
    const hargaJualNum = hargaJual ? parseFloat(hargaJual) : null;
    const ppn = hargaJualNum ? parseFloat((hargaJualNum * 0.011).toFixed(2)) : null;
    const totalHarga = hargaJualNum && ppn ? parseFloat((hargaJualNum + ppn).toFixed(2)) : null;
    const profit = hargaJualNum ? parseFloat((hargaJualNum - cogsNum).toFixed(2)) : null;

    const item = await prisma.elektronik.create({
      data: {
        nomorSbg,
        grade,
        jenisBarang,
        detailBarang,
        keterangan: keterangan || null,
        cogs: cogsNum,
        offeringPengepul: offeringPengepul ? parseFloat(offeringPengepul) : null,
        hargaJual: hargaJualNum,
        ppn,
        totalHarga,
        profit,
        perusahaan: perusahaan || 'SERBA_MAS',
        tanggalLelang: parseTanggal(tanggalLelang),
      },
    });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: 'TAMBAH DATA ELEKTRONIK',
      tabel: 'Elektronik',
      dataBaru: item,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Data berhasil ditambahkan', data: item });
  } catch (err) {
    next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.elektronik.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    // status TIDAK diterima dari body — hanya bisa berubah lewat flow invoice (approve/cancel)
    const { nomorSbg, grade, jenisBarang, detailBarang, keterangan, cogs, offeringPengepul, hargaJual, perusahaan, tanggalLelang } = req.body;

    // Barang yang sudah TERJUAL tidak boleh diubah harganya (jaga konsistensi dengan snapshot invoice)
    if (existing.status === 'TERJUAL' && (cogs !== undefined || hargaJual !== undefined)) {
      return res.status(400).json({ success: false, message: 'Tidak dapat mengubah harga barang yang sudah terjual' });
    }

    if (nomorSbg && nomorSbg !== existing.nomorSbg) {
      const dup = await prisma.elektronik.findUnique({ where: { nomorSbg } });
      if (dup) return res.status(400).json({ success: false, message: 'Nomor SBG sudah ada' });
    }

    const cogsNum = cogs !== undefined ? parseFloat(cogs) : parseFloat(existing.cogs);
    const hargaJualNum = hargaJual !== undefined ? (hargaJual ? parseFloat(hargaJual) : null) : (existing.hargaJual ? parseFloat(existing.hargaJual) : null);
    const ppn = hargaJualNum ? parseFloat((hargaJualNum * 0.011).toFixed(2)) : null;
    const totalHarga = hargaJualNum && ppn ? parseFloat((hargaJualNum + ppn).toFixed(2)) : null;
    const profit = hargaJualNum ? parseFloat((hargaJualNum - cogsNum).toFixed(2)) : null;

    const updated = await prisma.elektronik.update({
      where: { id },
      data: {
        nomorSbg: nomorSbg || existing.nomorSbg,
        grade: grade || existing.grade,
        jenisBarang: jenisBarang || existing.jenisBarang,
        detailBarang: detailBarang || existing.detailBarang,
        keterangan: keterangan !== undefined ? keterangan : existing.keterangan,
        cogs: cogsNum,
        offeringPengepul: offeringPengepul !== undefined ? (offeringPengepul ? parseFloat(offeringPengepul) : null) : existing.offeringPengepul,
        hargaJual: hargaJualNum,
        ppn,
        totalHarga,
        profit,
        perusahaan: perusahaan || existing.perusahaan,
        tanggalLelang: tanggalLelang !== undefined ? parseTanggal(tanggalLelang) : existing.tanggalLelang,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: 'EDIT DATA ELEKTRONIK',
      tabel: 'Elektronik',
      dataLama: existing,
      dataBaru: updated,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Data berhasil diperbarui', data: updated });
  } catch (err) {
    next(err);
  }
};

const deleteItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.elektronik.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    // Cegah hapus barang yang sedang ada di invoice aktif (jaga integritas data invoice)
    const diInvoice = await prisma.invoiceItem.findFirst({
      where: { elektronikId: id, invoice: { status: { in: ['DRAFT', 'WAITING_APPROVAL', 'APPROVED', 'PRINTED'] } } },
      include: { invoice: { select: { nomorInvoice: true } } },
    });
    if (diInvoice) {
      return res.status(400).json({ success: false, message: `Barang tidak dapat dihapus karena ada di invoice aktif (${diInvoice.invoice.nomorInvoice})` });
    }

    await prisma.elektronik.delete({ where: { id } });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: 'HAPUS DATA ELEKTRONIK',
      tabel: 'Elektronik',
      dataLama: existing,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Data berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

const importExcel = async (req, res, next) => {
  try {
    const { mapping, perusahaan } = req.body;
    let mappingObj;
    try {
      mappingObj = typeof mapping === 'string' ? JSON.parse(mapping) : mapping;
    } catch {
      return res.status(400).json({ success: false, message: 'Format mapping kolom tidak valid' });
    }
    if (!mappingObj || typeof mappingObj !== 'object') {
      return res.status(400).json({ success: false, message: 'Mapping kolom wajib diisi' });
    }

    if (!req.file) return res.status(400).json({ success: false, message: 'File Excel tidak ditemukan' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    // Batasi jumlah baris agar import besar tidak membebani DB / request hang (L-02)
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({
        success: false,
        message: `Jumlah baris (${rows.length}) melebihi batas ${MAX_IMPORT_ROWS}. Bagi file menjadi beberapa bagian.`,
      });
    }

    let berhasil = 0, gagal = 0, duplicate = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const nomorSbg = String(row[mappingObj.nomorSbg] || '').trim();
        const jenisBarang = String(row[mappingObj.jenisBarang] || '').trim();
        const detailBarang = String(row[mappingObj.detailBarang] || '').trim();
        const grade = String(row[mappingObj.grade] || '').trim().toUpperCase();
        const cogs = parseFloat(row[mappingObj.cogs] || 0);
        const offeringPengepul = mappingObj.offeringPengepul ? parseFloat(row[mappingObj.offeringPengepul] || 0) : null;
        const hargaJual = mappingObj.hargaJual ? parseFloat(row[mappingObj.hargaJual] || 0) : null;
        const keterangan = mappingObj.keterangan ? String(row[mappingObj.keterangan] || '') : null;
        const tanggalLelang = mappingObj.tanggalLelang ? parseTanggal(row[mappingObj.tanggalLelang]) : null;

        if (!nomorSbg || !jenisBarang || !detailBarang || !['A','B','C','D'].includes(grade)) {
          gagal++;
          errors.push({ nomorSbg, pesan: 'Data tidak lengkap atau grade tidak valid' });
          continue;
        }

        const ppn = hargaJual ? parseFloat((hargaJual * 0.011).toFixed(2)) : null;
        const totalHarga = hargaJual && ppn ? parseFloat((hargaJual + ppn).toFixed(2)) : null;
        const profit = hargaJual ? parseFloat((hargaJual - cogs).toFixed(2)) : null;

        const existing = await prisma.elektronik.findUnique({ where: { nomorSbg } });
        if (existing) {
          // Jangan overwrite barang yang sudah TERJUAL (cegah korupsi data keuangan)
          if (existing.status === 'TERJUAL') {
            gagal++;
            errors.push({ nomorSbg, pesan: 'Barang sudah terjual, tidak dapat diupdate via import' });
            continue;
          }
          await prisma.elektronik.update({
            where: { nomorSbg },
            data: { grade, jenisBarang, detailBarang, keterangan, cogs, offeringPengepul, hargaJual, ppn, totalHarga, profit, perusahaan: perusahaan || 'SERBA_MAS', ...(tanggalLelang ? { tanggalLelang } : {}) },
          });
          duplicate++;
        } else {
          await prisma.elektronik.create({
            data: { nomorSbg, grade, jenisBarang, detailBarang, keterangan, cogs, offeringPengepul, hargaJual, ppn, totalHarga, profit, perusahaan: perusahaan || 'SERBA_MAS', tanggalLelang },
          });
          berhasil++;
        }
      } catch (e) {
        // Jangan bocorkan detail error internal Prisma ke client (M-01 / L-02)
        gagal++;
        errors.push({ pesan: 'Gagal memproses baris ini' });
      }
    }

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `IMPORT EXCEL (${berhasil} baru, ${duplicate} update, ${gagal} gagal)`,
      tabel: 'Elektronik',
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Import selesai',
      data: { total: rows.length, berhasil, duplicate, gagal, errors },
    });
  } catch (err) {
    next(err);
  }
};

const exportExcel = async (req, res, next) => {
  try {
    const where = buildWhere(req.query, req.user.role);
    const items = await prisma.elektronik.findMany({ where, orderBy: { createdAt: 'desc' } });

    const hideCogs = !canSeeAll(req.user);

    const data = items.map((item, idx) => {
      const row = {
        No: idx + 1,
        'Tanggal Lelang': item.tanggalLelang ? new Date(item.tanggalLelang).toLocaleDateString('id-ID') : '',
        'Nomor SBG': item.nomorSbg,
        Grade: item.grade,
        'Jenis Barang': item.jenisBarang,
        'Detail Barang': item.detailBarang,
        Keterangan: item.keterangan || '',
        'Offering Pengepul': item.offeringPengepul != null ? parseFloat(item.offeringPengepul) : '',
        'Harga Jual': item.hargaJual != null ? parseFloat(item.hargaJual) : '',
        'PPN (1.1%)': item.ppn != null ? parseFloat(item.ppn) : '',
        'Total Harga': item.totalHarga != null ? parseFloat(item.totalHarga) : '',
        Status: item.status === 'BELUM_TERJUAL' ? 'Belum Terjual' : 'Terjual',
        Perusahaan: item.perusahaan === 'VOLARY' ? 'Volary' : 'Serba Mas',
        'Tanggal Masuk': new Date(item.tanggalMasuk).toLocaleDateString('id-ID'),
      };
      // COGS & Profit hanya untuk role yang berwenang (H-02)
      if (!hideCogs) {
        row['COGS'] = parseFloat(item.cogs);
        row['Profit'] = item.profit != null ? parseFloat(item.profit) : '';
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Elektronik');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `EXPORT EXCEL (${items.length} data)`,
      tabel: 'Elektronik',
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Data-Elektronik-${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

const getStats = async (req, res, next) => {
  try {
    const { perusahaan, startDate, endDate } = req.query;
    const where = perusahaan ? { perusahaan } : {};

    // Periode dashboard difilter berdasarkan TANGGAL LELANG (bukan tanggal upload)
    const sd = safeDate(startDate);
    const ed = safeDate(endDate ? endDate + 'T23:59:59' : null);
    if (sd || ed) {
      where.tanggalLelang = {};
      if (sd) where.tanggalLelang.gte = sd;
      if (ed) where.tanggalLelang.lte = ed;
    }

    // Rentang untuk trend chart
    const trendStart = sd || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trendEnd = ed || new Date();

    const trendQuery = perusahaan
      ? prisma.$queryRaw`SELECT DATE(tanggal_masuk) as tanggal, CAST(COUNT(*) AS UNSIGNED) as jumlah FROM elektronik WHERE tanggal_masuk >= ${trendStart} AND tanggal_masuk <= ${trendEnd} AND perusahaan = ${perusahaan} GROUP BY DATE(tanggal_masuk) ORDER BY tanggal`
      : prisma.$queryRaw`SELECT DATE(tanggal_masuk) as tanggal, CAST(COUNT(*) AS UNSIGNED) as jumlah FROM elektronik WHERE tanggal_masuk >= ${trendStart} AND tanggal_masuk <= ${trendEnd} GROUP BY DATE(tanggal_masuk) ORDER BY tanggal`;

    const [
      totalSbg,
      totalCogs,
      totalHargaJual,
      totalTerjual,
      gradeDistribution,
      topProfit,
      topHargaJual,
      trendHarian,
      profitItems,
      rugiItems,
      profitRiil,
      profitProyeksi,
    ] = await Promise.all([
      prisma.elektronik.count({ where }),
      prisma.elektronik.aggregate({ _sum: { cogs: true }, where }),
      prisma.elektronik.aggregate({ _sum: { hargaJual: true, profit: true }, where }),
      prisma.elektronik.count({ where: { ...where, status: 'TERJUAL' } }),
      prisma.elektronik.groupBy({ by: ['grade'], _count: { grade: true }, where }),
      prisma.elektronik.findMany({ where: { ...where, profit: { gt: 0 } }, orderBy: { profit: 'desc' }, take: 10, select: { nomorSbg: true, jenisBarang: true, detailBarang: true, profit: true } }),
      prisma.elektronik.findMany({ where: { ...where, hargaJual: { not: null } }, orderBy: { hargaJual: 'desc' }, take: 10, select: { nomorSbg: true, jenisBarang: true, detailBarang: true, hargaJual: true } }),
      trendQuery,
      prisma.elektronik.findMany({
        where: { ...where, profit: { gt: 0 } },
        select: { tanggalLelang: true, tanggalMasuk: true, hargaJual: true, cogs: true, profit: true },
      }),
      prisma.elektronik.findMany({
        where: { ...where, profit: { lt: 0 } },
        select: { tanggalLelang: true, tanggalMasuk: true, hargaJual: true, cogs: true, profit: true },
      }),
      // Profit RIIL — hanya barang yang sudah TERJUAL (pendapatan terealisasi)
      prisma.elektronik.aggregate({ _sum: { hargaJual: true, profit: true }, where: { ...where, status: 'TERJUAL' } }),
      // Profit PROYEKSI — barang BELUM_TERJUAL (potensi, belum terealisasi)
      prisma.elektronik.aggregate({ _sum: { hargaJual: true, profit: true }, where: { ...where, status: 'BELUM_TERJUAL' } }),
    ]);

    const totalHargaJualNum = parseFloat(totalHargaJual._sum.hargaJual || 0);
    const totalProfitNum = parseFloat(totalHargaJual._sum.profit || 0);
    const persentaseProfit = totalHargaJualNum > 0 ? ((totalProfitNum / totalHargaJualNum) * 100).toFixed(2) : 0;

    // Breakdown profit riil vs proyeksi
    const profitRiilNum = parseFloat(profitRiil._sum.profit || 0);
    const hargaJualRiilNum = parseFloat(profitRiil._sum.hargaJual || 0);
    const profitProyeksiNum = parseFloat(profitProyeksi._sum.profit || 0);
    const hargaJualProyeksiNum = parseFloat(profitProyeksi._sum.hargaJual || 0);
    const marginRiil = hargaJualRiilNum > 0 ? parseFloat(((profitRiilNum / hargaJualRiilNum) * 100).toFixed(2)) : 0;

    const trendHarianSafe = trendHarian.map(row => ({
      tanggal: row.tanggal instanceof Date ? row.tanggal.toISOString().split('T')[0] : String(row.tanggal),
      jumlah: Number(row.jumlah),
    }));

    // Bulan mengikuti tanggal lelang (fallback ke tanggal masuk bila lelang kosong)
    const bulanDari = (item) => (item.tanggalLelang || item.tanggalMasuk).toISOString().slice(0, 7);

    // Agregasi profit per bulan (hanya item dengan profit > 0)
    const byMonth = {};
    profitItems.forEach(item => {
      const bulan = bulanDari(item);
      if (!byMonth[bulan]) byMonth[bulan] = { bulan, totalHargaJual: 0, totalCogs: 0, totalProfit: 0, jumlah: 0 };
      byMonth[bulan].totalHargaJual += parseFloat(item.hargaJual || 0);
      byMonth[bulan].totalCogs += parseFloat(item.cogs || 0);
      byMonth[bulan].totalProfit += parseFloat(item.profit || 0);
      byMonth[bulan].jumlah += 1;
    });
    const trendProfit = Object.values(byMonth).sort((a, b) => a.bulan.localeCompare(b.bulan));

    // Agregasi rugi per bulan (hanya item dengan profit < 0, rugi = COGS - HJ)
    const byMonthRugi = {};
    rugiItems.forEach(item => {
      const bulan = bulanDari(item);
      if (!byMonthRugi[bulan]) byMonthRugi[bulan] = { bulan, totalHargaJual: 0, totalCogs: 0, totalRugi: 0, jumlah: 0 };
      byMonthRugi[bulan].totalHargaJual += parseFloat(item.hargaJual || 0);
      byMonthRugi[bulan].totalCogs += parseFloat(item.cogs || 0);
      byMonthRugi[bulan].totalRugi += Math.abs(parseFloat(item.profit || 0));
      byMonthRugi[bulan].jumlah += 1;
    });
    const trendRugi = Object.values(byMonthRugi).sort((a, b) => a.bulan.localeCompare(b.bulan));

    const payload = {
      totalSbg,
      totalCogs: parseFloat(totalCogs._sum.cogs || 0),
      totalHargaJual: totalHargaJualNum,
      totalProfit: totalProfitNum,
      persentaseProfit: parseFloat(persentaseProfit),
      // Profit terealisasi (barang TERJUAL) vs proyeksi (BELUM_TERJUAL)
      profitRiil: profitRiilNum,
      hargaJualRiil: hargaJualRiilNum,
      marginRiil,
      profitProyeksi: profitProyeksiNum,
      hargaJualProyeksi: hargaJualProyeksiNum,
      totalTerjual,
      totalBelumTerjual: totalSbg - totalTerjual,
      gradeDistribution,
      topProfit,
      topHargaJual,
      trendHarian: trendHarianSafe,
      trendProfit,
      trendRugi,
    };

    // Sembunyikan metrik COGS & profit dari role non-admin (H-02).
    if (!canSeeAll(req.user)) {
      payload.totalCogs = null;
      payload.totalProfit = null;
      payload.persentaseProfit = null;
      payload.profitRiil = null;
      payload.marginRiil = null;
      payload.profitProyeksi = null;
      payload.topProfit = [];
      payload.trendProfit = [];
      payload.trendRugi = [];
    }

    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
};

const getRiwayat = async (req, res, next) => {
  try {
    const { perusahaan, search } = req.query;
    const page = toInt(req.query.page, 1, 1, 1e9);
    const limit = toInt(req.query.limit, 50, 1, 100);
    const skip = (page - 1) * limit;

    const where = { status: 'TERJUAL' };
    if (perusahaan) where.perusahaan = perusahaan;
    if (search) {
      where.OR = [
        { jenisBarang: { contains: search } },
        { detailBarang: { contains: search } },
        { nomorSbg: { contains: search } },
        { invoiceItems: { some: { invoice: { OR: [
          { namaCustomer: { contains: search } },
          { nomorInvoice: { contains: search } },
        ] } } } },
      ];
    }

    const [total, agregat, items] = await Promise.all([
      prisma.elektronik.count({ where }),
      prisma.elektronik.aggregate({
        where,
        _sum: { profit: true, totalHarga: true, hargaJual: true },
      }),
      prisma.elektronik.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          invoiceItems: {
            include: {
              invoice: {
                select: { nomorInvoice: true, namaCustomer: true, noTelepon: true, approvedAt: true, approvedByNama: true, tanggalInvoice: true },
              },
            },
          },
        },
      }),
    ]);

    const bolehLihatSemua = canSeeAll(req.user);

    // Sembunyikan COGS, profit, dan nomor telepon customer dari role non-admin (H-02 / UU PDP)
    const dataAman = bolehLihatSemua ? items : items.map((item) => {
      const { cogs, profit, offeringPengepul, ...rest } = item;
      if (Array.isArray(rest.invoiceItems)) {
        rest.invoiceItems = rest.invoiceItems.map((ii) => ({
          ...ii,
          invoice: ii.invoice ? { ...ii.invoice, noTelepon: null } : ii.invoice,
        }));
      }
      return rest;
    });

    res.json({
      success: true,
      data: dataAman,
      summary: {
        totalBarang: total,
        totalProfit: bolehLihatSemua ? parseFloat(agregat._sum.profit || 0) : null,
        totalHargaJual: parseFloat(agregat._sum.hargaJual || 0),
        totalNilai: parseFloat(agregat._sum.totalHarga || 0),
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getItems, getItemById, createItem, updateItem, deleteItem, importExcel, exportExcel, getStats, getRiwayat };
