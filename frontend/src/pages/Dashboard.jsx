import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import SummaryCards from '../components/Dashboard/SummaryCards'
import { TrendProfitRugiChart, ProfitTable, RugiTable } from '../components/Dashboard/Charts'
import { RefreshCw, Calendar, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const today = () => new Date().toISOString().split('T')[0]
const firstDayOfMonth = (offset = 0) => {
  const d = new Date()
  d.setMonth(d.getMonth() + offset, 1)
  return d.toISOString().split('T')[0]
}
const lastDayOfMonth = (offset = 0) => {
  const d = new Date()
  d.setMonth(d.getMonth() + offset + 1, 0)
  return d.toISOString().split('T')[0]
}
const firstDayOfYear = () => `${new Date().getFullYear()}-01-01`

const PRESETS = [
  { label: 'Bulan Ini', start: firstDayOfMonth(0), end: lastDayOfMonth(0) },
  { label: 'Bulan Lalu', start: firstDayOfMonth(-1), end: lastDayOfMonth(-1) },
  { label: '3 Bulan', start: firstDayOfMonth(-2), end: lastDayOfMonth(0) },
  { label: 'Tahun Ini', start: firstDayOfYear(), end: today() },
]

export default function Dashboard() {
  const { canSeeCogs } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [perusahaan, setPerusahaan] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activePreset, setActivePreset] = useState(null)

  const fetchStats = async (sd = startDate, ed = endDate, p = perusahaan) => {
    setLoading(true)
    try {
      const params = {}
      if (p) params.perusahaan = p
      if (sd) params.startDate = sd
      if (ed) params.endDate = ed
      const { data } = await api.get('/items/stats', { params })
      setStats(data.data)
    } catch {
      toast.error('Gagal memuat statistik')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [perusahaan, startDate, endDate])

  const applyPreset = (preset) => {
    setActivePreset(preset.label)
    setStartDate(preset.start)
    setEndDate(preset.end)
  }

  const clearDate = () => {
    setActivePreset(null)
    setStartDate('')
    setEndDate('')
  }

  const hasDateFilter = startDate || endDate

  return (
    <div className="space-y-5">

      {/* Filter bar */}
      <div className="card p-4 space-y-3">
        {/* Row 1: Preset + Perusahaan + Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-brown-400 flex-shrink-0" />
          <span className="text-sm text-brown-500 dark:text-brown-400 flex-shrink-0">Periode:</span>

          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activePreset === p.label
                  ? 'bg-gold-500 text-brown-900 shadow-sm'
                  : 'bg-brown-100 dark:bg-brown-800 text-brown-600 dark:text-brown-300 hover:bg-brown-200 dark:hover:bg-brown-700'
              }`}
            >
              {p.label}
            </button>
          ))}

          {hasDateFilter && (
            <button
              onClick={clearDate}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <select
              value={perusahaan}
              onChange={e => setPerusahaan(e.target.value)}
              className="input-field w-40 text-sm"
            >
              <option value="">Semua Perusahaan</option>
              <option value="SERBA_MAS">Serba Mas</option>
              <option value="VOLARY">Volary</option>
            </select>
            <button onClick={() => fetchStats()} className="btn-outline p-2.5">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Custom date range */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-brown-400 dark:text-brown-500 w-16">Dari:</span>
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setActivePreset(null) }}
            className="input-field w-40 text-sm"
          />
          <span className="text-xs text-brown-400 dark:text-brown-500">s/d</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={e => { setEndDate(e.target.value); setActivePreset(null) }}
            className="input-field w-40 text-sm"
          />
          {hasDateFilter && (
            <span className="text-xs text-gold-600 dark:text-gold-400 font-medium">
              {startDate && endDate
                ? `${new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} — ${new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : startDate ? `Dari ${new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : `Sampai ${new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
              }
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards stats={stats} loading={loading} />

      {/* Analisa profit/rugi hanya untuk role yang boleh melihat COGS (H-02) */}
      {canSeeCogs() && (
        <>
          {/* Trend Profit & Rugi Gabungan */}
          <TrendProfitRugiChart profitData={stats?.trendProfit} rugiData={stats?.trendRugi} loading={loading} />

          {/* Tabel Profit per Bulan */}
          <ProfitTable data={stats?.trendProfit} loading={loading} />

          {/* Tabel Rugi per Bulan */}
          <RugiTable data={stats?.trendRugi} loading={loading} />
        </>
      )}

      {/* Info bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-gradient-to-br from-brown-800 to-brown-700 border-0">
          <p className="text-gold-300 text-xs font-semibold uppercase tracking-wider mb-1">Total Terjual</p>
          <p className="text-white text-3xl font-bold">{stats?.totalTerjual || 0}</p>
          <p className="text-brown-300 text-sm mt-1">Unit barang terjual</p>
        </div>
        <div className="card bg-gradient-to-br from-amber-700 to-amber-600 border-0">
          <p className="text-amber-100 text-xs font-semibold uppercase tracking-wider mb-1">Belum Terjual</p>
          <p className="text-white text-3xl font-bold">{stats?.totalBelumTerjual || 0}</p>
          <p className="text-amber-200 text-sm mt-1">Unit menunggu pembeli</p>
        </div>
        <div className="card bg-gradient-to-br from-gold-600 to-gold-500 border-0">
          <p className="text-brown-900 text-xs font-semibold uppercase tracking-wider mb-1">Konversi</p>
          <p className="text-brown-900 text-3xl font-bold">
            {stats?.totalSbg > 0 ? Math.round((stats.totalTerjual / stats.totalSbg) * 100) : 0}%
          </p>
          <p className="text-brown-800 text-sm mt-1">Tingkat penjualan</p>
        </div>
      </div>
    </div>
  )
}
