#!/bin/sh
# Restaura un backup generado por scripts/backup.sh (reemplaza los datos actuales).
#   scripts/restore.sh backups/stockflow-AAAAMMDD-HHMMSS.sql.gz   (o `make restore FILE=...`)
#
# La base queda idéntica al backup: se vacía el esquema completo y se carga el dump
# en UNA transacción (si algo falla, la base queda como estaba). Al iniciar, el
# backend aplica las migraciones posteriores al backup.
set -eu

cd "$(dirname "$0")/.."
FILE="${1:?Uso: scripts/restore.sh <archivo .sql.gz>}"
[ -f "$FILE" ] || { echo "No existe: $FILE" >&2; exit 1; }
gzip -t "$FILE" 2>/dev/null || { echo "El archivo está dañado o no es un .gz: $FILE" >&2; exit 1; }

if [ "${FORCE:-}" != "1" ]; then
    printf 'Esto REEMPLAZA todos los datos actuales con %s. ¿Continuar? [escribí "si"] ' "$FILE"
    read -r answer
    [ "$answer" = "si" ] || { echo "Cancelado."; exit 1; }
fi

echo "Deteniendo el backend..."
docker compose stop backend
# Pase lo que pase, el backend vuelve a iniciarse
trap 'echo "Iniciando el backend (aplica migraciones pendientes)..."; docker compose start backend' EXIT

echo "Restaurando..."
{
    echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
    gzip -dc "$FILE"
} | docker compose exec -T db sh -c \
    'PGOPTIONS="-c client_min_messages=warning" psql --single-transaction -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null \
    || { echo "ERROR: la restauración falló; la base quedó como estaba." >&2; exit 1; }

echo "Restauración completa."
