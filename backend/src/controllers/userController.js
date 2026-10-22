const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const { createAuditLog } = require('../utils/audit');
const { validatePassword, BCRYPT_COST } = require('../utils/password');

const getUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, nama: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { nama, email, password, role } = req.body;
    if (!nama || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi' });
    }
    const pwError = validatePassword(password);
    if (pwError) {
      return res.status(400).json({ success: false, message: pwError });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Format email tidak valid' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ success: false, message: 'Email sudah terdaftar' });

    const hashed = await bcrypt.hash(password, BCRYPT_COST);
    const user = await prisma.user.create({
      data: { nama, email, password: hashed, role: role || 'USER' },
      select: { id: true, nama: true, email: true, role: true, createdAt: true },
    });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `BUAT USER: ${email} (${role || 'USER'})`,
      tabel: 'User',
      dataBaru: { nama, email, role },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'User berhasil dibuat', data: user });
  } catch (err) {
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { nama, email, role, isActive } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

    // Normalisasi isActive menjadi boolean bila dikirim (L-03)
    let isActiveBaru = existing.isActive;
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ success: false, message: 'isActive harus bernilai true atau false' });
      }
      isActiveBaru = isActive;
    }

    // Admin tidak boleh menurunkan role / menonaktifkan dirinya sendiri (L-03)
    if (id === req.user.id) {
      if (role && role !== existing.role) {
        return res.status(400).json({ success: false, message: 'Tidak dapat mengubah role akun sendiri' });
      }
      if (isActive === false) {
        return res.status(400).json({ success: false, message: 'Tidak dapat menonaktifkan akun sendiri' });
      }
    }

    // Cegah menghilangkan ADMIN aktif terakhir (turun role atau nonaktif) (L-03)
    const adminAkanHilang =
      existing.role === 'ADMIN' && existing.isActive &&
      ((role && role !== 'ADMIN') || isActiveBaru === false);
    if (adminAkanHilang) {
      const adminAktif = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminAktif <= 1) {
        return res.status(400).json({ success: false, message: 'Minimal harus ada satu ADMIN aktif' });
      }
    }

    if (email && email !== existing.email) {
      const dup = await prisma.user.findUnique({ where: { email } });
      if (dup) return res.status(400).json({ success: false, message: 'Email sudah digunakan' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        nama: nama || existing.nama,
        email: email || existing.email,
        role: role || existing.role,
        isActive: isActiveBaru,
      },
      select: { id: true, nama: true, email: true, role: true, isActive: true },
    });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `EDIT USER: ${existing.email}`,
      tabel: 'User',
      dataLama: { nama: existing.nama, email: existing.email, role: existing.role },
      dataBaru: { nama: updated.nama, email: updated.email, role: updated.role },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'User berhasil diperbarui', data: updated });
  } catch (err) {
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun sendiri' });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

    // Cegah menghapus ADMIN aktif terakhir (L-03)
    if (existing.role === 'ADMIN' && existing.isActive) {
      const adminAktif = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminAktif <= 1) {
        return res.status(400).json({ success: false, message: 'Minimal harus ada satu ADMIN aktif' });
      }
    }

    await prisma.user.delete({ where: { id } });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `HAPUS USER: ${existing.email}`,
      tabel: 'User',
      dataLama: { nama: existing.nama, email: existing.email, role: existing.role },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'User berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { passwordBaru } = req.body;

    // Wajibkan password baru yang eksplisit & cukup kuat (M-06)
    const pwError = validatePassword(passwordBaru);
    if (pwError) {
      return res.status(400).json({ success: false, message: pwError });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

    const hashed = await bcrypt.hash(passwordBaru, BCRYPT_COST);
    // Reset password sekaligus revoke semua token lama user tsb (M-05)
    await prisma.user.update({
      where: { id },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: `RESET PASSWORD USER: ${existing.email}`,
      tabel: 'User',
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Password berhasil direset' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser, resetPassword };
