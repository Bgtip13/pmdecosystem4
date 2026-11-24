@echo off
setlocal
cd /d "%~dp0"
title PMD Ecosystem - HR dan Akunting

:menu
echo.
echo ==============================================
echo   PMD Ecosystem - menu cepat
echo ==============================================
echo   1. Pasang dependensi (npm install)  - jalankan sekali dulu
echo   2. Jalankan backend Convex (npx convex dev)
echo   3. Jalankan aplikasi (npx expo start)
echo   4. Deploy backend ke production (npx convex deploy)
echo   5. Publish update preview (eas update)
echo   6. Cek tipe (npx tsc --noEmit)
echo   0. Keluar
echo ==============================================
set /p pilih=Pilih nomor: 

if "%pilih%"=="1" call npm install & goto menu
if "%pilih%"=="2" call npx convex dev & goto menu
if "%pilih%"=="3" call npx expo start & goto menu
if "%pilih%"=="4" call npx convex deploy & goto menu
if "%pilih%"=="5" call npx eas update --channel preview --message "Role HR dan Akunting" & goto menu
if "%pilih%"=="6" call npx tsc --noEmit & goto menu
if "%pilih%"=="0" goto selesai
echo Pilihan tidak dikenal.
goto menu

:selesai
endlocal
