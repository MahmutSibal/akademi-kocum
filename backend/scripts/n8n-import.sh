#!/bin/sh
# n8n başlamadan önce çalışır: SQL credential'ını oluşturur, workflow'ları import edip aktifleştirir.
# Aynı id'lerle tekrar import edildiği için her `docker compose up`'ta güvenle çalışır.
set -eu

CRED_FILE=/tmp/ak-credentials.json
trap 'rm -f "$CRED_FILE"' EXIT

cat > "$CRED_FILE" <<EOF
[{
  "id": "akMssqlCred00001",
  "name": "StudyAssistant SQL",
  "type": "microsoftSql",
  "data": {
    "server": "${APP_DB_HOST}",
    "port": ${APP_DB_PORT},
    "database": "StudyAssistant",
    "user": "${APP_DB_USER}",
    "password": "${APP_DB_PASSWORD}",
    "domain": "",
    "tls": true,
    "allowUnauthorizedCerts": true,
    "tdsVersion": "7_4",
    "connectTimeout": 15000,
    "requestTimeout": 120000
  }
}]
EOF

echo "[n8n-import] credential import ediliyor..."
n8n import:credentials --input="$CRED_FILE"

if [ -n "${BREVO_SMTP_USER:-}" ] && [ -n "${BREVO_SMTP_PASSWORD:-}" ]; then
  cat > "$CRED_FILE" <<EOF
[{
  "id": "akBrevoSmtp00001",
  "name": "Brevo SMTP",
  "type": "smtp",
  "data": {
    "user": "${BREVO_SMTP_USER}",
    "password": "${BREVO_SMTP_PASSWORD}",
    "host": "${BREVO_SMTP_HOST:-smtp-relay.brevo.com}",
    "port": ${BREVO_SMTP_PORT:-587},
    "ssl": false,
    "tls": true
  }
}]
EOF
  echo "[n8n-import] Brevo SMTP credential import ediliyor..."
  n8n import:credentials --input="$CRED_FILE"
else
  echo "[n8n-import] Brevo SMTP atlandı: BREVO_SMTP_USER/PASSWORD tanımlı değil."
fi

echo "[n8n-import] workflow'lar import ediliyor..."
n8n import:workflow --separate --input=/workflows

echo "[n8n-import] workflow'lar aktifleştiriliyor..."
for f in /workflows/*.json; do
  id=$(sed -n 's/^  "id": "\([^"]*\)".*/\1/p' "$f" | head -n 1)
  [ -n "$id" ] || continue
  # n8n 2.x: publish:workflow, 1.x: update:workflow --active=true
  n8n publish:workflow --id="$id" >/dev/null 2>&1 \
    || n8n update:workflow --id="$id" --active=true >/dev/null 2>&1 \
    || echo "[n8n-import] UYARI: $id aktifleştirilemedi"
done
echo "[n8n-import] tamamlandı."
