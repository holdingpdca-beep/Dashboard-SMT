export const formatRupiah = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num)
}

export const formatNumber = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('id-ID').format(num)
}

export const formatDate = (date) => {
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(date))
}

export const formatDateTime = (date) => {
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
}

export const formatShortDate = (date) => {
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date))
}

export const STATUS_LABELS = {
  BELUM_TERJUAL: 'Belum Terjual',
  TERJUAL: 'Terjual',
}

export const INVOICE_STATUS_LABELS = {
  DRAFT: 'Draft',
  WAITING_APPROVAL: 'Menunggu Approval',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  PRINTED: 'Dicetak',
  CANCELLED: 'Dibatalkan',
}

export const PERUSAHAAN_LABELS = {
  VOLARY: 'Volary',
  SERBA_MAS: 'Serba Mas',
}

export const JENIS_PEMBELI_LABELS = {
  KARYAWAN_INTERNAL: 'Karyawan Internal',
  EKSTERNAL: 'Eksternal',
  PENGEPUL: 'Pengepul',
}

export const JENIS_PEMBELI_OPTIONS = [
  { value: 'KARYAWAN_INTERNAL', label: 'Karyawan Internal' },
  { value: 'EKSTERNAL', label: 'Eksternal' },
  { value: 'PENGEPUL', label: 'Pengepul' },
]

export const JENIS_PEMBELI_COLORS = {
  KARYAWAN_INTERNAL: 'badge-info',
  EKSTERNAL: 'badge-gold',
  PENGEPUL: 'badge-warning',
}

export const GRADE_COLORS = {
  A: 'badge-success',
  B: 'badge-info',
  C: 'badge-warning',
  D: 'badge-danger',
}

export const INVOICE_STATUS_COLORS = {
  DRAFT: 'badge-gray',
  WAITING_APPROVAL: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  PRINTED: 'badge-gold',
  CANCELLED: 'badge-gray',
}
