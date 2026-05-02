DC = docker compose

.PHONY: start stop restart build logs shell-backend shell-db migrate reset

start:
	$(DC) up -d

stop:
	$(DC) down

restart:
	$(DC) restart

build:
	$(DC) up -d --build

logs:
	$(DC) logs -f

migrate:
	$(DC) exec backend python manage.py migrate

shell-backend:
	$(DC) exec backend python manage.py shell

shell-db:
	$(DC) exec db psql -U stockflow -d stockflow

reset:
	$(DC) down -v
