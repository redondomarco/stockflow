#!/bin/sh
# Restaura un backup generado por scripts/backup.sh (reemplaza los datos actuales).
#   scripts/restore.sh backups/stockflow-AAAAMMDD-HHMMSS.sql.gz   (o `make restore FILE=...`)
set -eu

cd "$(dirname "$0")/.."
FILE="${1:?Uso: scripts/restore.sh <archivo .sql.gz>}"
[ -f "$FILE" ] || { echo "No existe: $FILE" >&2; exit 1; }

if [ "${FORCE:-}" != "1" ]; then
    printf 'Esto REEMPLAZA todos los datos actuales con %s. ¿Continuar? [escribí "si"] ' "$FILE"
    read -r answer
    [ "$answer" = "si" ] || { echo "Cancelado."; exit 1; }
fi

echo "Deteniendo el backend..."
docker compose stop backend

echo "Restaurando..."
gzip -dc "$FILE" | docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null

echo "Iniciando el backend (aplica migraciones pendientes)..."
docker compose start backend
echo "Restauración completa."
