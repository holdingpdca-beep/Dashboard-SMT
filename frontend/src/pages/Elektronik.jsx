import { useState, useEffect, useRef } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { useAuth } from '../contexts/AuthContext'
import { formatRupiah, formatDate, STATUS_LABELS, GRADE_COLORS, PERUSAHAAN_LABELS } from '../utils/format'
import { Plus, Upload, Download, Search, Filter, RefreshCw, Edit2, Trash2, Eye, X, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'

const GRADE_OPTIONS = ['A', 'B', 'C', 'D']
const STATUS_OPTIONS = [{ value: 'BELUM_TERJUAL', label: 'Belum Terjual' }, { value: 'TERJUAL', label: 'Terjual' }]
const PERUSAHAAN_OPTIONS = [{ value: 'SERBA_MAS', label: 'Serba Mas' }, { value: 'VOLARY', label: 'Volary' }]

function FormField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

const emptyForm = { nomorSbg: '', tanggalLelang: '', grade: 'A', jenisBarang: '', detailBarang: '', keterangan: '', cogs: '', offeringPengepul: '', hargaJual: '', perusahaan: 'SERBA_MAS' }

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
  const [importMapping, setImportMapping] = useState({ nomorSbg: '', tanggalLelang: '', grade: '', jenisBarang: '', detailBarang: '', keterangan: '', cogs: '', offeringPengepul: '', hargaJual: '' })
  const [importColumns, setImportColumns] = useState([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const fileRef = useRef()

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
    setForm(p => {
      const next = { ...p, [field]: val }
      if (field === 'hargaJual') {
        const hj = parseFloat(val) || 0
        next._ppn = hj ? (hj * 0.011).toFixed(0) : ''
        next._total = hj ? (hj + hj * 0.011).toFixed(0) : ''
      }
      return next
    })
  }

  const openCreate = () => { setForm(emptyForm); setEditItem(null); setShowForm(true) }
  const openEdit = (item) => {
    setForm({
      nomorSbg: item.nomorSbg,
      tanggalLelang: item.tanggalLelang ? item.tanggalLelang.split('T')[0] : '',
      grade: item.grade, jenisBarang: item.jenisBarang,
      detailBarang: item.detailBarang, keterangan: item.keterangan || '',
      cogs: item.cogs || '', offeringPengepul: item.offeringPengepul || '',
      hargaJual: item.hargaJual || '', perusahaan: item.perusahaan || 'SERBA_MAS',
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
          <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} className="input-field w-36">
            <option value="">Semua Status</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filters.perusahaan} onChange={e => setFilters(p => ({ ...p, perusahaan: e.target.value }))} className="input-field w-36">
            <option value="">Semua Perusahaan</option>
            {PERUSAHAAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          <button onClick={() => fetchItems()} className="btn-outline p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filter tanggal lelang */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-brown-500 dark:text-brown-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Tanggal Lelang:
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
                <th className="table-header w-12">No</th>
                <SortTh col="tanggalLelang">Tanggal Lelang</SortTh>
                <SortTh col="nomorSbg">Nomor SBG</SortTh>
                <SortTh col="grade">Grade</SortTh>
                <SortTh col="jenisBarang">Jenis Barang</SortTh>
                <th className="table-header">Detail Barang</th>
                <th className="table-header">Keterangan</th>
                {canSeeCogs() && <SortTh col="cogs">COGS</SortTh>}
                <SortTh col="offeringPengepul">Offering Pengepul</SortTh>
                <SortTh col="hargaJual">Harga Jual</SortTh>
                <th className="table-header">PPN</th>
                <SortTh col="totalHarga">Total Harga</SortTh>
                <SortTh col="status">Status</SortTh>
                <th className="table-header">Perusahaan</th>
                <th className="table-header text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={16} className="text-center py-12 text-brown-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Memuat data...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={16} className="text-center py-12 text-brown-400">
                  Tidak ada data ditemukan
                </td></tr>
              ) : items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gold-50/50 dark:hover:bg-brown-800/30 transition-colors">
                  <td className="table-cell text-center text-brown-400">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="table-cell whitespace-nowrap text-brown-600 dark:text-brown-300">{item.tanggalLelang ? formatDate(item.tanggalLelang) : '-'}</td>
                  <td className="table-cell font-mono font-medium text-brown-800 dark:text-gold-300">{item.nomorSbg}</td>
                  <td className="table-cell">
                    <span className={GRADE_COLORS[item.grade]}>Grade {item.grade}</span>
                  </td>
                  <td className="table-cell">{item.jenisBarang}</td>
                  <td className="table-cell max-w-48 truncate" title={item.detailBarang}>{item.detailBarang}</td>
                  <td className="table-cell max-w-36 truncate text-brown-500" title={item.keterangan}>{item.keterangan || '-'}</td>
                  {canSeeCogs() && <td className="table-cell text-right font-mono">{formatRupiah(item.cogs)}</td>}
                  <td className="table-cell text-right font-mono">{formatRupiah(item.offeringPengepul)}</td>
                  <td className="table-cell text-right font-mono">{formatRupiah(item.hargaJual)}</td>
                  <td className="table-cell text-right font-mono text-brown-500">{formatRupiah(item.ppn)}</td>
                  <td className="table-cell text-right font-mono font-semibold">{formatRupiah(item.totalHarga)}</td>
                  <td className="table-cell">
                    <span className={item.status === 'TERJUAL' ? 'badge-success' : 'badge-warning'}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={item.perusahaan === 'VOLARY' ? 'badge-gold' : 'badge-info'}>
                      {PERUSAHAAN_LABELS[item.perusahaan]}
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
          <FormField label="Tanggal Lelang">
            <input type="date" value={form.tanggalLelang} onChange={e => handleFormChange('tanggalLelang', e.target.value)} className="input-field" />
          </FormField>
          <FormField label="Grade *">
            <select value={form.grade} onChange={e => handleFormChange('grade', e.target.value)} className="input-field" required>
              {GRADE_OPTIONS.map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          </FormField>
          <FormField label="Jenis Barang *">
            <input value={form.jenisBarang} onChange={e => handleFormChange('jenisBarang', e.target.value)} className="input-field" placeholder="Laptop, HP, TV, dll" required />
          </FormField>
          <FormField label="Perusahaan *">
            <select value={form.perusahaan} onChange={e => handleFormChange('perusahaan', e.target.value)} className="input-field">
              {PERUSAHAAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Detail Barang *">
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
          <FormField label="Offering Pengepul">
            <input type="number" value={form.offeringPengepul} onChange={e => handleFormChange('offeringPengepul', e.target.value)} className="input-field" placeholder="0" min="0" />
          </FormField>
          <FormField label="Harga Jual (Before Tax)">
            <input type="number" value={form.hargaJual} onChange={e => handleFormChange('hargaJual', e.target.value)} className="input-field" placeholder="0" min="0" />
          </FormField>
          <div className="space-y-2">
            <p className="label">PPN & Total (Otomatis)</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={form._ppn ? `Rp ${Number(form._ppn).toLocaleString('id-ID')}` : '-'} className="input-field bg-brown-50 dark:bg-brown-800/50 text-brown-400 text-sm" readOnly />
              <input value={form._total ? `Rp ${Number(form._total).toLocaleString('id-ID')}` : '-'} className="input-field bg-brown-50 dark:bg-brown-800/50 text-brown-400 text-sm" readOnly />
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
              ['Tanggal Lelang', viewItem.tanggalLelang ? formatDate(viewItem.tanggalLelang) : '-'],
              ['Grade', `Grade ${viewItem.grade}`],
              ['Jenis Barang', viewItem.jenisBarang],
              ['Detail Barang', viewItem.detailBarang],
              ['Keterangan', viewItem.keterangan || '-'],
              ...(canSeeCogs() ? [['COGS', formatRupiah(viewItem.cogs)]] : []),
              ['Offering Pengepul', formatRupiah(viewItem.offeringPengepul)],
              ['Harga Jual', formatRupiah(viewItem.hargaJual)],
              ['PPN (1.1%)', formatRupiah(viewItem.ppn)],
              ['Total Harga', formatRupiah(viewItem.totalHarga)],
              ...(canSeeCogs() ? [['Profit', formatRupiah(viewItem.profit)]] : []),
              ['Status', STATUS_LABELS[viewItem.status]],
              ['Perusahaan', PERUSAHAAN_LABELS[viewItem.perusahaan]],
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
              <p className="label">Mapping Kolom <span className="text-brown-400 font-normal">(petakan kolom Excel ke field database)</span></p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'nomorSbg', label: 'Nomor SBG *' },
                  { key: 'tanggalLelang', label: 'Tanggal Lelang' },
                  { key: 'grade', label: 'Grade *' },
                  { key: 'jenisBarang', label: 'Jenis Barang *' },
                  { key: 'detailBarang', label: 'Detail Barang *' },
                  { key: 'cogs', label: 'COGS *' },
                  { key: 'offeringPengepul', label: 'Offering Pengepul' },
                  { key: 'hargaJual', label: 'Harga Jual' },
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
    </div>
  )
}
