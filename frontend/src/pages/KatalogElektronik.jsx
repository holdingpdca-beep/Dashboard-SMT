import { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import { formatRupiah, GRADE_COLORS } from '../utils/format'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Monitor, PackageSearch } from 'lucide-react'

const GRADE_TABS = ['', 'A', 'B', 'C', 'D']
const PER_PAGE = 24

function KartuBarang({ item }) {
  return (
    <div className="card p-0 overflow-hidden flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
      <div className="p-4 flex flex-col flex-1">
        {/* Grade + jenis */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className={GRADE_COLORS[item.grade] || 'badge-gray'}>Grade {item.grade}</span>
          {item.jenisBarang && (
            <span className="text-[11px] uppercase tracking-wide text-brown-400 dark:text-brown-500 font-medium truncate">
              {item.jenisBarang}
            </span>
          )}
        </div>

        {/* Nama barang */}
        <p className="font-semibold text-brown-800 dark:text-gold-100 leading-snug line-clamp-2">
          {item.nama}
        </p>

        {/* Keterangan */}
        {item.keterangan && (
          <p className="text-sm text-brown-500 dark:text-brown-400 mt-1 line-clamp-3">
            {item.keterangan}
          </p>
        )}

        {/* Harga SMT */}
        <div className="mt-auto pt-3">
          <p className="text-[11px] text-brown-400 dark:text-brown-500 uppercase tracking-wide font-semibold">Harga SMT</p>
          <p className="text-gold-600 dark:text-gold-400 font-bold text-lg tracking-tight">
            {formatRupiah(item.hargaSmt)}
          </p>
          <p className="text-[11px] text-brown-400 dark:text-brown-500 mt-0.5">Belum termasuk PPN 1,1%</p>
        </div>
      </div>
    </div>
  )
}

export default function KatalogElektronik() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [grade, setGrade] = useState('')
  const [kategori, setKategori] = useState('')
  const [kategoriList, setKategoriList] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PER_PAGE, totalPages: 1 })

  const fetchData = useCallback(async (page = 1, q = search, g = grade, k = kategori) => {
    setLoading(true)
    try {
      const { data } = await api.get('/katalog-elektronik', {
        params: { page, limit: PER_PAGE, search: q, grade: g, kategori: k },
      })
      setItems(data.data)
      setPagination(data.pagination)
      if (Array.isArray(data.kategoriList)) setKategoriList(data.kategoriList)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [search, grade, kategori])

  // Debounce pencarian + filter grade + filter kategori
  useEffect(() => {
    const t = setTimeout(() => fetchData(1, search, grade, kategori), 350)
    return () => clearTimeout(t)
  }, [search, grade, kategori]) // eslint-disable-line react-hooks/exhaustive-deps

  const goPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return
    fetchData(p, search, grade, kategori)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Ubah "SMART WATCH" → "Smart Watch" untuk tampilan dropdown
  const labelKategori = (k) =>
    k.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="min-h-screen bg-beige dark:bg-brown-950 text-brown-900 dark:text-gold-200">
      {/* ── Header ── */}
      <header className="bg-white/90 dark:bg-brown-900/90 backdrop-blur border-b border-brown-100 dark:border-brown-800 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <img
            src="/logos/logo-smt.png"
            alt="Logo SMT"
            className="h-10 w-auto object-contain"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-brown-800 dark:text-gold-200 text-lg sm:text-xl leading-tight flex items-center gap-2">
              <Monitor className="w-5 h-5 text-gold-500 shrink-0" />
              Katalog Elektronik
            </h1>
            <p className="text-xs text-brown-400 dark:text-brown-500">Serba Mulia Group · Barang tersedia</p>
          </div>
        </div>
      </header>

      {/* ── Konten ── */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama barang atau keterangan..."
              className="input-field pl-9"
            />
          </div>

          {/* Filter kategori (jenis barang) */}
          <select
            value={kategori}
            onChange={e => setKategori(e.target.value)}
            className="input-field sm:w-48"
          >
            <option value="">Semua Kategori</option>
            {kategoriList.map(k => (
              <option key={k} value={k}>{labelKategori(k)}</option>
            ))}
          </select>

          <div className="flex gap-1.5 flex-wrap">
            {GRADE_TABS.map(g => (
              <button
                key={g || 'all'}
                onClick={() => setGrade(g)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  grade === g
                    ? 'bg-gold-500 text-brown-900 shadow-sm'
                    : 'bg-white dark:bg-brown-900 border border-brown-200 dark:border-brown-700 text-brown-600 dark:text-brown-300 hover:border-gold-400'
                }`}
              >
                {g ? `Grade ${g}` : 'Semua'}
              </button>
            ))}
          </div>
        </div>

        {/* Info jumlah */}
        <p className="text-sm text-brown-500 dark:text-brown-400 mb-3">
          {loading ? 'Memuat...' : `${pagination.total} barang tersedia`}
        </p>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card p-4 animate-pulse space-y-2">
                <div className="h-4 bg-brown-100 dark:bg-brown-800 rounded w-1/3" />
                <div className="h-4 bg-brown-100 dark:bg-brown-800 rounded w-3/4" />
                <div className="h-3 bg-brown-100 dark:bg-brown-800 rounded w-full" />
                <div className="h-5 bg-brown-100 dark:bg-brown-800 rounded w-1/2 mt-3" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="card py-16 text-center">
            <PackageSearch className="w-12 h-12 mx-auto mb-3 text-brown-300 dark:text-brown-600" />
            <p className="text-brown-500 dark:text-brown-400 font-medium">
              {search || grade || kategori ? 'Barang tidak ditemukan' : 'Belum ada barang tersedia'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map(item => <KartuBarang key={item.id} item={item} />)}
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => goPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-2 rounded-xl border border-brown-200 dark:border-brown-700 disabled:opacity-40 hover:border-gold-400 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-brown-600 dark:text-brown-400">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => goPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 rounded-xl border border-brown-200 dark:border-brown-700 disabled:opacity-40 hover:border-gold-400 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Catatan kaki */}
        <div className="mt-10 pt-6 border-t border-brown-100 dark:border-brown-800 text-center">
          <p className="text-xs text-brown-400 dark:text-brown-500">
            Semua harga <strong>belum termasuk PPN 1,1%</strong>. Ketersediaan barang dapat berubah sewaktu-waktu.
          </p>
          <p className="text-xs text-brown-300 dark:text-brown-600 mt-1">
            © {new Date().getFullYear()} Serba Mulia Group
          </p>
        </div>
      </main>
    </div>
  )
}
