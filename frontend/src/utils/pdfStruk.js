import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { formatRupiah, formatDate } from './format'
import { terbilang } from './terbilang'

const LOGO_SMT = '/logos/logo-smt.png'

// Nama file PDF: ubah prefix nomor struk menjadi INV-SMT.
// STR-2026-0011 -> INV-SMT-2026-0011 (2026 = tahun, 0011 = running number).
function strukFileName(struk) {
  const nomor = struk.nomorStruk || 'STRUK'
  return nomor.startsWith('STR-') ? nomor.replace(/^STR-/, 'INV-SMT-') : `INV-SMT-${nomor}`
}

// Muat gambar sebagai base64 + ukuran aslinya (untuk jaga rasio aspek)
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve({ data: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = reject
    img.src = url
  })
}

// Struk penjualan langsung (bukan invoice). Berisi tabel barang, total,
// jenis pembeli, dan tanda tangan Pelanggan + Sales.
export async function generateStrukPDF(struk) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const primaryColor = [78, 52, 46]
  const goldColor = [212, 175, 55]
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15

  let logo = null
  try { logo = await loadImage(LOGO_SMT) } catch {}

  // Header: satu blok cream penuh (logo terlihat jelas), tidak terlalu tinggi
  const headerH = 40
  doc.setFillColor(248, 241, 227)
  doc.rect(0, 0, pageW, headerH, 'F')
  doc.setFillColor(...goldColor)
  doc.rect(0, headerH - 2, pageW, 2, 'F')

  // Logo SMT (landscape) di kiri, center vertikal
  if (logo) {
    const w = 72
    const h = (logo.h / logo.w) * w
    doc.addImage(logo.data, 'PNG', margin, (headerH - 2 - h) / 2, w, h)
  }
  // Judul & info kanan — teks gelap agar kontras di header cream
  doc.setTextColor(...primaryColor)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE', pageW - margin, 16, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`No: ${struk.nomorStruk}`, pageW - margin, 23, { align: 'right' })
  doc.text(`Tanggal: ${formatDate(struk.tanggalJual || new Date())}`, pageW - margin, 29, { align: 'right' })

  // Info pelanggan & sales — label abu-abu + nilai tebal, sejajar kolom (rapi)
  const infoY = 52
  const colL = margin
  const colR = pageW / 2 + 10
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(140, 120, 110)
  doc.text('Pelanggan', colL, infoY)
  doc.text('No. Telepon', colL, infoY + 7)
  doc.text('Sales', colR, infoY)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(60, 42, 35)
  doc.text(`: ${struk.namaPelanggan || '-'}`, colL + 24, infoY)
  doc.text(`: ${struk.noTelepon || '-'}`, colL + 24, infoY + 7)
  doc.text(`: ${struk.namaSales || '-'}`, colR + 16, infoY)

  doc.setDrawColor(...goldColor)
  doc.setLineWidth(0.5)
  doc.line(margin, 66, pageW - margin, 66)

  // Tabel barang
  const tableData = (struk.items || []).map((it, i) => [
    i + 1,
    it.nomorSbg || '-',
    it.jenisBarang,
    it.detailBarang,
    formatRupiah(it.hargaJual),
    formatRupiah(it.ppn),
    formatRupiah(it.totalHarga),
  ])

  doc.autoTable({
    startY: 70,
    head: [['No', 'No. SBG', 'Jenis', 'Nama Barang', 'Harga', 'PPN (1.1%)', 'Total']],
    body: tableData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [250, 246, 240] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 24 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
  })

  const finalY = doc.lastAutoTable.finalY + 8
  const items = struk.items || []
  const subtotal = items.reduce((s, i) => s + parseFloat(i.hargaJual || 0), 0)
  const totalPpn = items.reduce((s, i) => s + parseFloat(i.ppn || 0), 0)
  const grandTotal = items.reduce((s, i) => s + parseFloat(i.totalHarga || 0), 0)

  const totalsX = pageW - margin - 70
  doc.setFontSize(9)
  doc.setTextColor(78, 52, 46)
  doc.text('Subtotal:', totalsX, finalY)
  doc.text(formatRupiah(subtotal), pageW - margin, finalY, { align: 'right' })
  doc.text('Total PPN (1.1%):', totalsX, finalY + 6)
  doc.text(formatRupiah(totalPpn), pageW - margin, finalY + 6, { align: 'right' })

  doc.setFillColor(...goldColor)
  doc.setTextColor(...primaryColor)
  doc.roundedRect(totalsX - 2, finalY + 10, pageW - margin - totalsX + 2, 10, 2, 2, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('GRAND TOTAL:', totalsX + 1, finalY + 17)
  doc.text(formatRupiah(grandTotal), pageW - margin - 2, finalY + 17, { align: 'right' })

  // Terbilang dari grand total (dibulatkan ke rupiah terdekat)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(78, 52, 46)
  const terbilangY = finalY + 26
  const terbilangLines = doc.splitTextToSize(`Terbilang: ${terbilang(grandTotal)}`, pageW - 2 * margin)
  doc.text(terbilangLines, margin, terbilangY)

  // Tanda tangan: Pelanggan (kiri) & Sales (kanan) — posisi mengikuti tinggi terbilang
  const signY = terbilangY + terbilangLines.length * 4.5 + 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(78, 52, 46)
  const leftX = margin + 25
  const rightX = pageW - margin - 25
  doc.text('Pelanggan,', leftX, signY, { align: 'center' })
  doc.text('Sales,', rightX, signY, { align: 'center' })
  doc.setDrawColor(120, 120, 120)
  doc.setLineWidth(0.3)
  doc.line(leftX - 25, signY + 22, leftX + 25, signY + 22)
  doc.line(rightX - 25, signY + 22, rightX + 25, signY + 22)
  doc.setFont('helvetica', 'bold')
  doc.text(struk.namaPelanggan || '', leftX, signY + 27, { align: 'center' })
  doc.text(struk.namaSales || '', rightX, signY + 27, { align: 'center' })

  // ── Note / Ketentuan Pembelian ──
  const ketentuan = [
    'Barang yang sudah dibeli tidak dapat ditukar atau dikembalikan.',
    'Barang merupakan produk second/bekas dan dijual sesuai kondisi aktual.',
    'Tidak terdapat garansi toko maupun garansi penjual.',
    'Pembeli wajib memeriksa kondisi fisik, fungsi, dan kelengkapan barang sebelum transaksi.',
    'Kerusakan atau kekurangan yang telah diinformasikan sebelum pembelian menjadi tanggung jawab pembeli.',
    'Kelengkapan barang sesuai dengan keterangan pada invoice.',
    'Invoice ini merupakan bukti sah transaksi pembelian.',
  ]

  const numW = 5
  const lineH = 3.8
  const boxW = pageW - 2 * margin
  const textW = boxW - 6 - numW
  doc.setFontSize(7.5)
  const wrapped = ketentuan.map(t => doc.splitTextToSize(t, textW))
  const bodyLines = wrapped.reduce((s, w) => s + w.length, 0)
  const boxH = 10 + bodyLines * lineH + 3

  // Pindah ke halaman baru bila tak cukup ruang sebelum footer
  let noteY = signY + 36
  const footerTop = pageH - 16
  if (noteY + boxH > footerTop - 4) {
    doc.addPage()
    noteY = 20
  }

  doc.setDrawColor(...goldColor)
  doc.setLineWidth(0.4)
  doc.setFillColor(250, 246, 240)
  doc.roundedRect(margin, noteY, boxW, boxH, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...primaryColor)
  doc.text('NOTE / KETENTUAN PEMBELIAN', margin + 3, noteY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(70, 55, 48)
  let ty = noteY + 11
  wrapped.forEach((lines, idx) => {
    doc.text(`${idx + 1}.`, margin + 3, ty)
    doc.text(lines, margin + 3 + numW, ty)
    ty += lines.length * lineH
  })

  // Footer
  doc.setFillColor(...primaryColor)
  doc.rect(0, pageH - 14, pageW, 14, 'F')
  doc.setFillColor(...goldColor)
  doc.rect(0, pageH - 16, pageW, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Terima kasih atas pembelian Anda', pageW / 2, pageH - 6, { align: 'center' })

  return doc
}

export async function printStrukPDF(struk) {
  const doc = await generateStrukPDF(struk)
  doc.autoPrint()
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export async function downloadStrukPDF(struk) {
  const doc = await generateStrukPDF(struk)
  doc.save(`${strukFileName(struk)}.pdf`)
}
