import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { formatRupiah, formatNumber, formatDate } from '../utils/format'
import { Plus, Upload, Download, Search, RefreshCw, Edit2, Trash2, Eye, CheckCircle2, RotateCcw, ChevronLeft, ChevronRight, ArrowUpDown, X, ArrowRightLeft, Flame, Ship, Image as ImageIcon } from 'lucide-react'

const KATEGORI_LABEL = { LOGAM_MULIA: 'Logam Mulia', PERHIASAN: 'Perhiasan' }
const VENDOR_OPTIONS = ['Gadai Mas', 'Gadai Mulia']
const TAHAP_LABEL = { AKTIF: 'Aktif', EKSPORT: 'Eksport', TERJUAL: 'Terjual', DILEBUR: 'Dilebur' }
const TAHAP_BADGE = { AKTIF: 'badge-warning', EKSPORT: 'badge-info', TERJUAL: 'badge-success', DILEBUR: 'badge-gray' }

function FormField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

const emptyForm = { vendorAsal: '', provinsi: '', nomorSbg: '', namaBarang: '', gramasi: '', karat: '', totalHarga: '', beaLelang: '', keterangan: '' }

const todayStr = () => new Date().toISOString().slice(0, 10)

/**
 * view: 'inventory' (kategori LOGAM_MULIA / PERHIASAN) | 'eksport' | 'history'
 */
export default function BarangArt({ kategori, view = 'inventory' }) {
  const isInventory = view === 'inventory'
  const isEksport = view === 'eksport'
  const isHistory = view === 'history'
  const isLM = isInventory && kategori === 'LOGAM_MULIA'
  const isPerhiasan = isInventory && kategori === 'PERHIASAN'

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ totalAktif: 0, totalEksport: 0, totalTerjual: 0, totalDilebur: 0 })
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 })

  const [search, setSearch] = useState('')
  const [historyTab, setHistoryTab] = useState('HISTORY') // HISTORY | TERJUAL | DILEBUR
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formLoading, setFormLoading] = useState(false)

  // Multi-select untuk aksi massal — simpan objek barang (bisa lintas halaman)
  const [selectedMap, setSelectedMap] = useState({})
  const selectedList = Object.values(selectedMap)

  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)

  // Modal Tandai Terjual (Logam Mulia)
  const [soldTargets, setSoldTargets] = useState([])
  const [showSold, setShowSold] = useState(false)
  const [soldShared, setSoldShared] = useState({ tanggalJual: '', vendor: '', nomorSku: '', keterangan: '' })
  const [soldNominal, setSoldNominal] = useState({})
  const [soldLoading, setSoldLoading] = useState(false)

  // Modal Lebur (Perhiasan)
  const [leburTargets, setLeburTargets] = useState([])
  const [showLebur, setShowLebur] = useState(false)
  const [leburShared, setLeburShared] = useState({ tanggalLebur: '', keterangan: '', berat: '', kadarXrf: '' })
  const [leburLoading, setLeburLoading] = useState(false)

  // Modal Foto Barang (Barang Eksport)
  const [fotoItem, setFotoItem] = useState(null)
  const [showFoto, setShowFoto] = useState(false)
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [fotoLoading, setFotoLoading] = useState(false)

  const tahapParam = () => {
    if (isEksport) return 'EKSPORT'
    if (isHistory) return historyTab
    return 'AKTIF'
  }

  const fetchItems = async (page = 1) => {
    setLoading(true)
    try {
      const params = { page, limit: pagination.limit, sortBy, sortOrder, search, tahap: tahapParam() }
      if (kategori) params.kategori = kategori
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

  useEffect(() => { setSelectedMap({}) }, [kategori, view])
  useEffect(() => { fetchItems(1) }, [kategori, view, search, historyTab, sortBy, sortOrder])

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(p => p === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortOrder('asc') }
  }

  // ── Seleksi (inventory & eksport) ──
  const selectable = isInventory || isEksport
  const canSelect = (item) => selectable && item.tahap !== 'TERJUAL' && item.tahap !== 'DILEBUR'
  const toggleSelect = (item) => {
    if (!canSelect(item)) return
    setSelectedMap(prev => {
      const next = { ...prev }
      if (next[item.id]) delete next[item.id]
      else next[item.id] = item
      return next
    })
  }
  const selectableOnPage = items.filter(canSelect)
  const allPageSelected = selectableOnPage.length > 0 && selectableOnPage.every(i => selectedMap[i.id])
  const toggleSelectAllPage = () => {
    setSelectedMap(prev => {
      const next = { ...prev }
      if (allPageSelected) selectableOnPage.forEach(i => { delete next[i.id] })
      else selectableOnPage.forEach(i => { next[i.id] = i })
      return next
    })
  }
  const clearSelection = () => setSelectedMap({})

  // ── Form Tambah / Edit ──
  const openCreate = () => { setForm(emptyForm); setEditItem(null); setShowForm(true) }
  const openEdit = (item) => {
    setForm({
      vendorAsal: item.vendorAsal || '', provinsi: item.provinsi, nomorSbg: item.nomorSbg, namaBarang: item.namaBarang,
      gramasi: item.gramasi ?? '', karat: item.karat,
      totalHarga: item.totalHarga ?? '', beaLelang: item.beaLelang ?? '', keterangan: item.keterangan || '',
    })
    setEditItem(item)
    setShowForm(true)
  }
  const paymentSmt = (parseFloat(form.totalHarga) || 0) + (parseFloat(form.beaLelang) || 0)
  const kategoriPreview = () => {
    const k = parseFloat(String(form.karat).replace(',', '.'))
    return (!isNaN(k) && Math.round(k) === 24) ? 'Logam Mulia' : 'Perhiasan'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.vendorAsal) return toast.error('Vendor wajib dipilih')
    setFormLoading(true)
    try {
      const payload = {
        vendorAsal: form.vendorAsal, provinsi: form.provinsi, nomorSbg: form.nomorSbg, namaBarang: form.namaBarang,
        gramasi: form.gramasi, karat: form.karat,
        totalHarga: form.totalHarga === '' ? 0 : form.totalHarga,
        beaLelang: form.beaLelang === '' ? 0 : form.beaLelang,
        keterangan: form.keterangan,
      }
      if (editItem) {
        const { data } = await api.put(`/barang-art/${editItem.id}`, payload)
        toast.success(data.message || 'Data berhasil diperbarui')
      } else {
        const { data } = await api.post('/barang-art', payload)
        toast.success(data.message || 'Data berhasil ditambahkan')
      }
      setShowForm(false)
      fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan data')
    } finally {
      setFormLoading(false)
    }
  }

  // ── Tandai Terjual (Logam Mulia) ──
  const openSold = (list) => {
    if (!list || list.length === 0) return toast.error('Pilih minimal 1 barang')
    setSoldTargets(list)
    setSoldShared({ tanggalJual: todayStr(), vendor: '', nomorSku: '', keterangan: '' })
    setSoldNominal(Object.fromEntries(list.map(i => [i.id, ''])))
    setShowSold(true)
  }
  const totalNominalBatch = soldTargets.reduce((s, i) => s + (parseFloat(soldNominal[i.id]) || 0), 0)
  const handleMarkSold = async (e) => {
    e.preventDefault()
    if (!soldShared.tanggalJual) return toast.error('Tanggal Jual wajib diisi')
    if (!soldShared.vendor.trim()) return toast.error('Vendor pembeli wajib diisi')
    if (!soldShared.nomorSku.trim()) return toast.error('Nomor SKU wajib diisi')
    const kosong = soldTargets.find(i => soldNominal[i.id] === '' || soldNominal[i.id] === undefined)
    if (kosong) return toast.error(`Nominal Jual untuk ${kosong.kodeBarang} belum diisi`)
    setSoldLoading(true)
    try {
      await api.patch('/barang-art/jual', {
        tanggalJual: soldShared.tanggalJual, vendor: soldShared.vendor, nomorSku: soldShared.nomorSku, keterangan: soldShared.keterangan,
        items: soldTargets.map(i => ({ id: i.id, nominalJual: soldNominal[i.id] })),
      })
      toast.success(`${soldTargets.length} barang ditandai terjual`)
      setShowSold(false); clearSelection(); fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menandai terjual')
    } finally {
      setSoldLoading(false)
    }
  }

  // ── Lebur (Perhiasan) ──
  const openLebur = (list) => {
    if (!list || list.length === 0) return toast.error('Pilih minimal 1 barang')
    setLeburTargets(list)
    setLeburShared({ tanggalLebur: todayStr(), keterangan: '', berat: '', kadarXrf: '' })
    setShowLebur(true)
  }
  const leburTotalCogs = leburTargets.reduce((s, i) => s + (parseFloat(i.cogs) || 0), 0)
  const handleLebur = async (e) => {
    e.preventDefault()
    if (!leburShared.berat || parseFloat(leburShared.berat) <= 0) return toast.error('Berat Cukim wajib diisi (angka > 0)')
    if (!leburShared.kadarXrf.trim()) return toast.error('Kadar XRF wajib diisi')
    setLeburLoading(true)
    try {
      const { data } = await api.patch('/barang-art/lebur', {
        tanggalLebur: leburShared.tanggalLebur, keterangan: leburShared.keterangan,
        berat: leburShared.berat, kadarXrf: leburShared.kadarXrf,
        ids: leburTargets.map(i => i.id),
      })
      toast.success(data.message || `${leburTargets.length} barang dilebur`)
      setShowLebur(false); clearSelection(); fetchItems(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal melebur')
    } finally {
      setLeburLoading(false)
    }
  }

  // ── Foto Barang (Barang Eksport) ──
  const openFoto = (item) => {
    setFotoItem(item)
    setFotoFile(null)
    setFotoPreview(item.gambar || null)
    setShowFoto(true)
  }
  const onPickFoto = (e) => {
    const f = e.target.files?.[0] || null
    if (!f) return
    if (f.size > 5 * 1024 * 1024) return toast.error('Ukuran gambar maksimal 5 MB')
    setFotoFile(f)
    setFotoPreview(URL.createObjectURL(f))
  }
  const handleUploadFoto = async () => {
    if (!fotoFile) return toast.error('Pilih file gambar terlebih dahulu')
    setFotoLoading(true)
    try {
      const fd = new FormData()
      fd.append('gambar', fotoFile)
      const { data } = await api.post(`/barang-art/${fotoItem.id}/gambar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Foto berhasil diunggah')
      setItems(prev => prev.map(i => i.id === fotoItem.id ? data.data : i))
      setFotoItem(data.data)
      setFotoFile(null)
      setFotoPreview(data.data.gambar || null)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal mengunggah foto')
    } finally {
      setFotoLoading(false)
    }
  }
  const handleDeleteFoto = async () => {
    if (!fotoItem?.gambar) { setFotoFile(null); setFotoPreview(null); return }
    if (!window.confirm('Hapus foto barang ini?')) return
    setFotoLoading(true)
    try {
      const { data } = await api.delete(`/barang-art/${fotoItem.id}/gambar`)
      toast.success('Foto berhasil dihapus')
      setItems(prev => prev.map(i => i.id === fotoItem.id ? data.data : i))
      setFotoItem(data.data)
      setFotoFile(null)
      setFotoPreview(null)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus foto')
    } finally {
      setFotoLoading(false)
    }
  }

  // ── Pindah kategori / lokasi ──
  const bulkMovePerhiasan = async (list) => {
    if (!window.confirm(`Pindahkan ${list.length} barang dari Logam Mulia ke Perhiasan?`)) return
    try {
      await api.patch('/barang-art/pindah-perhiasan', { ids: list.map(i => i.id) })
      toast.success(`${list.length} barang dipindah ke Perhiasan`)
      clearSelection(); fetchItems(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal memindahkan') }
  }
  const bulkMoveEksport = async (list) => {
    if (!window.confirm(`Pindahkan ${list.length} barang perhiasan ke Barang Eksport?`)) return
    try {
      await api.patch('/barang-art/pindah-eksport', { ids: list.map(i => i.id) })
      toast.success(`${list.length} barang dipindah ke Barang Eksport`)
      clearSelection(); fetchItems(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal memindahkan') }
  }
  const bulkKembalikan = async (list, labelTujuan = 'daftar aktif') => {
    if (!window.confirm(`Kembalikan ${list.length} barang ke ${labelTujuan}?`)) return
    try {
      await Promise.all(list.map(i => api.patch(`/barang-art/${i.id}/aktifkan`)))
      toast.success(`${list.length} barang dikembalikan`)
      clearSelection(); fetchItems(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal mengembalikan') }
  }
  const handleRevertAktif = async (item) => {
    const tujuan = item.kategori === 'LOGAM_MULIA' ? 'Logam Mulia' : 'Perhiasan'
    if (!window.confirm(`Kembalikan ${item.kodeBarang} ke daftar aktif (${tujuan})? Data jual/lebur/eksport akan dikosongkan.`)) return
    try {
      await api.patch(`/barang-art/${item.id}/aktifkan`)
      toast.success('Barang dikembalikan ke daftar aktif')
      setSelectedMap(prev => { const n = { ...prev }; delete n[item.id]; return n })
      fetchItems(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal mengembalikan') }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus data ${item.kodeBarang} (${item.nomorSbg})?`)) return
    try {
      await api.delete(`/barang-art/${item.id}`)
      toast.success('Data berhasil dihapus')
      setSelectedMap(prev => { const n = { ...prev }; delete n[item.id]; return n })
      fetchItems(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menghapus') }
  }

  const bulkDelete = async (list) => {
    if (!list || list.length === 0) return toast.error('Pilih minimal 1 barang')
    if (!window.confirm(`Hapus ${list.length} barang terpilih? Tindakan ini permanen dan tidak bisa dibatalkan.`)) return
    try {
      const { data } = await api.delete('/barang-art', { data: { ids: list.map(i => i.id) } })
      toast.success(data.message || `${list.length} barang berhasil dihapus`)
      clearSelection(); fetchItems(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menghapus') }
  }

  const handleExport = async () => {
    try {
      const params = { search, tahap: tahapParam() }
      if (kategori) params.kategori = kategori
      const res = await api.get('/barang-art/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `Barang-ART-${Date.now()}.xlsx`; a.click()
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
      const { data } = await api.post('/barang-art/import/excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImportResult(data.data)
      toast.success(`Import selesai: ${data.data.berhasil} baru (${data.data.logamMulia} LM, ${data.data.perhiasan} perhiasan)`)
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

  const title = isEksport ? 'Barang ART — Barang Eksport'
    : isHistory ? 'Barang ART — History'
    : `Barang ART — ${KATEGORI_LABEL[kategori]}`

  const showStatusCol = isHistory
  const showSaleCols = isHistory
  const showEksportCol = isEksport
  const showFotoCol = isEksport // foto barang hanya di Barang Eksport
  // Perhiasan aktif tidak berkode → sembunyikan kolom Kode. (LM, Eksport, History tetap tampil.)
  const showKodeCol = !isPerhiasan

  return (
    <div className="space-y-4">
      {/* Judul */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brown-800 dark:text-gold-300">{title}</h1>
        <div className="flex gap-2 text-xs">
          {isInventory && <span className="badge-warning">Aktif: {summary.totalAktif}</span>}
          {isEksport && <span className="badge-info">Eksport: {summary.totalEksport}</span>}
          {isHistory && <>
            <span className="badge-success">Terjual: {summary.totalTerjual}</span>
            <span className="badge-gray">Dilebur: {summary.totalDilebur}</span>
          </>}
        </div>
      </div>

      {/* Tabs History */}
      {isHistory && (
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'HISTORY', label: 'Semua', count: summary.totalTerjual + summary.totalDilebur },
            { value: 'TERJUAL', label: 'Terjual (Logam Mulia)', count: summary.totalTerjual },
            { value: 'DILEBUR', label: 'Dilebur (Perhiasan)', count: summary.totalDilebur },
          ].map(tab => (
            <button key={tab.value} onClick={() => setHistoryTab(tab.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${historyTab === tab.value
                ? 'bg-gold-500 text-brown-900 border-gold-500'
                : 'bg-white dark:bg-brown-900 text-brown-600 dark:text-brown-300 border-brown-200 dark:border-brown-700 hover:bg-brown-50 dark:hover:bg-brown-800'}`}>
              {tab.label} <span className="opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {isInventory && <>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Tambah Data
            </button>
            <button onClick={openImport} className="btn-outline flex items-center gap-2 text-sm">
              <Upload className="w-4 h-4" /> Import Excel
            </button>
          </>}
          <button onClick={handleExport} className="btn-outline flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Download Excel
          </button>

          <div className="flex-1 min-w-48">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari kode, No SBG, nama, provinsi, vendor, SKU..." className="input-field pl-9" />
            </div>
          </div>

          <button onClick={() => fetchItems(pagination.page)} className="btn-outline p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Bar aksi massal */}
        {selectable && selectedList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-gold-50 dark:bg-brown-800/50 border border-gold-200 dark:border-brown-700 px-4 py-2.5">
            <span className="text-sm font-medium text-brown-700 dark:text-gold-200">{selectedList.length} barang dipilih</span>
            {isLM && <>
              <button onClick={() => openSold(selectedList)} className="btn-primary flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Tandai Terjual
              </button>
              <button onClick={() => bulkMovePerhiasan(selectedList)} className="btn-outline flex items-center gap-2 text-sm">
                <ArrowRightLeft className="w-4 h-4" /> Pindah ke Perhiasan
              </button>
            </>}
            {isPerhiasan && <>
              <button onClick={() => openLebur(selectedList)} className="btn-primary flex items-center gap-2 text-sm">
                <Flame className="w-4 h-4" /> Lebur
              </button>
              <button onClick={() => bulkMoveEksport(selectedList)} className="btn-outline flex items-center gap-2 text-sm">
                <Ship className="w-4 h-4" /> Pindah ke Eksport
              </button>
            </>}
            {isEksport && (
              <button onClick={() => bulkKembalikan(selectedList, 'Perhiasan')} className="btn-outline flex items-center gap-2 text-sm">
                <RotateCcw className="w-4 h-4" /> Kembalikan ke Perhiasan
              </button>
            )}
            <button onClick={() => bulkDelete(selectedList)}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors">
              <Trash2 className="w-4 h-4" /> Hapus {selectedList.length} barang
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
                {selectable && (
                  <th className="table-header w-10 text-center">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllPage}
                      disabled={selectableOnPage.length === 0}
                      title="Pilih semua di halaman ini"
                      className="accent-gold-500 w-4 h-4 cursor-pointer disabled:opacity-30" />
                  </th>
                )}
                <th className="table-header w-12">No</th>
                {showKodeCol && <SortTh col="kodeBarang">Kode Barang</SortTh>}
                <SortTh col="provinsi">Provinsi</SortTh>
                <SortTh col="vendorAsal">Vendor</SortTh>
                <SortTh col="nomorSbg">No SBG</SortTh>
                <SortTh col="namaBarang">Barang</SortTh>
                <SortTh col="gramasi">Berat</SortTh>
                <SortTh col="karat">Karat</SortTh>
                <SortTh col="totalHarga">Total Harga</SortTh>
                <SortTh col="beaLelang">Bea Lelang</SortTh>
                <SortTh col="cogs">Payment SMT</SortTh>
                <th className="table-header">Keterangan</th>
                {showStatusCol && <th className="table-header">Status</th>}
                {showSaleCols && <>
                  <th className="table-header">Tanggal</th>
                  <th className="table-header">Nominal Jual</th>
                  <th className="table-header">Vendor Pembeli</th>
                  <th className="table-header">Nomor SKU</th>
                </>}
                {showEksportCol && <SortTh col="tanggalEksport">Tanggal Eksport</SortTh>}
                {showFotoCol && <th className="table-header text-center">Foto</th>}
                <th className="table-header text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={22} className="text-center py-12 text-brown-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Memuat data...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={22} className="text-center py-12 text-brown-400">Tidak ada data ditemukan</td></tr>
              ) : items.map((item, idx) => (
                <tr key={item.id} className={`transition-colors ${selectedMap[item.id] ? 'bg-gold-50 dark:bg-brown-800/40' : 'hover:bg-gold-50/50 dark:hover:bg-brown-800/30'}`}>
                  {selectable && (
                    <td className="table-cell text-center">
                      {canSelect(item) ? (
                        <input type="checkbox" checked={!!selectedMap[item.id]} onChange={() => toggleSelect(item)}
                          className="accent-gold-500 w-4 h-4 cursor-pointer" />
                      ) : <span className="text-brown-300">—</span>}
                    </td>
                  )}
                  <td className="table-cell text-center text-brown-400">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  {showKodeCol && <td className="table-cell font-mono font-semibold text-brown-800 dark:text-gold-300">{item.kodeBarang || '-'}</td>}
                  <td className="table-cell">{item.provinsi}</td>
                  <td className="table-cell whitespace-nowrap">{item.vendorAsal || '-'}</td>
                  <td className="table-cell font-mono">{item.nomorSbg}</td>
                  <td className="table-cell">{item.namaBarang}</td>
                  <td className="table-cell text-right font-mono whitespace-nowrap">{formatNumber(item.gramasi)} gr</td>
                  <td className="table-cell whitespace-nowrap">{item.karat}</td>
                  <td className="table-cell text-right font-mono">{formatRupiah(item.totalHarga)}</td>
                  <td className="table-cell text-right font-mono">{formatRupiah(item.beaLelang)}</td>
                  <td className="table-cell text-right font-mono font-semibold">{formatRupiah(item.cogs)}</td>
                  <td className="table-cell max-w-36 truncate text-brown-500" title={item.keterangan}>{item.keterangan || '-'}</td>
                  {showStatusCol && (
                    <td className="table-cell"><span className={TAHAP_BADGE[item.tahap]}>{TAHAP_LABEL[item.tahap]}</span></td>
                  )}
                  {showSaleCols && <>
                    <td className="table-cell whitespace-nowrap text-brown-600 dark:text-brown-300">
                      {item.tahap === 'TERJUAL' ? (item.tanggalJual ? formatDate(item.tanggalJual) : '-')
                        : item.tahap === 'DILEBUR' ? (item.tanggalLebur ? formatDate(item.tanggalLebur) : '-') : '-'}
                    </td>
                    <td className="table-cell text-right font-mono font-semibold">{item.nominalJual != null ? formatRupiah(item.nominalJual) : '-'}</td>
                    <td className="table-cell whitespace-nowrap">{item.vendor || '-'}</td>
                    <td className="table-cell font-mono">{item.nomorSku || '-'}</td>
                  </>}
                  {showEksportCol && (
                    <td className="table-cell whitespace-nowrap text-brown-600 dark:text-brown-300">{item.tanggalEksport ? formatDate(item.tanggalEksport) : '-'}</td>
                  )}
                  {showFotoCol && (
                    <td className="table-cell">
                      <div className="flex justify-center">
                        {item.gambar ? (
                          <button onClick={() => openFoto(item)} title="Lihat / ganti foto"
                            className="w-11 h-11 rounded-lg overflow-hidden border border-brown-200 dark:border-brown-700 hover:ring-2 hover:ring-gold-400 transition-all">
                            <img src={item.gambar} alt={item.namaBarang} className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <button onClick={() => openFoto(item)} title="Tambah foto"
                            className="w-11 h-11 rounded-lg border border-dashed border-brown-300 dark:border-brown-600 flex items-center justify-center text-brown-400 hover:text-gold-500 hover:border-gold-400 transition-colors">
                            <ImageIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="table-cell">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setViewItem(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Detail">
                        <Eye className="w-4 h-4" />
                      </button>
                      {(isInventory || isEksport) && (
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/20 transition-colors" title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {isLM && (
                        <button onClick={() => bulkMovePerhiasan([item])} className="p-1.5 rounded-lg text-brown-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Pindah ke Perhiasan">
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      )}
                      {isPerhiasan && <>
                        <button onClick={() => openLebur([item])} className="p-1.5 rounded-lg text-brown-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors" title="Lebur">
                          <Flame className="w-4 h-4" />
                        </button>
                        <button onClick={() => bulkMoveEksport([item])} className="p-1.5 rounded-lg text-brown-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" title="Pindah ke Eksport">
                          <Ship className="w-4 h-4" />
                        </button>
                      </>}
                      {(isEksport || isHistory) && (
                        <button onClick={() => handleRevertAktif(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title="Kembalikan ke daftar aktif">
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

      {/* Form Modal (Tambah / Edit) */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)}
        title={editItem ? `Edit — ${editItem.kodeBarang}` : 'Tambah Barang ART'} size="lg"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-outline">Batal</button>
          <button onClick={handleSubmit} disabled={formLoading} className="btn-primary">
            {formLoading ? 'Menyimpan...' : editItem ? 'Simpan Perubahan' : 'Tambah Data'}
          </button>
        </>}>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Vendor *">
            <select value={form.vendorAsal} onChange={e => setForm(p => ({ ...p, vendorAsal: e.target.value }))} className="input-field" required>
              <option value="">— Pilih Vendor —</option>
              {VENDOR_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </FormField>
          <FormField label="Provinsi *">
            <input value={form.provinsi} onChange={e => setForm(p => ({ ...p, provinsi: e.target.value }))} className="input-field" placeholder="PT. Gadai Mas NTB" required />
          </FormField>
          <FormField label="No SBG *">
            <input value={form.nomorSbg} onChange={e => setForm(p => ({ ...p, nomorSbg: e.target.value }))} className="input-field" placeholder="0013320226..." required />
          </FormField>
          <FormField label="Barang *">
            <input value={form.namaBarang} onChange={e => setForm(p => ({ ...p, namaBarang: e.target.value }))} className="input-field" placeholder="CINCIN / KALUNG / LM ANTAM" required />
          </FormField>
          <FormField label="Berat (gram) *">
            <input type="number" step="0.001" min="0" value={form.gramasi} onChange={e => setForm(p => ({ ...p, gramasi: e.target.value }))} className="input-field" placeholder="0" required />
          </FormField>
          <FormField label="Karat *">
            <input value={form.karat} onChange={e => setForm(p => ({ ...p, karat: e.target.value }))} className="input-field" placeholder="24 / 21 / 16" required />
          </FormField>
          <FormField label="Total Harga (Rp)">
            <input type="number" min="0" value={form.totalHarga} onChange={e => setForm(p => ({ ...p, totalHarga: e.target.value }))} className="input-field" placeholder="0" />
          </FormField>
          <FormField label="Bea Lelang (Rp)">
            <input type="number" min="0" value={form.beaLelang} onChange={e => setForm(p => ({ ...p, beaLelang: e.target.value }))} className="input-field" placeholder="0" />
          </FormField>
          <FormField label="Payment SMT (COGS)">
            <input value={formatRupiah(paymentSmt)} className="input-field bg-brown-50 dark:bg-brown-800/50" readOnly tabIndex={-1} />
          </FormField>
          <div className="flex items-end">
            <p className="text-xs text-brown-500 dark:text-brown-400">
              Kategori otomatis: <b>{kategoriPreview()}</b> (dari karat).{' '}
              {kategoriPreview() === 'Logam Mulia'
                ? <>Kode Barang <b>LMN/LMS</b> otomatis dari vendor.</>
                : <>Perhiasan <b>tidak berkode</b> (kode EKS dibuat saat masuk Barang Eksport).</>}
            </p>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Keterangan">
              <textarea value={form.keterangan} onChange={e => setForm(p => ({ ...p, keterangan: e.target.value }))} className="input-field" rows={2} placeholder="Deskripsi barang..." />
            </FormField>
          </div>
          {!editItem && (
            <p className="sm:col-span-2 text-xs text-brown-500 dark:text-brown-400">
              Payment SMT (COGS) = Total Harga + Bea Lelang. Data baru berstatus <b>Aktif</b> & masuk daftar sesuai karat.
            </p>
          )}
        </form>
      </Modal>

      {/* Modal Import Excel */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Import Excel — Barang ART" size="lg"
        footer={<>
          <button onClick={() => setShowImport(false)} className="btn-outline">Tutup</button>
          <button onClick={handleImport} disabled={importLoading || !importFile} className="btn-primary">
            {importLoading ? 'Mengimport...' : 'Mulai Import'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="rounded-xl bg-brown-50 dark:bg-brown-800/50 border border-brown-200 dark:border-brown-700 px-4 py-3 text-sm text-brown-600 dark:text-brown-300">
            <p className="font-medium text-brown-800 dark:text-gold-300 mb-1">Format kolom template:</p>
            <p><b>Kode Barang</b>, <b>Provinsi</b>, <b>Vendor</b>, <b>No SBG</b>, <b>Keterangan</b>, <b>Barang</b>, <b>Berat</b>, <b>Karat</b>, <b>Total Harga</b>, <b>Bea Lelang</b>, <b>Payment SMT</b></p>
            <ul className="text-xs text-brown-500 dark:text-brown-400 mt-2 list-disc pl-4 space-y-1">
              <li><b>Kategori otomatis</b> dari Karat: 24 → Logam Mulia, selain itu → Perhiasan.</li>
              <li><b>Logam Mulia berkode otomatis</b> dari Vendor: Gadai Mas → <b>LMN</b>, Gadai Mulia → <b>LMS</b> (nomor berjalan, tak dipakai ulang). Kolom Kode di Excel diabaikan.</li>
              <li><b>Perhiasan tidak berkode.</b> Kode <b>EKS</b> baru dibuat saat barang dipindah ke Barang Eksport.</li>
              <li><b>Payment SMT</b> = COGS/modal. Bila kosong, dihitung dari Total Harga + Bea Lelang.</li>
              <li>Satu file bisa berisi campuran Logam Mulia & Perhiasan — otomatis dipisah.</li>
            </ul>
          </div>

          <div>
            <label className="label">Pilih File Excel (.xlsx / .xls)</label>
            <input type="file" accept=".xlsx,.xls" onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null) }} className="input-field" />
          </div>

          {importResult && (
            <div className="card bg-brown-50 dark:bg-brown-800/50 border border-brown-200 dark:border-brown-700 space-y-2">
              <p className="font-semibold text-brown-800 dark:text-gold-300">Hasil Import</p>
              <div className="grid grid-cols-5 gap-2 text-center">
                {[['Total', importResult.total, 'badge-info'], ['Berhasil', importResult.berhasil, 'badge-success'], ['Logam Mulia', importResult.logamMulia ?? 0, 'badge-gold'], ['Perhiasan', importResult.perhiasan ?? 0, 'badge-gold'], ['Gagal', importResult.gagal, 'badge-danger']].map(([l, v, c]) => (
                  <div key={l}>
                    <p className="text-xs text-brown-500 dark:text-brown-400">{l}</p>
                    <span className={`${c} text-base font-bold`}>{v}</span>
                  </div>
                ))}
              </div>
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

      {/* Modal Tandai Terjual */}
      <Modal isOpen={showSold} onClose={() => setShowSold(false)} title={`Tandai Terjual — ${soldTargets.length} barang`} size="lg"
        footer={<>
          <button onClick={() => setShowSold(false)} className="btn-outline">Batal</button>
          <button onClick={handleMarkSold} disabled={soldLoading} className="btn-primary">{soldLoading ? 'Menyimpan...' : 'Simpan'}</button>
        </>}>
        <form onSubmit={handleMarkSold} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Tanggal Jual *">
              <input type="date" value={soldShared.tanggalJual} onChange={e => setSoldShared(p => ({ ...p, tanggalJual: e.target.value }))} className="input-field" required />
            </FormField>
            <FormField label="Vendor Pembeli *">
              <input value={soldShared.vendor} onChange={e => setSoldShared(p => ({ ...p, vendor: e.target.value }))} className="input-field" placeholder="Nama pembeli" required />
            </FormField>
            <FormField label="Nomor SKU *">
              <input value={soldShared.nomorSku} onChange={e => setSoldShared(p => ({ ...p, nomorSku: e.target.value }))} className="input-field" placeholder="SKU-001" required />
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
                    <p className="text-sm font-medium text-brown-800 dark:text-gold-200 font-mono">{i.kodeBarang} · {i.nomorSbg}</p>
                    <p className="text-xs text-brown-500 truncate">{i.namaBarang} · {formatNumber(i.gramasi)} gr · {i.karat}</p>
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

      {/* Modal Lebur → Cukim */}
      <Modal isOpen={showLebur} onClose={() => setShowLebur(false)} title={`Lebur jadi Cukim — ${leburTargets.length} barang`} size="md"
        footer={<>
          <button onClick={() => setShowLebur(false)} className="btn-outline">Batal</button>
          <button onClick={handleLebur} disabled={leburLoading} className="btn-primary">{leburLoading ? 'Menyimpan...' : 'Lebur jadi Cukim'}</button>
        </>}>
        <form onSubmit={handleLebur} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Tanggal Lebur *">
              <input type="date" value={leburShared.tanggalLebur} onChange={e => setLeburShared(p => ({ ...p, tanggalLebur: e.target.value }))} className="input-field" required />
            </FormField>
            <FormField label="Berat Cukim (gram) *">
              <input type="number" step="0.001" min="0" value={leburShared.berat} onChange={e => setLeburShared(p => ({ ...p, berat: e.target.value }))} className="input-field" placeholder="0" required />
            </FormField>
            <FormField label="Kadar XRF *">
              <input value={leburShared.kadarXrf} onChange={e => setLeburShared(p => ({ ...p, kadarXrf: e.target.value }))} className="input-field" placeholder='mis. 99.9% / 85K' required />
            </FormField>
          </div>
          <div className="rounded-xl bg-gold-50 dark:bg-brown-800/50 border border-gold-200 dark:border-brown-700 px-4 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-brown-600 dark:text-brown-300">COGS Cukim (total Payment SMT barang terpilih)</span>
              <span className="text-base font-bold text-brown-800 dark:text-gold-300 font-mono">{formatRupiah(leburTotalCogs)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-brown-600 dark:text-brown-300">COGS/gram (COGS ÷ Berat)</span>
              <span className="text-sm font-semibold text-brown-700 dark:text-gold-300 font-mono">
                {parseFloat(leburShared.berat) > 0 ? `${formatRupiah(leburTotalCogs / parseFloat(leburShared.berat))}/gr` : '-'}
              </span>
            </div>
          </div>
          <FormField label="Keterangan">
            <textarea value={leburShared.keterangan} onChange={e => setLeburShared(p => ({ ...p, keterangan: e.target.value }))} className="input-field" rows={2} placeholder="Catatan peleburan (opsional)..." />
          </FormField>
          <p className="text-xs text-brown-500 dark:text-brown-400">Barang terpilih digabung menjadi <b>1 Cukim</b> (No CKM otomatis). Barang tetap tercatat di <b>History</b> (Dilebur) dan terhubung ke Cukim-nya.</p>
          <div className="rounded-xl border border-brown-200 dark:border-brown-700 max-h-56 overflow-y-auto divide-y divide-brown-100 dark:divide-brown-800">
            {leburTargets.map(i => (
              <div key={i.id} className="px-3 py-2">
                <p className="text-sm font-medium text-brown-800 dark:text-gold-200 font-mono">{i.kodeBarang} · {i.nomorSbg}</p>
                <p className="text-xs text-brown-500 truncate">{i.namaBarang} · {formatNumber(i.gramasi)} gr · {i.karat}</p>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      {/* Modal Foto Barang */}
      <Modal isOpen={showFoto} onClose={() => setShowFoto(false)}
        title={`Foto Barang — ${fotoItem?.kodeBarang || fotoItem?.nomorSbg || ''}`} size="md"
        footer={<>
          <button onClick={() => setShowFoto(false)} className="btn-outline">Tutup</button>
          <button onClick={handleUploadFoto} disabled={fotoLoading || !fotoFile} className="btn-primary">
            {fotoLoading ? 'Menyimpan...' : fotoItem?.gambar ? 'Ganti Foto' : 'Unggah Foto'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="rounded-xl border border-brown-200 dark:border-brown-700 bg-brown-50 dark:bg-brown-800/40 aspect-square max-h-72 mx-auto overflow-hidden flex items-center justify-center">
            {fotoPreview ? (
              <img src={fotoPreview} alt="Foto barang" className="w-full h-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-brown-400">
                <ImageIcon className="w-10 h-10" />
                <span className="text-sm">Belum ada foto</span>
              </div>
            )}
          </div>

          <div>
            <label className="label">Pilih Foto (JPG, PNG, WEBP · maks 5 MB)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickFoto} className="input-field" />
          </div>

          {fotoItem?.gambar && (
            <button onClick={handleDeleteFoto} disabled={fotoLoading}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> Hapus foto saat ini
            </button>
          )}
        </div>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Detail — ${viewItem?.kodeBarang || viewItem?.nomorSbg}`} size="md">
        {viewItem && (
          <>
          {viewItem.gambar && (
            <div className="mb-4 rounded-xl overflow-hidden border border-brown-200 dark:border-brown-700 bg-brown-50 dark:bg-brown-800/40 flex items-center justify-center max-h-64">
              <img src={viewItem.gambar} alt={viewItem.namaBarang} className="w-full h-full object-contain max-h-64" />
            </div>
          )}
          <dl className="space-y-3">
            {[
              ['Kode Barang', viewItem.kodeBarang || '-'],
              ['Kategori', KATEGORI_LABEL[viewItem.kategori]],
              ['Tahap', TAHAP_LABEL[viewItem.tahap]],
              ['Vendor', viewItem.vendorAsal || '-'],
              ['Provinsi', viewItem.provinsi],
              ['No SBG', viewItem.nomorSbg],
              ['Barang', viewItem.namaBarang],
              ['Berat', `${formatNumber(viewItem.gramasi)} gr`],
              ['Karat', viewItem.karat],
              ['Total Harga', formatRupiah(viewItem.totalHarga)],
              ['Bea Lelang', formatRupiah(viewItem.beaLelang)],
              ['Payment SMT (COGS)', formatRupiah(viewItem.cogs)],
              ['Keterangan', viewItem.keterangan || '-'],
              ['Tanggal Jual', viewItem.tanggalJual ? formatDate(viewItem.tanggalJual) : '-'],
              ['Nominal Jual', viewItem.nominalJual != null ? formatRupiah(viewItem.nominalJual) : '-'],
              ['Vendor Pembeli', viewItem.vendor || '-'],
              ['Nomor SKU', viewItem.nomorSku || '-'],
              ['Tanggal Lebur', viewItem.tanggalLebur ? formatDate(viewItem.tanggalLebur) : '-'],
              ['Tanggal Eksport', viewItem.tanggalEksport ? formatDate(viewItem.tanggalEksport) : '-'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-brown-50 dark:border-brown-800 gap-4">
                <dt className="text-sm text-brown-500 dark:text-brown-400 shrink-0">{k}</dt>
                <dd className="text-sm font-medium text-brown-800 dark:text-gold-200 text-right">{v}</dd>
              </div>
            ))}
          </dl>
          </>
        )}
      </Modal>
    </div>
  )
}
