const prisma = require('../utils/prisma');

const getCabang = async (req, res) => {
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
    res.status(500).json({ success: false, message: err.message });
  }
};

const createCabang = async (req, res) => {
  try {
    const { nama, alamat, storeName } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama cabang wajib diisi' });
    const data = await prisma.cabang.create({ data: { nama, alamat: alamat || null, storeName: storeName || null } });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateCabang = async (req, res) => {
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
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteCabang = async (req, res) => {
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
    res.json({ success: true, message: 'Cabang berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getCabang, createCabang, updateCabang, deleteCabang };
