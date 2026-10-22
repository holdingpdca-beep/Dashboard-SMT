import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Gem, Plus, Edit2, Trash2, Search, RefreshCw, X, Upload,
  Eye, EyeOff, Star, Package, MapPin, Settings, Building2,
  Maximize2, Minimize2
} from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { useAuth } from '../contexts/AuthContext'
import { formatRupiah } from '../utils/format'

const JENIS_PERHIASAN = ['Cincin', 'Koye', 'Bracelet', 'Bangle', 'Anting', 'Giwang', 'Kalung', 'Gelang']
const JENIS_LM = ['LM 0.5gr', 'LM 1gr', 'LM 2gr', 'LM 5gr', 'LM 10gr', 'LM 25gr', 'LM 50gr', 'LM 100gr']

const KATEGORI_TABS = [
  { value: '', label: 'Semua', icon: Star },
  { value: 'PERHIASAN', label: 'Perhiasan', icon: Gem },
  { value: 'LM', label: 'Logam Mulia', icon: Package },
]

const DEFAULT_FORM = {
  cabangId: '',
  kategori: 'PERHIASAN',
  jenisBarang: '',
  nama: '',
  deskripsi: '',
  harga: '',
  tersedia: true,
  urutan: 0,
}

const DEFAULT_CABANG_FORM = { nama: '', alamat: '', storeName: '' }

/* ─── KatalogCard ─── */
function KatalogCard({ item, canManage, onEdit, onDelete, onToggle }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className={`card p-0 overflow-hidden flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${!item.tersedia ? 'opacity-60' : ''}`}>
      <div className="relative bg-brown-50 dark:bg-brown-900 aspect-square overflow-hidden">
        {item.gambar && !imgError ? (
          <img src={item.gambar} alt={item.nama} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-brown-300 dark:text-brown-600">
            {item.kategori === 'LM' ? <Package className="w-12 h-12 mb-2" /> : <Gem className="w-12 h-12 mb-2" />}
            <span className="text-xs">Tidak ada gambar</span>
          </div>
        )}

        <div className="absolute top-2 left-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shadow ${
            item.kategori === 'LM' ? 'bg-amber-400 text-amber-900' : 'bg-gold-500 text-brown-900'
          }`}>
            {item.kategori === 'LM' ? 'LM' : item.jenisBarang}
          </span>
        </div>

        {!item.tersedia && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">Tidak Tersedia</span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <p className="font-semibold text-brown-800 dark:text-gold-100 text-sm leading-tight line-clamp-2">{item.nama}</p>
        {item.deskripsi && (
          <p className="text-xs text-brown-500 dark:text-brown-400 mt-1 line-clamp-2">{item.deskripsi}</p>
        )}
        <div className="mt-auto pt-2">
          <p className="text-gold-600 dark:text-gold-400 font-bold text-base">{formatRupiah(item.harga)}</p>
        </div>

        {canManage && (
          <div className="flex gap-1 mt-2 pt-2 border-t border-brown-100 dark:border-brown-800">
            <button
              onClick={() => onEdit(item)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <Edit2 className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={() => onToggle(item)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              {item.tersedia ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {item.tersedia ? 'Sembunyikan' : 'Tampilkan'}
            </button>
            <button
              onClick={() => onDelete(item)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Hapus
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── FormKatalog ─── */
function FormKatalog({ form, setForm, onSubmit, onClose, loading, editItem, onHapusGambar, cabangList }) {
  const [preview, setPreview] = useState(editItem?.gambar || null)
  const [fileObj, setFileObj] = useState(null)

  const jenisList = form.kategori === 'LM' ? JENIS_LM : JENIS_PERHIASAN

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileObj(file)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result)
    reader.readAsDataURL(file)
  }

  const clearPreview = (e) => {
    e.stopPropagation()
    setPreview(null)
    setFileObj(null)
    if (editItem?.gambar && !fileObj) onHapusGambar?.()
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ ...form, _file: fileObj })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Cabang */}
      <div>
        <label className="label">Cabang *</label>
        <select
          value={form.cabangId}
          onChange={e => setForm(f => ({ ...f, cabangId: e.target.value }))}
          className="input-field"
          required
        >
          <option value="">Pilih cabang...</option>
          {cabangList.filter(c => c.aktif).map(c => (
            <option key={c.id} value={c.id}>{c.nama}</option>
          ))}
        </select>
      </div>

      {/* Kategori */}
      <div>
        <label className="label">Kategori *</label>
        <div className="flex gap-2">
          {['PERHIASAN', 'LM'].map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setForm(f => ({ ...f, kategori: k, jenisBarang: '' }))}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                form.kategori === k
                  ? 'bg-gold-500 text-brown-900 border-gold-500'
                  : 'border-brown-200 dark:border-brown-700 text-brown-600 dark:text-brown-300 hover:border-gold-400'
              }`}
            >
              {k === 'LM' ? 'Logam Mulia' : 'Perhiasan'}
            </button>
          ))}
        </div>
      </div>

      {/* Jenis Barang */}
      <div>
        <label className="label">Jenis Barang *</label>
        <select
          value={form.jenisBarang}
          onChange={e => setForm(f => ({ ...f, jenisBarang: e.target.value }))}
          className="input-field"
          required
        >
          <option value="">Pilih jenis...</option>
          {jenisList.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
      </div>

      {/* Nama */}
      <div>
        <label className="label">Nama Produk *</label>
        <input
          type="text"
          value={form.nama}
          onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
          className="input-field"
          placeholder="Contoh: Cincin Berlian 18K"
          required
        />
      </div>

      {/* Deskripsi */}
      <div>
        <label className="label">Deskripsi</label>
        <textarea
          value={form.deskripsi}
          onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
          className="input-field"
          rows={2}
          placeholder="Berat, bahan, keterangan lain..."
        />
      </div>

      {/* Harga */}
      <div>
        <label className="label">Harga *</label>
        <input
          type="number"
          value={form.harga}
          onChange={e => setForm(f => ({ ...f, harga: e.target.value }))}
          className="input-field"
          placeholder="0"
          min="0"
          required
        />
      </div>

      {/* Gambar */}
      <div>
        <p className="label">Foto Produk</p>
        <div className="space-y-2">
          <label className="cursor-pointer flex items-start gap-3">
            <input type="file" accept="image/*" onChange={handleFile} className="sr-only" />
            {preview ? (
              <div className="w-24 h-24 rounded-xl overflow-hidden border border-brown-200 dark:border-brown-700 flex-shrink-0">
                <img src={preview} alt="preview" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-brown-200 dark:border-brown-700 hover:border-gold-400 hover:bg-gold-50/30 dark:hover:bg-gold-900/10 transition-colors flex flex-col items-center justify-center gap-1 text-brown-400 hover:text-gold-500 flex-shrink-0">
                <Upload className="w-6 h-6" />
                <span className="text-xs text-center leading-tight">Klik upload</span>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-1 text-xs text-brown-400">
              {preview ? <span className="text-gold-500 font-medium">Klik gambar untuk ganti</span> : <span>JPG, PNG, WEBP</span>}
              <span>Maks 5MB</span>
            </div>
          </label>
          {preview && (
            <button
              type="button"
              onClick={clearPreview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Hapus Foto
            </button>
          )}
        </div>
      </div>

      {/* Urutan */}
      <div>
        <label className="label">Urutan Tampil</label>
        <input
          type="number"
          value={form.urutan}
          onChange={e => setForm(f => ({ ...f, urutan: parseInt(e.target.value) || 0 }))}
          className="input-field"
          min="0"
          placeholder="0 = pertama"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-outline flex-1">Batal</button>
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : editItem ? 'Simpan Perubahan' : 'Tambah Item'}
        </button>
      </div>
    </form>
  )
}

/* ─── ModalKelolaCabang ─── */
function ModalKelolaCabang({ cabangList, onRefresh, onClose }) {
  const [formCabang, setFormCabang] = useState(DEFAULT_CABANG_FORM)
  const [editCabang, setEditCabang] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const openEdit = (c) => {
    setEditCabang(c)
    setFormCabang({ nama: c.nama, alamat: c.alamat || '', storeName: c.storeName || '' })
  }

  const resetForm = () => {
    setEditCabang(null)
    setFormCabang(DEFAULT_CABANG_FORM)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editCabang) {
        await api.put(`/cabang/${editCabang.id}`, formCabang)
        toast.success('Cabang berhasil diperbarui')
      } else {
        await api.post('/cabang', formCabang)
        toast.success('Cabang berhasil ditambahkan')
      }
      resetForm()
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan cabang')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAktif = async (c) => {
    try {
      await api.put(`/cabang/${c.id}`, { aktif: String(!c.aktif) })
      toast.success(c.aktif ? 'Cabang dinonaktifkan' : 'Cabang diaktifkan')
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal mengubah status')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/cabang/${deleteTarget.id}`)
      toast.success('Cabang berhasil dihapus')
      setDeleteTarget(null)
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus cabang')
    }
  }

  return (
    <div className="space-y-5">
      {/* Form tambah/edit */}
      <form onSubmit={handleSave} className="bg-brown-50 dark:bg-brown-800/50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-brown-700 dark:text-gold-300">
          {editCabang ? `Edit: ${editCabang.nama}` : 'Tambah Cabang Baru'}
        </p>
        <div>
          <label className="label">Nama Cabang *</label>
          <input
            type="text"
            value={formCabang.nama}
            onChange={e => setFormCabang(f => ({ ...f, nama: e.target.value }))}
            className="input-field"
            placeholder="Contoh: Cabang Jakarta Pusat"
            required
          />
        </div>
        <div>
          <label className="label">Alamat</label>
          <textarea
            value={formCabang.alamat}
            onChange={e => setFormCabang(f => ({ ...f, alamat: e.target.value }))}
            className="input-field"
            rows={2}
            placeholder="Alamat cabang (opsional)"
          />
        </div>
        <div>
          <label className="label">Nama Toko (untuk Sinkronisasi API)</label>
          <input
            type="text"
            value={formCabang.storeName}
            onChange={e => setFormCabang(f => ({ ...f, storeName: e.target.value }))}
            className="input-field"
            placeholder="Contoh: TOKO CABANG AMPENAN"
          />
          <p className="text-[11px] text-brown-400 mt-1">
            Harus persis sama dengan nama toko di sistem SERBAMAS. Kosongkan bila cabang ini tidak disinkronkan.
          </p>
        </div>
        <div className="flex gap-2">
          {editCabang && (
            <button type="button" onClick={resetForm} className="btn-outline flex-1">Batal</button>
          )}
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : editCabang ? 'Simpan' : 'Tambah Cabang'}
          </button>
        </div>
      </form>

      {/* List cabang */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-brown-500 dark:text-brown-400 uppercase tracking-wide">
          Daftar Cabang ({cabangList.length})
        </p>
        {cabangList.length === 0 ? (
          <p className="text-sm text-brown-400 text-center py-4">Belum ada cabang</p>
        ) : (
          cabangList.map(c => (
            <div
              key={c.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                c.aktif
                  ? 'border-brown-100 dark:border-brown-700 bg-white dark:bg-brown-900'
                  : 'border-brown-100 dark:border-brown-700 bg-brown-50 dark:bg-brown-800/50 opacity-60'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-gold-600 dark:text-gold-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-brown-800 dark:text-gold-200 truncate">{c.nama}</p>
                  {!c.aktif && (
                    <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                      Nonaktif
                    </span>
                  )}
                </div>
                {c.alamat && <p className="text-xs text-brown-400 mt-0.5 line-clamp-1">{c.alamat}</p>}
                <p className="text-xs text-brown-400 mt-0.5">{c._count?.katalog ?? 0} item katalog</p>
                {c.storeName ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                    <Download className="w-3 h-3" /> Sinkron: {c.storeName}
                  </p>
                ) : (
                  <p className="text-[11px] text-brown-300 dark:text-brown-600 mt-0.5">Belum disinkronkan (Nama Toko kosong)</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEdit(c)}
                  className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleToggleAktif(c)}
                  className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                  title={c.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                >
                  {c.aktif ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setDeleteTarget(c)}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Hapus"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Konfirmasi hapus */}
      {deleteTarget && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-3">
          <p className="text-sm text-red-700 dark:text-red-300">
            Hapus cabang <strong>{deleteTarget.nama}</strong>? Cabang yang masih memiliki item katalog tidak bisa dihapus.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setDeleteTarget(null)} className="btn-outline flex-1 text-sm py-1.5">Batal</button>
            <button onClick={handleDelete} className="flex-1 py-1.5 px-3 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">
              Hapus
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Card untuk mode layar penuh (tanpa aksi) ─── */
function KatalogPresentCard({ item, onClick }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl overflow-hidden shadow-md flex flex-col transition-transform duration-200 hover:scale-[1.02] hover:shadow-xl cursor-pointer ${!item.tersedia ? 'opacity-50' : ''}`}
    >
      <div className="relative bg-amber-50 aspect-square overflow-hidden">
        {item.gambar && !imgError ? (
          <img src={item.gambar} alt={item.nama} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-amber-200">
            {item.kategori === 'LM' ? <Package className="w-16 h-16 mb-2" /> : <Gem className="w-16 h-16 mb-2" />}
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full shadow-sm ${
            item.kategori === 'LM' ? 'bg-amber-400 text-amber-900' : 'bg-yellow-500 text-yellow-900'
          }`}>
            {item.kategori === 'LM' ? 'Logam Mulia' : item.jenisBarang}
          </span>
        </div>
        {!item.tersedia && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-red-500 text-white text-sm font-bold px-4 py-1.5 rounded-full tracking-wide">Tidak Tersedia</span>
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="font-bold text-stone-800 text-base leading-tight line-clamp-2">{item.nama}</p>
        {item.deskripsi && (
          <p className="text-sm text-stone-500 mt-1.5 line-clamp-2 leading-snug">{item.deskripsi}</p>
        )}
        <div className="mt-auto pt-3 border-t border-amber-100">
          <p className="text-yellow-700 font-extrabold text-lg tracking-tight">{formatRupiah(item.harga)}</p>
        </div>
      </div>
    </div>
  )
}

/* ─── Modal Detail Produk (dalam mode layar penuh) ─── */
function KatalogDetailModal({ item, onClose }) {
  const [imgError, setImgError] = useState(false)
  if (!item) return null

  return (
    <div
      className="absolute inset-0 z-[10000] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-4xl max-h-full flex flex-col md:flex-row"
        onClick={e => e.stopPropagation()}
      >
        {/* Foto */}
        <div className="relative md:w-1/2 bg-amber-50 aspect-square md:aspect-auto shrink-0">
          {item.gambar && !imgError ? (
            <img src={item.gambar} alt={item.nama} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <div className="w-full h-full min-h-[16rem] flex flex-col items-center justify-center text-amber-200">
              {item.kategori === 'LM' ? <Package className="w-24 h-24" /> : <Gem className="w-24 h-24" />}
            </div>
          )}
          <div className="absolute top-4 left-4">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full shadow ${
              item.kategori === 'LM' ? 'bg-amber-400 text-amber-900' : 'bg-yellow-500 text-yellow-900'
            }`}>
              {item.kategori === 'LM' ? 'Logam Mulia' : item.jenisBarang}
            </span>
          </div>
        </div>

        {/* Detail */}
        <div className="md:w-1/2 p-6 sm:p-8 flex flex-col overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-extrabold text-stone-800 text-2xl leading-tight">{item.nama}</h2>
            <button
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between border-b border-amber-100 pb-2">
              <span className="text-stone-400">Kategori</span>
              <span className="font-semibold text-stone-700">{item.kategori === 'LM' ? 'Logam Mulia' : 'Perhiasan'}</span>
            </div>
            <div className="flex justify-between border-b border-amber-100 pb-2">
              <span className="text-stone-400">Jenis</span>
              <span className="font-semibold text-stone-700">{item.jenisBarang}</span>
            </div>
            {item.cabang?.nama && (
              <div className="flex justify-between border-b border-amber-100 pb-2">
                <span className="text-stone-400">Cabang</span>
                <span className="font-semibold text-stone-700">{item.cabang.nama}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-amber-100 pb-2">
              <span className="text-stone-400">Status</span>
              <span className={`font-semibold ${item.tersedia ? 'text-emerald-600' : 'text-red-500'}`}>
                {item.tersedia ? 'Tersedia' : 'Tidak Tersedia'}
              </span>
            </div>
          </div>

          {item.deskripsi && (
            <div className="mt-4">
              <p className="text-xs text-stone-400 uppercase tracking-wide font-semibold mb-1">Deskripsi</p>
              <p className="text-sm text-stone-600 leading-relaxed">{item.deskripsi}</p>
            </div>
          )}

          <div className="mt-auto pt-6">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-semibold">Harga</p>
            <p className="text-yellow-700 font-extrabold text-3xl tracking-tight mt-1">{formatRupiah(item.harga)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Layar Penuh ─── */
function KatalogLayarPenuh({ cabangList, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCabang, setSelectedCabang] = useState(null)
  const [kategori, setKategori] = useState('')
  const [search, setSearch] = useState('')
  const [detailItem, setDetailItem] = useState(null)
  const containerRef = useRef(null)
  // Ref untuk onClose agar tidak perlu masuk dependency useEffect
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  // Ref untuk state modal detail agar handler Escape selalu baca nilai terbaru
  const detailRef = useRef(null)

  // Fullscreen browser + listener Escape — hanya jalan sekali saat mount
  useEffect(() => {
    const el = containerRef.current
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {})
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      // Jika modal detail terbuka, tutup modal dulu (jangan keluar layar penuh)
      if (detailRef.current) {
        setDetailItem(null)
      } else {
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, []) // deps kosong — tidak akan re-trigger saat state berubah

  // Fetch item per cabang (cabangId berubah = fetch ulang)
  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = { tersedia: 'true' }
      if (selectedCabang) params.cabangId = selectedCabang
      const { data } = await api.get('/katalog', { params })
      setItems(data.data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [selectedCabang])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Jaga ref modal detail selalu sinkron dengan state (dipakai handler Escape)
  useEffect(() => { detailRef.current = detailItem }, [detailItem])

  // Filter kategori & search dilakukan di sisi client (instan, tanpa fetch ulang)
  const filtered = items.filter(item => {
    if (kategori && item.kategori !== kategori) return false
    if (search) {
      const q = search.toLowerCase()
      return item.nama.toLowerCase().includes(q) || item.jenisBarang?.toLowerCase().includes(q)
    }
    return true
  })

  const namaCabang = selectedCabang
    ? cabangList.find(c => c.id === selectedCabang)?.nama || ''
    : 'Semua Cabang'

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 50%, #fde68a 100%)' }}
    >
      {/* Header */}
      <div className="shrink-0 bg-white/80 backdrop-blur-sm border-b border-amber-200 px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Branding */}
          <div className="flex items-center gap-3 mr-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow">
              <Gem className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-extrabold text-stone-800 text-base leading-tight">Katalog Emas</p>
              <p className="text-xs text-stone-500">Serba Mas Tentram</p>
            </div>
          </div>

          {/* Tab cabang */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            <button
              onClick={() => setSelectedCabang(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedCabang === null ? 'bg-yellow-500 text-yellow-900 shadow-sm' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              }`}
            >
              Semua
            </button>
            {cabangList.filter(c => c.aktif).map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCabang(c.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedCabang === c.id ? 'bg-yellow-500 text-yellow-900 shadow-sm' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                {c.nama}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-48 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari produk..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-amber-200 bg-white/80 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-300 text-stone-700"
            />
          </div>

          {/* Tombol keluar */}
          <button
            onClick={onClose}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-800 text-white text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            <Minimize2 className="w-4 h-4" />
            Keluar
          </button>
        </div>

        {/* Tab kategori */}
        <div className="flex items-center gap-1.5 mt-3">
          {[
            { value: '', label: 'Semua Kategori', icon: Star },
            { value: 'PERHIASAN', label: 'Perhiasan', icon: Gem },
            { value: 'LM', label: 'Logam Mulia', icon: Package },
          ].map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.value}
                onClick={() => setKategori(tab.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  kategori === tab.value ? 'bg-yellow-500 text-yellow-900' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
          <span className="ml-auto text-sm text-stone-500 font-medium">
            {namaCabang} · {filtered.length} produk tersedia
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Gem className="w-16 h-16 text-amber-300" />
            <p className="text-stone-500 font-medium text-lg">Tidak ada produk tersedia</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {filtered.map(item => (
              <KatalogPresentCard key={item.id} item={item} onClick={() => setDetailItem(item)} />
            ))}
          </div>
        )}
      </div>

      {/* Modal detail produk */}
      <KatalogDetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  )
}

/* ─── Main Page ─── */
export default function Katalog() {
  const { user } = useAuth()
  const canManage = ['ADMIN', 'SUPER_USER', 'KATALOG_USER'].includes(user?.role)
  const isAdmin = user?.role === 'ADMIN'

  const [cabangList, setCabangList] = useState([])
  const [selectedCabang, setSelectedCabang] = useState(null) // null = semua
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [kategori, setKategori] = useState('')
  const [jenisFilter, setJenisFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showTersedia, setShowTersedia] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteItem, setDeleteItem] = useState(null)
  const [showKelolaCabang, setShowKelolaCabang] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const fetchCabang = useCallback(async () => {
    try {
      const { data } = await api.get('/cabang')
      setCabangList(data.data)
    } catch {
      toast.error('Gagal memuat data cabang')
    }
  }, [])

  const fetchKatalog = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (kategori) params.kategori = kategori
      if (search) params.search = search
      if (selectedCabang) params.cabangId = selectedCabang
      const { data } = await api.get('/katalog', { params })
      setItems(data.data)
    } catch {
      toast.error('Gagal memuat katalog')
    } finally {
      setLoading(false)
    }
  }, [kategori, search, selectedCabang])

  useEffect(() => { fetchCabang() }, [fetchCabang])
  useEffect(() => { fetchKatalog() }, [fetchKatalog])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchKatalog()
  }

  const openAdd = () => {
    setEditItem(null)
    setForm({ ...DEFAULT_FORM, cabangId: selectedCabang ? String(selectedCabang) : '' })
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      cabangId: item.cabangId ? String(item.cabangId) : '',
      kategori: item.kategori,
      jenisBarang: item.jenisBarang,
      nama: item.nama,
      deskripsi: item.deskripsi || '',
      harga: item.harga,
      tersedia: item.tersedia,
      urutan: item.urutan || 0,
    })
    setShowModal(true)
  }

  const handleSubmit = async (formData) => {
    setSaving(true)
    try {
      const fd = new FormData()
      if (formData.cabangId) fd.append('cabangId', formData.cabangId)
      fd.append('kategori', formData.kategori)
      fd.append('jenisBarang', formData.jenisBarang)
      fd.append('nama', formData.nama)
      fd.append('deskripsi', formData.deskripsi || '')
      fd.append('harga', formData.harga)
      fd.append('tersedia', formData.tersedia)
      fd.append('urutan', formData.urutan || 0)
      if (formData._file) fd.append('gambar', formData._file)

      if (editItem) {
        await api.put(`/katalog/${editItem.id}`, fd)
        toast.success('Item berhasil diperbarui')
      } else {
        await api.post('/katalog', fd)
        toast.success('Item berhasil ditambahkan')
      }
      setShowModal(false)
      fetchKatalog()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan item')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item) => {
    try {
      const fd = new FormData()
      fd.append('tersedia', String(!item.tersedia))
      fd.append('kategori', item.kategori)
      fd.append('jenisBarang', item.jenisBarang)
      fd.append('nama', item.nama)
      fd.append('harga', item.harga)
      if (item.cabangId) fd.append('cabangId', item.cabangId)
      await api.put(`/katalog/${item.id}`, fd)
      toast.success(item.tersedia ? 'Item disembunyikan' : 'Item ditampilkan')
      fetchKatalog()
    } catch {
      toast.error('Gagal mengubah status item')
    }
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    try {
      await api.delete(`/katalog/${deleteItem.id}`)
      toast.success('Item berhasil dihapus')
      setDeleteItem(null)
      fetchKatalog()
    } catch {
      toast.error('Gagal menghapus item')
    }
  }

  const handleHapusGambar = async () => {
    if (!editItem) return
    try {
      await api.delete(`/katalog/${editItem.id}/gambar`)
      toast.success('Foto berhasil dihapus')
    } catch {
      toast.error('Gagal menghapus foto')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    const loadingToast = toast.loading('Menyinkronkan dengan stok toko...')
    try {
      const { data } = await api.post('/katalog/sync')
      toast.dismiss(loadingToast)
      if (data.success) {
        toast.success(data.message, { duration: 6000 })
      } else {
        // Sebagian cabang mungkin gagal (mis. password/Nama Toko belum di-set)
        const pesanError = (data.error || []).map(e => `${e.cabang}: ${e.pesan}`).join('\n')
        toast.error(`${data.message}\n${pesanError}`.trim(), { duration: 8000 })
      }
      fetchKatalog()
      fetchCabang()
    } catch (err) {
      toast.dismiss(loadingToast)
      toast.error(err.response?.data?.message || 'Gagal menjalankan sinkronisasi')
    } finally {
      setSyncing(false)
    }
  }

  const jenisList = kategori === 'LM' ? JENIS_LM : kategori === 'PERHIASAN' ? JENIS_PERHIASAN : [...JENIS_PERHIASAN, ...JENIS_LM]
  const filtered = items.filter(item => {
    if (jenisFilter && item.jenisBarang !== jenisFilter) return false
    if (showTersedia && !item.tersedia) return false
    return true
  })

  const stats = {
    total: items.length,
    tersedia: items.filter(i => i.tersedia).length,
    perhiasan: items.filter(i => i.kategori === 'PERHIASAN').length,
    lm: items.filter(i => i.kategori === 'LM').length,
  }

  const namaSelectedCabang = selectedCabang
    ? cabangList.find(c => c.id === selectedCabang)?.nama || 'Cabang'
    : 'Semua Cabang'

  if (fullscreen) return (
    <KatalogLayarPenuh
      cabangList={cabangList}
      onClose={() => setFullscreen(false)}
    />
  )

  return (
    <div className="space-y-4">

      {/* ── Tab Cabang ── */}
      <div className="card p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <MapPin className="w-4 h-4 text-gold-500 shrink-0" />

          {/* Semua cabang */}
          <button
            onClick={() => setSelectedCabang(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedCabang === null
                ? 'bg-gold-500 text-brown-900 shadow-sm'
                : 'bg-brown-100 dark:bg-brown-800 text-brown-600 dark:text-brown-300 hover:bg-brown-200 dark:hover:bg-brown-700'
            }`}
          >
            Semua Cabang
          </button>

          {/* Tab per cabang */}
          {cabangList.filter(c => c.aktif).map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCabang(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedCabang === c.id
                  ? 'bg-gold-500 text-brown-900 shadow-sm'
                  : 'bg-brown-100 dark:bg-brown-800 text-brown-600 dark:text-brown-300 hover:bg-brown-200 dark:hover:bg-brown-700'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              {c.nama}
              <span className="text-[10px] opacity-70 ml-0.5">({c._count?.katalog ?? 0})</span>
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            {/* Sinkronkan dengan stok toko (API SERBAMAS) */}
            {canManage && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-white transition-colors shadow-sm disabled:opacity-60"
                title="Tarik data stok terbaru dari toko. Barang yang stoknya habis akan otomatis terhapus."
              >
                <Download className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} />
                {syncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}
              </button>
            )}

            {/* Layar penuh */}
            <button
              onClick={() => setFullscreen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500 hover:bg-yellow-400 text-yellow-900 transition-colors shadow-sm"
              title="Tampilkan mode katalog layar penuh"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Layar Penuh
            </button>

            {/* Kelola cabang (admin only) */}
            {isAdmin && (
              <button
                onClick={() => setShowKelolaCabang(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-brown-500 dark:text-brown-400 border border-brown-200 dark:border-brown-700 hover:border-gold-400 hover:text-gold-600 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Kelola Cabang
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Item', value: stats.total, color: 'text-brown-700 dark:text-gold-200' },
          { label: 'Tersedia', value: stats.tersedia, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Perhiasan', value: stats.perhiasan, color: 'text-gold-600 dark:text-gold-400' },
          { label: 'Logam Mulia', value: stats.lm, color: 'text-amber-600 dark:text-amber-400' },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-brown-400 mt-0.5">{s.label}</p>
            {selectedCabang && <p className="text-[10px] text-brown-300 dark:text-brown-600 mt-0.5 truncate">{namaSelectedCabang}</p>}
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {KATEGORI_TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.value}
                onClick={() => { setKategori(tab.value); setJenisFilter('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  kategori === tab.value
                    ? 'bg-gold-500 text-brown-900 shadow-sm'
                    : 'bg-brown-100 dark:bg-brown-800 text-brown-600 dark:text-brown-300 hover:bg-brown-200 dark:hover:bg-brown-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}

          {canManage && (
            <button onClick={openAdd} className="btn-primary ml-auto flex items-center gap-1.5 text-sm py-1.5">
              <Plus className="w-4 h-4" /> Tambah Item
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <form onSubmit={handleSearch} className="flex-1 min-w-40">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama produk..."
                className="input-field pl-9 text-sm"
              />
            </div>
          </form>

          <select
            value={jenisFilter}
            onChange={e => setJenisFilter(e.target.value)}
            className="input-field w-40 text-sm"
          >
            <option value="">Semua Jenis</option>
            {jenisList.map(j => <option key={j} value={j}>{j}</option>)}
          </select>

          {canManage && (
            <button
              onClick={() => setShowTersedia(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                showTersedia
                  ? 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-brown-200 dark:border-brown-700 text-brown-500 dark:text-brown-400'
              }`}
            >
              {showTersedia ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showTersedia ? 'Tersedia' : 'Semua'}
            </button>
          )}

          <button onClick={fetchKatalog} className="btn-outline p-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <span className="text-xs text-brown-400 ml-auto">{filtered.length} item</span>
        </div>
      </div>

      {/* ── Grid Katalog ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-0 overflow-hidden animate-pulse">
              <div className="aspect-square bg-brown-100 dark:bg-brown-800" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-brown-100 dark:bg-brown-800 rounded w-3/4" />
                <div className="h-3 bg-brown-100 dark:bg-brown-800 rounded w-1/2" />
                <div className="h-4 bg-brown-100 dark:bg-brown-800 rounded w-2/3 mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Gem className="w-12 h-12 mx-auto mb-3 text-brown-300 dark:text-brown-600" />
          <p className="text-brown-500 dark:text-brown-400 font-medium">
            {selectedCabang ? `Belum ada item di ${namaSelectedCabang}` : 'Belum ada item katalog'}
          </p>
          {canManage && (
            <button onClick={openAdd} className="btn-primary mt-4 inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Tambah Item Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(item => (
            <KatalogCard
              key={item.id}
              item={item}
              canManage={canManage}
              onEdit={openEdit}
              onDelete={setDeleteItem}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* ── Modal Tambah/Edit Item ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editItem ? `Edit — ${editItem.nama}` : 'Tambah Item Katalog'}
        size="md"
      >
        <FormKatalog
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
          loading={saving}
          editItem={editItem}
          onHapusGambar={handleHapusGambar}
          cabangList={cabangList}
        />
      </Modal>

      {/* ── Modal Kelola Cabang ── */}
      <Modal
        isOpen={showKelolaCabang}
        onClose={() => setShowKelolaCabang(false)}
        title="Kelola Cabang"
        size="md"
      >
        <ModalKelolaCabang
          cabangList={cabangList}
          onRefresh={() => { fetchCabang(); fetchKatalog() }}
          onClose={() => setShowKelolaCabang(false)}
        />
      </Modal>

      {/* ── Modal Hapus Item ── */}
      <Modal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        title="Hapus Item Katalog"
        size="sm"
      >
        {deleteItem && (
          <div className="space-y-4">
            <p className="text-brown-600 dark:text-brown-300">
              Yakin ingin menghapus <strong>{deleteItem.nama}</strong>? Foto produk juga akan ikut terhapus.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteItem(null)} className="btn-outline flex-1">Batal</button>
              <button onClick={handleDelete} className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors">
                Hapus
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
