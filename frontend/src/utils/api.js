import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    // L-08: hanya paksa logout+redirect bila token yang ADA ternyata ditolak
    // (sesi kedaluwarsa). Untuk request login itu sendiri, biarkan halaman login
    // menampilkan pesan error ("email/password salah"), jangan reload.
    const url = err.config?.url || ''
    const isLoginRequest = url.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginRequest && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
