const roleHierarchy = { ADMIN: 3, SUPER_USER: 2, USER: 1 };

// ── Helper otorisasi berbasis whitelist (H-01/H-02) ──
// Jangan pakai pola blacklist (mis. `role === 'USER'`) karena role baru
// seperti KATALOG_USER otomatis lolos. Selalu whitelist role yang BOLEH.

// Role yang boleh melihat SELURUH data: semua invoice, COGS, profit,
// serta data pribadi customer (nomor telepon).
const canSeeAll = (user) => ['ADMIN', 'SUPER_USER'].includes(user?.role);

// Role yang boleh mengakses modul Elektronik & Invoice.
// KATALOG_USER sengaja DIKECUALIKAN (hanya boleh akses katalog & cabang).
const ELEKTRONIK_ROLES = ['ADMIN', 'SUPER_USER', 'USER'];
const canAccessElektronik = (user) => ELEKTRONIK_ROLES.includes(user?.role);

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Akses ditolak. Hak akses tidak mencukupi.' });
    }
    next();
  };
}

function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const userLevel = roleHierarchy[req.user.role] || 0;
    const minLevel = roleHierarchy[minRole] || 0;
    if (userLevel < minLevel) {
      return res.status(403).json({ success: false, message: 'Akses ditolak. Hak akses tidak mencukupi.' });
    }
    next();
  };
}

module.exports = { requireRole, requireMinRole, canSeeAll, canAccessElektronik, ELEKTRONIK_ROLES };
