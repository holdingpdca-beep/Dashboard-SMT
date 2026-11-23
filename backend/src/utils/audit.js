const prisma = require('./prisma');
const logger = require('./logger');

async function createAuditLog({ userId, namaUser, aktivitas, tabel, dataLama, dataBaru, ipAddress }) {
  try {
    // M-02: kolom `aktivitas` VARCHAR(191). Teks panjang (alasan void, daftar nomor
    // Cukim/ID barang pada penjualan massal) bisa melebihi batas dan membuat INSERT
    // gagal diam-diam → transaksi keuangan tak tercatat. Potong ke 190 karakter.
    // Daftar panjang yang utuh tetap tersimpan di dataLama/dataBaru (JSON).
    const aktivitasAman = aktivitas != null ? String(aktivitas).slice(0, 190) : aktivitas;
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        namaUser: namaUser || null,
        aktivitas: aktivitasAman,
        tabel: tabel || null,
        dataLama: dataLama || null,
        dataBaru: dataBaru || null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (err) {
    // Masuk ke winston (logs/error.log) agar kegagalan audit terpantau di production (M-09)
    logger.error(`Gagal membuat audit log: ${err.message}`);
  }
}

module.exports = { createAuditLog };
