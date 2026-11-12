@echo off
title Dashboard SMT - Update Database (Prisma)
color 0B
echo.
echo  ================================================
echo    UPDATE DATABASE - Dashboard SMT
echo  ================================================
echo.
echo  Langkah ini menambah kolom baru (sold_by_id) & menyiapkan
echo  Prisma Client terbaru. Aman, tidak menghapus data.
echo.
echo  PENTING: TUTUP dulu jendela "Backend" (jalankan-backend.bat)
echo  sebelum lanjut, supaya file tidak terkunci.
echo.
pause

:: Masuk ke folder backend
cd /d "%~dp0backend"
echo.
echo  Folder aktif: %CD%
echo.

echo  [1/2] Menyiapkan Prisma Client...
call npx prisma generate
if errorlevel 1 (
  echo.
  echo  [GAGAL] Prisma generate error. Pastikan jendela Backend sudah DITUTUP, lalu coba lagi.
  echo.
  pause
  exit /b 1
)

echo.
echo  [2/2] Menerapkan perubahan ke database...
call npx prisma db push
if errorlevel 1 (
  echo.
  echo  [GAGAL] db push error. Pastikan MySQL menyala & DATABASE_URL benar di backend\.env
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================
echo    SELESAI! Sekarang jalankan lagi jalankan-backend.bat
echo  ================================================
echo.
pause
