import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { formatRupiah, formatNumber, formatDate } from '../utils/format'
import { Download, Search, RefreshCw, Edit2, Trash2, Eye, ChevronLeft, ChevronRight, ArrowUpDown, CheckCircle2, RotateCcw, X } from 'lucide-react'

function FormField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

const todayStr = () => new Date().toISOString().slice(0, 10)

// COGS per gram = total COGS (Payment SMT) ÷ berat. null bila berat tidak valid.
const cogsPerGram = (c) => {
  const berat = parseFloat(c?.berat)
  const cogs = parseFloat(c?.cogs)
  return (berat > 0 && !isNaN(cogs)) ? cogs / berat : null
}

export default function Cukim() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ totalCukim: 0, totalBerat: 0, totalCogs: 0, totalNominalJual: 0, totalAktif: 0, totalTerjual: 0 })
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 })

  const [statusTab, setStatusTab] = useState('BELUM_TERJUAL') // BELUM_TERJUAL (aktif) | TERJUAL (history)
  const isAktif = statusTab === 'BELUM_TERJUAL'

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  const [viewItem, setViewItem] = useState(null)
  const [viewLoading, setViewLoading] = useState(false)

  const [editItem, setEditItem] = useState(null)
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState({ berat: '', kadarXrf: '', tanggal: '', keterangan: '' })
  const [formLoading, setFormLoading] = useState(false)

  // Multi-select (hanya di tab Aktif)
  const [selectedMap, setSelectedMap] = useState({})
  const selectedList = Object.values(selectedMap)

  // Modal Tandai Terjual
  const [soldTargets, setSoldTargets] = useState([])
  const [showSold, setShowSold] = useState(false)
  const [soldShared, setSoldShared] = useState({ tanggalJual: '', vendor: '', nomorSku: '', keterangan: '' })
  const [soldNominal, setSoldNominal] = useState({})
  const [soldLoading, setSoldLoading] = useState(false)

  const fetchItems = async (page = 1) => {
    setLoading(true)
    try {
      const params = { page, limit: pagination.limit, sortBy, sortOrder, search, status: statusTab }
      const { data } = await api.get('/cukim', { params })
      setItems(data.data)
      setSummary(data.summary)
      setPagination(data.pagination)
    } catch (err) {
      toast.error('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { setSelectedMap({}) }, [statusTab])
  useEffect(() => { fetchItems(1) }, [search, sortBy, sortOrder, statusTab])

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(p => p === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortOrder('asc') }
  }

  // ── Seleksi (hanya tab Aktif) ──
  const toggleSelect = (item) => {
    if (!isAktif) return
    setSelectedMap(prev => {
      const next = { ...prev }
      if (next[item.id]) delete next[item.id]
      else next[item.id] = item
      return next
    })
  }
  const allPageSelected = items.length > 0 && items.every(i => selectedMap[i.id])
  const toggleSelectAllPage = () => {
    setSelectedMap(prev => {
      const next = { ...prev }
      if (allPageSelected) items.forEach(i => { delete next[i.id] })
      else items.forEach(i => { next[i.id] = i })
      return next
    })
  }
  const clearSelection = () => setSelectedMap({})

  const openView = async (item) => {
    setViewItem(item)
    setViewLoading(true)
    try {
      const { data } = await api.get(`/cukim/${item.id}`)
      setViewItem(data.data)
    } catch {
      toast.error('Gagal memuat detail')
    } finally {
      setViewLoading(false)
    }
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      berat: item.berat ?? '',
      kadarXrf: item.kadarXrf || '',
      tanggal: item.tanggal ? new Date(item.tanggal).toISOString().slice(0, 10) : todayStr(),
      keterangan: item.keterangan || '',
    })
    setShowEdit(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.berat || parseFloat(form.berat) <= 0) return toast.error('Berat wajib diisi (angka > 0)')
    if (!form.kadarXrf.trim()) return toast.error('Kadar XRF wajib diisi')
    setFormLoading(true)
    try {
      const { data } = await api.put(`/cukim/${editItem.id}`, form)
      toast.success(data.message || 'Cukim berhasil diperbarui')
      setShowEdit(false)
      fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan')
    } finally {
      setFormLoading(false)
    }
  }

  // ── Tandai Terjual ──
  const openSold = (list) => {
    if (!list || list.length === 0) return toast.error('Pilih minimal 1 Cukim')
    setSoldTargets(list)
    setSoldShared({ tanggalJual: todayStr(), vendor: '', nomorSku: '', keterangan: '' })
    setSoldNominal(Object.fromEntries(list.map(i => [i.id, ''])))
    setShowSold(true)
  }
  const totalNominalBatch = soldTargets.reduce((s, i) => s + (parseFloat(soldNominal[i.id]) || 0), 0)
  const handleMarkSold = async (e) => {
    e.preventDefault()
    if (!soldShared.tanggalJual) return toast.error('Tanggal Jual wajib diisi')
    if (!soldShared.vendor.trim()) return toast.error('Pembeli wajib diisi')
    const kosong = soldTargets.find(i => soldNominal[i.id] === '' || soldNominal[i.id] === undefined)
    if (kosong) return toast.error(`Nominal Jual untuk ${kosong.noCukim} belum diisi`)
    setSoldLoading(true)
    try {
      await api.patch('/cukim/jual', {
        tanggalJual: soldShared.tanggalJual, vendor: soldShared.vendor, nomorSku: soldShared.nomorSku, keterangan: soldShared.keterangan,
        items: soldTargets.map(i => ({ id: i.id, nominalJual: soldNominal[i.id] })),
      })
      toast.success(`${soldTargets.length} Cukim ditandai terjual`)
      setShowSold(false); clearSelection(); fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menandai terjual')
    } finally {
      setSoldLoading(false)
    }
  }

  const handleRevert = async (item) => {
    if (!window.confirm(`Batalkan penjualan ${item.noCukim}? Data penjualan akan dikosongkan dan Cukim kembali ke daftar Aktif.`)) return
    try {
      await api.patch(`/cukim/${item.id}/aktifkan`)
      toast.success('Cukim dikembalikan ke daftar aktif')
      fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal mengembalikan')
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus ${item.noCukim}? Barang yang tergabung tetap tersimpan di History (Dilebur), hanya tautannya dilepas.`)) return
    try {
      await api.delete(`/cukim/${item.id}`)
      toast.success('Cukim berhasil dihapus')
      setSelectedMap(prev => { const n = { ...prev }; delete n[item.id]; return n })
      fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus')
    }
  }

  const handleExport = async () => {
    try {
      const res = await api.get('/cukim/export', { params: { search, status: statusTab }, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `Cukim-${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Download berhasil')
    } catch { toast.error('Gagal download') }
  }

  const SortTh = ({ col, children, className = '' }) => (
    <th className={`table-header cursor-pointer select-none ${className}`} onClick={() => handleSort(col)}>
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === col ? 'text-gold-500' : 'text-brown-400'}`} />
      </div>
    </th>
  )

  const colCount = isAktif ? 11 : 13

  return (
    <div className="space-y-4">
      {/* Judul */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brown-800 dark:text-gold-300">Cukim — Hasil Lebur</h1>
        <div className="flex gap-2 text-xs">
          <span className="badge-gold">Berat: {formatNumber(summary.totalBerat)} gr</span>
          <span className="badge-info">COGS: {formatRupiah(summary.totalCogs)}</span>
          {!isAktif && <span className="badge-success">Nominal Jual: {formatRupiah(summary.totalNominalJual)}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: 'BELUM_TERJUAL', label: 'Aktif', count: summary.totalAktif },
          { value: 'TERJUAL', label: 'Terjual (History)', count: summary.totalTerjual },
        ].map(tab => (
          <button key={tab.value} onClick={() => setStatusTab(tab.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${statusTab === tab.value
              ? 'bg-gold-500 text-brown-900 border-gold-500'
              : 'bg-white dark:bg-brown-900 text-brown-600 dark:text-brown-300 border-brown-200 dark:border-brown-700 hover:bg-brown-50 dark:hover:bg-brown-800'}`}>
            {tab.label} <span className="opacity-70">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <button onClick={handleExport} className="btn-outline flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Download Excel
          </button>
          <div className="flex-1 min-w-48">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari No Cukim, Kadar XRF, pembeli, SKU..." className="input-field pl-9" />
            </div>
          </div>
          <button onClick={() => fetchItems(pagination.page)} className="btn-outline p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Bar aksi massal (tab Aktif) */}
        {isAktif && selectedList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-gold-50 dark:bg-brown-800/50 border border-gold-200 dark:border-brown-700 px-4 py-2.5">
            <span className="text-sm font-medium text-brown-700 dark:text-gold-200">{selectedList.length} Cukim dipilih</span>
            <button onClick={() => openSold(selectedList)} className="btn-primary flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Tandai Terjual
            </button>
            <button onClick={clearSelection} className="flex items-center gap-1 text-xs text-brown-500 hover:text-red-500 transition-colors">
              <X className="w-3.5 h-3.5" /> Batalkan pilihan
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full sticky-table freeze-col">
            <thead>
              <tr>
                {isAktif && (
                  <th className="table-header w-10 text-center">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllPage}
                      disabled={items.length === 0} title="Pilih semua di halaman ini"
                      className="accent-gold-500 w-4 h-4 cursor-pointer disabled:opacity-30" />
                  </th>
                )}
                <th className="table-header w-12">No</th>
                <SortTh col="noCukim">No Cukim</SortTh>
                <SortTh col="tanggal">Tanggal</SortTh>
                <SortTh col="berat">Berat</SortTh>
                <SortTh col="kadarXrf">Kadar XRF</SortTh>
                <SortTh col="cogs">COGS (Payment SMT)</SortTh>
                <th className="table-header text-right">COGS/gram</th>
                {isAktif ? (
                  <th className="table-header text-center">Jumlah Barang</th>
                ) : (<>
                  <SortTh col="tanggalJual">Tanggal Jual</SortTh>
                  <SortTh col="nominalJual">Nominal Jual</SortTh>
                  <th className="table-header">Pembeli</th>
                  <th className="table-header">Nomor SKU</th>
                </>)}
                <th className="table-header">Keterangan</th>
                <th className="table-header text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={colCount} className="text-center py-12 text-brown-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Memuat data...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={colCount} className="text-center py-12 text-brown-400">
                  {isAktif ? 'Belum ada Cukim aktif. Cukim dibuat otomatis saat melebur barang perhiasan.' : 'Belum ada Cukim terjual.'}
                </td></tr>
              ) : items.map((item, idx) => (
                <tr key={item.id} className={`transition-colors ${selectedMap[item.id] ? 'bg-gold-50 dark:bg-brown-800/40' : 'hover:bg-gold-50/50 dark:hover:bg-brown-800/30'}`}>
                  {isAktif && (
                    <td className="table-cell text-center">
                      <input type="checkbox" checked={!!selectedMap[item.id]} onChange={() => toggleSelect(item)}
                        className="accent-gold-500 w-4 h-4 cursor-pointer" />
                    </td>
                  )}
                  <td className="table-cell text-center text-brown-400">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="table-cell font-mono font-semibold text-brown-800 dark:text-gold-300">{item.noCukim}</td>
                  <td className="table-cell whitespace-nowrap text-brown-600 dark:text-brown-300">{item.tanggal ? formatDate(item.tanggal) : '-'}</td>
                  <td className="table-cell text-right font-mono whitespace-nowrap">{formatNumber(item.berat)} gr</td>
                  <td className="table-cell whitespace-nowrap">{item.kadarXrf}</td>
                  <td className="table-cell text-right font-mono font-semibold">{formatRupiah(item.cogs)}</td>
                  <td className="table-cell text-right font-mono whitespace-nowrap">{cogsPerGram(item) != null ? `${formatRupiah(cogsPerGram(item))}/gr` : '-'}</td>
                  {isAktif ? (
                    <td className="table-cell text-center">{item.jumlahBarang ?? '-'}</td>
                  ) : (<>
                    <td className="table-cell whitespace-nowrap text-brown-600 dark:text-brown-300">{item.tanggalJual ? formatDate(item.tanggalJual) : '-'}</td>
                    <td className="table-cell text-right font-mono font-semibold">{item.nominalJual != null ? formatRupiah(item.nominalJual) : '-'}</td>
                    <td className="table-cell whitespace-nowrap">{item.vendor || '-'}</td>
                    <td className="table-cell font-mono">{item.nomorSku || '-'}</td>
                  </>)}
                  <td className="table-cell max-w-36 truncate text-brown-500" title={item.keterangan}>{item.keterangan || '-'}</td>
                  <td className="table-cell">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openView(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Detail & barang asal">
                        <Eye className="w-4 h-4" />
                      </button>
                      {isAktif && (
                        <button onClick={() => openSold([item])} className="p-1.5 rounded-lg text-brown-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" title="Tandai terjual">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {!isAktif && (
                        <button onClick={() => handleRevert(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title="Batal jual (kembalikan ke aktif)">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/20 transition-colors" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Hapus">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-brown-100 dark:border-brown-800">
          <p className="text-sm text-brown-500 dark:text-brown-400">Menampilkan {items.length} dari {pagination.total} data</p>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchItems(pagination.page - 1)} disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg border border-brown-200 dark:border-brown-700 disabled:opacity-40 hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors">
              <ChevronLeft className="w-4 h-4 text-brown-500 dark:text-brown-400" />
            </button>
            <span className="text-sm text-brown-600 dark:text-brown-400 px-2">{pagination.page} / {pagination.totalPages}</span>
            <button onClick={() => fetchItems(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-lg border border-brown-200 dark:border-brown-700 disabled:opacity-40 hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors">
              <ChevronRight className="w-4 h-4 text-brown-500 dark:text-brown-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Tandai Terjual */}
      <Modal isOpen={showSold} onClose={() => setShowSold(false)} title={`Tandai Terjual — ${soldTargets.length} Cukim`} size="lg"
        footer={<>
          <button onClick={() => setShowSold(false)} className="btn-outline">Batal</button>
          <button onClick={handleMarkSold} disabled={soldLoading} className="btn-primary">{soldLoading ? 'Menyimpan...' : 'Simpan'}</button>
        </>}>
        <form onSubmit={handleMarkSold} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Tanggal Jual *">
              <input type="date" value={soldShared.tanggalJual} onChange={e => setSoldShared(p => ({ ...p, tanggalJual: e.target.value }))} className="input-field" required />
            </FormField>
            <FormField label="Pembeli *">
              <input value={soldShared.vendor} onChange={e => setSoldShared(p => ({ ...p, vendor: e.target.value }))} className="input-field" placeholder="Nama pembeli" required />
            </FormField>
            <FormField label="Nomor SKU">
              <input value={soldShared.nomorSku} onChange={e => setSoldShared(p => ({ ...p, nomorSku: e.target.value }))} className="input-field" placeholder="opsional" />
            </FormField>
          </div>
          <FormField label="Keterangan">
            <textarea value={soldShared.keterangan} onChange={e => setSoldShared(p => ({ ...p, keterangan: e.target.value }))} className="input-field" rows={2} placeholder="Catatan penjualan (opsional)..." />
          </FormField>
          <div className="rounded-xl border border-brown-200 dark:border-brown-700 overflow-hidden">
            <div className="max-h-72 overflow-y-auto divide-y divide-brown-100 dark:divide-brown-800">
              {soldTargets.map(i => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-brown-800 dark:text-gold-200 font-mono">{i.noCukim}</p>
                    <p className="text-xs text-brown-500 truncate">{formatNumber(i.berat)} gr · {i.kadarXrf} · COGS {formatRupiah(i.cogs)}</p>
                  </div>
                  <div className="w-40">
                    <input type="number" min="0" value={soldNominal[i.id] ?? ''} onChange={e => setSoldNominal(p => ({ ...p, [i.id]: e.target.value }))}
                      className="input-field text-sm text-right" placeholder="Nominal Jual" required />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-brown-50 dark:bg-brown-800/50 border-t border-brown-200 dark:border-brown-700">
              <span className="text-xs text-brown-500 dark:text-brown-400">Total Nominal Batch</span>
              <span className="text-sm font-bold text-brown-800 dark:text-gold-300 font-mono">{formatRupiah(totalNominalBatch)}</span>
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={`Edit — ${editItem?.noCukim || ''}`} size="md"
        footer={<>
          <button onClick={() => setShowEdit(false)} className="btn-outline">Batal</button>
          <button onClick={handleSubmit} disabled={formLoading} className="btn-primary">{formLoading ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
        </>}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Tanggal">
              <input type="date" value={form.tanggal} onChange={e => setForm(p => ({ ...p, tanggal: e.target.value }))} className="input-field" />
            </FormField>
            <FormField label="Berat (gram) *">
              <input type="number" step="0.001" min="0" value={form.berat} onChange={e => setForm(p => ({ ...p, berat: e.target.value }))} className="input-field" required />
            </FormField>
            <FormField label="Kadar XRF *">
              <input value={form.kadarXrf} onChange={e => setForm(p => ({ ...p, kadarXrf: e.target.value }))} className="input-field" placeholder="mis. 99.9%" required />
            </FormField>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-brown-50 dark:bg-brown-800/50 border border-brown-200 dark:border-brown-700 px-4 py-2.5">
            <span className="text-sm text-brown-600 dark:text-brown-300">COGS/gram (COGS ÷ Berat)</span>
            <span className="text-base font-bold text-brown-800 dark:text-gold-300 font-mono">
              {cogsPerGram({ cogs: editItem?.cogs, berat: form.berat }) != null ? `${formatRupiah(cogsPerGram({ cogs: editItem?.cogs, berat: form.berat }))}/gr` : '-'}
            </span>
          </div>
          <FormField label="Keterangan">
            <textarea value={form.keterangan} onChange={e => setForm(p => ({ ...p, keterangan: e.target.value }))} className="input-field" rows={2} placeholder="Catatan (opsional)..." />
          </FormField>
          <p className="text-xs text-brown-500 dark:text-brown-400">COGS Cukim mengikuti total Payment SMT barang yang dilebur dan tidak diubah di sini. COGS/gram ikut berubah bila Berat diubah.</p>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Detail — ${viewItem?.noCukim || ''}`} size="lg">
        {viewItem && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ['No Cukim', viewItem.noCukim],
                ['Tanggal', viewItem.tanggal ? formatDate(viewItem.tanggal) : '-'],
                ['Berat', `${formatNumber(viewItem.berat)} gr`],
                ['Kadar XRF', viewItem.kadarXrf],
                ['COGS (Payment SMT)', formatRupiah(viewItem.cogs)],
                ['COGS/gram', cogsPerGram(viewItem) != null ? `${formatRupiah(cogsPerGram(viewItem))}/gr` : '-'],
                ['Jumlah Barang', (viewItem.items?.length ?? viewItem.jumlahBarang ?? 0) + ' barang'],
                ['Status', viewItem.status === 'TERJUAL' ? 'Terjual' : 'Aktif'],
                ...(viewItem.status === 'TERJUAL' ? [
                  ['Tanggal Jual', viewItem.tanggalJual ? formatDate(viewItem.tanggalJual) : '-'],
                  ['Nominal Jual', viewItem.nominalJual != null ? formatRupiah(viewItem.nominalJual) : '-'],
                  ['Pembeli', viewItem.vendor || '-'],
                  ['Nomor SKU', viewItem.nomorSku || '-'],
                ] : []),
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-brown-50 dark:bg-brown-800/50 px-3 py-2">
                  <dt className="text-xs text-brown-500 dark:text-brown-400">{k}</dt>
                  <dd className="text-sm font-semibold text-brown-800 dark:text-gold-200">{v}</dd>
                </div>
              ))}
            </dl>
            {viewItem.keterangan && (
              <p className="text-sm text-brown-600 dark:text-brown-300"><b>Keterangan:</b> {viewItem.keterangan}</p>
            )}

            <div>
              <p className="text-sm font-semibold text-brown-800 dark:text-gold-300 mb-2">Barang asal yang dilebur</p>
              {viewLoading ? (
                <p className="text-sm text-brown-400"><RefreshCw className="w-4 h-4 animate-spin inline mr-1" /> Memuat...</p>
              ) : (viewItem.items && viewItem.items.length > 0) ? (
                <div className="rounded-xl border border-brown-200 dark:border-brown-700 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto divide-y divide-brown-100 dark:divide-brown-800">
                    {viewItem.items.map(b => (
                      <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-brown-800 dark:text-gold-200">{b.namaBarang}</p>
                          <p className="text-xs text-brown-500 truncate font-mono">{b.kodeBarang || b.nomorSbg} · {formatNumber(b.gramasi)} gr · {b.karat}</p>
                        </div>
                        <span className="text-sm font-mono font-semibold text-brown-700 dark:text-gold-300 whitespace-nowrap">{formatRupiah(b.cogs)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-brown-400">Tidak ada barang terhubung (mungkin tautannya sudah dilepas).</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
