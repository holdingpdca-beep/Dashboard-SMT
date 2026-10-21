/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SINKRONISASI KATALOG EMAS DENGAN API TOKO SERBAMAS
 * ─────────────────────────────────────────────────────────────────────────
 *  Alur:
 *    1. Ambil daftar barang yang MASIH ADA STOK dari API toko (per cabang).
 *    2. Cocokkan dengan katalog di dashboard berdasarkan (cabang + externalId).
 *       - Barang baru  → dibuat.
 *       - Barang lama  → diperbarui (nama, harga, stok, gambar).
 *    3. Barang hasil sinkron (sumber=API) yang TIDAK LAGI muncul di API
 *       → DIHAPUS PERMANEN dari dashboard (sesuai keputusan: stok habis = hapus).
 *
 *  Item input manual (sumber=MANUAL) TIDAK PERNAH disentuh oleh proses ini.
 */

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { mapProduk, adaStok } = require('./serbamasMapping');

const API_URL = process.env.SERBAMAS_API_URL
  || 'https://serbamas.cuan.co/web/sync-to-oracle/store-product-by-date/';
const API_USER = process.env.SERBAMAS_API_USERNAME || 'SYNCRECONSERBAMAS';
const API_PASS = process.env.SERBAMAS_API_PASSWORD || '';
// Token Bearer (API SERBAMAS memakai skema Bearer, bukan Basic Auth).
const API_TOKEN = process.env.SERBAMAS_API_TOKEN || '';
// Mode auth: 'bearer' (default, sesuai respons server WWW-Authenticate: Bearer) atau 'basic'.
const AUTH_MODE = (process.env.SERBAMAS_AUTH_MODE || 'bearer').toLowerCase();
// Rentang tanggal default: dari jauh di masa lalu s/d hari ini (agar seluruh stok ikut).
const DATE_FROM_DEFAULT = process.env.SERBAMAS_SYNC_DATE_FROM || '2020-01-01';

function hariIni() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Bangun header Authorization sesuai mode yang dikonfigurasi.
// - bearer: pakai SERBAMAS_API_TOKEN  →  "Authorization: Bearer <token>"
// - basic : pakai username:password    →  "Authorization: Basic <base64>"
function authHeader() {
  if (AUTH_MODE === 'basic') {
    const token = Buffer.from(`${API_USER}:${API_PASS}`).toString('base64');
    return `Basic ${token}`;
  }
  return `Bearer ${API_TOKEN}`;
}

// Apakah kredensial untuk mode aktif sudah tersedia?
function kredensialSiap() {
  return AUTH_MODE === 'basic' ? !!API_PASS : !!API_TOKEN;
}

function pesanKredensialKurang() {
  return AUTH_MODE === 'basic'
    ? 'Password API SERBAMAS belum di-set (SERBAMAS_API_PASSWORD di .env)'
    : 'Token API SERBAMAS belum di-set. API ini memakai Bearer token — isi SERBAMAS_API_TOKEN di .env (minta token ke tim SERBAMAS/IT).';
}

// Response API bisa berbentuk array langsung, atau dibungkus { data: [...] },
// { data: { items: [...] } }, { result: [...] }, dsb. Cari array-nya.
function extractList(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  const kandidat = ['data', 'items', 'result', 'results', 'products', 'rows', 'records', 'Data', 'Items', 'Result'];
  for (const k of kandidat) {
    if (Array.isArray(json[k])) return json[k];
    if (json[k] && typeof json[k] === 'object') {
      for (const k2 of kandidat) {
        if (Array.isArray(json[k][k2])) return json[k][k2];
      }
    }
  }
  return [];
}

/**
 * Ambil data mentah barang dari API untuk satu cabang.
 * @throws Error bila konfigurasi kurang / API gagal (penting: memblokir
 *         penghapusan agar data tidak terhapus karena API error).
 */
async function fetchStoreProducts(cabang, { dateFrom, dateTo } = {}) {
  if (!kredensialSiap()) {
    throw new Error(pesanKredensialKurang());
  }
  if (!cabang.storeName) {
    throw new Error(`Cabang "${cabang.nama}" belum punya Nama Toko (StoreName) untuk sinkronisasi`);
  }

  const url = new URL(API_URL);
  url.searchParams.set('DateFromFilter', dateFrom || DATE_FROM_DEFAULT);
  url.searchParams.set('DateToFilter', dateTo || hariIni());
  url.searchParams.set('StoreName', cabang.storeName);
  url.searchParams.set('IsInStock', 'true');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let res;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: authHeader(), Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API toko membalas ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`);
  }

  const json = await res.json();
  return extractList(json);
}

/**
 * Sinkronkan satu cabang. Mengembalikan ringkasan { cabang, fetched, created, updated, deleted }.
 */
async function syncCabang(cabang, { dateFrom, dateTo } = {}) {
  const rawList = await fetchStoreProducts(cabang, { dateFrom, dateTo });

  const seenExternalIds = [];
  let created = 0;
  let updated = 0;

  for (const raw of rawList) {
    if (!adaStok(raw)) continue; // pengaman: lewati yang stok 0
    const data = mapProduk(raw, cabang);
    if (!data) continue; // tidak ada ID unik → dilewati

    seenExternalIds.push(data.externalId);

    const existing = await prisma.katalogEmas.findUnique({
      where: { cabang_external: { cabangId: cabang.id, externalId: data.externalId } },
    });

    if (existing) {
      await prisma.katalogEmas.update({
        where: { id: existing.id },
        data: {
          nama: data.nama,
          kategori: data.kategori,
          jenisBarang: data.jenisBarang,
          harga: data.harga,
          // Jangan timpa gambar lama dengan kosong kalau API tidak mengirim gambar
          ...(data.gambar ? { gambar: data.gambar } : {}),
          stok: data.stok,
          tersedia: true,
          sumber: 'API',
          lastSyncedAt: new Date(),
        },
      });
      updated++;
    } else {
      await prisma.katalogEmas.create({
        data: {
          cabangId: cabang.id,
          externalId: data.externalId,
          nama: data.nama,
          kategori: data.kategori,
          jenisBarang: data.jenisBarang,
          harga: data.harga,
          gambar: data.gambar,
          stok: data.stok,
          tersedia: true,
          sumber: 'API',
          lastSyncedAt: new Date(),
        },
      });
      created++;
    }
  }

  // HAPUS PERMANEN item sinkron (sumber=API) di cabang ini yang tidak lagi ada di stok toko.
  // Pengaman: fetch sudah sukses di atas (kalau gagal, fungsi ini sudah throw lebih dulu),
  // jadi daftar kosong = memang benar-benar tidak ada stok.
  const { count: deleted } = await prisma.katalogEmas.deleteMany({
    where: {
      cabangId: cabang.id,
      sumber: 'API',
      ...(seenExternalIds.length > 0 ? { externalId: { notIn: seenExternalIds } } : {}),
    },
  });

  return { cabang: cabang.nama, fetched: rawList.length, created, updated, deleted };
}

/**
 * Sinkronkan semua cabang aktif yang sudah punya Nama Toko (storeName).
 * @returns {Promise<{ok:boolean, mulai:Date, selesai:Date, hasil:Array, error:Array}>}
 */
async function syncAll(opts = {}) {
  const mulai = new Date();
  const cabangList = await prisma.cabang.findMany({
    where: { aktif: true, storeName: { not: null } },
  });

  const hasil = [];
  const error = [];
  for (const cabang of cabangList) {
    try {
      const ringkasan = await syncCabang(cabang, opts);
      hasil.push(ringkasan);
      logger.info(`[SYNC] ${cabang.nama}: +${ringkasan.created} baru, ${ringkasan.updated} update, -${ringkasan.deleted} hapus (dari ${ringkasan.fetched} data toko)`);
    } catch (err) {
      error.push({ cabang: cabang.nama, pesan: err.message });
      logger.error(`[SYNC] Gagal sinkron cabang "${cabang.nama}": ${err.message}`);
    }
  }

  const selesai = new Date();
  if (cabangList.length === 0) {
    logger.warn('[SYNC] Tidak ada cabang aktif dengan Nama Toko (storeName) yang di-set. Sinkronisasi dilewati.');
  }
  return { ok: error.length === 0, mulai, selesai, hasil, error };
}

module.exports = { fetchStoreProducts, syncCabang, syncAll, extractList };
