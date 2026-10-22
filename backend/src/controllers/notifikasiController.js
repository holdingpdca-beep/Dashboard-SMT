const prisma = require('../utils/prisma');

const getNotifikasi = async (req, res, next) => {
  try {
    const { hanya_belum_dibaca } = req.query;
    const where = { userId: req.user.id };
    if (hanya_belum_dibaca === 'true') where.dibaca = false;

    const [data, jumlahBelumDibaca] = await Promise.all([
      prisma.notifikasi.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.notifikasi.count({ where: { userId: req.user.id, dibaca: false } }),
    ]);

    res.json({ success: true, data, jumlahBelumDibaca });
  } catch (err) {
    next(err);
  }
};

const getJumlahBelumDibaca = async (req, res, next) => {
  try {
    const count = await prisma.notifikasi.count({
      where: { userId: req.user.id, dibaca: false },
    });
    res.json({ success: true, jumlah: count });
  } catch (err) {
    next(err);
  }
};

const bacaNotifikasi = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const notif = await prisma.notifikasi.findUnique({ where: { id } });
    if (!notif) return res.status(404).json({ success: false, message: 'Notifikasi tidak ditemukan' });
    if (notif.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Akses ditolak' });

    await prisma.notifikasi.update({ where: { id }, data: { dibaca: true } });
    res.json({ success: true, message: 'Notifikasi ditandai sudah dibaca' });
  } catch (err) {
    next(err);
  }
};

const bacaSemuaNotifikasi = async (req, res, next) => {
  try {
    await prisma.notifikasi.updateMany({
      where: { userId: req.user.id, dibaca: false },
      data: { dibaca: true },
    });
    res.json({ success: true, message: 'Semua notifikasi ditandai sudah dibaca' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotifikasi, getJumlahBelumDibaca, bacaNotifikasi, bacaSemuaNotifikasi };
