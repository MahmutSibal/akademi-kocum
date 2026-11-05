#!/bin/bash
# SQL Server sağlıklı olduktan sonra init.sql'i çalıştırır ve çıkar.
set -euo pipefail

SQLCMD=/opt/mssql-tools18/bin/sqlcmd

echo "[db-init] SQL Server'a bağlanılıyor..."
for i in $(seq 1 30); do
  if "$SQLCMD" -S sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -b -Q "SELECT 1" -o /dev/null; then
    break
  fi
  echo "[db-init] bekleniyor ($i/30)"
  sleep 2
done

echo "[db-init] init.sql çalıştırılıyor..."
"$SQLCMD" -S sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -b -I -f 65001 \
  -i /sql/init.sql \
  -v APP_DB_USER="$APP_DB_USER" APP_DB_PASSWORD="$APP_DB_PASSWORD"

echo "[db-init] tamamlandı."
