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

// ── Perhitungan harga berbasis COGS (format Elektronik 2026) ──
// COGS adalah satu-satunya input harga. Harga jual diturunkan otomatis:
//   HJ MIN    = COGS + 17%, dibulatkan KE ATAS ke ribuan terdekat
//   HJ MAX    = COGS + 24%, dibulatkan KE ATAS ke ribuan terdekat
//   HARGA SMT = HJ MAX dibulatkan KE ATAS ke puluhan ribu (4 angka terakhir jadi 0)
// Field lama (hargaJual/ppn/totalHarga/profit) tetap diisi demi kompatibilitas
// Invoice & Dashboard: harga jual invoice memakai HARGA SMT, PPN 1,1%.
function hitungHarga(cogsRaw) {
  const cogs = parseFloat(cogsRaw) || 0;
  const hjMin = Math.ceil((cogs * 1.17) / 1000) * 1000;
  const hjMax = Math.ceil((cogs * 1.24) / 1000) * 1000;
  const hargaSmt = Math.ceil(hjMax / 10000) * 10000;
  const hargaJual = hargaSmt;
  const ppn = parseFloat((hargaSmt * 0.011).toFixed(2));
  const totalHarga = parseFloat((hargaSmt + ppn).toFixed(2));
  const profit = parseFloat((hargaSmt - cogs).toFixed(2));
  return { hjMin, hjMax, hargaSmt, hargaJual, ppn, totalHarga, profit };
}

// Parser angka tahan-format: terima number asli, atau string ber-"Rp", spasi,
// dan pemisah ribuan (1.500.000 / 1,500,000). Return null bila kosong/invalid.
function angka(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  let s = String(v).trim().replace(/[^\d.,-]/g, ''); // buang Rp, spasi, dll
  if (s === '' || s === '-') return null;
  if (s.includes(',') && s.includes('.')) {
    // Ada keduanya → titik = ribuan, koma = desimal (format Indonesia)
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // >1 koma → ribuan gaya US (2,224,200); 1 koma → desimal
    if ((s.match(/,/g) || []).length > 1) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else {
    // Hanya titik: >1 titik pasti ribuan (1.500.000); 1 titik dibiarkan (bisa desimal 4376200.6)
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Harga efektif: pakai override (dari import Excel) bila ada, selain itu hitung dari COGS.
// overrides = { hjMin, hjMax, hargaSmt } (masing-masing boleh null).
function hargaEfektif(cogsRaw, overrides = {}) {
  const c = hitungHarga(cogsRaw);
  const cogs = parseFloat(cogsRaw) || 0;
  const num = (v) => (v === null || v === undefined || v === '' || isNaN(parseFloat(v))) ? null : parseFloat(v);
  const hjMin = num(overrides.hjMin) != null ? num(overrides.hjMin) : c.hjMin;
  const hjMax = num(overrides.hjMax) != null ? num(overrides.hjMax) : c.hjMax;
  const hargaSmt = num(overrides.hargaSmt) != null ? num(overrides.hargaSmt) : c.hargaSmt;
  const hargaJual = hargaSmt;
  const ppn = parseFloat((hargaSmt * 0.011).toFixed(2));
  const totalHarga = parseFloat((hargaSmt + ppn).toFixed(2));
  const profit = parseFloat((hargaSmt - cogs).toFixed(2));
  return { hjMin, hjMax, hargaSmt, hargaJual, ppn, totalHarga, profit };
}

// Lampirkan field turunan (hjMin/hjMax/hargaSmt) ke objek item untuk respons API.
// Dipanggil SEBELUM COGS di-strip agar role non-admin tetap melihat harga jual
// (HJ MIN/MAX/HARGA SMT) walau COGS disembunyikan. Menghormati override tersimpan.
function withHarga(item) {
  if (!item) return item;
  const { hjMin, hjMax, hargaSmt } = hargaEfektif(item.cogs, { hjMin: item.hjMin, hjMax: item.hjMax, hargaSmt: item.hargaSmt });
  return { ...item, hjMin, hjMax, hargaSmt };
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
    // Tabel Data Elektronik = stok tersedia. Default hanya BELUM_TERJUAL;
    // barang terjual pindah ke Riwayat Penjualan (kecuali diminta status lain).
    if (!req.query.status) where.status = 'BELUM_TERJUAL';

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
    const data = items.map(i => {
      const withH = withHarga(i);
      if (hideCogs) { const { cogs, profit, ...rest } = withH; return rest; }
      return withH;
    });

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

    const withH = withHarga(item);
    if (!canSeeAll(req.user)) {
      const { cogs, profit, ...rest } = withH;
      return res.json({ success: true, data: rest });
    }
    res.json({ success: true, data: withH });
  } catch (err) {
    next(err);
  }
};

const createItem = async (req, res, next) => {
  try {
    const { nomorSbg, grade, jenisBarang, detailBarang, keterangan, cogs, perusahaan, tanggalLelang } = req.body;

    if (!nomorSbg || !grade || !jenisBarang || !detailBarang || cogs === undefined) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    const existing = await prisma.elektronik.findUnique({ where: { nomorSbg } });
    if (existing) return res.status(400).json({ success: false, message: 'Nomor SBG sudah ada' });

    const cogsNum = parseFloat(cogs);
    // Harga jual (HJ MIN/MAX/HARGA SMT) & field lama diturunkan otomatis dari COGS
    const { hargaJual, ppn, totalHarga, profit } = hitungHarga(cogsNum);

    const item = await prisma.elektronik.create({
      data: {
        nomorSbg,
        grade,
        jenisBarang,
        detailBarang,
        keterangan: keterangan || null,
        cogs: cogsNum,
        offeringPengepul: null,
        hargaJual,
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

    res.status(201).json({ success: true, message: 'Data berhasil ditambahkan', data: withHarga(item) });
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
    const { nomorSbg, grade, jenisBarang, detailBarang, keterangan, cogs, perusahaan, tanggalLelang } = req.body;

    // Barang yang sudah TERJUAL tidak boleh diubah harganya (jaga konsistensi dengan snapshot invoice)
    if (existing.status === 'TERJUAL' && cogs !== undefined) {
      return res.status(400).json({ success: false, message: 'Tidak dapat mengubah harga barang yang sudah terjual' });
    }

    if (nomorSbg && nomorSbg !== existing.nomorSbg) {
      const dup = await prisma.elektronik.findUnique({ where: { nomorSbg } });
      if (dup) return res.status(400).json({ success: false, message: 'Nomor SBG sudah ada' });
    }

    const cogsNum = cogs !== undefined ? parseFloat(cogs) : parseFloat(existing.cogs);
    // Semua harga jual & field lama dihitung ulang dari COGS
    const { hargaJual, ppn, totalHarga, profit } = hitungHarga(cogsNum);

    const updated = await prisma.elektronik.update({
      where: { id },
      data: {
        nomorSbg: nomorSbg || existing.nomorSbg,
        grade: grade || existing.grade,
        jenisBarang: jenisBarang || existing.jenisBarang,
        detailBarang: detailBarang || existing.detailBarang,
        keterangan: keterangan !== undefined ? keterangan : existing.keterangan,
        cogs: cogsNum,
        // Edit manual → reset override HJ, harga kembali mengikuti rumus COGS
        hjMin: null,
        hjMax: null,
        hargaSmt: null,
        offeringPengepul: null,
        hargaJual,
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

    res.json({ success: true, message: 'Data berhasil diperbarui', data: withHarga(updated) });
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
    // Baca sebagai array-of-arrays lalu bangun objek dengan KUNCI = teks header baris pertama,
    // persis seperti dropdown di frontend (rows[0].map(String)). Ini menghindari ketidakcocokan
    // object-mode (kolom kembar jadi "COGS_1", header kosong jadi "__EMPTY") yg bikin nilai → 0.
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    const headers = (aoa[0] || []).map(h => String(h));
    const rows = aoa.slice(1).map(arr => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = arr[i]; });
      return obj;
    });

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
        const cogs = angka(row[mappingObj.cogs]) || 0;
        const keterangan = mappingObj.keterangan ? String(row[mappingObj.keterangan] || '') : null;
        const tanggalLelang = mappingObj.tanggalLelang ? parseTanggal(row[mappingObj.tanggalLelang]) : null;
        // Override HJ MIN/MAX/HARGA SMT bila dipetakan di Excel (selain itu dihitung dari COGS)
        const ovHjMin = mappingObj.hjMin ? angka(row[mappingObj.hjMin]) : null;
        const ovHjMax = mappingObj.hjMax ? angka(row[mappingObj.hjMax]) : null;
        const ovHargaSmt = mappingObj.hargaSmt ? angka(row[mappingObj.hargaSmt]) : null;

        if (!nomorSbg || !jenisBarang || !detailBarang || !['A','B','C','D'].includes(grade)) {
          gagal++;
          errors.push({ nomorSbg, pesan: 'Data tidak lengkap atau grade tidak valid' });
          continue;
        }

        // Harga jual & field lama: pakai override Excel bila ada, selain itu hitung dari COGS
        const { hargaJual, ppn, totalHarga, profit } = hargaEfektif(cogs, { hjMin: ovHjMin, hjMax: ovHjMax, hargaSmt: ovHargaSmt });

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
            data: { grade, jenisBarang, detailBarang, keterangan, cogs, hjMin: ovHjMin, hjMax: ovHjMax, hargaSmt: ovHargaSmt, offeringPengepul: null, hargaJual, ppn, totalHarga, profit, perusahaan: perusahaan || 'SERBA_MAS', ...(tanggalLelang ? { tanggalLelang } : {}) },
          });
          duplicate++;
        } else {
          await prisma.elektronik.create({
            data: { nomorSbg, grade, jenisBarang, detailBarang, keterangan, cogs, hjMin: ovHjMin, hjMax: ovHjMax, hargaSmt: ovHargaSmt, offeringPengepul: null, hargaJual, ppn, totalHarga, profit, perusahaan: perusahaan || 'SERBA_MAS', tanggalLelang },
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
      const { hjMin, hjMax, hargaSmt } = hargaEfektif(item.cogs, { hjMin: item.hjMin, hjMax: item.hjMax, hargaSmt: item.hargaSmt });
      const row = {
        No: idx + 1,
        'Tanggal Serah Terima': item.tanggalLelang ? new Date(item.tanggalLelang).toLocaleDateString('id-ID') : '',
        'Nomor SBG': item.nomorSbg,
        'Jenis Barang': item.jenisBarang,
        Grade: item.grade,
        'Nama Barang': item.detailBarang,
        Keterangan: item.keterangan || '',
      };
      // COGS hanya untuk role yang berwenang (H-02)
      if (!hideCogs) row['COGS'] = parseFloat(item.cogs);
      row['HJ MIN'] = hjMin;
      row['HJ MAX'] = hjMax;
      row['HARGA SMT'] = hargaSmt;
      row['Status'] = item.status === 'BELUM_TERJUAL' ? 'Belum Terjual' : 'Terjual';
      row['Perusahaan'] = item.perusahaan === 'VOLARY' ? 'Volary' : 'Serba Mas';
      row['Tanggal Masuk'] = new Date(item.tanggalMasuk).toLocaleDateString('id-ID');
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

// Nomor struk sekuensial: STR-YYYY-NNNN (mis. STR-2026-0001), diambil dari
// nomor terbesar tahun berjalan + 1. Tabrakan ditangani retry di jualItems.
async function generateNomorStruk() {
  const year = new Date().getFullYear();
  const prefix = `STR-${year}-`;
  const last = await prisma.elektronik.findFirst({
    where: { nomorStruk: { startsWith: prefix } },
    orderBy: { nomorStruk: 'desc' },
    select: { nomorStruk: true },
  });
  let seq = 1;
  if (last && last.nomorStruk) {
    const n = parseInt(last.nomorStruk.slice(prefix.length), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

const JENIS_PEMBELI = ['KARYAWAN_INTERNAL', 'EKSTERNAL', 'PENGEPUL'];

// Penjualan langsung + struk: tandai barang TERJUAL dan simpan data penjualan
// (harga terjual manual, PPN 1,1%, pelanggan, sales, jenis pembeli) di baris elektronik.
const jualItems = async (req, res, next) => {
  try {
    const { namaPelanggan, noTelepon, tanggal, namaSales, jenisPembeli, items } = req.body;

    if (!namaPelanggan || !namaSales || !tanggal) {
      return res.status(400).json({ success: false, message: 'Nama pelanggan, nama sales, dan tanggal wajib diisi' });
    }
    if (!JENIS_PEMBELI.includes(jenisPembeli)) {
      return res.status(400).json({ success: false, message: 'Jenis pembeli tidak valid' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada barang dipilih' });
    }

    // Petakan id → harga jual (net, sebelum PPN) yang diinput manual
    const hargaById = new Map();
    for (const it of items) {
      const id = Number(it.id);
      const harga = parseFloat(it.hargaJual);
      if (!Number.isInteger(id) || isNaN(harga) || harga <= 0) {
        return res.status(400).json({ success: false, message: 'Harga jual setiap barang wajib diisi dan lebih dari 0' });
      }
      hargaById.set(id, harga);
    }
    const idList = [...hargaById.keys()];

    const tanggalJual = parseTanggal(tanggal);
    if (!tanggalJual) return res.status(400).json({ success: false, message: 'Tanggal tidak valid' });

    // Validasi: semua barang ada & masih BELUM_TERJUAL
    const barang = await prisma.elektronik.findMany({ where: { id: { in: idList } } });
    if (barang.length !== idList.length) {
      return res.status(400).json({ success: false, message: 'Sebagian barang tidak ditemukan' });
    }
    const sudah = barang.filter(b => b.status === 'TERJUAL');
    if (sudah.length > 0) {
      return res.status(400).json({ success: false, message: `Barang sudah terjual: ${sudah.map(b => b.nomorSbg).join(', ')}` });
    }

    // Buat nomor struk + simpan penjualan dalam satu transaksi atomik (+ retry nomor tabrakan)
    let nomorStruk = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      nomorStruk = await generateNomorStruk();
      try {
        await prisma.$transaction(async (tx) => {
          for (const b of barang) {
            const net = hargaById.get(b.id);
            const ppn = parseFloat((net * 0.011).toFixed(2));
            const totalHarga = parseFloat((net + ppn).toFixed(2));
            const profit = parseFloat((net - parseFloat(b.cogs)).toFixed(2));
            // updateMany dgn guard status agar tak bisa terjual ganda (race)
            const r = await tx.elektronik.updateMany({
              where: { id: b.id, status: 'BELUM_TERJUAL' },
              data: {
                status: 'TERJUAL',
                hargaJual: net, ppn, totalHarga, profit,
                offeringPengepul: null,
                tanggalJual, namaPelanggan, noTelepon: noTelepon || null,
                namaSales, jenisPembeli, nomorStruk,
              },
            });
            if (r.count !== 1) {
              throw Object.assign(new Error(`Barang ${b.nomorSbg} sudah terjual di transaksi lain`), { status: 409 });
            }
          }
        });
        break;
      } catch (e) {
        if (e.code === 'P2002' && attempt < 4) continue; // nomor struk tabrakan → coba lagi
        throw e;
      }
    }

    const terjual = await prisma.elektronik.findMany({ where: { nomorStruk }, orderBy: { id: 'asc' } });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `JUAL ${terjual.length} BARANG — Struk ${nomorStruk} (${namaPelanggan})`,
      tabel: 'Elektronik',
      dataBaru: { nomorStruk, namaPelanggan, jenisPembeli, jumlah: terjual.length },
      ipAddress: req.ip,
    });

    // Data struk untuk dicetak di frontend (COGS tidak ikut ke struk pelanggan)
    const strukItems = terjual.map(b => ({
      nomorSbg: b.nomorSbg, jenisBarang: b.jenisBarang, grade: b.grade,
      detailBarang: b.detailBarang, keterangan: b.keterangan,
      hargaJual: parseFloat(b.hargaJual), ppn: parseFloat(b.ppn), totalHarga: parseFloat(b.totalHarga),
    }));

    res.status(201).json({
      success: true,
      message: `Penjualan berhasil — Struk ${nomorStruk}`,
      data: { nomorStruk, namaPelanggan, noTelepon: noTelepon || null, namaSales, jenisPembeli, tanggalJual, items: strukItems },
    });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ success: false, message: err.message });
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
    const { search, jenisPembeli } = req.query;
    const page = toInt(req.query.page, 1, 1, 1e9);
    const limit = toInt(req.query.limit, 50, 1, 100);
    const skip = (page - 1) * limit;

    const where = { status: 'TERJUAL' };
    if (jenisPembeli && JENIS_PEMBELI.includes(jenisPembeli)) where.jenisPembeli = jenisPembeli;
    if (search) {
      where.OR = [
        { jenisBarang: { contains: search } },
        { detailBarang: { contains: search } },
        { nomorSbg: { contains: search } },
        { namaPelanggan: { contains: search } },
        { nomorStruk: { contains: search } },
        { namaSales: { contains: search } },
      ];
    }

    const [total, agregat, items] = await Promise.all([
      prisma.elektronik.count({ where }),
      prisma.elektronik.aggregate({
        where,
        _sum: { profit: true, totalHarga: true, hargaJual: true, ppn: true },
      }),
      prisma.elektronik.findMany({
        where,
        skip,
        take: limit,
        // Penjualan terbaru dulu; tanggalJual bisa null utk data lama → fallback updatedAt
        orderBy: [{ tanggalJual: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);

    const bolehLihatSemua = canSeeAll(req.user);

    // Sembunyikan COGS & profit dari role non-admin (H-02).
    const dataAman = bolehLihatSemua
      ? items
      : items.map((item) => { const { cogs, profit, ...rest } = item; return rest; });

    res.json({
      success: true,
      data: dataAman,
      summary: {
        totalBarang: total,
        totalProfit: bolehLihatSemua ? parseFloat(agregat._sum.profit || 0) : null,
        totalHargaJual: parseFloat(agregat._sum.hargaJual || 0),
        totalPpn: parseFloat(agregat._sum.ppn || 0),
        totalNilai: parseFloat(agregat._sum.totalHarga || 0),
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const JENIS_PEMBELI_LABEL = {
  KARYAWAN_INTERNAL: 'Karyawan Internal',
  EKSTERNAL: 'Eksternal',
  PENGEPUL: 'Pengepul',
};

// Export Riwayat Penjualan ke Excel. Mengikuti filter jenis pembeli
// (semua / karyawan internal / eksternal / pengepul) + pencarian.
const exportRiwayat = async (req, res, next) => {
  try {
    const { search, jenisPembeli } = req.query;
    const where = { status: 'TERJUAL' };
    if (jenisPembeli && JENIS_PEMBELI.includes(jenisPembeli)) where.jenisPembeli = jenisPembeli;
    if (search) {
      where.OR = [
        { jenisBarang: { contains: search } },
        { detailBarang: { contains: search } },
        { nomorSbg: { contains: search } },
        { namaPelanggan: { contains: search } },
        { nomorStruk: { contains: search } },
        { namaSales: { contains: search } },
      ];
    }

    const items = await prisma.elektronik.findMany({
      where,
      orderBy: [{ tanggalJual: 'desc' }, { updatedAt: 'desc' }],
    });

    const hideCogs = !canSeeAll(req.user);
    const data = items.map((item, idx) => {
      const row = {
        No: idx + 1,
        'Tanggal Jual': new Date(item.tanggalJual || item.updatedAt).toLocaleDateString('id-ID'),
        'Tanggal Serah Terima': item.tanggalLelang ? new Date(item.tanggalLelang).toLocaleDateString('id-ID') : '',
        'No. Struk': item.nomorStruk || '',
        'Nomor SBG': item.nomorSbg,
        'Jenis Barang': item.jenisBarang,
        Grade: item.grade,
        'Nama Barang': item.detailBarang,
        Keterangan: item.keterangan || '',
      };
      if (!hideCogs) row['COGS'] = parseFloat(item.cogs);
      row['Harga Terjual'] = item.hargaJual != null ? parseFloat(item.hargaJual) : '';
      row['PPN (1.1%)'] = item.ppn != null ? parseFloat(item.ppn) : '';
      row['Total Harga'] = item.totalHarga != null ? parseFloat(item.totalHarga) : '';
      if (!hideCogs) row['Profit'] = item.profit != null ? parseFloat(item.profit) : '';
      row['Pembeli'] = item.jenisPembeli ? (JENIS_PEMBELI_LABEL[item.jenisPembeli] || item.jenisPembeli) : '';
      row['Pelanggan'] = item.namaPelanggan || '';
      row['No. Telepon'] = item.noTelepon || '';
      row['Sales'] = item.namaSales || '';
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    const sheetName = jenisPembeli ? (JENIS_PEMBELI_LABEL[jenisPembeli] || 'Riwayat') : 'Semua';
    XLSX.utils.book_append_sheet(wb, ws, `Riwayat ${sheetName}`.slice(0, 31));
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `EXPORT RIWAYAT PENJUALAN (${items.length} data${jenisPembeli ? ', ' + sheetName : ''})`,
      tabel: 'Elektronik',
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Riwayat-Penjualan-${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

module.exports = { getItems, getItemById, createItem, updateItem, deleteItem, importExcel, exportExcel, getStats, getRiwayat, jualItems, exportRiwayat };
