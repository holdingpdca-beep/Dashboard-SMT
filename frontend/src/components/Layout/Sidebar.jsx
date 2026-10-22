import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Package, FileText, History, Users, ScrollText, LogOut, ChevronRight, ChevronDown, Gem, Boxes, Coins, Sparkles, Tv } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// Menu level atas
const dashboardItem = { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true }
const katalogItem = { to: '/katalog', label: 'Katalog Emas', icon: Gem }

// Grup Elektronik — dropdown berisi Data Elektronik, Invoice, Riwayat
const elektronikItems = [
  { to: '/elektronik', label: 'Data Elektronik', icon: Package },
  { to: '/invoice', label: 'Invoice', icon: FileText },
  { to: '/riwayat', label: 'Riwayat Penjualan', icon: History },
]

// Grup Barang ART (khusus ADMIN) — dropdown dengan 2 sub-menu
const barangArtItems = [
  { to: '/barang-art/logam-mulia', label: 'Logam Mulia', icon: Coins },
  { to: '/barang-art/perhiasan', label: 'Perhiasan', icon: Sparkles },
]

const adminItems = [
  { to: '/users', label: 'Manajemen User', icon: Users, role: 'ADMIN' },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, role: 'SUPER_USER' },
]

// Dropdown menu yang bisa dipakai ulang (Elektronik, Barang ART, dll)
function NavGroup({ label, icon: Icon, items, collapsed }) {
  const location = useLocation()
  const groupActive = items.some(s => location.pathname === s.to || location.pathname.startsWith(s.to + '/'))
  const [open, setOpen] = useState(groupActive)

  const subActiveOf = (sub) => location.pathname === sub.to || location.pathname.startsWith(sub.to + '/')

  if (collapsed) {
    return (
      <>
        <div className="border-t border-brown-800/50 my-2" />
        {items.map(sub => {
          const SubIcon = sub.icon
          const active = subActiveOf(sub)
          return (
            <NavLink key={sub.to} to={sub.to} className={`sidebar-link ${active ? 'active' : ''}`} title={`${label} — ${sub.label}`}>
              <SubIcon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-gold-400' : ''}`} />
            </NavLink>
          )
        })}
      </>
    )
  }

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className={`sidebar-link w-full ${groupActive ? 'active' : ''}`}>
        <Icon className={`w-5 h-5 flex-shrink-0 ${groupActive ? 'text-gold-400' : ''}`} />
        <span className="text-sm font-medium">{label}</span>
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-1 border-l border-brown-800/50 pl-2">
          {items.map(sub => {
            const SubIcon = sub.icon
            const active = subActiveOf(sub)
            return (
              <NavLink key={sub.to} to={sub.to} className={`sidebar-link ${active ? 'active' : ''}`}>
                <SubIcon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-gold-400' : ''}`} />
                <span className="text-sm font-medium">{sub.label}</span>
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout, isAdmin, canManageUsers, isSuperUser, isKatalogOnly } = useAuth()
  const location = useLocation()

  const katalogOnly = isKatalogOnly()
  const showBarangArt = isAdmin() && !katalogOnly

  // Renderer untuk link level atas (Dashboard, Katalog Emas)
  const renderLink = (item) => {
    const Icon = item.icon
    const isActive = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to)
    return (
      <NavLink key={item.to} to={item.to} className={`sidebar-link ${isActive ? 'active' : ''}`} title={collapsed ? item.label : ''}>
        <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-gold-400' : ''}`} />
        {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
      </NavLink>
    )
  }

  const filteredAdmin = katalogOnly ? [] : adminItems.filter(item => {
    if (item.role === 'ADMIN') return canManageUsers()
    if (item.role === 'SUPER_USER') return isSuperUser()
    return true
  })

  return (
    <div className={`flex flex-col h-full bg-gradient-to-b from-brown-900 to-brown-950 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Logo area */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-brown-800/50">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <img src="/logos/logo-serbamas.png" alt="SMT" className="h-10 w-10 object-contain" />
            <div>
              <p className="text-gold-300 font-bold text-sm leading-tight">SMT</p>
              <p className="text-brown-400 text-xs">Dashboard Elektronik</p>
            </div>
          </div>
        )}
        {collapsed && <img src="/logos/logo-serbamas.png" alt="SMT" className="h-8 w-8 object-contain mx-auto" />}
        <button
          onClick={onToggle}
          className="text-brown-400 hover:text-gold-400 transition-colors p-1 rounded-lg hover:bg-brown-800 ml-auto"
        >
          <ChevronRight className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {katalogOnly ? (
          renderLink(katalogItem)
        ) : (
          <>
            {renderLink(dashboardItem)}
            <NavGroup label="Elektronik" icon={Tv} items={elektronikItems} collapsed={collapsed} />
            {renderLink(katalogItem)}
            {showBarangArt && <NavGroup label="Barang ART" icon={Boxes} items={barangArtItems} collapsed={collapsed} />}
          </>
        )}

        {filteredAdmin.length > 0 && (
          <>
            {!collapsed && <p className="text-brown-500 text-xs uppercase tracking-wider font-semibold px-4 pt-3 pb-1">Admin</p>}
            {collapsed && <div className="border-t border-brown-800/50 my-2" />}
            {filteredAdmin.map(item => {
              const Icon = item.icon
              const isActive = location.pathname.startsWith(item.to)
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : ''}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-gold-400' : ''}`} />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </NavLink>
              )
            })}
          </>
        )}
      </nav>

      {/* User info */}
      <div className="border-t border-brown-800/50 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center text-brown-900 font-bold text-sm flex-shrink-0">
              {user?.nama?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-gold-200 text-sm font-medium truncate">{user?.nama}</p>
              <p className="text-brown-400 text-xs capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center text-brown-900 font-bold text-xs">
              {user?.nama?.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 text-brown-400 hover:text-red-400 hover:bg-red-900/10 rounded-xl transition-all text-sm"
          title={collapsed ? 'Logout' : ''}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  )
}
