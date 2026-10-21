import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Elektronik from './pages/Elektronik'
import Invoice from './pages/Invoice'
import Riwayat from './pages/Riwayat'
import Katalog from './pages/Katalog'
import BarangArt from './pages/BarangArt'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-beige dark:bg-brown-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-brown-600 dark:text-gold-400 font-medium">Memuat...</p>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user } = useAuth()
  return user?.role === 'ADMIN' ? children : <Navigate to="/" replace />
}

function SuperRoute({ children }) {
  const { user } = useAuth()
  return ['ADMIN', 'SUPER_USER'].includes(user?.role) ? children : <Navigate to="/" replace />
}

// Rute yang tidak bisa diakses KATALOG_USER — redirect ke /katalog
function BlockKatalogUser({ children }) {
  const { user } = useAuth()
  return user?.role === 'KATALOG_USER' ? <Navigate to="/katalog" replace /> : children
}

export default function App() {
  const { user } = useAuth()

  // KATALOG_USER masuk ke /katalog langsung
  const homeElement = user?.role === 'KATALOG_USER'
    ? <Navigate to="/katalog" replace />
    : <Dashboard />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={homeElement} />
        <Route path="elektronik" element={<BlockKatalogUser><Elektronik /></BlockKatalogUser>} />
        <Route path="invoice"    element={<BlockKatalogUser><Invoice /></BlockKatalogUser>} />
        <Route path="riwayat"    element={<BlockKatalogUser><Riwayat /></BlockKatalogUser>} />
        <Route path="katalog"    element={<Katalog />} />
        <Route path="barang-art/logam-mulia" element={<AdminRoute><BarangArt kategori="LOGAM_MULIA" /></AdminRoute>} />
        <Route path="barang-art/perhiasan"   element={<AdminRoute><BarangArt kategori="PERHIASAN" /></AdminRoute>} />
        <Route path="users"      element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="audit"      element={<SuperRoute><AuditLog /></SuperRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
