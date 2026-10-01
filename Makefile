DC = docker compose
DC_DEV = docker compose -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: start stop restart build deploy logs shell-backend shell-db migrate reset \
        backup restore dev dev-build makemigrations test

# ── Producción ────────────────────────────────────────────────
start:
	$(DC) up -d

stop:
	$(DC) down

restart:
	$(DC) restart

build:
	$(DC) up -d --build

# Reconstruye imágenes (backend + frontend compilado) y recrea los contenedores
deploy:
	$(DC) up -d --build --remove-orphans

logs:
	$(DC) logs -f

migrate:
	$(DC) exec backend python manage.py migrate

shell-backend:
	$(DC) exec backend python manage.py shell

shell-db:
	$(DC) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

reset:
	$(DC) down -v

# Backup comprimido en backups/ (retención: BACKUP_KEEP_DAYS, 14 por defecto)
backup:
	./scripts/backup.sh

# make restore FILE=backups/stockflow-AAAAMMDD-HHMMSS.sql.gz
restore:
	./scripts/restore.sh $(FILE)

# ── Desarrollo ────────────────────────────────────────────────
dev:
	$(DC_DEV) up

dev-build:
	$(DC_DEV) up --build

# Las migraciones se generan en desarrollo y se commitean
makemigrations:
	$(DC_DEV) exec backend python manage.py makemigrations

test:
	$(DC_DEV) exec backend python manage.py test apps --noinput
