// Konversi angka ke terbilang Bahasa Indonesia.
// Dipakai di invoice (PDF & tampilan layar) untuk menuliskan grand total dalam huruf.

const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan',
  'sembilan', 'sepuluh', 'sebelas',
]

// Mengubah bilangan bulat non-negatif menjadi kata (tanpa kata "rupiah").
function terbilangDasar(n) {
  n = Math.floor(n)
  if (n < 12) return SATUAN[n]
  if (n < 20) return terbilangDasar(n - 10) + ' belas'
  if (n < 100) return terbilangDasar(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + SATUAN[n % 10] : '')
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + terbilangDasar(n % 100) : '')
  if (n < 1000) return SATUAN[Math.floor(n / 100)] + ' ratus' + (n % 100 ? ' ' + terbilangDasar(n % 100) : '')
  if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + terbilangDasar(n % 1000) : '')
  if (n < 1000000) return terbilangDasar(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + terbilangDasar(n % 1000) : '')
  if (n < 1000000000) return terbilangDasar(Math.floor(n / 1000000)) + ' juta' + (n % 1000000 ? ' ' + terbilangDasar(n % 1000000) : '')
  if (n < 1000000000000) return terbilangDasar(Math.floor(n / 1000000000)) + ' miliar' + (n % 1000000000 ? ' ' + terbilangDasar(n % 1000000000) : '')
  return terbilangDasar(Math.floor(n / 1000000000000)) + ' triliun' + (n % 1000000000000 ? ' ' + terbilangDasar(n % 1000000000000) : '')
}

// Terbilang lengkap dengan kata "rupiah", kapital di awal.
// Contoh: terbilang(1250000) -> "Satu juta dua ratus lima puluh ribu rupiah"
export function terbilang(angka) {
  const n = Math.round(Math.abs(Number(angka) || 0))
  const kata = n === 0 ? 'nol' : terbilangDasar(n).replace(/\s+/g, ' ').trim()
  return kata.charAt(0).toUpperCase() + kata.slice(1) + ' rupiah'
}

export default terbilang
