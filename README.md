# StockFlow 📦

Sistema completo de gestión de stock, pedidos y pagos.

## Stack
- **Backend**: Django 4.2 + Django REST Framework + PostgreSQL
- **Frontend**: React 18 + Vite + Recharts
- **Infraestructura**: Docker + Docker Compose + Nginx + Redis

---

## 🚀 Inicio rápido

### Requisitos
- Docker >= 24
- Docker Compose >= 2

### Configuración

```bash
cd stockflow
cp .env.example .env
# completar SECRET_KEY, POSTGRES_PASSWORD, ALLOWED_HOSTS y ADMIN_PASSWORD
```

### Producción

```bash
make deploy        # compila frontend y backend y levanta todo
```

Para publicarlo en internet con HTTPS (DigitalOcean), seguí [docs/DEPLOY-DIGITALOCEAN.md](docs/DEPLOY-DIGITALOCEAN.md).

La app queda en `http://<servidor>` (puerto `HTTP_PORT`, 80 por defecto). Solo nginx expone un puerto.

### Desarrollo

```bash
make dev           # código montado con recarga automática
make test          # tests del backend
```

| Servicio | URL |
|---|---|
| Frontend (Vite) | http://localhost:3000 |
| Backend (API) | http://localhost:8000/api |
| Django Admin | http://localhost:8000/admin |

### Credenciales

El superusuario inicial se crea solo si la base no tiene ninguno, con `ADMIN_USERNAME` / `ADMIN_PASSWORD` de `.env`. Si no, crearlo con:

```bash
docker compose exec backend python manage.py createsuperuser
```

---

## 📁 Estructura del proyecto

```
stockflow/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── manage.py
│   ├── requirements.txt
│   ├── stockflow/           # Configuración Django
│   │   ├── settings.py
│   │   └── urls.py
│   └── apps/
│       ├── products/        # Productos, categorías, proveedores, stock
│       ├── orders/          # Pedidos, clientes, items
│       └── payments/        # Pagos y estados
├── frontend/
│   ├── Dockerfile
│   ├── vite.config.js
│   └── src/
│       ├── pages/           # Dashboard, Products, Orders, Payments, etc.
│       ├── components/      # Layout, Sidebar
│       ├── services/        # API client (axios)
│       └── context/         # AuthContext (JWT)
└── nginx/
    └── nginx.conf
```

---

## 🔌 API Endpoints

Todas las rutas requieren JWT salvo `/api/token/`. Los permisos por sección (oculto / lectura / escritura) se configuran por usuario.

### Autenticación
```
POST /api/token/                          → Obtener access + refresh token
POST /api/token/refresh/                  → Renovar access token
```

### Productos y stock
```
GET/POST   /api/products/                    → Listar (?all=true incluye inactivos) / Crear
GET/PATCH  /api/products/{id}/               → Detalle / Editar
POST       /api/products/{id}/adjust_stock/  → Entrada, salida o ajuste de stock
GET        /api/products/{id}/movements/     → Historial de movimientos
GET        /api/products/low_stock/          → Productos en o bajo el mínimo
GET        /api/products/stats/              → Estadísticas
GET        /api/products/export_csv/         → Exportar CSV
POST       /api/products/import_csv/         → Importar CSV
GET/POST   /api/products/categories/         → Categorías
GET/POST   /api/products/suppliers/          → Proveedores
GET        /api/products/movements/          → Todos los movimientos
```

### Pedidos
```
GET/POST   /api/orders/                      → Listar / Crear (precio calculado en el servidor)
GET/PATCH  /api/orders/{id}/                 → Detalle / Editar (ítems solo si está pendiente)
POST       /api/orders/{id}/deliver/         → Registrar entrega total o parcial
POST       /api/orders/{id}/change_status/   → Anular
GET        /api/orders/today/?customer=<id>  → Pedidos del cliente cargados hoy
GET        /api/orders/stats/                → Estadísticas
```

### Clientes, zonas y listas de precios
```
GET/POST   /api/orders/customers/                      → Clientes (?all=1, ?inactive=1)
GET/POST   /api/orders/customers/{id}/products/        → Productos habilitados
GET        /api/orders/customers/{id}/account_statement/ → Cuenta corriente
GET        /api/orders/customers/debt_dashboard/       → Clientes con saldo pendiente
GET/POST   /api/orders/customers/export_csv/ | import_csv/
GET/POST   /api/orders/zones/                          → Zonas
GET/POST   /api/orders/price-lists/                    → Listas de precios (+ export_csv / import_csv)
```

### Hojas de ruta
```
GET/POST   /api/orders/routes/                         → Listar / Crear (HR-XXXXXXXX)
PATCH      /api/orders/routes/{id}/                    → Fecha, repartidor, notas
GET        /api/orders/routes/available_orders/        → Pedidos sin hoja activa
POST       /api/orders/routes/{id}/change_status/      → draft → in_progress → completed / cancelled
POST       /api/orders/routes/{id}/add_orders/ | remove_item/ | update_item/
```

### Pagos
```
GET/POST   /api/payments/                    → Listar / Registrar (queda pendiente)
POST       /api/payments/{id}/approve/       → Aprobar
POST       /api/payments/{id}/reject/        → Rechazar
POST       /api/payments/{id}/refund/        → Reembolsar
POST       /api/payments/{id}/mark_reviewed/ → Conservar cobro de pedido anulado
GET        /api/payments/stats/              → Estadísticas
```

### Usuarios y configuración
```
GET/POST   /api/users/                       → Usuarios (solo administradores)
GET        /api/users/me/                    → Usuario actual y permisos
GET/PATCH  /api/users/config/                → Logo y políticas del sistema (PATCH: superusuario)
```

---

## 🔄 Flujo de estados

**Pedidos**
```
pending ──entrega parcial──▶ partial ──entrega total──▶ delivered
   │                            │
   └──────────▶ cancelled ◀─────┘
```
Al anular se devuelve al stock lo no entregado y se aplican las políticas de pagos.

**Pagos**
```
pending ──▶ approved ──▶ refunded
   └──────▶ rejected
```

**Hojas de ruta**
```
draft ──▶ in_progress ──▶ completed
  │            │
  └──▶ cancelled ◀┘   (cancelled ──▶ draft)
```

---

## ⚙️ Comandos útiles

```bash
# Ver logs
docker compose logs -f backend
docker compose logs -f frontend

# Aplicar migraciones
docker compose exec backend python manage.py migrate

# Crear migraciones
docker compose exec backend python manage.py makemigrations

# Django shell
docker compose exec backend python manage.py shell

# Acceder a la base de datos
docker compose exec db psql -U stockflow -d stockflow

# Rebuild solo el backend
docker compose up --build backend

# Detener todo
docker compose down

# Borrar volúmenes (reset completo)
docker compose down -v
```

---

## 🔧 Variables de entorno (`.env`)

| Variable | Descripción |
|---|---|
| `SECRET_KEY` | Clave de Django (obligatoria en producción) |
| `DEBUG` | `False` en producción |
| `ALLOWED_HOSTS` | Hosts/IPs por los que se accede |
| `CSRF_TRUSTED_ORIGINS` | Orígenes del admin, con esquema (`http://192.168.1.200`) |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Base de datos |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Superusuario inicial (solo en base vacía) |
| `HTTP_PORT` | Puerto publicado por nginx (80) |

---

## 🧩 Funcionalidades

### Stock
- Catálogo con SKU, precio, costo, margen, orden de visualización y productos agrupados (cajas)
- Categorías y proveedores
- Movimientos auditados: entradas, salidas y ajustes
- Alertas de stock bajo; control de stock activable por producto

### Pedidos
- Precios calculados en el servidor según la lista de precios del cliente
- Solo productos habilitados para cada cliente
- Stock descontado al crear el pedido y devuelto al anular
- Entregas parciales y totales, con historial de cambios
- Aviso si el cliente ya cargó un pedido en el día
- Numeración correlativa NV-XXXXXXXX sin duplicados

### Clientes
- Zonas con color y mapa, prioridad de entrega, CUIT, listas de precios
- Cuenta corriente y tablero de deudores
- Importación y exportación CSV

### Hojas de ruta
- Armado de recorridos con repartidor, PDF de hoja de ruta y comprobantes

### Pagos
- Métodos: efectivo, transferencia, tarjetas, MercadoPago
- Aprobación, rechazo y reembolso con transiciones validadas

### Configuración (políticas ajustables)
- Pedidos sin stock: permitir / avisar y confirmar / bloquear
- Pagos mayores al saldo: permitir / avisar / bloquear
- Pagos de pedidos anulados: conservar / marcar para revisión / reembolsar
- Quién aprueba pagos: cualquiera con acceso a Pagos / solo usuarios habilitados
- Logo del sistema y de los PDFs
