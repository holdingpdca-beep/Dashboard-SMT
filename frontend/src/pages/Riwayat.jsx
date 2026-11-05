import { useState, useEffect } from 'react'
import { History, Search, Filter, RefreshCw, Eye, ChevronLeft, ChevronRight, Package, TrendingUp, DollarSign, Printer, Download } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { useAuth } from '../contexts/AuthContext'
import { formatRupiah, formatDate, GRADE_COLORS, JENIS_PEMBELI_LABELS, JENIS_PEMBELI_COLORS, JENIS_PEMBELI_OPTIONS } from '../utils/format'
import { printStrukPDF } from '../utils/pdfStruk'

export default function Riwayat() {
  const { canSeeCogs } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [jenisPembeli, setJenisPembeli] = useState('')
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 })
  const [viewItem, setViewItem] = useState(null)
  const [summary, setSummary] = useState({ totalBarang: 0, totalProfit: 0, totalHargaJual: 0, totalPpn: 0, totalNilai: 0 })

  const fetchRiwayat = async (page = 1) => {
    setLoading(true)
    try {
      const params = { page, limit: 50 }
      if (search) params.search = search
      if (jenisPembeli) params.jenisPembeli = jenisPembeli
      const { data } = await api.get('/items/riwayat', { params })
      setItems(data.data)
      setPagination(data.pagination)
      setSummary(data.summary)
    } catch {
      toast.error('Gagal memuat riwayat')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRiwayat(1) }, [jenisPembeli])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchRiwayat(1)
  }

  const handleExport = async () => {
    try {
      const params = {}
      if (search) params.search = search
      if (jenisPembeli) params.jenisPembeli = jenisPembeli
      const res = await api.get('/items/riwayat/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `Riwayat-Penjualan-${Date.now()}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Download berhasil')
    } catch {
      toast.error('Gagal download')
    }
  }

  // Bangun ulang data struk dari 1 baris barang untuk dicetak ulang
  const cetakStruk = (item) => {
    printStrukPDF({
      nomorStruk: item.nomorStruk || '-',
      namaPelanggan: item.namaPelanggan,
      noTelepon: item.noTelepon,
      namaSales: item.namaSales,
      jenisPembeli: item.jenisPembeli,
      tanggalJual: item.tanggalJual || item.updatedAt,
      items: [{
        nomorSbg: item.nomorSbg, jenisBarang: item.jenisBarang, grade: item.grade,
        detailBarang: item.detailBarang, keterangan: item.keterangan,
        hargaJual: parseFloat(item.hargaJual || 0), ppn: parseFloat(item.ppn || 0), totalHarga: parseFloat(item.totalHarga || 0),
      }],
    })
  }

  const colCount = canSeeCogs() ? 16 : 14

  return (
    <div className="space-y-4">

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm text-brown-500 dark:text-brown-400">Total Barang Terjual</p>
            <p className="text-3xl font-bold text-brown-900 dark:text-gold-100">{summary.totalBarang}</p>
            <p className="text-xs text-brown-400 mt-0.5">unit barang</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-6 h-6 text-gold-600 dark:text-gold-400" />
          </div>
          <div>
            <p className="text-sm text-brown-500 dark:text-brown-400">Total Harga Terjual</p>
            <p className="text-lg font-bold text-brown-900 dark:text-gold-100">{formatRupiah(summary.totalNilai)}</p>
            <p className="text-xs text-brown-400 mt-0.5">termasuk PPN</p>
          </div>
        </div>
        {canSeeCogs() && (
          <div className="card flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-brown-500 dark:text-brown-400">Total Profit</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatRupiah(summary.totalProfit)}</p>
              <p className="text-xs text-brown-400 mt-0.5">harga jual − COGS</p>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <form onSubmit={handleSearch} className="flex-1 min-w-48">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari barang, pelanggan, sales, no. struk..."
                className="input-field pl-9"
              />
            </div>
          </form>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-brown-400" />
            <select value={jenisPembeli} onChange={e => setJenisPembeli(e.target.value)} className="input-field w-44">
              <option value="">Semua Pembeli</option>
              {JENIS_PEMBELI_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <button type="button" onClick={handleSearch} className="btn-primary text-sm">Cari</button>

          <button onClick={handleExport} className="btn-outline flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Download Excel
          </button>

          <button onClick={() => fetchRiwayat(pagination.page)} className="btn-outline p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <span className="text-sm text-brown-500 dark:text-brown-400 ml-auto">
            Total: <strong>{pagination.total}</strong> barang terjual
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full sticky-table freeze-col">
            <thead>
              <tr>
                <th className="table-header w-12">No</th>
                <th className="table-header">Tanggal Jual</th>
                <th className="table-header">Tanggal Serah Terima</th>
                <th className="table-header">Nomor SBG</th>
                <th className="table-header">Jenis Barang</th>
                <th className="table-header">Grade</th>
                <th className="table-header">Nama Barang</th>
                <th className="table-header">Keterangan</th>
                {canSeeCogs() && <th className="table-header text-right">COGS</th>}
                <th className="table-header text-right">Harga Terjual</th>
                <th className="table-header text-right">PPN</th>
                <th className="table-header text-right">Total Harga</th>
                {canSeeCogs() && <th className="table-header text-right">Profit</th>}
                <th className="table-header">Pembeli</th>
                <th className="table-header">Pelanggan</th>
                <th className="table-header text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-12 text-brown-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Memuat data...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-12 text-brown-400">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    Belum ada barang yang terjual
                  </td>
                </tr>
              ) : items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gold-50/50 dark:hover:bg-brown-800/30 transition-colors">
                  <td className="table-cell text-center text-brown-400">{(pagination.page - 1) * 50 + idx + 1}</td>
                  <td className="table-cell whitespace-nowrap">{formatDate(item.tanggalJual || item.updatedAt)}</td>
                  <td className="table-cell whitespace-nowrap">{formatDate(item.tanggalLelang)}</td>
                  <td className="table-cell font-mono font-medium text-brown-800 dark:text-gold-300">{item.nomorSbg}</td>
                  <td className="table-cell font-medium">{item.jenisBarang}</td>
                  <td className="table-cell"><span className={GRADE_COLORS[item.grade]}>{item.grade}</span></td>
                  <td className="table-cell max-w-48 truncate" title={item.detailBarang}>{item.detailBarang}</td>
                  <td className="table-cell max-w-36 truncate text-brown-500 dark:text-brown-400" title={item.keterangan}>{item.keterangan || '-'}</td>
                  {canSeeCogs() && <td className="table-cell text-right font-mono">{formatRupiah(item.cogs)}</td>}
                  <td className="table-cell text-right font-mono">{formatRupiah(item.hargaJual)}</td>
                  <td className="table-cell text-right font-mono text-brown-500">{formatRupiah(item.ppn)}</td>
                  <td className="table-cell text-right font-mono font-semibold">{formatRupiah(item.totalHarga)}</td>
                  {canSeeCogs() && (
                    <td className="table-cell text-right font-mono">
                      {item.profit != null ? (
                        <span className={parseFloat(item.profit) >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-500 font-semibold'}>
                          {formatRupiah(item.profit)}
                        </span>
                      ) : '-'}
                    </td>
                  )}
                  <td className="table-cell">
                    {item.jenisPembeli ? <span className={JENIS_PEMBELI_COLORS[item.jenisPembeli]}>{JENIS_PEMBELI_LABELS[item.jenisPembeli]}</span> : '-'}
                  </td>
                  <td className="table-cell">{item.namaPelanggan || '-'}</td>
                  <td className="table-cell">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setViewItem(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Detail">
                        <Eye className="w-4 h-4" />
                      </button>
                      {item.nomorStruk && (
                        <button onClick={() => cetakStruk(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/20 transition-colors" title="Cetak Struk">
                          <Printer className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-brown-100 dark:border-brown-800">
          <p className="text-sm text-brown-500 dark:text-brown-400">
            Menampilkan {items.length} dari {pagination.total} data
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchRiwayat(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg border border-brown-200 dark:border-brown-700 disabled:opacity-40 hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-brown-500 dark:text-brown-400" />
            </button>
            <span className="text-sm text-brown-600 dark:text-brown-400 px-2">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => fetchRiwayat(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-lg border border-brown-200 dark:border-brown-700 disabled:opacity-40 hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-brown-500 dark:text-brown-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Detail */}
      <Modal
        isOpen={!!viewItem}
        onClose={() => setViewItem(null)}
        title={`Detail Penjualan — ${viewItem?.nomorSbg || ''}`}
        size="md"
      >
        {viewItem && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-brown-400 dark:text-brown-500 uppercase tracking-wider mb-2">Info Barang</p>
              <dl className="space-y-0">
                {[
                  ['Nomor SBG', viewItem.nomorSbg],
                  ['Tanggal Serah Terima', formatDate(viewItem.tanggalLelang)],
                  ['Jenis Barang', viewItem.jenisBarang],
                  ['Grade', viewItem.grade],
                  ['Nama Barang', viewItem.detailBarang],
                  ['Keterangan', viewItem.keterangan || '-'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-brown-50 dark:border-brown-800">
                    <dt className="text-sm text-brown-500 dark:text-brown-400">{k}</dt>
                    <dd className="text-sm font-medium text-brown-800 dark:text-gold-200 text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <p className="text-xs font-semibold text-brown-400 dark:text-brown-500 uppercase tracking-wider mb-2">Info Harga</p>
              <dl className="space-y-0">
                {[
                  ...(canSeeCogs() ? [['COGS', formatRupiah(viewItem.cogs)]] : []),
                  ['Harga Terjual', formatRupiah(viewItem.hargaJual)],
                  ['PPN (1.1%)', formatRupiah(viewItem.ppn)],
                  ['Total Harga', formatRupiah(viewItem.totalHarga)],
                  ...(canSeeCogs() ? [['Profit', formatRupiah(viewItem.profit)]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-brown-50 dark:border-brown-800">
                    <dt className="text-sm text-brown-500 dark:text-brown-400">{k}</dt>
                    <dd className={`text-sm font-medium text-right ${k === 'Profit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-brown-800 dark:text-gold-200'}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <p className="text-xs font-semibold text-brown-400 dark:text-brown-500 uppercase tracking-wider mb-2">Info Penjualan</p>
              <dl className="space-y-0">
                {[
                  ['No. Struk', viewItem.nomorStruk || '-'],
                  ['Pelanggan', viewItem.namaPelanggan || '-'],
                  ['No. Telepon', viewItem.noTelepon || '-'],
                  ['Sales', viewItem.namaSales || '-'],
                  ['Pembeli', viewItem.jenisPembeli ? JENIS_PEMBELI_LABELS[viewItem.jenisPembeli] : '-'],
                  ['Tanggal', formatDate(viewItem.tanggalJual || viewItem.updatedAt)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-brown-50 dark:border-brown-800">
                    <dt className="text-sm text-brown-500 dark:text-brown-400">{k}</dt>
                    <dd className="text-sm font-medium text-brown-800 dark:text-gold-200 text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {viewItem.nomorStruk && (
              <button onClick={() => cetakStruk(viewItem)} className="btn-primary w-full flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Cetak Struk
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
