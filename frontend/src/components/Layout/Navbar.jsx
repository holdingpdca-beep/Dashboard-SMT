import { Sun, Moon, Bell, Menu, CheckCheck, Package, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

function formatWaktu(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return 'Baru saja'
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

const TIPE_ICON = {
  APPROVAL_REQUEST: <Package className="w-4 h-4 text-yellow-500" />,
  APPROVED: <ThumbsUp className="w-4 h-4 text-green-500" />,
  REJECTED: <ThumbsDown className="w-4 h-4 text-red-500" />,
}

export default function Navbar({ onMenuToggle, title }) {
  const { isDark, toggleTheme } = useTheme()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [jumlahBelumDibaca, setJumlahBelumDibaca] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const intervalRef = useRef(null)

  const fetchJumlah = useCallback(async () => {
    try {
      const res = await api.get('/notifikasi/jumlah')
      setJumlahBelumDibaca(res.data.jumlah)
    } catch {
      // silent
    }
  }, [])

  const fetchNotifikasi = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/notifikasi')
      setNotifs(res.data.data)
      setJumlahBelumDibaca(res.data.jumlahBelumDibaca)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJumlah()
    intervalRef.current = setInterval(fetchJumlah, 30000)
    return () => clearInterval(intervalRef.current)
  }, [fetchJumlah])

  useEffect(() => {
    if (open) fetchNotifikasi()
  }, [open, fetchNotifikasi])

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleKlikNotif(notif) {
    if (!notif.dibaca) {
      await api.patch(`/notifikasi/${notif.id}/baca`)
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, dibaca: true } : n))
      setJumlahBelumDibaca(prev => Math.max(0, prev - 1))
    }
    setOpen(false)
    if (notif.invoiceId) navigate('/riwayat')
  }

  async function handleBacaSemua() {
    await api.patch('/notifikasi/baca-semua')
    setNotifs(prev => prev.map(n => ({ ...n, dibaca: true })))
    setJumlahBelumDibaca(0)
  }

  return (
    <header className="h-16 bg-white dark:bg-brown-900 border-b border-brown-100 dark:border-brown-800 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden text-brown-500 hover:text-brown-800 dark:text-brown-400 dark:hover:text-gold-400 p-2 rounded-lg hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-brown-800 dark:text-gold-300">{title}</h1>
          <p className="text-xs text-brown-400 dark:text-brown-500 hidden sm:block">Dashboard Serba Mas Tentram</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-brown-500 hover:text-brown-800 dark:text-brown-400 dark:hover:text-gold-400 hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors"
          title={isDark ? 'Mode Terang' : 'Mode Gelap'}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Bell + Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(v => !v)}
            className="p-2 rounded-xl text-brown-500 hover:text-brown-800 dark:text-brown-400 dark:hover:text-gold-400 hover:bg-brown-50 dark:hover:bg-brown-800 transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {jumlahBelumDibaca > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold leading-none">
                {jumlahBelumDibaca > 99 ? '99+' : jumlahBelumDibaca}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-12 w-80 bg-white dark:bg-brown-900 border border-brown-100 dark:border-brown-700 rounded-2xl shadow-xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-brown-100 dark:border-brown-800">
                <span className="font-semibold text-brown-800 dark:text-gold-300 text-sm">Notifikasi</span>
                {jumlahBelumDibaca > 0 && (
                  <button
                    onClick={handleBacaSemua}
                    className="flex items-center gap-1 text-xs text-gold-600 dark:text-gold-400 hover:underline"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Baca semua
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="py-8 text-center text-sm text-brown-400">Memuat...</div>
                ) : notifs.length === 0 ? (
                  <div className="py-8 text-center text-sm text-brown-400 dark:text-brown-500">
                    Tidak ada notifikasi
                  </div>
                ) : (
                  notifs.map(n => (
                    <button
                      key={n.id}
                      onClick={() => handleKlikNotif(n)}
                      className={`w-full text-left px-4 py-3 flex gap-3 border-b border-brown-50 dark:border-brown-800 last:border-0 transition-colors ${
                        n.dibaca
                          ? 'bg-white dark:bg-brown-900'
                          : 'bg-gold-50 dark:bg-brown-800 hover:bg-gold-100 dark:hover:bg-brown-700'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {TIPE_ICON[n.tipe] ?? <Bell className="w-4 h-4 text-brown-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-tight ${n.dibaca ? 'text-brown-500 dark:text-brown-400' : 'font-semibold text-brown-800 dark:text-gold-200'}`}>
                          {n.judul}
                        </p>
                        <p className="text-xs text-brown-400 dark:text-brown-500 mt-0.5 line-clamp-2 leading-tight">
                          {n.pesan}
                        </p>
                        <p className="text-[10px] text-brown-300 dark:text-brown-600 mt-1">
                          {formatWaktu(n.createdAt)}
                        </p>
                      </div>
                      {!n.dibaca && (
                        <div className="w-2 h-2 rounded-full bg-gold-500 shrink-0 mt-1.5" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-brown-100 dark:border-brown-800 ml-1">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center text-brown-900 font-bold text-sm">
            {user?.nama?.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-brown-800 dark:text-gold-200 leading-tight">{user?.nama}</p>
            <p className="text-xs text-brown-400 dark:text-brown-500 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
