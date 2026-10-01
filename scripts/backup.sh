#!/bin/sh
# Backup de la base de datos: dump comprimido en backups/ y borrado de los viejos.
#   scripts/backup.sh                 (o `make backup`)
#   BACKUP_KEEP_DAYS=30 scripts/backup.sh
# Pensado para correr desde cron; ver docs/DEPLOY-DIGITALOCEAN.md.
set -eu

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

FILE="$BACKUP_DIR/stockflow-$(date +%Y%m%d-%H%M%S).sql.gz"
TMP="$FILE.partial"

# --clean --if-exists: el dump borra y recrea las tablas al restaurarlo
docker compose exec -T db sh -c 'pg_dump --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$TMP"

# Un dump completo termina con la marca de pg_dump; si no, se descarta
if ! gzip -dc "$TMP" | tail -n 20 | grep -q "PostgreSQL database dump complete"; then
    rm -f "$TMP"
    echo "ERROR: el dump quedó incompleto" >&2
    exit 1
fi
mv "$TMP" "$FILE"
chmod 600 "$FILE"
echo "Backup: $FILE ($(du -h "$FILE" | cut -f1))"

find "$BACKUP_DIR" -name 'stockflow-*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/Borrado (más de '"$KEEP_DAYS"' días): /'
