const prisma = require('../utils/prisma');
const { createAuditLog } = require('../utils/audit');

const getCabang = async (req, res, next) => {
  try {
    const { aktif } = req.query;
    const where = {};
    if (aktif !== undefined) where.aktif = aktif === 'true';
    const data = await prisma.cabang.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { katalog: true } } },
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const createCabang = async (req, res, next) => {
  try {
    const { nama, alamat, storeName } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama cabang wajib diisi' });
    const data = await prisma.cabang.create({ data: { nama, alamat: alamat || null, storeName: storeName || null } });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `TAMBAH CABANG: ${data.nama}`,
      tabel: 'Cabang',
      dataBaru: { nama: data.nama, alamat: data.alamat, storeName: data.storeName },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const updateCabang = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { nama, alamat, aktif, storeName } = req.body;
    const existing = await prisma.cabang.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Cabang tidak ditemukan' });
    const data = await prisma.cabang.update({
      where: { id },
      data: {
        ...(nama && { nama }),
        ...(alamat !== undefined && { alamat: alamat || null }),
        ...(storeName !== undefined && { storeName: storeName || null }),
        ...(aktif !== undefined && { aktif: aktif === 'false' ? false : Boolean(aktif) }),
      },
    });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `EDIT CABANG: ${existing.nama}`,
      tabel: 'Cabang',
      dataLama: { nama: existing.nama, alamat: existing.alamat, storeName: existing.storeName, aktif: existing.aktif },
      dataBaru: { nama: data.nama, alamat: data.alamat, storeName: data.storeName, aktif: data.aktif },
      ipAddress: req.ip,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const deleteCabang = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.cabang.findUnique({
      where: { id },
      include: { _count: { select: { katalog: true } } },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Cabang tidak ditemukan' });
    if (existing._count.katalog > 0) {
      return res.status(400).json({
        success: false,
        message: `Cabang masih memiliki ${existing._count.katalog} item katalog. Hapus atau pindahkan item terlebih dahulu.`,
      });
    }
    await prisma.cabang.delete({ where: { id } });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `HAPUS CABANG: ${existing.nama}`,
      tabel: 'Cabang',
      dataLama: { nama: existing.nama, alamat: existing.alamat, storeName: existing.storeName },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Cabang berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCabang, createCabang, updateCabang, deleteCabang };
