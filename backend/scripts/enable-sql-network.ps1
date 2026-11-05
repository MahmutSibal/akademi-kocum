# Docker'daki n8n'in bilgisayardaki SQL Server'a bağlanabilmesi için TEK SEFERLİK ayar.
# YÖNETİCİ PowerShell'de çalıştırın:
#   powershell -ExecutionPolicy Bypass -File scripts/enable-sql-network.ps1
#
# Yaptıkları (varsayılan instance MSSQLSERVER için):
#   1. Karma kimlik doğrulama (Windows + SQL login) — n8n SQL login ile bağlanır
#   2. TCP/IP protokolünü açar, sabit port 1433
#   3. SQL Server servisini yeniden başlatır
param(
    [string]$InstanceId = 'MSSQL17.MSSQLSERVER',   # SQL Server 2025 varsayılan instance
    [string]$ServiceName = 'MSSQLSERVER',
    [int]$Port = 1433
)
$ErrorActionPreference = 'Stop'

$base = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$InstanceId\MSSQLServer"
if (-not (Test-Path $base)) { throw "Instance bulunamadı: $InstanceId" }

Set-ItemProperty -Path $base -Name LoginMode -Value 2
Write-Host "Karma kimlik doğrulama açıldı."

$tcp = "$base\SuperSocketNetLib\Tcp"
Set-ItemProperty -Path $tcp -Name Enabled -Value 1
Set-ItemProperty -Path "$tcp\IPAll" -Name TcpPort -Value "$Port"
Set-ItemProperty -Path "$tcp\IPAll" -Name TcpDynamicPorts -Value ''
Write-Host "TCP/IP açıldı, port $Port."

Restart-Service -Name $ServiceName -Force
Write-Host "$ServiceName yeniden başlatıldı."

Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort | Format-Table
