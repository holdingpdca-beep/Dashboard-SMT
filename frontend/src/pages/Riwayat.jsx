import { useState, useEffect } from 'react'
import { History, Search, Filter, RefreshCw, Eye, ChevronLeft, ChevronRight, Package, TrendingUp, DollarSign } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { useAuth } from '../contexts/AuthContext'
import { formatRupiah, formatDate, GRADE_COLORS, PERUSAHAAN_LABELS } from '../utils/format'

const PERUSAHAAN_OPTIONS = [{ value: 'SERBA_MAS', label: 'Serba Mas' }, { value: 'VOLARY', label: 'Volary' }]

export default function Riwayat() {
  const { canSeeCogs } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [perusahaan, setPerusahaan] = useState('')
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 })
  const [viewItem, setViewItem] = useState(null)
  const [summary, setSummary] = useState({ totalBarang: 0, totalProfit: 0, totalHargaJual: 0, totalNilai: 0 })

  const fetchRiwayat = async (page = 1) => {
    setLoading(true)
    try {
      const params = { page, limit: 50 }
      if (search) params.search = search
      if (perusahaan) params.perusahaan = perusahaan
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

  useEffect(() => { fetchRiwayat(1) }, [perusahaan])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchRiwayat(1)
  }

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
            <p className="text-sm text-brown-500 dark:text-brown-400">Total Harga Jual</p>
            <p className="text-lg font-bold text-brown-900 dark:text-gold-100">{formatRupiah(summary.totalHargaJual)}</p>
            <p className="text-xs text-brown-400 mt-0.5">sebelum PPN</p>
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
                placeholder="Cari barang, customer, nomor invoice..."
                className="input-field pl-9"
              />
            </div>
          </form>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-brown-400" />
            <select value={perusahaan} onChange={e => setPerusahaan(e.target.value)} className="input-field w-40">
              <option value="">Semua Perusahaan</option>
              {PERUSAHAAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <button type="button" onClick={handleSearch} className="btn-primary text-sm">Cari</button>

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
                <th className="table-header">Tanggal Terjual</th>
                <th className="table-header">Jenis Barang</th>
                <th className="table-header">Detail Barang</th>
                <th className="table-header">Grade</th>
                <th className="table-header">Keterangan</th>
                {canSeeCogs() && <th className="table-header text-right">COGS</th>}
                <th className="table-header text-right">Offering Pengepul</th>
                <th className="table-header text-right">Harga Jual</th>
                <th className="table-header text-right">PPN</th>
                <th className="table-header text-right">Total Harga</th>
                {canSeeCogs() && <th className="table-header text-right">Profit</th>}
                <th className="table-header">Perusahaan</th>
                <th className="table-header">No. Invoice</th>
                <th className="table-header">Customer</th>
                <th className="table-header">Disetujui Oleh</th>
                <th className="table-header text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canSeeCogs() ? 17 : 15} className="text-center py-12 text-brown-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Memuat data...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canSeeCogs() ? 17 : 15} className="text-center py-12 text-brown-400">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    Belum ada barang yang terjual
                  </td>
                </tr>
              ) : items.map((item, idx) => {
                const inv = item.invoiceItems?.[0]?.invoice
                return (
                  <tr key={item.id} className="hover:bg-gold-50/50 dark:hover:bg-brown-800/30 transition-colors">
                    <td className="table-cell text-center text-brown-400">
                      {(pagination.page - 1) * 50 + idx + 1}
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      {inv?.approvedAt ? formatDate(inv.approvedAt) : formatDate(item.updatedAt)}
                    </td>
                    <td className="table-cell font-medium">{item.jenisBarang}</td>
                    <td className="table-cell max-w-48 truncate" title={item.detailBarang}>{item.detailBarang}</td>
                    <td className="table-cell">
                      <span className={GRADE_COLORS[item.grade]}>Grade {item.grade}</span>
                    </td>
                    <td className="table-cell max-w-36 truncate text-brown-500 dark:text-brown-400" title={item.keterangan}>
                      {item.keterangan || '-'}
                    </td>
                    {canSeeCogs() && (
                      <td className="table-cell text-right font-mono">{formatRupiah(item.cogs)}</td>
                    )}
                    <td className="table-cell text-right font-mono">{formatRupiah(item.offeringPengepul)}</td>
                    <td className="table-cell text-right font-mono">{formatRupiah(item.hargaJual)}</td>
                    <td className="table-cell text-right font-mono text-brown-500">{formatRupiah(item.ppn)}</td>
                    <td className="table-cell text-right font-mono font-semibold">{formatRupiah(item.totalHarga)}</td>
                    {canSeeCogs() && (
                      <td className="table-cell text-right font-mono">
                        {item.profit ? (
                          <span className={parseFloat(item.profit) >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-500 font-semibold'}>
                            {formatRupiah(item.profit)}
                          </span>
                        ) : '-'}
                      </td>
                    )}
                    <td className="table-cell">
                      <span className={item.perusahaan === 'VOLARY' ? 'badge-gold' : 'badge-info'}>
                        {PERUSAHAAN_LABELS[item.perusahaan]}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-sm">{inv?.nomorInvoice || '-'}</td>
                    <td className="table-cell">{inv?.namaCustomer || '-'}</td>
                    <td className="table-cell text-brown-500 dark:text-brown-400">{inv?.approvedByNama || '-'}</td>
                    <td className="table-cell">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => setViewItem({ ...item, invoice: inv })}
                          className="p-1.5 rounded-lg text-brown-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title="Lihat Detail"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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
        title={`Detail Barang — ${viewItem?.jenisBarang || ''}`}
        size="md"
      >
        {viewItem && (
          <div className="space-y-4">
            {/* Info Barang */}
            <div>
              <p className="text-xs font-semibold text-brown-400 dark:text-brown-500 uppercase tracking-wider mb-2">Info Barang</p>
              <dl className="space-y-0">
                {[
                  ['Nomor SBG', viewItem.nomorSbg],
                  ['Grade', `Grade ${viewItem.grade}`],
                  ['Jenis Barang', viewItem.jenisBarang],
                  ['Detail Barang', viewItem.detailBarang],
                  ['Keterangan', viewItem.keterangan || '-'],
                  ['Perusahaan', PERUSAHAAN_LABELS[viewItem.perusahaan]],
                  ['Tanggal Masuk', formatDate(viewItem.tanggalMasuk)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-brown-50 dark:border-brown-800">
                    <dt className="text-sm text-brown-500 dark:text-brown-400">{k}</dt>
                    <dd className="text-sm font-medium text-brown-800 dark:text-gold-200 text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Info Harga */}
            <div>
              <p className="text-xs font-semibold text-brown-400 dark:text-brown-500 uppercase tracking-wider mb-2">Info Harga</p>
              <dl className="space-y-0">
                {[
                  ...(canSeeCogs() ? [['COGS', formatRupiah(viewItem.cogs)]] : []),
                  ['Offering Pengepul', formatRupiah(viewItem.offeringPengepul)],
                  ['Harga Jual', formatRupiah(viewItem.hargaJual)],
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

            {/* Info Invoice */}
            {viewItem.invoice && (
              <div>
                <p className="text-xs font-semibold text-brown-400 dark:text-brown-500 uppercase tracking-wider mb-2">Info Penjualan</p>
                <dl className="space-y-0">
                  {[
                    ['Nomor Invoice', viewItem.invoice.nomorInvoice],
                    ['Customer', viewItem.invoice.namaCustomer],
                    ...(canSeeCogs() ? [['No. Telepon', viewItem.invoice.noTelepon || '-']] : []),
                    ['Tanggal Invoice', formatDate(viewItem.invoice.tanggalInvoice)],
                    ['Disetujui Oleh', viewItem.invoice.approvedByNama || '-'],
                    ['Tanggal Disetujui', viewItem.invoice.approvedAt ? formatDate(viewItem.invoice.approvedAt) : '-'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2 border-b border-brown-50 dark:border-brown-800">
                      <dt className="text-sm text-brown-500 dark:text-brown-400">{k}</dt>
                      <dd className="text-sm font-medium text-brown-800 dark:text-gold-200 text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
