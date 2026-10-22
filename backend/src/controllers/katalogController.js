const prisma = require('../utils/prisma');
const { simpanGambar, hapusGambar: hapusFileGambar } = require('../utils/storage');
const { syncAll, fetchStoreProducts } = require('../services/serbamasSync');
const { mapProduk, FIELD_CANDIDATES } = require('../services/serbamasMapping');
const { createAuditLog } = require('../utils/audit');

const getKatalog = async (req, res) => {
  try {
    const { kategori, jenisBarang, tersedia, search, cabangId } = req.query;
    const where = {};
    if (kategori) where.kategori = kategori;
    if (jenisBarang) where.jenisBarang = jenisBarang;
    if (tersedia !== undefined) where.tersedia = tersedia === 'true';
    if (cabangId) where.cabangId = parseInt(cabangId);
    if (search) {
      where.OR = [
        { nama: { contains: search } },
        { deskripsi: { contains: search } },
        { jenisBarang: { contains: search } },
      ];
    }
    const items = await prisma.katalogEmas.findMany({
      where,
      orderBy: [{ kategori: 'asc' }, { urutan: 'asc' }, { createdAt: 'asc' }],
      include: { cabang: { select: { id: true, nama: true } } },
    });
    res.json({ success: true, data: items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal memuat katalog' });
  }
};

const getKatalogById = async (req, res) => {
  try {
    const item = await prisma.katalogEmas.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!item) return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memuat item' });
  }
};

const createKatalog = async (req, res) => {
  try {
    const { kategori, jenisBarang, nama, deskripsi, harga, tersedia, urutan, cabangId } = req.body;
    if (!kategori || !jenisBarang || !nama || !harga) {
      return res.status(400).json({ success: false, message: 'Kategori, jenis barang, nama, dan harga wajib diisi' });
    }
    let gambar = null;
    if (req.file) {
      gambar = await simpanGambar(req.file, 'katalog');
    }
    const item = await prisma.katalogEmas.create({
      data: {
        cabangId: cabangId ? parseInt(cabangId) : null,
        kategori,
        jenisBarang,
        nama,
        deskripsi: deskripsi || null,
        harga: parseFloat(harga),
        gambar,
        tersedia: tersedia === 'false' ? false : true,
        urutan: urutan ? parseInt(urutan) : 0,
      },
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal membuat item katalog' });
  }
};

const updateKatalog = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.katalogEmas.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });

    const { kategori, jenisBarang, nama, deskripsi, harga, tersedia, urutan, cabangId } = req.body;
    let gambar = existing.gambar;

    if (req.file) {
      // Hapus gambar lama jika ada (OSS atau lokal, terdeteksi otomatis)
      if (existing.gambar) await hapusFileGambar(existing.gambar);
      gambar = await simpanGambar(req.file, 'katalog');
    }

    const item = await prisma.katalogEmas.update({
      where: { id },
      data: {
        ...(cabangId !== undefined && { cabangId: cabangId ? parseInt(cabangId) : null }),
        ...(kategori && { kategori }),
        ...(jenisBarang && { jenisBarang }),
        ...(nama && { nama }),
        deskripsi: deskripsi !== undefined ? deskripsi || null : existing.deskripsi,
        ...(harga && { harga: parseFloat(harga) }),
        ...(tersedia !== undefined && { tersedia: tersedia === 'false' ? false : true }),
        ...(urutan !== undefined && { urutan: parseInt(urutan) }),
        gambar,
      },
    });
    res.json({ success: true, data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui item katalog' });
  }
};

const deleteKatalog = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.katalogEmas.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });

    if (existing.gambar) await hapusFileGambar(existing.gambar);
    await prisma.katalogEmas.delete({ where: { id } });
    res.json({ success: true, message: 'Item berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menghapus item' });
  }
};

const hapusGambar = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.katalogEmas.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });
    if (existing.gambar) await hapusFileGambar(existing.gambar);
    await prisma.katalogEmas.update({ where: { id }, data: { gambar: null } });
    res.json({ success: true, message: 'Gambar berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menghapus gambar' });
  }
};

// ── Sinkronisasi manual dengan API toko SERBAMAS ──
const syncKatalog = async (req, res) => {
  try {
    const hasil = await syncAll();
    const total = hasil.hasil.reduce(
      (acc, r) => ({
        created: acc.created + r.created,
        updated: acc.updated + r.updated,
        deleted: acc.deleted + r.deleted,
      }),
      { created: 0, updated: 0, deleted: 0 }
    );

    await createAuditLog({
      userId: req.user?.id,
      namaUser: req.user?.nama,
      aktivitas: `Sinkronisasi katalog dengan API toko (+${total.created} baru, ${total.updated} update, -${total.deleted} hapus)`,
      tabel: 'katalog_emas',
      dataBaru: hasil,
      ipAddress: req.ip,
    });

    res.json({
      success: hasil.ok,
      message: hasil.hasil.length === 0 && hasil.error.length === 0
        ? 'Tidak ada cabang dengan Nama Toko yang di-set untuk disinkronkan.'
        : `Sinkronisasi selesai: ${total.created} barang baru, ${total.updated} diperbarui, ${total.deleted} dihapus (stok habis).`,
      total,
      detail: hasil.hasil,
      error: hasil.error,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || 'Gagal menjalankan sinkronisasi' });
  }
};

// ── Preview data mentah API (untuk verifikasi/penyesuaian pemetaan field) ──
const previewSync = async (req, res) => {
  try {
    const cabangId = parseInt(req.query.cabangId);
    if (!cabangId) return res.status(400).json({ success: false, message: 'Parameter cabangId wajib diisi' });
    const cabang = await prisma.cabang.findUnique({ where: { id: cabangId } });
    if (!cabang) return res.status(404).json({ success: false, message: 'Cabang tidak ditemukan' });

    const rawList = await fetchStoreProducts(cabang);
    const contoh = rawList.slice(0, 3);
    res.json({
      success: true,
      cabang: cabang.nama,
      storeName: cabang.storeName,
      totalData: rawList.length,
      fieldTersediaDiApi: contoh[0] ? Object.keys(contoh[0]) : [],
      kandidatFieldDigunakan: FIELD_CANDIDATES,
      contohMentah: contoh,
      contohHasilPemetaan: contoh.map((r) => mapProduk(r, cabang)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || 'Gagal mengambil preview data API' });
  }
};

module.exports = { getKatalog, getKatalogById, createKatalog, updateKatalog, deleteKatalog, hapusGambar, syncKatalog, previewSync };
