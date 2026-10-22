// Kebijakan password terpusat (M-06).
// Dipakai saat ganti password, buat user, dan reset password.

const BCRYPT_COST = 12;

// Daftar password umum yang dilarang (termasuk default lama aplikasi).
const COMMON_PASSWORDS = new Set([
  'admin123', 'password', 'password1', 'password123', '12345678', '123456789',
  '1234567890', 'qwerty123', 'admin1234', 'serbamas', 'serbamas123', 'rahasia123',
  'dashboard', 'smt123456', 'adminadmin',
]);

// Kembalikan pesan error (string) bila tidak valid, atau null bila lolos.
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) {
    return 'Password minimal 10 karakter';
  }
  if (pw.length > 128) {
    return 'Password terlalu panjang (maksimal 128 karakter)';
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return 'Password terlalu umum/mudah ditebak, gunakan yang lebih kuat';
  }
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Password harus mengandung minimal satu huruf dan satu angka';
  }
  return null;
}

module.exports = { validatePassword, BCRYPT_COST, COMMON_PASSWORDS };
