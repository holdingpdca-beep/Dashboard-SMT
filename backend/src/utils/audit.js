const prisma = require('./prisma');
const logger = require('./logger');

async function createAuditLog({ userId, namaUser, aktivitas, tabel, dataLama, dataBaru, ipAddress }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        namaUser: namaUser || null,
        aktivitas,
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
