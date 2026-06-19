@echo off
title Yorum Analizi - Durdur
echo ===================================================
echo   YOUTUBE YORUM ANALIZI SISTEMI DURDURULUYOR
echo ===================================================
echo.

echo Backend (Port: 8000) surecleri kapatiliyor...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo PID %%a sonlandiriliyor...
    taskkill /f /pid %%a >nul 2>&1
)

echo Frontend (Port: 5173) surecleri kapatiliyor...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo PID %%a sonlandiriliyor...
    taskkill /f /pid %%a >nul 2>&1
)

echo Ek terminal pencereleri temizleniyor...
taskkill /f /fi "WINDOWTITLE eq FastAPI Backend" /im cmd.exe >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq Vite Frontend" /im cmd.exe >nul 2>&1

echo.
echo ===================================================
echo   Sistem basariyla durduruldu ve portlar temizlendi!
echo ===================================================
timeout /t 3 >nul
exit
