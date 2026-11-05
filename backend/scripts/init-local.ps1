# Host modu: init.sql'i bilgisayarda kurulu SQL Server'a uygular (Windows kimlik doğrulaması).
# Kullanım (backend klasöründen):  powershell -ExecutionPolicy Bypass -File scripts/init-local.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { throw ".env bulunamadı: önce .env.example dosyasını .env olarak kopyalayın." }

$cfg = @{}
foreach ($line in Get-Content $envFile -Encoding UTF8) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() }
}

$instance = if ($cfg['LOCAL_SQL_INSTANCE']) { $cfg['LOCAL_SQL_INSTANCE'] } else { '.' }
$appUser  = if ($cfg['APP_DB_USER']) { $cfg['APP_DB_USER'] } else { 'study_app' }
$appPass  = $cfg['APP_DB_PASSWORD']
if (-not $appPass) { throw "APP_DB_PASSWORD .env içinde tanımlı olmalı." }

Write-Host "[init-local] $instance üzerinde init.sql çalıştırılıyor..."
& sqlcmd -S $instance -E -C -b -I -f 65001 -i (Join-Path $root 'sql\init.sql') `
    -v "APP_DB_USER=$appUser" "APP_DB_PASSWORD=$appPass"
if ($LASTEXITCODE -ne 0) { throw "sqlcmd hata kodu: $LASTEXITCODE" }
Write-Host "[init-local] tamamlandı."
