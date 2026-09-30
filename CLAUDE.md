# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

StockFlow is a full-stack inventory/order management system for a small distributor. The entire stack runs via Docker Compose.

- **Backend**: Django 4.2 + DRF + PostgreSQL + Redis (`backend/`)
- **Frontend**: React 18 + Vite, no TypeScript, plain CSS variables (`frontend/src/`)
- **Auth**: JWT via `djangorestframework-simplejwt` (access 8h, refresh 7d)
- **Maps**: Leaflet + OpenStreetMap/Nominatim (no API key)
- **PDFs**: jsPDF + jspdf-autotable

## Running the project

Config and secrets live in `.env` (not versioned; copy `.env.example`). `SECRET_KEY` and `POSTGRES_PASSWORD` are required.

```bash
cd stockflow
make deploy        # production: build images (frontend compiled into nginx) and recreate containers
make dev           # development: docker-compose.yml + docker-compose.dev.yml (code mounted, --reload, Vite HMR)
make test          # run backend tests (dev stack must be up)
make makemigrations / migrate / shell-backend / shell-db / logs / reset
```

| Mode | Service | URL |
|------|---------|-----|
| prod | App (nginx: SPA + /api + /admin) | http://localhost (`HTTP_PORT`) |
| dev  | Vite dev server                  | http://localhost:3000 |
| dev  | Backend API                      | http://localhost:8000/api |
| dev  | PostgreSQL                       | 127.0.0.1:5432 |

In production only nginx publishes a port; db, redis and backend are internal. `DEBUG` defaults to `False` and Django refuses to start without `SECRET_KEY` unless `DEBUG=True`.

`backend/entrypoint.sh` runs `migrate` and `collectstatic` on every start. It does **not** run `makemigrations` (migrations are generated in dev and committed). The initial superuser is created only if the DB has none, using `ADMIN_USERNAME`/`ADMIN_PASSWORD` from `.env`.

## Testing

```bash
make test                                              # all backend tests (dev stack up)
docker compose exec backend python manage.py test apps.orders.test_delivery   # one module
```

- Tests live in each app: `orders/tests.py` (create/edit, pricing, stock policy), `orders/test_delivery.py` (deliver, routes), `orders/test_customers.py` (customers, CSV, account statement, price lists), `orders/test_numbering.py` (incl. multi-thread), `payments/tests.py`, `products/tests.py` (stock adjustments, CSV, section permissions), `users/tests.py`
- They run against PostgreSQL (the multi-thread numbering test needs real row locks); Redis is not needed
- CI: `.github/workflows/tests.yml` runs backend tests with coverage, checks `makemigrations --check`, and builds the frontend
- Every bug fix should come with a test that fails before the fix

## Backend architecture (`backend/apps/`)

### `products`
- Models: `Category`, `Supplier`, `Product`, `StockMovement`
- `Product` has `is_active` soft-delete (default queryset filters to active; `?all=true` includes inactive), `sort_order` (integer, configurable display order), `is_bundle` flag
- Bundle products: `is_bundle=True` → has `bundle_child` (self FK), `bundle_quantity`, `bundle_unit_weight`, `bundle_unit_price`; `price` is auto-calculated as `bundle_quantity × bundle_unit_price` on save
- Stock is decremented when an order is **created** (not confirmed), restored on cancellation — all wrapped in `transaction.atomic`
- `StockMovementViewSet` is read-only; all ViewSets need `pagination_class = None` for endpoints that must return full datasets (product pickers, dropdowns)
- CSV: `sku, nombre, descripcion, categoria, proveedor, precio, costo, stock, stock_min, orden, precio_unitario_bundle, cantidad_bundle, peso_unitario_bundle`

### `orders`
- Models: `Zone`, `PriceList`, `Customer`, `Order`, `OrderItem`, `OrderStatusHistory`, `DeliveryRoute`, `DeliveryRouteItem`
- **Zone**: `name`, `description`, `color` (hex, default `#6366f1`) — used to group and color-code customers on the map
- **Customer**: extended with `cuit` (unique auto-generated as `00-XXXXXXXX-0` if blank), `localidad`, `zone` (FK), `latitude`, `longitude`, `priority`; has M2M `enabled_products` restricting what a customer can order
- **Order**: `order_number` auto-generated as `NV-00000001` (sequential, see numbering below); status flow: `pending → partial → delivered` (driven by the `deliver` action), `pending`/`partial` → `cancelled`
- **DeliveryRoute**: `route_number` auto-generated as `HR-00000001` (sequential); `driver` FK to `auth.User`; status flow: `draft → in_progress → completed/cancelled`, `cancelled → draft`; an order can only be on one active route at a time
- **PriceList**: multiplier-based pricing linked to customers
- `available_orders` endpoint returns orders not yet on a route, ordered by `customer__priority, customer__name`
- CSV customers: `nombre, activo, cuit, email, telefono, direccion, localidad, zona, latitud, longitud, prioridad, lista_de_precios, productos_habilitados` (products as pipe-separated SKUs; `zona` creates the Zone if not exists on import; an unknown `lista_de_precios` or invalid `prioridad` is reported as a row error but the customer is still created; customers with an existing CUIT/email are skipped)

### `payments`
- Models: `Payment` (+ `needs_review` flag); rules in `payments/services.py` (tests: `python manage.py test apps.payments`)
- Transitions only via actions: `pending/processing → approved | rejected` (`approve`, `reject`), `approved → refunded` (`refund`); `status` is read-only in the serializer. Only pending payments are editable; approved/refunded can't be deleted. Amount must be > 0; cancelled orders accept no payments
- `SystemConfig.overpayment_policy` (`allow`/`warn`/`block`): amount vs. order balance (total − approved), checked on create and again on approve. `warn` → 409 `code=overpayment_warning` until resent with `confirm_overpayment: true`
- `SystemConfig.payment_approval` (`section`/`restricted`): `restricted` → approve/reject/refund/mark_reviewed only for superusers or `UserProfile.can_approve_payments`
- Order cancellation (`change_status` → `cancelled`, atomic): pending payments are always rejected; approved ones follow `SystemConfig.cancelled_order_payments`: `keep` (unchanged), `review` (sets `needs_review=True`, cleared by `refund` or `mark_reviewed`), `refund` (auto-refunded)

### `users`
- Models: `UserProfile` (OneToOne to `auth.User`), `SystemConfig` (singleton)
- `UserProfile.permissions`: JSONField; keys are section names, values are `'hidden'`, `'read'`, or `'write'`
- `UserProfile.is_driver`: BooleanField — only users with this flag appear as "repartidor" options in delivery routes
- **`SectionPermission`** (in `users/permissions.py`): custom DRF permission class applied to all ViewSets via `permission_classes = [IsAuthenticated, SectionPermission]` and a `permission_section = '<section>'` class attribute. `hidden` → 403; `read` + non-safe method → 403; superusers bypass all checks
- Section names used: `products`, `stock`, `orders`, `payments`, `routes`, `customers`, `price_lists`
- `UserViewSet`: CRUD + `me`, `export_csv`, `import_csv` — only `me` available to non-admin
- **`SystemConfig`**: singleton accessed via `SystemConfig.get()`; fields: `logo_svg` (text), `logo_width` (px, default 140), `pdf_logo_width` (mm, default 35), `stock_policy`, `overpayment_policy`, `cancelled_order_payments`, `payment_approval`. GET via `/api/users/config/`, PATCH (superuser only).

## Frontend architecture (`frontend/src/`)

### Context
- **`AuthContext`**: fetches `/api/users/me/` on load; stores JWT in `localStorage`; provides `user`, `isAdmin`, `login`, `logout`, `loading`. `usePermissions()` hook exposes `can(section, level)` and `isHidden(section)`
- **`ConfigContext`**: fetches `/api/users/config/` on load; provides `logoSvg`, `logoWidth`, `pdfLogoWidth`. Also exports `svgToPngDataUrl(svgString, pxWidth)` — uses `DOMParser` to detect SVG aspect ratio, renders to canvas, returns `{dataUrl, ratio, pxWidth}` for correct PDF scaling

### Services
- `services/api.js`: single Axios instance with Bearer token interceptor and auto-refresh on 401
- Named exports: `productsApi`, `zonesApi`, `priceListsApi`, `ordersApi`, `routesApi`, `paymentsApi`, `usersApi`

### Key pages / components
- **`Layout.jsx`**: filters nav items by `isHidden(perm)`; sections hidden if all their items are hidden; admin-only "Sistema" section (Usuarios, Configuración)
- **`MapPicker.jsx`**: standalone Leaflet map (raw, not react-leaflet) for placing a lat/lng pin; Nominatim search with `Accept-Language: es`; default center Rosario (-32.9468, -60.6393); draggable marker + click-to-place. **Note**: Leaflet default icons are broken in Vite — fix by overriding with `L.Icon.Default.mergeOptions({iconUrl: 'https://unpkg.com/...'})`
- **`MapPage.jsx`**: displays all customers as `L.circleMarker` colored by `zone.color`; zone legend (clickable filter); popup with name, address, phone, CUIT, zone; height `calc(100vh - 240px)`
- **`RoutesPage.jsx`**: PDF functions `downloadRouteSheet` (A4 portrait, columns: #, Pedido, Cliente, Dirección, Productos, Bultos, Total, Notas), `downloadAllReceipts` / `downloadSingleReceipt` (one receipt = 2 pages: original + duplicate). Receipt columns vary: without bundles (SKU, Producto, Cant., Unidad, Subtotal) vs. with bundles (adds Caja column). Logo loaded via `svgToPngDataUrl` from ConfigContext; footer shows total bultos
- **`SettingsPage.jsx`**: SVG upload + preview, sliders for `logo_width` (60–300px) and `pdf_logo_width` (10–80mm), saves to PATCH `/api/users/config/`
- **`OrdersPage.jsx`**: `CustomerCombobox` for filtered customer search; shows `last_order_date`; "Habilitar productos" modal when a customer has no enabled products

### Pagination gotcha
ViewSets that feed dropdowns or full pickers **must** set `pagination_class = None` (e.g. `CustomerViewSet`, `ProductViewSet`, `ZoneViewSet`). The global default is 20 items — easy to miss for lists that seem short but grow.

## API routes summary

```
POST /api/token/                          # login
POST /api/token/refresh/

GET/POST   /api/products/                 # products (sort_order, is_bundle, etc.)
GET/POST   /api/products/categories/
GET/POST   /api/products/suppliers/
GET        /api/products/movements/
GET        /api/products/export_csv/
POST       /api/products/import_csv/

GET/POST   /api/orders/                   # orders (NV-XXXXXXXX)
GET        /api/orders/today/?customer=<id>  # non-cancelled orders created today (local date) — create-order warning
GET/POST   /api/orders/customers/
GET/POST   /api/orders/zones/
GET/POST   /api/orders/price-lists/
GET/POST   /api/orders/routes/            # delivery routes (HR-XXXXXXXX)
GET        /api/orders/routes/available_orders/
POST       /api/orders/routes/{id}/change_status/
POST       /api/orders/routes/{id}/add_orders/
POST       /api/orders/routes/{id}/remove_item/
POST       /api/orders/routes/{id}/update_item/

GET/POST   /api/payments/

GET/POST   /api/users/                    # admin-only CRUD
GET        /api/users/me/
GET        /api/users/config/
PATCH      /api/users/config/             # superuser only
```

## Key business rules

- Order creation/edition logic lives in `orders/services.py` (tests: `docker compose exec backend python manage.py test apps.orders`)
- **Prices are computed server-side**: `product.price × customer.price_list.multiplier` (skipped if `fixed_price`), rounded half-up to cents. Any `unit_price` sent by the client is ignored
- Orders only accept active products enabled for the customer (`enabled_products`), active customers, integer quantities > 0, no repeated products, non-negative `shipping_cost`/`discount`
- **Stock policy** (`SystemConfig.stock_policy`, editable in Configuración): `allow` (default, stock may go negative) / `warn` (409 `code=stock_warning` + `shortages` until the client resends with `confirm_stock: true`) / `block` (400 `code=insufficient_stock`; superusers and users with `UserProfile.can_override_stock` get the `warn` flow instead). Products with `track_stock=False` are never checked. Orders accepted with shortages record it in the status history comment
- Stock decremented on order **creation**, restored on **cancellation**
- `deliver` is all-or-nothing: an invalid item rolls back the whole delivery
- Deleting a record referenced by `on_delete=PROTECT` (product/customer with orders) returns 400 via `stockflow/exceptions.py` instead of 500 — deactivate instead
- Manual stock adjustments: `in`/`out` need quantity > 0; `adjustment` sets the absolute stock (≥ 0)
- `Order.order_number` → `NV-00000001` format (sequential, not UUID)
- **Numbering** (NV, HR, auto CUIT) uses `NumberSequence` rows (`order_number`, `route_number`, `customer_auto_cuit`) locked with `select_for_update` inside the model's `save()` transaction: concurrent creations never collide and a rolled-back creation doesn't consume a number. Numbers already taken (e.g. entered manually) are skipped; a missing row is seeded from the current max. Tests: `apps/orders/test_numbering.py` (includes a multi-thread test)
- `DeliveryRoute.route_number` → `HR-00000001` format
- `Customer.cuit` auto-fills as `00-XXXXXXXX-0` (incrementing, unique) if left blank
- An order can only appear on one non-cancelled delivery route at a time
- `DeliveryRoute.driver` is an `auth.User` with `profile.is_driver = True`
- Bundle `price` is read-only / auto-calculated; edit `bundle_unit_price` and `bundle_quantity`
- `celery` is in `requirements.txt` but no tasks exist and no worker runs — not operational
