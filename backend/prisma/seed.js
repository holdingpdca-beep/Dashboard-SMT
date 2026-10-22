const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Seed HANYA membuat satu akun ADMIN awal.
// Password WAJIB diisi lewat environment variable SEED_ADMIN_PASSWORD —
// tidak ada password default (C-03). Akun superuser/user tidak di-seed
// agar tidak ada kredensial default yang bisa ditebak di production.
//
// Contoh menjalankan:
//   SEED_ADMIN_EMAIL=admin@smt.com SEED_ADMIN_PASSWORD='<password-kuat>' node prisma/seed.js
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@smt.com';
  const nama = process.env.SEED_ADMIN_NAMA || 'Administrator';
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    console.error(
      'FATAL: SEED_ADMIN_PASSWORD wajib di-set dan minimal 12 karakter.\n' +
      "Contoh: SEED_ADMIN_EMAIL=admin@smt.com SEED_ADMIN_PASSWORD='<password-kuat>' node prisma/seed.js"
    );
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    // Jangan timpa password akun yang sudah ada saat seed diulang
    update: {},
    create: { nama, email, password: hashedPassword, role: 'ADMIN' },
  });

  console.log(`Seed selesai. Akun ADMIN: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
