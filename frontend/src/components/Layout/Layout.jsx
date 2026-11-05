import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/elektronik': 'Data Elektronik',
  '/riwayat': 'Riwayat Penjualan',
  '/katalog': 'Katalog Emas',
  '/users': 'Manajemen User',
  '/audit': 'Audit Log',
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] || 'Dashboard'

  return (
    <div className="flex h-screen bg-beige dark:bg-brown-950 overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - desktop */}
      <div className="hidden lg:flex flex-col h-full">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
      </div>

      {/* Sidebar - mobile */}
      <div className={`fixed left-0 top-0 h-full z-30 lg:hidden transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar onMenuToggle={() => setMobileOpen(p => !p)} title={title} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
