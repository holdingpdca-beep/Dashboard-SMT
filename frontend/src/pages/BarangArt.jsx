import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { formatRupiah, formatNumber, formatDate, STATUS_LABELS } from '../utils/format'
import { Plus, Upload, Download, Search, RefreshCw, Edit2, Trash2, Eye, CheckCircle2, RotateCcw, ChevronLeft, ChevronRight, ArrowUpDown, X } from 'lucide-react'

const KATEGORI_LABEL = { LOGAM_MULIA: 'Logam Mulia', PERHIASAN: 'Perhiasan' }

function FormField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

const emptyForm = { barangAsal: '', nomorSbg: '', provinsi: '', namaBarang: '', gramasi: '', karat: '', cogs: '', kodeBarang: '', keterangan: '' }

export default function BarangArt({ kategori }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ totalBelum: 0, totalTerjual: 0, totalPerluKode: 0 })
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 })

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('BELUM_TERJUAL') // tab aktif
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formLoading, setFormLoading] = useState(false)

  // Multi-select untuk jual massal — simpan objek barang (bisa lintas halaman)
  const [selectedMap, setSelectedMap] = useState({})
  const selectedList = Object.values(selectedMap)

  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const [showSold, setShowSold] = useState(false)
  const [soldShared, setSoldShared] = useState({ tanggalJual: '', vendor: '', nomorSku: '', keterangan: '' })
  const [soldNominal, setSoldNominal] = useState({}) // { [id]: nominalJual }
  const [soldLoading, setSoldLoading] = useState(false)

  const fetchItems = async (page = 1) => {
    setLoading(true)
    try {
      const params = { kategori, page, limit: pagination.limit, sortBy, sortOrder, search }
      if (statusFilter === 'PERLU_KODE') params.tanpaKode = 1
      else if (statusFilter) params.status = statusFilter
      const { data } = await api.get('/barang-art', { params })
      setItems(data.data)
      setSummary(data.summary)
      setPagination(data.pagination)
    } catch (err) {
      toast.error('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  // Reset ke halaman 1 saat ganti kategori / filter / sort. Bersihkan pilihan saat ganti kategori.
  useEffect(() => { setSelectedMap({}) }, [kategori])
  useEffect(() => { fetchItems(1) }, [kategori, search, statusFilter, sortBy, sortOrder])

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(p => p === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortOrder('asc') }
  }

  // ── Seleksi ──
  // Hanya barang Belum Terjual yang SUDAH punya Kode Barang yang bisa dijual.
  const canSell = (item) => item.status === 'BELUM_TERJUAL' && !!(item.kodeBarang && String(item.kodeBarang).trim())
  const toggleSelect = (item) => {
    if (!canSell(item)) return
    setSelectedMap(prev => {
      const next = { ...prev }
      if (next[item.id]) delete next[item.id]
      else next[item.id] = item
      return next
    })
  }
  const sellableOnPage = items.filter(canSell)
  const allPageSelected = sellableOnPage.length > 0 && sellableOnPage.every(i => selectedMap[i.id])
  const toggleSelectAllPage = () => {
    setSelectedMap(prev => {
      const next = { ...prev }
      if (allPageSelected) sellableOnPage.forEach(i => { delete next[i.id] })
      else sellableOnPage.forEach(i => { next[i.id] = i })
      return next
    })
  }
  const clearSelection = () => setSelectedMap({})

  const openCreate = () => { setForm(emptyForm); setEditItem(null); setShowForm(true) }
  const openEdit = (item) => {
    setForm({
      barangAsal: item.barangAsal, nomorSbg: item.nomorSbg, provinsi: item.provinsi, namaBarang: item.namaBarang,
      gramasi: item.gramasi ?? '', karat: item.karat, cogs: item.cogs ?? '',
      kodeBarang: item.kodeBarang, keterangan: item.keterangan || '',
    })
    setEditItem(item)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormLoading(true)
    try {
      if (editItem) {
        await api.put(`/barang-art/${editItem.id}`, form)
        toast.success('Data berhasil diperbarui')
      } else {
        await api.post('/barang-art', { ...form, kategori })
        toast.success('Data berhasil ditambahkan')
      }
      setShowForm(false)
      fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan data')
    } finally {
      setFormLoading(false)
    }
  }

  // ── Jual massal ──
  const openSold = () => {
    if (selectedList.length === 0) return toast.error('Pilih minimal 1 barang')
    setSoldShared({ tanggalJual: '', vendor: '', nomorSku: '', keterangan: '' })
    setSoldNominal(Object.fromEntries(selectedList.map(i => [i.id, ''])))
    setShowSold(true)
  }
  const handleMarkSold = async (e) => {
    e.preventDefault()
    if (!soldShared.tanggalJual) return toast.error('Tanggal Jual wajib diisi')
    if (!soldShared.vendor.trim()) return toast.error('Vendor wajib diisi')
    if (!soldShared.nomorSku.trim()) return toast.error('Nomor SKU wajib diisi')
    const kosong = selectedList.find(i => soldNominal[i.id] === '' || soldNominal[i.id] === undefined)
    if (kosong) return toast.error(`Nominal Jual untuk ${kosong.nomorSbg} belum diisi`)

    setSoldLoading(true)
    try {
      await api.patch('/barang-art/jual', {
        tanggalJual: soldShared.tanggalJual,
        vendor: soldShared.vendor,
        nomorSku: soldShared.nomorSku,
        keterangan: soldShared.keterangan,
        items: selectedList.map(i => ({ id: i.id, nominalJual: soldNominal[i.id] })),
      })
      toast.success(`${selectedList.length} barang ditandai terjual`)
      setShowSold(false)
      clearSelection()
      fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menandai terjual')
    } finally {
      setSoldLoading(false)
    }
  }

  const handleRevertSold = async (item) => {
    if (!window.confirm(`Batalkan status terjual untuk ${item.nomorSbg}? Tanggal, Nominal, Vendor & SKU akan dikosongkan.`)) return
    try {
      await api.patch(`/barang-art/${item.id}/batal-jual`)
      toast.success('Status terjual dibatalkan')
      fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal membatalkan')
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus data ${item.nomorSbg}?`)) return
    try {
      await api.delete(`/barang-art/${item.id}`)
      toast.success('Data berhasil dihapus')
      setSelectedMap(prev => { const n = { ...prev }; delete n[item.id]; return n })
      fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus')
    }
  }

  const handleExport = async () => {
    try {
      const params = { kategori, search }
      if (statusFilter === 'PERLU_KODE') params.tanpaKode = 1
      else if (statusFilter) params.status = statusFilter
      const res = await api.get('/barang-art/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `Barang-ART-${KATEGORI_LABEL[kategori].replace(/\s+/g, '-')}-${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Download berhasil')
    } catch { toast.error('Gagal download') }
  }

  const openImport = () => { setImportFile(null); setImportResult(null); setShowImport(true) }
  const handleImport = async () => {
    if (!importFile) return toast.error('Pilih file Excel terlebih dahulu')
    setImportLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('kategori', kategori)
      const { data } = await api.post('/barang-art/import/excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImportResult(data.data)
      toast.success(`Import selesai: ${data.data.berhasil} baru`)
      fetchItems(1)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal import')
    } finally {
      setImportLoading(false)
    }
  }

  const SortTh = ({ col, children, className = '' }) => (
    <th className={`table-header cursor-pointer select-none ${className}`} onClick={() => handleSort(col)}>
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === col ? 'text-gold-500' : 'text-brown-400'}`} />
      </div>
    </th>
  )

  const TABS = [
    { value: 'BELUM_TERJUAL', label: 'Belum Terjual', count: summary.totalBelum },
    { value: 'TERJUAL', label: 'Terjual', count: summary.totalTerjual },
    { value: 'PERLU_KODE', label: 'Perlu Kode Barang', count: summary.totalPerluKode },
    { value: '', label: 'Semua', count: summary.totalBelum + summary.totalTerjual },
  ]

  const totalNominalBatch = selectedList.reduce((s, i) => s + (parseFloat(soldNominal[i.id]) || 0), 0)

  // Kolom data penjualan hanya relevan untuk barang terjual → sembunyikan di tab "Belum Terjual"
  const showJualCols = !['BELUM_TERJUAL', 'PERLU_KODE'].includes(statusFilter)
  const colSpan = showJualCols ? 17 : 12

  return (
    <div className="space-y-4">
      {/* Judul kategori */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brown-800 dark:text-gold-300">Barang ART — {KATEGORI_LABEL[kategori]}</h1>
      </div>

      {/* Tabs status */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              statusFilter === tab.value
                ? 'bg-gold-500 text-brown-900 border-gold-500'
                : 'bg-white dark:bg-brown-900 text-brown-600 dark:text-brown-300 border-brown-200 dark:border-brown-700 hover:bg-brown-50 dark:hover:bg-brown-800'
            }`}
          >
            {tab.label} <span className="opacity-70">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Tambah Data
          </button>
          <button onClick={openImport} className="btn-outline flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" /> Import Excel
          </button>
          <button onClick={handleExport} className="btn-outline flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Download Excel
          </button>

          <div className="flex-1 min-w-48">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari No SBG, nama, kode, provinsi, vendor, SKU..."
                className="input-field pl-9"
              />
            </div>
          </div>

          <button onClick={() => fetchItems(pagination.page)} className="btn-outline p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Bar seleksi jual massal */}
        {selectedList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-gold-50 dark:bg-brown-800/50 border border-gold-200 dark:border-brown-700 px-4 py-2.5">
            <span className="text-sm font-medium text-brown-700 dark:text-gold-200">
              {selectedList.length} barang dipilih
            </span>
            <button onClick={openSold} className="btn-primary flex items-center gap-2 text-sm">
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
                <th className="table-header w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAllPage}
                    disabled={sellableOnPage.length === 0}
                    title="Pilih semua barang siap jual (sudah ada Kode Barang) di halaman ini"
                    className="accent-gold-500 w-4 h-4 cursor-pointer disabled:opacity-30"
                  />
                </th>
                <th className="table-header w-12">No</th>
                <SortTh col="barangAsal">Barang Asal</SortTh>
                <SortTh col="nomorSbg">No SBG</SortTh>
                <SortTh col="provinsi">Provinsi</SortTh>
                <SortTh col="namaBarang">Nama Barang</SortTh>
                <SortTh col="gramasi">Gramasi</SortTh>
                <SortTh col="karat">Karat</SortTh>
                <SortTh col="cogs">COGS</SortTh>
                <SortTh col="kodeBarang">Kode Barang</SortTh>
                {showJualCols && <>
                  <SortTh col="tanggalJual">Tanggal Jual</SortTh>
                  <SortTh col="nominalJual">Nominal Jual</SortTh>
                  <SortTh col="vendor">Vendor</SortTh>
                  <SortTh col="nomorSku">Nomor SKU</SortTh>
                  <th className="table-header">Keterangan</th>
                </>}
                <SortTh col="status">Status</SortTh>
                <th className="table-header text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={colSpan} className="text-center py-12 text-brown-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Memuat data...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={colSpan} className="text-center py-12 text-brown-400">
                  Tidak ada data ditemukan
                </td></tr>
              ) : items.map((item, idx) => (
                <tr key={item.id} className={`transition-colors ${selectedMap[item.id] ? 'bg-gold-50 dark:bg-brown-800/40' : 'hover:bg-gold-50/50 dark:hover:bg-brown-800/30'}`}>
                  <td className="table-cell text-center">
                    {item.status !== 'BELUM_TERJUAL' ? (
                      <span className="text-brown-300">—</span>
                    ) : canSell(item) ? (
                      <input
                        type="checkbox"
                        checked={!!selectedMap[item.id]}
                        onChange={() => toggleSelect(item)}
                        className="accent-gold-500 w-4 h-4 cursor-pointer"
                      />
                    ) : (
                      <input
                        type="checkbox"
                        disabled
                        title="Isi Kode Barang dulu sebelum barang bisa dijual"
                        className="w-4 h-4 opacity-30 cursor-not-allowed"
                      />
                    )}
                  </td>
                  <td className="table-cell text-center text-brown-400">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="table-cell">{item.barangAsal || '-'}</td>
                  <td className="table-cell font-mono font-medium text-brown-800 dark:text-gold-300">{item.nomorSbg}</td>
                  <td className="table-cell">{item.provinsi}</td>
                  <td className="table-cell">{item.namaBarang}</td>
                  <td className="table-cell text-right font-mono whitespace-nowrap">{formatNumber(item.gramasi)} gr</td>
                  <td className="table-cell whitespace-nowrap">{item.karat}</td>
                  <td className="table-cell text-right font-mono">{formatRupiah(item.cogs)}</td>
                  <td className="table-cell font-mono">
                    {item.kodeBarang
                      ? item.kodeBarang
                      : <span className="badge-warning cursor-pointer" title="Klik Edit untuk mengisi Kode Barang" onClick={() => openEdit(item)}>Perlu diisi</span>}
                  </td>
                  {showJualCols && <>
                    <td className="table-cell whitespace-nowrap text-brown-600 dark:text-brown-300">{item.tanggalJual ? formatDate(item.tanggalJual) : '-'}</td>
                    <td className="table-cell text-right font-mono font-semibold">{formatRupiah(item.nominalJual)}</td>
                    <td className="table-cell whitespace-nowrap">{item.vendor || '-'}</td>
                    <td className="table-cell font-mono">{item.nomorSku || '-'}</td>
                    <td className="table-cell max-w-36 truncate text-brown-500" title={item.keterangan}>{item.keterangan || '-'}</td>
                  </>}
                  <td className="table-cell">
                    <span className={item.status === 'TERJUAL' ? 'badge-success' : 'badge-warning'}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setViewItem(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Detail">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/20 transition-colors" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {item.status === 'TERJUAL' && (
                        <button onClick={() => handleRevertSold(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title="Batalkan Terjual">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
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
          <p className="text-sm text-brown-500 dark:text-brown-400">
            Menampilkan {items.length} dari {pagination.total} data
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchItems(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg border border-brown-200 dark:border-brown-700 disabled:opacity-40 hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-brown-500 dark:text-brown-400" />
            </button>
            <span className="text-sm text-brown-600 dark:text-brown-400 px-2">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => fetchItems(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-lg border border-brown-200 dark:border-brown-700 disabled:opacity-40 hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-brown-500 dark:text-brown-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Form Modal (Tambah / Edit) */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? `Edit — ${editItem.nomorSbg}` : `Tambah ${KATEGORI_LABEL[kategori]}`}
        size="lg"
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="btn-outline">Batal</button>
            <button onClick={handleSubmit} disabled={formLoading} className="btn-primary">
              {formLoading ? 'Menyimpan...' : editItem ? 'Simpan Perubahan' : 'Tambah Data'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Barang Asal *">
            <input value={form.barangAsal} onChange={e => setForm(p => ({ ...p, barangAsal: e.target.value }))} className="input-field" placeholder="Asal barang" required />
          </FormField>
          <FormField label="No SBG *">
            <input value={form.nomorSbg} onChange={e => setForm(p => ({ ...p, nomorSbg: e.target.value }))} className="input-field" placeholder="SBG-001" required disabled={!!editItem} />
          </FormField>
          <FormField label="Provinsi *">
            <input value={form.provinsi} onChange={e => setForm(p => ({ ...p, provinsi: e.target.value }))} className="input-field" placeholder="Kalimantan Timur" required />
          </FormField>
          <FormField label="Nama Barang *">
            <input value={form.namaBarang} onChange={e => setForm(p => ({ ...p, namaBarang: e.target.value }))} className="input-field" placeholder={kategori === 'LOGAM_MULIA' ? 'LM Antam 5gr' : 'Cincin, Kalung, dll'} required />
          </FormField>
          <FormField label="Gramasi (gram) *">
            <input type="number" step="0.001" min="0" value={form.gramasi} onChange={e => setForm(p => ({ ...p, gramasi: e.target.value }))} className="input-field" placeholder="0" required />
          </FormField>
          <FormField label="Karat *">
            <input value={form.karat} onChange={e => setForm(p => ({ ...p, karat: e.target.value }))} className="input-field" placeholder="24K / 99.99 / 18K" required />
          </FormField>
          <FormField label="COGS (Rp) *">
            <input type="number" min="0" value={form.cogs} onChange={e => setForm(p => ({ ...p, cogs: e.target.value }))} className="input-field" placeholder="0" required />
          </FormField>
          <FormField label="Kode Barang *">
            <input value={form.kodeBarang} onChange={e => setForm(p => ({ ...p, kodeBarang: e.target.value }))} className="input-field" placeholder="Kode internal" required />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Keterangan">
              <textarea value={form.keterangan} onChange={e => setForm(p => ({ ...p, keterangan: e.target.value }))} className="input-field" rows={2} placeholder="Catatan tambahan..." />
            </FormField>
          </div>
          {!editItem && (
            <p className="sm:col-span-2 text-xs text-brown-500 dark:text-brown-400">
              Data baru otomatis berstatus <b>Belum Terjual</b>. Tanggal, Nominal Jual, Vendor &amp; SKU diisi lewat aksi <b>Tandai Terjual</b>.
            </p>
          )}
        </form>
      </Modal>

      {/* Modal Import Excel */}
      <Modal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title={`Import Excel — ${KATEGORI_LABEL[kategori]}`}
        size="lg"
        footer={
          <>
            <button onClick={() => setShowImport(false)} className="btn-outline">Tutup</button>
            <button onClick={handleImport} disabled={importLoading || !importFile} className="btn-primary">
              {importLoading ? 'Mengimport...' : 'Mulai Import'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-brown-50 dark:bg-brown-800/50 border border-brown-200 dark:border-brown-700 px-4 py-3 text-sm text-brown-600 dark:text-brown-300">
            <p className="font-medium text-brown-800 dark:text-gold-300 mb-1">Format kolom template:</p>
            <p><b>Barang Asal</b>, <b>No SBG</b>, <b>Provinsi</b>, <b>Nama Barang</b>, <b>Gramasi</b>, <b>Karat</b>, <b>COGS</b>, <b>Kode Barang</b></p>
            <p className="text-xs text-brown-500 dark:text-brown-400 mt-2">
              Kolom dikenali otomatis dari nama header. <b>Kode Barang opsional</b>: bila di Excel sudah terisi, barang langsung siap dijual; bila kosong, barang tetap masuk tapi <b>Kode Barang wajib diisi dulu</b> sebelum bisa dijual. Semua barang masuk sebagai <b>Belum Terjual</b>. Satu No SBG boleh dipakai banyak barang.
            </p>
          </div>

          <div>
            <label className="label">Pilih File Excel (.xlsx / .xls)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null) }}
              className="input-field"
            />
          </div>

          {importResult && (
            <div className="card bg-brown-50 dark:bg-brown-800/50 border border-brown-200 dark:border-brown-700 space-y-2">
              <p className="font-semibold text-brown-800 dark:text-gold-300">Hasil Import</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Total', importResult.total, 'badge-info'], ['Berhasil', importResult.berhasil, 'badge-success'], ['Perlu Kode', importResult.perluKode ?? 0, 'badge-warning'], ['Gagal', importResult.gagal, 'badge-danger']].map(([l, v, c]) => (
                  <div key={l}>
                    <p className="text-xs text-brown-500 dark:text-brown-400">{l}</p>
                    <span className={`${c} text-base font-bold`}>{v}</span>
                  </div>
                ))}
              </div>
              {importResult.perluKode > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {importResult.perluKode} barang belum punya Kode Barang. Buka tab <b>Perlu Kode Barang</b> untuk mengisinya sebelum dijual.
                </p>
              )}
              {importResult.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Baris gagal:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                        Baris {e.baris}{e.nomorSbg ? ` (SBG ${e.nomorSbg})` : ''}: {e.pesan}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Tandai Terjual (massal) */}
      <Modal
        isOpen={showSold}
        onClose={() => setShowSold(false)}
        title={`Tandai Terjual — ${selectedList.length} barang`}
        size="lg"
        footer={
          <>
            <button onClick={() => setShowSold(false)} className="btn-outline">Batal</button>
            <button onClick={handleMarkSold} disabled={soldLoading} className="btn-primary">
              {soldLoading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </>
        }
      >
        <form onSubmit={handleMarkSold} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Tanggal Jual *">
              <input type="date" value={soldShared.tanggalJual} onChange={e => setSoldShared(p => ({ ...p, tanggalJual: e.target.value }))} className="input-field" required />
            </FormField>
            <FormField label="Vendor *">
              <input value={soldShared.vendor} onChange={e => setSoldShared(p => ({ ...p, vendor: e.target.value }))} className="input-field" placeholder="Nama vendor" required />
            </FormField>
            <FormField label="Nomor SKU *">
              <input value={soldShared.nomorSku} onChange={e => setSoldShared(p => ({ ...p, nomorSku: e.target.value }))} className="input-field" placeholder="SKU-001" required />
            </FormField>
          </div>

          <FormField label="Keterangan">
            <textarea value={soldShared.keterangan} onChange={e => setSoldShared(p => ({ ...p, keterangan: e.target.value }))} className="input-field" rows={2} placeholder="Catatan penjualan (opsional)..." />
          </FormField>

          <p className="text-xs text-brown-500 dark:text-brown-400">
            Tanggal Jual, Vendor, Nomor SKU, dan Keterangan berlaku untuk <b>semua</b> barang terpilih. Nominal Jual diisi per barang di bawah. Keterangan hanya menimpa catatan lama bila diisi.
          </p>

          <div className="rounded-xl border border-brown-200 dark:border-brown-700 overflow-hidden">
            <div className="max-h-72 overflow-y-auto divide-y divide-brown-100 dark:divide-brown-800">
              {selectedList.map(i => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-brown-800 dark:text-gold-200 font-mono">{i.nomorSbg}</p>
                    <p className="text-xs text-brown-500 truncate">{i.namaBarang} · {formatNumber(i.gramasi)} gr · {i.karat}</p>
                  </div>
                  <div className="w-40">
                    <input
                      type="number" min="0"
                      value={soldNominal[i.id] ?? ''}
                      onChange={e => setSoldNominal(p => ({ ...p, [i.id]: e.target.value }))}
                      className="input-field text-sm text-right"
                      placeholder="Nominal Jual"
                      required
                    />
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

      {/* View Modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Detail — ${viewItem?.nomorSbg}`} size="md">
        {viewItem && (
          <dl className="space-y-3">
            {[
              ['Barang Asal', viewItem.barangAsal || '-'],
              ['No SBG', viewItem.nomorSbg],
              ['Kategori', KATEGORI_LABEL[viewItem.kategori]],
              ['Provinsi', viewItem.provinsi],
              ['Nama Barang', viewItem.namaBarang],
              ['Gramasi', `${formatNumber(viewItem.gramasi)} gr`],
              ['Karat', viewItem.karat],
              ['COGS', formatRupiah(viewItem.cogs)],
              ['Kode Barang', viewItem.kodeBarang],
              ['Tanggal Jual', viewItem.tanggalJual ? formatDate(viewItem.tanggalJual) : '-'],
              ['Nominal Jual', formatRupiah(viewItem.nominalJual)],
              ['Vendor', viewItem.vendor || '-'],
              ['Nomor SKU', viewItem.nomorSku || '-'],
              ['Keterangan', viewItem.keterangan || '-'],
              ['Status', STATUS_LABELS[viewItem.status]],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-brown-50 dark:border-brown-800">
                <dt className="text-sm text-brown-500 dark:text-brown-400">{k}</dt>
                <dd className="text-sm font-medium text-brown-800 dark:text-gold-200 text-right">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
    </div>
  )
}
