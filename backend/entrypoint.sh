#!/bin/sh
set -e

echo "⏳ Esperando a PostgreSQL en ${DB_HOST:-db}:${DB_PORT:-5432}..."
while ! nc -z ${DB_HOST:-db} ${DB_PORT:-5432}; do
  sleep 1
done
echo "✅ PostgreSQL disponible"

# Las migraciones se generan en desarrollo y se versionan en git;
# acá solo se aplican.
echo "🔄 Aplicando migraciones..."
python manage.py migrate --noinput

echo "📦 Recopilando archivos estáticos..."
python manage.py collectstatic --noinput

# Superusuario inicial solo en una base sin superusuarios, con la contraseña de .env
python manage.py shell << 'PYEOF'
import os
from django.contrib.auth import get_user_model
User = get_user_model()
if User.objects.filter(is_superuser=True).exists():
    print('👤 Ya existe un superusuario')
elif os.environ.get('ADMIN_PASSWORD'):
    User.objects.create_superuser(
        os.environ.get('ADMIN_USERNAME', 'admin'), os.environ.get('ADMIN_EMAIL', ''), os.environ['ADMIN_PASSWORD'],
    )
    print('👤 Superusuario inicial creado')
else:
    print('⚠️  No hay superusuarios: definí ADMIN_PASSWORD en .env o usá "manage.py createsuperuser"')
PYEOF

echo "🚀 Iniciando servidor..."
exec "$@"
