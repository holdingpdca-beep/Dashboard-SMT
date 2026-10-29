/**
 * Penjadwal tugas otomatis (cron).
 * Saat ini: sinkronisasi katalog dengan API toko SERBAMAS.
 *
 * Diatur lewat .env:
 *   SERBAMAS_SYNC_ENABLED  = true/false  (default: false)
 *   SERBAMAS_SYNC_CRON     = pola cron   (default: "0 * * * *" = tiap jam)
 *   SERBAMAS_API_PASSWORD  = wajib ada, kalau kosong penjadwal tidak dinyalakan
 */
const cron = require('node-cron');
const logger = require('../utils/logger');
const { syncAll } = require('./serbamasSync');

// Pencegahan tumpang-tindih kini ditangani oleh lock bersama di serbamasSync.syncAll
// (L-01) — berlaku untuk sinkron manual maupun terjadwal.

function startSchedulers() {
  const enabled = String(process.env.SERBAMAS_SYNC_ENABLED).toLowerCase() === 'true';
  if (!enabled) {
    logger.info('[SCHEDULER] Sinkronisasi otomatis NONAKTIF (SERBAMAS_SYNC_ENABLED != true).');
    return;
  }
  const authMode = (process.env.SERBAMAS_AUTH_MODE || 'bearer').toLowerCase();
  const adaKredensial = authMode === 'basic'
    ? !!process.env.SERBAMAS_API_PASSWORD
    : !!process.env.SERBAMAS_API_TOKEN;
  if (!adaKredensial) {
    logger.warn(`[SCHEDULER] Sinkronisasi otomatis dilewati: kredensial API belum di-set (mode ${authMode} — butuh ${authMode === 'basic' ? 'SERBAMAS_API_PASSWORD' : 'SERBAMAS_API_TOKEN'}).`);
    return;
  }

  const pola = process.env.SERBAMAS_SYNC_CRON || '0 * * * *';
  if (!cron.validate(pola)) {
    logger.error(`[SCHEDULER] Pola cron tidak valid: "${pola}". Sinkronisasi otomatis tidak dijadwalkan.`);
    return;
  }

  cron.schedule(pola, async () => {
    logger.info('[SCHEDULER] Memulai sinkronisasi katalog terjadwal...');
    try {
      const hasil = await syncAll();
      if (hasil.skipped) {
        logger.warn('[SCHEDULER] Sinkronisasi sebelumnya belum selesai, jadwal ini dilewati.');
        return;
      }
      const total = hasil.hasil.reduce(
        (a, r) => ({ created: a.created + r.created, updated: a.updated + r.updated, deleted: a.deleted + r.deleted }),
        { created: 0, updated: 0, deleted: 0 }
      );
      logger.info(`[SCHEDULER] Sinkronisasi selesai: +${total.created} baru, ${total.updated} update, -${total.deleted} hapus.`);
    } catch (err) {
      logger.error(`[SCHEDULER] Sinkronisasi terjadwal gagal: ${err.message}`);
    }
  });

  logger.info(`[SCHEDULER] Sinkronisasi katalog otomatis dijadwalkan: "${pola}".`);
}

module.exports = { startSchedulers };
