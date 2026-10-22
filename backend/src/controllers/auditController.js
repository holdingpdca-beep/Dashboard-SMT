const prisma = require('../utils/prisma');
const { toInt, safeDate } = require('../utils/query');

const getAuditLogs = async (req, res, next) => {
  try {
    const { search, aktivitas, startDate, endDate } = req.query;
    const page = toInt(req.query.page, 1, 1, 1e9);
    const limit = toInt(req.query.limit, 50, 1, 100);
    const skip = (page - 1) * limit;
    const where = {};

    if (search) {
      where.OR = [
        { namaUser: { contains: search } },
        { aktivitas: { contains: search } },
      ];
    }
    if (aktivitas) where.aktivitas = { contains: aktivitas };
    const sd = safeDate(startDate);
    const ed = safeDate(endDate ? endDate + 'T23:59:59' : null);
    if (sd || ed) {
      where.createdAt = {};
      if (sd) where.createdAt.gte = sd;
      if (ed) where.createdAt.lte = ed;
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, nama: true, email: true, role: true } } },
      }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAuditLogs };
