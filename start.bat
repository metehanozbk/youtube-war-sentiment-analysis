@echo off
title Yorum Analizi - Baslat
echo ===================================================
echo   YOUTUBE YORUM ANALIZI SISTEMI BASLATILIYOR
echo ===================================================
echo.

echo [1/3] Backend (FastAPI) baslatiliyor...
start "FastAPI Backend" cmd /k "venv\Scripts\python.exe backend\main.py"

echo [2/3] Frontend (Vite React) baslatiliyor...
start "Vite Frontend" cmd /k "cd frontend && npm run dev"

echo [3/3] Tarayici aciliyor...
timeout /t 3 >nul
start http://localhost:5173

echo.
echo ===================================================
echo   Sistem basariyla baslatildi!
echo   Durdurmak icin stop.bat dosyasini calistirabilirsiniz.
echo ===================================================
timeout /t 3 >nul
exit
