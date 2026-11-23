import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { formatDateTime } from '../utils/format'
import { Plus, Edit2, Trash2, KeyRound, RefreshCw, UserCheck, UserX } from 'lucide-react'

const ROLES = [
  { value: 'USER', label: 'User' },
  { value: 'SUPER_USER', label: 'Super User' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'KATALOG_USER', label: 'Katalog User' },
]

const ROLE_COLORS = {
  ADMIN: 'badge-danger',
  SUPER_USER: 'badge-gold',
  USER: 'badge-info',
  KATALOG_USER: 'badge-success',
}

const emptyForm = { nama: '', email: '', password: '', role: 'USER' }

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formLoading, setFormLoading] = useState(false)
  const [showReset, setShowReset] = useState(null)
  const [newPassword, setNewPassword] = useState('')

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users')
      setUsers(data.data)
    } catch { toast.error('Gagal memuat data user') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchUsers() }, [])

  const openCreate = () => { setForm(emptyForm); setEditUser(null); setShowForm(true) }
  const openEdit = (u) => {
    setForm({ nama: u.nama, email: u.email, password: '', role: u.role })
    setEditUser(u); setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormLoading(true)
    try {
      if (editUser) {
        const payload = { nama: form.nama, email: form.email, role: form.role }
        await api.put(`/users/${editUser.id}`, payload)
        toast.success('User berhasil diperbarui')
      } else {
        await api.post('/users', form)
        toast.success('User berhasil dibuat')
      }
      setShowForm(false)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan')
    } finally { setFormLoading(false) }
  }

  const handleToggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive })
      toast.success(`User ${u.isActive ? 'dinonaktifkan' : 'diaktifkan'}`)
      fetchUsers()
    } catch { toast.error('Gagal mengubah status') }
  }

  const handleDelete = async (u) => {
    if (!window.confirm(`Hapus user ${u.nama}?`)) return
    try {
      await api.delete(`/users/${u.id}`)
      toast.success('User berhasil dihapus')
      fetchUsers()
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menghapus') }
  }

  const handleReset = async () => {
    if (!newPassword.trim()) return toast.error('Password baru wajib diisi')
    try {
      await api.post(`/users/${showReset.id}/reset-password`, { passwordBaru: newPassword })
      toast.success('Password berhasil direset')
      setShowReset(null); setNewPassword('')
    } catch { toast.error('Gagal reset password') }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-brown-800 dark:text-gold-300">Manajemen User</h2>
          <p className="text-sm text-brown-500 dark:text-brown-400">{users.length} user terdaftar</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchUsers} className="btn-outline p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Tambah User
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full sticky-table">
          <thead>
            <tr>
              <th className="table-header">Nama</th>
              <th className="table-header">Email</th>
              <th className="table-header">Role</th>
              <th className="table-header">Status</th>
              <th className="table-header">Terdaftar</th>
              <th className="table-header text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-brown-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Memuat...
              </td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gold-50/50 dark:hover:bg-brown-800/30 transition-colors">
                <td className="table-cell font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center text-brown-900 font-bold text-sm flex-shrink-0">
                      {u.nama.charAt(0).toUpperCase()}
                    </div>
                    {u.nama}
                  </div>
                </td>
                <td className="table-cell text-brown-500">{u.email}</td>
                <td className="table-cell"><span className={ROLE_COLORS[u.role]}>{ROLES.find(r => r.value === u.role)?.label || u.role}</span></td>
                <td className="table-cell">
                  <span className={u.isActive ? 'badge-success' : 'badge-gray'}>{u.isActive ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td className="table-cell text-sm text-brown-500">{formatDateTime(u.createdAt)}</td>
                <td className="table-cell">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-brown-400 hover:text-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/20" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleToggleActive(u)} className={`p-1.5 rounded-lg transition-colors ${u.isActive ? 'text-brown-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-brown-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`} title={u.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
                      {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setShowReset(u); setNewPassword('') }} className="p-1.5 rounded-lg text-brown-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Reset Password">
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(u)} className="p-1.5 rounded-lg text-brown-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Hapus">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editUser ? `Edit User — ${editUser.nama}` : 'Tambah User Baru'} size="sm"
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="btn-outline">Batal</button>
            <button onClick={handleSubmit} disabled={formLoading} className="btn-primary">
              {formLoading ? 'Menyimpan...' : editUser ? 'Simpan' : 'Buat User'}
            </button>
          </>
        }>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="label">Nama Lengkap *</label>
            <input value={form.nama} onChange={e => setForm(p => ({...p, nama: e.target.value}))} className="input-field" required /></div>
          <div><label className="label">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} className="input-field" required /></div>
          {!editUser && (
            <div><label className="label">Password *</label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} className="input-field" required /></div>
          )}
          <div><label className="label">Role</label>
            <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))} className="input-field">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select></div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={!!showReset} onClose={() => { setShowReset(null); setNewPassword('') }} title={`Reset Password — ${showReset?.nama}`} size="sm"
        footer={
          <>
            <button onClick={() => { setShowReset(null); setNewPassword('') }} className="btn-outline">Batal</button>
            <button onClick={handleReset} className="btn-primary">Reset Password</button>
          </>
        }>
        <div><label className="label">Password Baru *</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input-field" placeholder="Minimal 10 karakter" /></div>
      </Modal>
    </div>
  )
}
