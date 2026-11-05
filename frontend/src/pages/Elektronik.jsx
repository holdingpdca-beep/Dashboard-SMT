import { useState, useEffect, useRef } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { useAuth } from '../contexts/AuthContext'
import { formatRupiah, formatDate, GRADE_COLORS, JENIS_PEMBELI_OPTIONS, JENIS_PEMBELI_LABELS } from '../utils/format'
import { printStrukPDF, downloadStrukPDF } from '../utils/pdfStruk'
import { terbilang } from '../utils/terbilang'
import { Plus, Upload, Download, Search, Filter, RefreshCw, Edit2, Trash2, Eye, X, ChevronLeft, ChevronRight, ArrowUpDown, ShoppingCart, Printer } from 'lucide-react'

const GRADE_OPTIONS = ['A', 'B', 'C', 'D']
// Pilihan jenis barang (bisa pilih dari daftar atau ketik sendiri untuk yang lain)
const JENIS_BARANG_OPTIONS = ['TELEVISI', 'HANDPHONE', 'TABLET', 'KONSOL', 'KAMERA', 'SMART WATCH', 'LAPTOP', 'DRONE']

const PPN_RATE = 0.011 // 1,1%
const emptyJual = { namaPelanggan: '', noTelepon: '', tanggal: new Date().toISOString().split('T')[0], namaSales: '', jenisPembeli: 'KARYAWAN_INTERNAL' }

// Perhitungan harga jual dari COGS (harus sama dengan backend hitungHarga):
// HJ MIN = COGS +17% (bulat ke atas ribuan), HJ MAX = COGS +24% (bulat ke atas ribuan),
// HARGA SMT = HJ MAX bulat ke atas puluhan ribu.
const hitungHarga = (cogsRaw) => {
  const cogs = parseFloat(cogsRaw) || 0
  const hjMin = Math.ceil((cogs * 1.17) / 1000) * 1000
  const hjMax = Math.ceil((cogs * 1.24) / 1000) * 1000
  const hargaSmt = Math.ceil(hjMax / 10000) * 10000
  return { hjMin, hjMax, hargaSmt }
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

const emptyForm = { nomorSbg: '', tanggalLelang: '', grade: 'A', jenisBarang: '', detailBarang: '', keterangan: '', cogs: '', perusahaan: 'SERBA_MAS' }

export default function Elektronik() {
  const { canSeeCogs, canDelete, user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 })

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ grade: '', status: '', perusahaan: '', startDate: '', endDate: '' })
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formLoading, setFormLoading] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importMapping, setImportMapping] = useState({ nomorSbg: '', grade: '', jenisBarang: '', detailBarang: '', keterangan: '', cogs: '', hjMin: '', hjMax: '', hargaSmt: '', tanggalLelang: '' })
  const [importColumns, setImportColumns] = useState([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const fileRef = useRef()

  // ── Penjualan (pilih barang → struk) ──
  const [selected, setSelected] = useState(new Set())
  const [showJual, setShowJual] = useState(false)
  const [jualForm, setJualForm] = useState(emptyJual)
  const [jualPrices, setJualPrices] = useState({}) // { [id]: { net, total } }
  const [jualLoading, setJualLoading] = useState(false)
  const [struk, setStruk] = useState(null)

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelected(prev => {
      const allIds = items.map(i => i.id)
      const allSelected = allIds.length > 0 && allIds.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        allIds.forEach(id => next.delete(id))
        return next
      }
      return new Set([...prev, ...allIds])
    })
  }

  const openJual = () => {
    const chosen = items.filter(i => selected.has(i.id))
    if (chosen.length === 0) return toast.error('Pilih minimal 1 barang')
    // Prefill harga dengan HARGA SMT (bisa diubah manual)
    const prices = {}
    chosen.forEach(i => {
      const net = i.hargaSmt || 0
      prices[i.id] = { net: net ? String(net) : '', total: net ? String(Math.round(net * (1 + PPN_RATE))) : '' }
    })
    setJualPrices(prices)
    setJualForm(emptyJual)
    setShowJual(true)
  }

  const setNet = (id, val) => {
    const net = parseFloat(val) || 0
    setJualPrices(p => ({ ...p, [id]: { net: val, total: net ? String(Math.round(net * (1 + PPN_RATE))) : '' } }))
  }
  const setTotal = (id, val) => {
    const total = parseFloat(val) || 0
    setJualPrices(p => ({ ...p, [id]: { total: val, net: total ? String(Math.round(total / (1 + PPN_RATE))) : '' } }))
  }

  const chosenItems = items.filter(i => selected.has(i.id))
  const jualGrandTotal = chosenItems.reduce((s, i) => {
    const net = parseFloat(jualPrices[i.id]?.net) || 0
    return s + Math.round(net * (1 + PPN_RATE))
  }, 0)

  const handleJual = async () => {
    if (!jualForm.namaPelanggan.trim()) return toast.error('Nama pelanggan wajib diisi')
    if (!jualForm.namaSales.trim()) return toast.error('Nama sales wajib diisi')
    const payloadItems = chosenItems.map(i => ({ id: i.id, hargaJual: parseFloat(jualPrices[i.id]?.net) || 0 }))
    if (payloadItems.some(it => !it.hargaJual || it.hargaJual <= 0)) return toast.error('Harga setiap barang wajib diisi')
    // H-02: non-admin tidak boleh menjual di bawah HJ MIN (pra-cek; backend tetap menolak juga)
    if (!canSeeCogs()) {
      const dibawah = chosenItems.filter(i => {
        const net = parseFloat(jualPrices[i.id]?.net) || 0
        return i.hjMin != null && net < parseFloat(i.hjMin)
      })
      if (dibawah.length) {
        return toast.error(`Harga di bawah HJ MIN: ${dibawah.map(i => i.nomorSbg).join(', ')}. Hanya ADMIN yang dapat menjual di bawah HJ MIN.`)
      }
    }
    setJualLoading(true)
    try {
      const { data } = await api.post('/items/jual', { ...jualForm, items: payloadItems })
      setStruk(data.data)
      setShowJual(false)
      setSelected(new Set())
      toast.success(data.message || 'Penjualan berhasil')
      fetchItems()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memproses penjualan')
    } finally {
      setJualLoading(false)
    }
  }

  const fetchItems = async (page = 1) => {
    setLoading(true)
    try {
      const params = { page, limit: pagination.limit, sortBy, sortOrder, search, ...filters }
      const { data } = await api.get('/items', { params })
      setItems(data.data)
      setPagination(data.pagination)
    } catch (err) {
      toast.error('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [search, filters, sortBy, sortOrder])

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(p => p === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortOrder('asc') }
  }

  const handleFormChange = (field, val) => {
    setForm(p => ({ ...p, [field]: val }))
  }

  // Preview harga jual (HJ MIN/MAX/HARGA SMT) dihitung langsung dari COGS yang diketik
  const previewHarga = hitungHarga(form.cogs)

  const openCreate = () => { setForm(emptyForm); setEditItem(null); setShowForm(true) }
  const openEdit = (item) => {
    setForm({
      nomorSbg: item.nomorSbg,
      tanggalLelang: item.tanggalLelang ? item.tanggalLelang.split('T')[0] : '',
      grade: item.grade, jenisBarang: item.jenisBarang,
      detailBarang: item.detailBarang, keterangan: item.keterangan || '',
      cogs: item.cogs || '', perusahaan: item.perusahaan || 'SERBA_MAS',
    })
    setEditItem(item)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormLoading(true)
    try {
      if (editItem) {
        await api.put(`/items/${editItem.id}`, form)
        toast.success('Data berhasil diperbarui')
      } else {
        await api.post('/items', form)
        toast.success('Data berhasil ditambahkan')
      }
      setShowForm(false)
      fetchItems()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan data')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus data ${item.nomorSbg}?`)) return
    try {
      await api.delete(`/items/${item.id}`)
      toast.success('Data berhasil dihapus')
      fetchItems()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus')
    }
  }

  const handleExport = async () => {
    try {
      const params = { search, ...filters }
      const res = await api.get('/items/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `Data-Elektronik-${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Download berhasil')
    } catch { toast.error('Gagal download') }
  }

  const handleImportFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportFile(file)
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      import('xlsx').then(XLSX => {
        const wb = XLSX.read(ev.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
        if (rows.length > 0) setImportColumns(rows[0].map(String))
      })
    }
    reader.readAsBinaryString(file)
  }

  const handleImport = async () => {
    if (!importFile) return toast.error('Pilih file Excel terlebih dahulu')
    if (!importMapping.nomorSbg || !importMapping.jenisBarang || !importMapping.detailBarang || !importMapping.grade || !importMapping.cogs) {
      return toast.error('Mapping kolom wajib tidak lengkap')
    }
    setImportLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('mapping', JSON.stringify(importMapping))
      fd.append('perusahaan', filters.perusahaan || 'SERBA_MAS')
      const { data } = await api.post('/items/import/excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImportResult(data.data)
      toast.success('Import selesai')
      fetchItems()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal import')
    } finally {
      setImportLoading(false)
    }
  }

  const SortTh = ({ col, children }) => (
    <th className="table-header cursor-pointer select-none" onClick={() => handleSort(col)}>
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === col ? 'text-gold-500' : 'text-brown-400'}`} />
      </div>
    </th>
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Tambah Data
          </button>
          <button onClick={() => setShowImport(true)} className="btn-outline flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" /> Import Excel
          </button>
          <button onClick={handleExport} className="btn-outline flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Download Excel
          </button>
          <button
            onClick={openJual}
            disabled={selected.size === 0}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
          >
            <ShoppingCart className="w-4 h-4" /> Jual Barang{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>

          <div className="flex-1 min-w-48">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari SBG, jenis, detail..."
                className="input-field pl-9"
              />
            </div>
          </div>

          <select value={filters.grade} onChange={e => setFilters(p => ({ ...p, grade: e.target.value }))} className="input-field w-28">
            <option value="">Semua Grade</option>
            {GRADE_OPTIONS.map(g => <option key={g} value={g}>Grade {g}</option>)}
          </select>

          <button onClick={() => fetchItems()} className="btn-outline p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filter tanggal serah terima */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-brown-500 dark:text-brown-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Tanggal Serah Terima:
          </span>
          <input
            type="date"
            value={filters.startDate}
            onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))}
            className="input-field w-40 text-sm"
          />
          <span className="text-xs text-brown-400">s/d</span>
          <input
            type="date"
            value={filters.endDate}
            min={filters.startDate}
            onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))}
            className="input-field w-40 text-sm"
          />
          {(filters.startDate || filters.endDate) && (
            <button
              onClick={() => setFilters(p => ({ ...p, startDate: '', endDate: '' }))}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <X className="w-3 h-3" /> Reset Tanggal
            </button>
          )}
        </div>
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
                    className="accent-emerald-600 cursor-pointer"
                    checked={items.length > 0 && items.every(i => selected.has(i.id))}
                    onChange={toggleSelectAll}
                    title="Pilih semua di halaman ini"
                  />
                </th>
                <th className="table-header w-12">No</th>
                <SortTh col="tanggalLelang">Tanggal Serah Terima</SortTh>
                <SortTh col="nomorSbg">Nomor SBG</SortTh>
                <SortTh col="jenisBarang">Jenis Barang</SortTh>
                <SortTh col="grade">Grade</SortTh>
                <th className="table-header">Nama Barang</th>
                <th className="table-header">Keterangan</th>
                {canSeeCogs() && <SortTh col="cogs">COGS</SortTh>}
                <th className="table-header text-right">HJ MIN</th>
                <th className="table-header text-right">HJ MAX</th>
                <th className="table-header text-right">HARGA SMT</th>
                <th className="table-header text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} className="text-center py-12 text-brown-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Memuat data...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-12 text-brown-400">
                  Tidak ada data ditemukan
                </td></tr>
              ) : items.map((item, idx) => (
                <tr key={item.id} className={`transition-colors ${selected.has(item.id) ? 'bg-emerald-50/70 dark:bg-emerald-900/20' : 'hover:bg-gold-50/50 dark:hover:bg-brown-800/30'}`}>
                  <td className="table-cell text-center">
                    <input
                      type="checkbox"
                      className="accent-emerald-600 cursor-pointer"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td className="table-cell text-center text-brown-400">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="table-cell whitespace-nowrap">{formatDate(item.tanggalLelang)}</td>
                  <td className="table-cell font-mono font-medium text-brown-800 dark:text-gold-300">{item.nomorSbg}</td>
                  <td className="table-cell">{item.jenisBarang}</td>
                  <td className="table-cell">
                    <span className={GRADE_COLORS[item.grade]}>{item.grade}</span>
                  </td>
                  <td className="table-cell max-w-48 truncate" title={item.detailBarang}>{item.detailBarang}</td>
                  <td className="table-cell max-w-36 truncate text-brown-500" title={item.keterangan}>{item.keterangan || '-'}</td>
                  {canSeeCogs() && <td className="table-cell text-right font-mono">{formatRupiah(item.cogs)}</td>}
                  <td className="table-cell text-right font-mono">{formatRupiah(item.hjMin)}</td>
                  <td className="table-cell text-right font-mono">{formatRupiah(item.hjMax)}</td>
                  <td className="table-cell text-right font-mono font-semibold text-gold-700 dark:text-gold-300">{formatRupiah(item.hargaSmt)}</td>
                  <td className="table-cell">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setViewItem(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Detail">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/20 transition-colors" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {canDelete() && (
                        <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg text-brown-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Hapus">
                          <Trash2 className="w-4 h-4" />
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

      {/* Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? `Edit Data — ${editItem.nomorSbg}` : 'Tambah Data Elektronik'}
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
          <FormField label="Nomor SBG *">
            <input value={form.nomorSbg} onChange={e => handleFormChange('nomorSbg', e.target.value)} className="input-field" placeholder="SBG-001" required disabled={!!editItem} />
          </FormField>
          <FormField label="Tanggal Serah Terima">
            <input type="date" value={form.tanggalLelang} onChange={e => handleFormChange('tanggalLelang', e.target.value)} className="input-field" />
          </FormField>
          <FormField label="Jenis Barang *">
            <input
              list="jenis-barang-list"
              value={form.jenisBarang}
              onChange={e => handleFormChange('jenisBarang', e.target.value.toUpperCase())}
              className="input-field"
              placeholder="Pilih atau ketik (TELEVISI, HANDPHONE, dll)"
              required
            />
            <datalist id="jenis-barang-list">
              {JENIS_BARANG_OPTIONS.map(j => <option key={j} value={j} />)}
            </datalist>
          </FormField>
          <FormField label="Grade *">
            <select value={form.grade} onChange={e => handleFormChange('grade', e.target.value)} className="input-field" required>
              {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Nama Barang *">
              <input value={form.detailBarang} onChange={e => handleFormChange('detailBarang', e.target.value)} className="input-field" placeholder="Merk, tipe, spesifikasi" required />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Keterangan">
              <textarea value={form.keterangan} onChange={e => handleFormChange('keterangan', e.target.value)} className="input-field" rows={2} placeholder="Catatan tambahan..." />
            </FormField>
          </div>
          <FormField label="COGS *">
            <input type="number" value={form.cogs} onChange={e => handleFormChange('cogs', e.target.value)} className="input-field" placeholder="0" required min="0" />
          </FormField>
          <div className="space-y-2">
            <p className="label">Harga Jual (Otomatis dari COGS)</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-brown-400 mb-1">HJ MIN (+17%)</p>
                <input value={form.cogs ? `Rp ${previewHarga.hjMin.toLocaleString('id-ID')}` : '-'} className="input-field bg-brown-50 dark:bg-brown-800/50 text-brown-500 text-sm" readOnly />
              </div>
              <div>
                <p className="text-xs text-brown-400 mb-1">HJ MAX (+24%)</p>
                <input value={form.cogs ? `Rp ${previewHarga.hjMax.toLocaleString('id-ID')}` : '-'} className="input-field bg-brown-50 dark:bg-brown-800/50 text-brown-500 text-sm" readOnly />
              </div>
              <div>
                <p className="text-xs text-brown-400 mb-1">HARGA SMT</p>
                <input value={form.cogs ? `Rp ${previewHarga.hargaSmt.toLocaleString('id-ID')}` : '-'} className="input-field bg-gold-50 dark:bg-gold-900/20 text-gold-700 dark:text-gold-300 font-semibold text-sm" readOnly />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Detail — ${viewItem?.nomorSbg}`} size="md">
        {viewItem && (
          <dl className="space-y-3">
            {[
              ['Nomor SBG', viewItem.nomorSbg],
              ['Tanggal Serah Terima', formatDate(viewItem.tanggalLelang)],
              ['Jenis Barang', viewItem.jenisBarang],
              ['Grade', viewItem.grade],
              ['Nama Barang', viewItem.detailBarang],
              ['Keterangan', viewItem.keterangan || '-'],
              ...(canSeeCogs() ? [['COGS', formatRupiah(viewItem.cogs)]] : []),
              ['HJ MIN (+17%)', formatRupiah(viewItem.hjMin)],
              ['HJ MAX (+24%)', formatRupiah(viewItem.hjMax)],
              ['HARGA SMT', formatRupiah(viewItem.hargaSmt)],
              ['Tanggal Masuk', formatDate(viewItem.tanggalMasuk)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-brown-50 dark:border-brown-800">
                <dt className="text-sm text-brown-500 dark:text-brown-400">{k}</dt>
                <dd className="text-sm font-medium text-brown-800 dark:text-gold-200 text-right">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImport} onClose={() => { setShowImport(false); setImportFile(null); setImportResult(null) }} title="Import Excel" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Pilih File Excel</label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImportFileChange} className="input-field" />
          </div>

          {importColumns.length > 0 && (
            <div className="space-y-3">
              <p className="label">Mapping Kolom <span className="text-brown-400 font-normal">(petakan kolom Excel ke field database. HJ MIN/MAX/HARGA SMT opsional — kosongkan agar dihitung otomatis dari COGS)</span></p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'nomorSbg', label: 'Nomor SBG *' },
                  { key: 'tanggalLelang', label: 'Tanggal Serah Terima' },
                  { key: 'grade', label: 'Grade *' },
                  { key: 'jenisBarang', label: 'Jenis Barang *' },
                  { key: 'detailBarang', label: 'Nama Barang *' },
                  { key: 'cogs', label: 'COGS *' },
                  { key: 'hjMin', label: 'HJ MIN' },
                  { key: 'hjMax', label: 'HJ MAX' },
                  { key: 'hargaSmt', label: 'HARGA SMT' },
                  { key: 'keterangan', label: 'Keterangan' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="label text-xs">{label}</label>
                    <select value={importMapping[key]} onChange={e => setImportMapping(p => ({ ...p, [key]: e.target.value }))} className="input-field text-sm">
                      <option value="">-- Pilih Kolom --</option>
                      {importColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={handleImport} disabled={importLoading} className="btn-primary w-full">
                {importLoading ? 'Mengimport...' : 'Mulai Import'}
              </button>
            </div>
          )}

          {importResult && (
            <div className="card bg-brown-50 dark:bg-brown-800/50 border border-brown-200 dark:border-brown-700 space-y-2">
              <p className="font-semibold text-brown-800 dark:text-gold-300">Hasil Import</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Total', importResult.total, 'badge-info'], ['Berhasil', importResult.berhasil, 'badge-success'], ['Update', importResult.duplicate, 'badge-warning'], ['Gagal', importResult.gagal, 'badge-danger']].map(([l, v, c]) => (
                  <div key={l}>
                    <p className="text-xs text-brown-500 dark:text-brown-400">{l}</p>
                    <span className={`${c} text-base font-bold`}>{v}</span>
                  </div>
                ))}
              </div>
              {importResult.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Error Log:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{e.nomorSbg ? `${e.nomorSbg}: ` : ''}{e.pesan}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Penjualan */}
      <Modal
        isOpen={showJual}
        onClose={() => setShowJual(false)}
        title={`Jual Barang (${chosenItems.length})`}
        size="xl"
        footer={
          <>
            <button onClick={() => setShowJual(false)} className="btn-outline">Batal</button>
            <button onClick={handleJual} disabled={jualLoading} className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-600">
              {jualLoading ? 'Memproses...' : 'Proses & Buat Struk'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Info pelanggan & sales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nama Pelanggan *">
              <input value={jualForm.namaPelanggan} onChange={e => setJualForm(p => ({ ...p, namaPelanggan: e.target.value }))} className="input-field" placeholder="Nama pembeli" required />
            </FormField>
            <FormField label="Nomor Telepon">
              <input value={jualForm.noTelepon} onChange={e => setJualForm(p => ({ ...p, noTelepon: e.target.value }))} className="input-field" placeholder="08xxxxxxxxxx" />
            </FormField>
            <FormField label="Tanggal *">
              <input type="date" value={jualForm.tanggal} onChange={e => setJualForm(p => ({ ...p, tanggal: e.target.value }))} className="input-field" required />
            </FormField>
            <FormField label="Nama Sales *">
              <input value={jualForm.namaSales} onChange={e => setJualForm(p => ({ ...p, namaSales: e.target.value }))} className="input-field" placeholder="Nama sales (TTD)" required />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Pembeli termasuk *">
                <div className="flex flex-wrap gap-2">
                  {JENIS_PEMBELI_OPTIONS.map(o => (
                    <button
                      type="button"
                      key={o.value}
                      onClick={() => setJualForm(p => ({ ...p, jenisPembeli: o.value }))}
                      className={`px-3 py-2 rounded-lg text-sm border transition-colors ${jualForm.jenisPembeli === o.value ? 'bg-emerald-600 text-white border-emerald-600' : 'border-brown-200 dark:border-brown-700 text-brown-600 dark:text-brown-300 hover:bg-brown-50 dark:hover:bg-brown-800'}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </FormField>
            </div>
          </div>

          {/* Harga per barang */}
          <div>
            <p className="label mb-2">Harga Jual per Barang <span className="text-brown-400 font-normal">(isi Harga Barang → Total otomatis, atau isi Total → Harga Barang otomatis; PPN 1,1%)</span></p>
            <div className="overflow-x-auto border border-brown-100 dark:border-brown-800 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brown-50 dark:bg-brown-800/50">
                    <th className="table-header">Barang</th>
                    <th className="table-header text-right">Harga Barang</th>
                    <th className="table-header text-right">PPN 1,1%</th>
                    <th className="table-header text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {chosenItems.map(i => {
                    const net = parseFloat(jualPrices[i.id]?.net) || 0
                    const ppn = Math.round(net * PPN_RATE)
                    return (
                      <tr key={i.id} className="border-t border-brown-100 dark:border-brown-800">
                        <td className="px-3 py-2">
                          <p className="font-medium text-brown-800 dark:text-gold-200">{i.jenisBarang} — {i.detailBarang}</p>
                          <p className="text-xs text-brown-400 font-mono">{i.nomorSbg} · Grade {i.grade} · SMT {formatRupiah(i.hargaSmt)}</p>
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min="0" value={jualPrices[i.id]?.net || ''} onChange={e => setNet(i.id, e.target.value)} className="input-field text-right text-sm w-32 ml-auto" placeholder="0" />
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-brown-500 whitespace-nowrap">{net ? formatRupiah(ppn) : '-'}</td>
                        <td className="px-2 py-2">
                          <input type="number" min="0" value={jualPrices[i.id]?.total || ''} onChange={e => setTotal(i.id, e.target.value)} className="input-field text-right text-sm w-36 ml-auto font-semibold" placeholder="0" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brown-200 dark:border-brown-700 bg-gold-50/50 dark:bg-gold-900/10">
                    <td className="px-3 py-2 font-semibold text-right" colSpan={3}>GRAND TOTAL</td>
                    <td className="px-2 py-2 text-right font-bold text-gold-700 dark:text-gold-300 whitespace-nowrap">{formatRupiah(jualGrandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Struk (setelah penjualan berhasil) */}
      <Modal
        isOpen={!!struk}
        onClose={() => setStruk(null)}
        title={`Struk ${struk?.nomorStruk || ''}`}
        size="md"
        footer={
          <>
            <button onClick={() => setStruk(null)} className="btn-outline">Tutup</button>
            <button onClick={() => downloadStrukPDF(struk)} className="btn-outline flex items-center gap-2"><Download className="w-4 h-4" /> Unduh PDF</button>
            <button onClick={() => printStrukPDF(struk)} className="btn-primary flex items-center gap-2"><Printer className="w-4 h-4" /> Cetak Struk</button>
          </>
        }
      >
        {struk && (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-sm">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">Penjualan berhasil disimpan.</p>
              <p className="text-brown-500 dark:text-brown-400 text-xs mt-0.5">Barang sudah pindah ke Riwayat Penjualan.</p>
            </div>
            <dl className="space-y-1 text-sm">
              {[
                ['No. Struk', struk.nomorStruk],
                ['Pelanggan', struk.namaPelanggan],
                ['Sales', struk.namaSales],
                ['Pembeli', JENIS_PEMBELI_LABELS[struk.jenisPembeli]],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-brown-50 dark:border-brown-800">
                  <dt className="text-brown-500 dark:text-brown-400">{k}</dt>
                  <dd className="font-medium text-brown-800 dark:text-gold-200">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="text-right text-sm">
              <span className="text-brown-500 dark:text-brown-400">Grand Total: </span>
              <span className="font-bold text-gold-700 dark:text-gold-300">
                {formatRupiah((struk.items || []).reduce((s, i) => s + parseFloat(i.totalHarga || 0), 0))}
              </span>
              <p className="mt-1 italic text-brown-600 dark:text-gold-200">
                Terbilang: {terbilang((struk.items || []).reduce((s, i) => s + parseFloat(i.totalHarga || 0), 0))}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
