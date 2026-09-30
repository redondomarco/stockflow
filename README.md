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

### Autenticación
```
POST /api/token/          → Obtener access + refresh token
POST /api/token/refresh/  → Renovar access token
```

### Productos
```
GET/POST   /api/products/                    → Listar / Crear
GET/PATCH  /api/products/{id}/               → Detalle / Editar
POST       /api/products/{id}/adjust_stock/  → Ajustar stock
GET        /api/products/{id}/movements/     → Historial movimientos
GET        /api/products/low_stock/          → Productos bajo mínimo
GET        /api/products/stats/              → Estadísticas

GET/POST   /api/products/categories/         → Categorías
GET/POST   /api/products/suppliers/          → Proveedores
GET        /api/products/movements/          → Todos los movimientos
```

### Pedidos
```
GET/POST   /api/orders/                      → Listar / Crear
GET        /api/orders/{id}/                 → Detalle
POST       /api/orders/{id}/change_status/   → Cambiar estado
GET        /api/orders/stats/                → Estadísticas

GET/POST   /api/orders/customers/            → Clientes
```

### Pagos
```
GET/POST   /api/payments/                    → Listar / Crear
POST       /api/payments/{id}/approve/       → Aprobar
POST       /api/payments/{id}/reject/        → Rechazar
POST       /api/payments/{id}/refund/        → Reembolsar
GET        /api/payments/stats/              → Estadísticas
```

---

## 🔄 Flujo de estados de pedidos

```
pending → confirmed → processing → shipped → delivered
   ↓           ↓           ↓
cancelled  cancelled  cancelled
```

Al cancelar un pedido, el stock de los productos se devuelve automáticamente.

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
- ✅ Catálogo de productos con SKU, precio, costo y margen
- ✅ Categorías y proveedores
- ✅ Control de stock con mínimos configurables
- ✅ Alertas de stock bajo
- ✅ Movimientos: entradas, salidas y ajustes
- ✅ Historial completo auditado

### Pedidos
- ✅ Creación de pedidos con múltiples productos
- ✅ Descuento de stock automático al crear pedido
- ✅ Flujo de estados con transiciones válidas
- ✅ Historial de cambios de estado
- ✅ Devolución de stock al cancelar
- ✅ Notas y dirección de envío

### Pagos
- ✅ Registro de pagos por pedido
- ✅ Múltiples métodos: efectivo, transferencia, tarjetas, MercadoPago
- ✅ Estados: pendiente → aprobado / rechazado / reembolsado
- ✅ Estadísticas de ingresos

### Dashboard
- ✅ KPIs principales
- ✅ Gráfico de pedidos por estado
- ✅ Lista de productos con stock bajo
- ✅ Valor total del inventario
