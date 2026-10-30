const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { createAuditLog } = require('../utils/audit');
const { validatePassword, BCRYPT_COST } = require('../utils/password');

// Hash dummy untuk menyamakan waktu respons ketika email tidak ada (L-03).
// Cost HARUS sama dengan BCRYPT_COST agar waktu bcrypt.compare untuk email tak terdaftar
// setara dengan email terdaftar — mencegah user enumeration via timing.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-untuk-timing-safety', BCRYPT_COST);

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Selalu jalankan bcrypt.compare (pakai hash dummy bila user tidak ada) → waktu konstan
    const isValid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

    if (!user || !user.isActive || !isValid) {
      // Catat percobaan login gagal untuk deteksi brute-force (M-09)
      await createAuditLog({
        userId: user ? user.id : null,
        namaUser: user ? user.nama : email,
        aktivitas: `LOGIN GAGAL (${email})`,
        ipAddress: req.ip,
      });
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    // L-03: rehash password lama yang masih memakai cost di bawah BCRYPT_COST,
    // agar waktu verifikasi login seragam (dan keamanan hash meningkat). Tidak
    // mengubah tokenVersion → sesi aktif tetap berlaku.
    try {
      if (bcrypt.getRounds(user.password) < BCRYPT_COST) {
        const rehashed = await bcrypt.hash(password, BCRYPT_COST);
        await prisma.user.update({ where: { id: user.id }, data: { password: rehashed } });
      }
    } catch (_) { /* abaikan kegagalan rehash — tidak boleh menggagalkan login */ }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await createAuditLog({
      userId: user.id,
      namaUser: user.nama,
      aktivitas: 'LOGIN',
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        user: { id: user.id, nama: user.nama, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    // Naikkan tokenVersion → semua token lama (termasuk di perangkat lain) langsung invalid (M-05)
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: 'LOGOUT',
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Logout berhasil' });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, nama: true, email: true, role: true, createdAt: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { passwordLama, passwordBaru } = req.body;
    if (!passwordLama || !passwordBaru) {
      return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi' });
    }
    const pwError = validatePassword(passwordBaru);
    if (pwError) {
      return res.status(400).json({ success: false, message: pwError });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isValid = await bcrypt.compare(passwordLama, user.password);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Password lama salah' });
    }

    const hashed = await bcrypt.hash(passwordBaru, BCRYPT_COST);
    // Ganti password sekaligus revoke semua token lama (M-05)
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });

    await createAuditLog({
      userId: req.user.id,
      namaUser: req.user.nama,
      aktivitas: 'GANTI PASSWORD',
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Password berhasil diubah. Silakan login ulang.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, logout, getMe, changePassword };
