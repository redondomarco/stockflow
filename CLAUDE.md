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

```bash
cd stockflow
docker compose up --build   # first run (~3 min)
docker compose up           # subsequent runs
docker compose down -v      # full reset including volumes
make start / stop / build / migrate / shell-backend / shell-db / reset
```

| Service     | URL                        |
|-------------|----------------------------|
| Frontend    | http://localhost:3000       |
| Backend API | http://localhost:8000/api   |
| Admin       | http://localhost:8000/admin |
| Nginx proxy | http://localhost:80         |

Default credentials: `admin` / `admin123`

`backend/entrypoint.sh` auto-runs `makemigrations`, `migrate`, `collectstatic`, and creates the admin user on every container start.

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
- **Order**: `order_number` auto-generated as `NV-00000001` (sequential, regex-based max); status flow: `pending → confirmed → processing → shipped → delivered`, any cancellable state → `cancelled`
- **DeliveryRoute**: `route_number` auto-generated as `HR-00000001` (sequential); `driver` FK to `auth.User`; status flow: `draft → in_progress → completed/cancelled`, `cancelled → draft`; an order can only be on one active route at a time
- **PriceList**: multiplier-based pricing linked to customers
- `available_orders` endpoint returns orders not yet on a route, ordered by `customer__priority, customer__name`
- CSV customers: `nombre, cuit, email, telefono, direccion, localidad, zona, latitud, longitud, prioridad, lista_de_precios, productos_habilitados` (products as pipe-separated SKUs; `zona` creates the Zone if not exists on import)

### `payments`
- Models: `Payment`; status: `pending → approved / rejected`; approved → `refunded`

### `users`
- Models: `UserProfile` (OneToOne to `auth.User`), `SystemConfig` (singleton)
- `UserProfile.permissions`: JSONField; keys are section names, values are `'hidden'`, `'read'`, or `'write'`
- `UserProfile.is_driver`: BooleanField — only users with this flag appear as "repartidor" options in delivery routes
- **`SectionPermission`** (in `users/permissions.py`): custom DRF permission class applied to all ViewSets via `permission_classes = [IsAuthenticated, SectionPermission]` and a `permission_section = '<section>'` class attribute. `hidden` → 403; `read` + non-safe method → 403; superusers bypass all checks
- Section names used: `products`, `stock`, `orders`, `payments`, `routes`, `customers`, `price_lists`
- `UserViewSet`: CRUD + `me`, `export_csv`, `import_csv` — only `me` available to non-admin
- **`SystemConfig`**: singleton accessed via `SystemConfig.get()`; fields: `logo_svg` (text), `logo_width` (px, default 140), `pdf_logo_width` (mm, default 35). GET via `/api/users/config/`, PATCH (superuser only).

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

- Stock decremented on order **creation**, restored on **cancellation**
- `Order.order_number` → `NV-00000001` format (sequential, not UUID)
- `DeliveryRoute.route_number` → `HR-00000001` format
- `Customer.cuit` auto-fills as `00-XXXXXXXX-0` (incrementing, unique) if left blank
- An order can only appear on one non-cancelled delivery route at a time
- `DeliveryRoute.driver` is an `auth.User` with `profile.is_driver = True`
- Bundle `price` is read-only / auto-calculated; edit `bundle_unit_price` and `bundle_quantity`
- `celery` is in `requirements.txt` but no tasks exist and no worker runs — not operational
