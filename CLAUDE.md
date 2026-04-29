# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

StockFlow is a full-stack inventory management system for stock, orders, and payments. The entire stack runs via Docker Compose.

- **Backend**: Django 4.2 + DRF + PostgreSQL + Redis
- **Frontend**: React 18 + Vite (no TypeScript, no CSS framework — plain CSS)
- **Auth**: JWT via `djangorestframework-simplejwt`

## Running the project

```bash
cd stockflow
docker compose up --build   # first run (~3 min)
docker compose up           # subsequent runs
docker compose down -v      # full reset including volumes
```

| Service       | URL                        |
|---------------|----------------------------|
| Frontend      | http://localhost:3000       |
| Backend API   | http://localhost:8000/api   |
| Django Admin  | http://localhost:8000/admin |
| Nginx proxy   | http://localhost:80         |

Default credentials: `admin` / `admin123`

## Common backend commands (exec into running container)

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py shell
docker compose exec backend python manage.py createsuperuser
docker compose exec db psql -U stockflow -d stockflow

# Rebuild only the backend image
docker compose up --build backend
```

## Architecture

### Backend (`backend/`)

All Django apps live in `backend/apps/`:

- **products** — `Category`, `Supplier`, `Product`, `StockMovement`. Stock is adjusted atomically with every state-changing operation; all changes are recorded as `StockMovement` rows. `Product` has an `is_active` soft-delete flag — the default queryset filters to `is_active=True`; pass `?all=true` to include inactive ones. `StockMovementViewSet` is read-only.
- **orders** — `PriceList`, `Customer`, `Order`, `OrderItem`, `OrderStatusHistory`. `Customer` optionally links to a `PriceList` (multiplier-based pricing) and a M2M `enabled_products` field that restricts which products a customer can order. Creating an order decrements stock immediately (wrapped in `transaction.atomic`). Cancelling an order restores stock. Order status transitions are validated against a strict allowlist (`VALID_TRANSITIONS` in `orders/views.py`).
- **payments** — `Payment`. Payments reference orders and move through `pending → approved / rejected`; only `approved` payments can be `refunded`.

All ViewSets use `IsAuthenticated`. Filtering is provided by `django-filter` + DRF's `SearchFilter`/`OrderingFilter`.

Products and customers support CSV import/export via `POST /api/products/import_csv/` and `GET /api/products/export_csv/` (same pattern under `/api/orders/customers/`). CSV columns: products use `sku, nombre, descripcion, categoria, proveedor, precio, costo, stock, stock_min`; customers use `nombre, email, telefono, direccion`. Files must be UTF-8 (BOM accepted). Import skips rows whose SKU/email already exists.

`celery` is listed in `requirements.txt` but no tasks are defined and no worker service exists in `docker-compose.yml` — it is not operational.

`backend/entrypoint.sh` runs on container start: waits for Postgres, auto-runs `makemigrations`, `migrate`, `collectstatic`, and creates the `admin` superuser if absent.

Settings read from environment variables; `dj_database_url` parses `DATABASE_URL`. Redis is configured as the default cache backend via `django-redis`.

### Frontend (`frontend/src/`)

- `context/AuthContext.jsx` — stores JWT tokens in `localStorage`; exposes `useAuth()` hook with `user`, `login`, `logout`.
- `services/api.js` — single Axios instance with request interceptor (attaches Bearer token) and response interceptor (auto-refreshes on 401 or redirects to `/login`). All API calls go through the named exports: `productsApi`, `ordersApi`, `paymentsApi`.
- `App.jsx` — React Router v6 with a `PrivateRoute` wrapper. All protected routes render inside `<Layout />`.
- Pages are self-contained (fetch + local state); no global state manager (no Redux/Zustand).

### Nginx (`nginx/`)

Reverse proxy routing: `/api` → backend:8000, everything else → frontend:3000. Also serves Django static files from the shared `static_volume`.

## Key business rules

- Stock is decremented when an order is **created**, not when it's confirmed or shipped.
- Stock is restored when an order is **cancelled** (any cancellable state).
- `Product.stock_min` drives low-stock alerts (`is_low_stock` property). `Product.margin` is a computed property: `((price - cost) / price) * 100`, returns `None` if cost is 0.
- `Order.order_number` is auto-generated (`ORD-<8 hex chars>`) on first save.
- JWT access token lifetime: 8 hours; refresh token: 7 days.
- API pagination: 20 items per page (`PageNumberPagination`).
