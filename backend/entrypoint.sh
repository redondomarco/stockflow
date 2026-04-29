#!/bin/sh
set -e

echo "⏳ Esperando a PostgreSQL en ${DB_HOST:-db}:${DB_PORT:-5432}..."
while ! nc -z ${DB_HOST:-db} ${DB_PORT:-5432}; do
  sleep 1
done
echo "✅ PostgreSQL disponible"

echo "🔄 Generando migraciones..."
python manage.py makemigrations products orders payments --noinput

echo "🔄 Aplicando migraciones..."
python manage.py migrate --noinput

echo "📦 Recopilando archivos estáticos..."
python manage.py collectstatic --noinput

echo "👤 Creando superusuario admin (si no existe)..."
python manage.py shell << 'PYEOF'
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@stockflow.com', 'admin123')
    print('  -> Usuario admin creado')
else:
    print('  -> Usuario admin ya existe')
PYEOF

echo "🚀 Iniciando servidor..."
exec "$@"
