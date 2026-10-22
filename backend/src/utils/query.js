// Helper validasi & pembatasan parameter query (M-02).
// Mencegah limit tak terbatas, sortBy bebas, dan tanggal tak valid (Invalid Date → 500).

// Parse integer dengan batas min/max; fallback ke nilai default bila bukan angka.
function toInt(value, def, min, max) {
  const n = parseInt(value, 10);
  if (isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

// Pilih kolom sort HANYA dari whitelist; selain itu pakai default.
function pickSort(value, allowed, def) {
  return allowed.includes(value) ? value : def;
}

// Normalisasi arah sort ke 'asc' / 'desc' saja.
const sortOrderOf = (value) => (value === 'asc' ? 'asc' : 'desc');

// Parse tanggal aman — kembalikan null bila tidak valid (hindari crash 500).
function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = { toInt, pickSort, sortOrderOf, safeDate };
