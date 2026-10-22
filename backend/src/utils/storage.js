const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const OSS = require('ali-oss');
const logger = require('./logger');

// ── Whitelist tipe gambar (C-02) ──
// Ekstensi file DITENTUKAN SERVER dari mimetype, bukan dari nama file client.
const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Verifikasi "magic bytes" agar isi file benar-benar gambar
// (bukan HTML/JS/SVG yang dibungkus dengan mimetype palsu).
function cocokMagicBytes(buffer, mimetype) {
  if (!buffer || buffer.length < 12) return false;
  switch (mimetype) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
      );
    case 'image/webp':
      // "RIFF"...."WEBP"
      return (
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      );
    default:
      return false;
  }
}

// ── Deteksi konfigurasi OSS ──
// Jika kredensial Alibaba Cloud OSS tersedia, gambar disimpan di cloud.
// Jika tidak, otomatis fallback ke penyimpanan disk lokal (uploads/).
const ossEnabled = !!(
  process.env.OSS_ACCESS_KEY_ID &&
  process.env.OSS_ACCESS_KEY_SECRET &&
  process.env.OSS_BUCKET &&
  (process.env.OSS_REGION || process.env.OSS_ENDPOINT)
);

let ossClient = null;
if (ossEnabled) {
  ossClient = new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    ...(process.env.OSS_ENDPOINT && { endpoint: process.env.OSS_ENDPOINT }),
    secure: true,
  });
  logger.info(`Penyimpanan gambar: Alibaba Cloud OSS (bucket: ${process.env.OSS_BUCKET})`);
} else {
  logger.info('Penyimpanan gambar: disk lokal (uploads/) — kredensial OSS tidak ditemukan');
}

// Base URL publik untuk membangun URL gambar OSS.
// Jika tidak diisi, dibangun otomatis dari bucket + endpoint.
const ossPublicBase =
  process.env.OSS_PUBLIC_BASE_URL ||
  (ossEnabled && process.env.OSS_ENDPOINT
    ? process.env.OSS_ENDPOINT.replace('https://', `https://${process.env.OSS_BUCKET}.`)
    : null);

const LOCAL_ROOT = path.join(__dirname, '../..');

/**
 * Simpan file gambar (buffer dari multer memoryStorage).
 * @param {object} file - req.file dari multer (harus punya .buffer, .originalname, .mimetype)
 * @param {string} folder - subfolder tujuan (mis. 'katalog')
 * @returns {Promise<string>} URL/path gambar yang disimpan ke DB
 */
async function simpanGambar(file, folder = 'katalog') {
  // Ekstensi dari mimetype yang di-whitelist — JANGAN percaya file.originalname (C-02)
  const ext = IMAGE_TYPES[file.mimetype];
  if (!ext) {
    throw new Error('Tipe gambar tidak diizinkan (hanya JPG, PNG, WEBP)');
  }
  // Pastikan isi file benar-benar gambar sesuai mimetype-nya
  if (!cocokMagicBytes(file.buffer, file.mimetype)) {
    throw new Error('File bukan gambar yang valid');
  }

  // Nama acak (UUID-like) agar tidak bisa ditebak/dienumerasi (L-08)
  const filename = `${folder}_${crypto.randomUUID()}${ext}`;
  const key = `${folder}/${filename}`;

  if (ossEnabled) {
    await ossClient.put(key, file.buffer, {
      mime: file.mimetype,
      headers: {
        'Cache-Control': 'public, max-age=31536000',
        // Objek gambar dibuat publik agar bisa ditampilkan langsung di <img src>.
        // Bucket boleh tetap privat; ACL ini hanya berlaku per objek.
        'x-oss-object-acl': 'public-read',
      },
    });
    return `${ossPublicBase}/${key}`;
  }

  // Fallback disk lokal
  const dir = path.join(LOCAL_ROOT, 'uploads', folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return `/uploads/${folder}/${filename}`;
}

/**
 * Hapus gambar berdasarkan nilai yang tersimpan di DB.
 * Otomatis mengenali apakah gambar ada di OSS (URL penuh) atau disk lokal (/uploads/...).
 * @param {string} gambar - nilai kolom gambar dari DB
 */
async function hapusGambar(gambar) {
  if (!gambar) return;

  try {
    // Gambar OSS: URL penuh diawali base publik OSS
    if (ossPublicBase && gambar.startsWith(ossPublicBase)) {
      const key = gambar.slice(ossPublicBase.length + 1); // buang "base/"
      if (ossClient && key) await ossClient.delete(key);
      return;
    }
    // Gambar lokal: path relatif /uploads/...
    if (gambar.startsWith('/uploads/')) {
      const localPath = path.join(LOCAL_ROOT, gambar);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }
  } catch (err) {
    // Kegagalan hapus gambar tidak boleh menggagalkan operasi utama
    logger.error(`Gagal menghapus gambar "${gambar}": ${err.message}`);
  }
}

module.exports = { simpanGambar, hapusGambar, ossEnabled, IMAGE_TYPES };
