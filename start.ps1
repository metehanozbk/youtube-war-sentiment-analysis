# YouTube Yorum Analiz Sistemi
# Baslat: .\start.ps1

$Host.UI.RawUI.WindowTitle = "Yorum Analiz Sistemi"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Clear-Host
Write-Host "YouTube Yorum Analiz Sistemi baslatiliyor..." -ForegroundColor Cyan
Write-Host ""

$ROOT     = $PSScriptRoot
$BACKEND  = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"
$VENV     = Join-Path $ROOT "venv"
$REQS     = Join-Path $ROOT "requirements.txt"

if (-not (Test-Path $BACKEND)) {
    Write-Host "HATA: backend klasoru bulunamadi." -ForegroundColor Red
    Write-Host "Script projenin kok klasorunde olmali." -ForegroundColor Yellow
    pause; exit 1
}

# Python kontrol
Write-Host "[1/6] Python kontrol ediliyor..." -ForegroundColor Yellow
$pythonExe = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3") {
            $pythonExe = $cmd
            Write-Host "      $ver" -ForegroundColor Green
            break
        }
    } catch {}
}
if (-not $pythonExe) {
    Write-Host ""
    Write-Host "HATA: Python 3 bulunamadi." -ForegroundColor Red
    Write-Host "https://www.python.org/downloads/ adresinden yukleyin." -ForegroundColor Yellow
    Write-Host "Kurulumda 'Add Python to PATH' secenegini isaretleyin." -ForegroundColor Yellow
    Write-Host ""
    pause; exit 1
}

# Node.js kontrol
Write-Host "[2/6] Node.js kontrol ediliyor..." -ForegroundColor Yellow
try {
    $nodeVer = node --version 2>&1
    $npmVer  = npm --version 2>&1
    Write-Host "      Node $nodeVer  npm $npmVer" -ForegroundColor Green
} catch {
    Write-Host "HATA: Node.js bulunamadi." -ForegroundColor Red
    Write-Host "https://nodejs.org adresinden LTS surumunu yukleyin." -ForegroundColor Yellow
    pause; exit 1
}

# venv kontrol / olustur
Write-Host "[3/6] Sanal ortam kontrol ediliyor..." -ForegroundColor Yellow

$venvPython = Join-Path $VENV "Scripts\python.exe"
$venvValid  = $false

if (Test-Path $venvPython) {
    try {
        $venvVer = & $venvPython --version 2>&1
        if ($venvVer -match "Python 3") { $venvValid = $true }
    } catch {}
}

if (-not $venvValid) {
    if (Test-Path $VENV) {
        Write-Host "      Mevcut venv gecersiz, yeniden olusturuluyor..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $VENV
    }
    & $pythonExe -m venv $VENV
    if ($LASTEXITCODE -ne 0) {
        Write-Host "HATA: venv olusturulamadi." -ForegroundColor Red
        pause; exit 1
    }
    Write-Host "      venv olusturuldu." -ForegroundColor Green
} else {
    Write-Host "      venv hazir." -ForegroundColor Green
}

$VENV_PYTHON = Join-Path $VENV "Scripts\python.exe"
$VENV_PIP    = Join-Path $VENV "Scripts\pip.exe"

# Python paketleri
Write-Host "[4/6] Python paketleri yukleniyor..." -ForegroundColor Yellow
if (Test-Path $REQS) {
    & $VENV_PIP install -r $REQS -q --upgrade 2>&1 | Where-Object { $_ -match "^ERROR" } | ForEach-Object {
        Write-Host "      $_" -ForegroundColor Yellow
    }
    Write-Host "      Paketler hazir." -ForegroundColor Green
} else {
    Write-Host "      requirements.txt bulunamadi, atlanıyor." -ForegroundColor Yellow
}

# node_modules
Write-Host "[5/6] Frontend bagimliliklari kontrol ediliyor..." -ForegroundColor Yellow
$NODE_MODULES = Join-Path $FRONTEND "node_modules"

if (-not (Test-Path $NODE_MODULES)) {
    Write-Host "      npm install calistiriliyor..." -ForegroundColor Yellow
    Push-Location $FRONTEND
    npm install --loglevel=error 2>&1 | Where-Object { $_ -match "^npm ERR" } | ForEach-Object {
        Write-Host "      $_" -ForegroundColor Red
    }
    Pop-Location
    if (-not (Test-Path $NODE_MODULES)) {
        Write-Host "HATA: npm install basarisiz." -ForegroundColor Red
        pause; exit 1
    }
    Write-Host "      node_modules hazir." -ForegroundColor Green
} else {
    Write-Host "      node_modules mevcut." -ForegroundColor Green
}

# Veri dosyalari
Write-Host "[6/6] Veri dosyalari kontrol ediliyor..." -ForegroundColor Yellow

$EXCEL_BACKUP = Join-Path $ROOT "youtube_war_comments_sentiment.xlsx"
$DB_FILE      = Join-Path $BACKEND "comments.db"

if (Test-Path $EXCEL_BACKUP) {
    Write-Host "      Excel yedek mevcut." -ForegroundColor Green
} else {
    Write-Host "      Excel yedegi yok, ilk calistirmada olusturulacak." -ForegroundColor Cyan
}

if (Test-Path $DB_FILE) {
    $dbSize = (Get-Item $DB_FILE).Length / 1MB
    Write-Host ("      Veritabani: {0:N2} MB" -f $dbSize) -ForegroundColor Green
} else {
    Write-Host "      Veritabani yok, Excel'den yuklenecek." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Servisler baslatiliyor..." -ForegroundColor Cyan

# Backend
$backendScript = @"
`$Host.UI.RawUI.WindowTitle = 'Backend :8000'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location '$BACKEND'
& '$VENV_PYTHON' main.py
Write-Host 'Backend durdu.' -ForegroundColor Yellow
pause
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript

Start-Sleep -Seconds 1

# Frontend
$frontendScript = @"
`$Host.UI.RawUI.WindowTitle = 'Frontend :5173'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location '$FRONTEND'
npm run dev
Write-Host 'Frontend durdu.' -ForegroundColor Yellow
pause
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript

Write-Host ""
Write-Host "Sistem hazir:" -ForegroundColor Green
Write-Host "  Arayuz : http://localhost:5173"
Write-Host "  API    : http://localhost:8000"
Write-Host ""
Write-Host "Durdurmak icin: stop.bat" -ForegroundColor DarkGray
Write-Host ""

Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"
