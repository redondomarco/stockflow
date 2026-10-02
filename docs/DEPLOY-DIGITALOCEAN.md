# Instalación en DigitalOcean

Guía para publicar StockFlow en internet con HTTPS, en un Droplet de DigitalOcean.

```
Internet ──443/80──▶ Caddy (HTTPS, Let's Encrypt) ──▶ nginx (frontend + proxy) ──▶ backend (Django)
                                                                                     ├─▶ PostgreSQL
                                                                                     └─▶ Redis
```

Solo Caddy queda expuesto. La base, Redis y el backend están en la red interna de Docker.

**Tiempo estimado:** 45–60 minutos la primera vez.

---

## 0. Antes de empezar

Necesitás:

- Una cuenta de DigitalOcean.
- Un **dominio o subdominio** con acceso a su DNS (por ejemplo `stockflow.tuempresa.com.ar`). Let's Encrypt no emite certificados para una IP sola.
- Una **clave SSH** en tu computadora (`ls ~/.ssh/id_ed25519.pub`; si no existe: `ssh-keygen -t ed25519`).
- Si vas a migrar datos del servidor local: acceso a ese servidor (192.168.1.200).

> ⚠️ **El repositorio de GitHub es público.** Cualquiera puede ver el código. Nunca subas `.env` ni backups (los dos están en `.gitignore`).

En todo este documento, reemplazá:

| Marcador | Por |
|---|---|
| `stockflow.example.com` | tu dominio |
| `IP_DEL_DROPLET` | la IP pública del Droplet |
| `admin@example.com` | un email real (Let's Encrypt avisa ahí si un certificado está por vencer) |

---

## 1. Crear el Droplet

En el panel de DigitalOcean → **Create → Droplets**:

| Opción | Valor recomendado |
|---|---|
| Región | **New York (NYC1 o NYC3)**: la de menor latencia desde Argentina |
| Imagen | **Ubuntu 24.04 (LTS) x64** |
| Tamaño | **Basic, Regular, 2 GB RAM / 1 vCPU / 50 GB** (USD 12/mes) |
| Autenticación | **SSH Key** (subí tu `~/.ssh/id_ed25519.pub`). No uses contraseña |
| Backups | Opcional pero recomendado: snapshots semanales automáticos (+20%) |
| Monitoring | Activado (gratis) |
| Hostname | `stockflow` |

Con 1 GB de RAM también funciona, pero la compilación del frontend puede quedarse sin memoria: en ese caso creá swap (paso 3.4).

Anotá la **IP pública** del Droplet.

## 2. DNS y firewall

### 2.1 Registro DNS

En el proveedor de tu dominio, creá un registro:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `stockflow` (o `@` si es el dominio raíz) | `IP_DEL_DROPLET` | 300 |

Verificá desde tu computadora (puede tardar unos minutos):

```bash
dig +short stockflow.example.com      # debe devolver IP_DEL_DROPLET
```

### 2.2 Cloud Firewall

En DigitalOcean → **Networking → Firewalls → Create Firewall**:

| Tipo | Protocolo | Puertos | Origen |
|---|---|---|---|
| SSH | TCP | 22 | Tu IP (ideal) o All IPv4/IPv6 |
| HTTP | TCP | 80 | All IPv4, All IPv6 |
| HTTPS | TCP | 443 | All IPv4, All IPv6 |
| HTTP/3 | UDP | 443 | All IPv4, All IPv6 |

Salida: dejá todo permitido. Aplicalo al Droplet.

> Usá el Cloud Firewall en lugar de `ufw`: Docker publica puertos saltándose las reglas de `ufw`.

## 3. Preparar el servidor

### 3.1 Primer ingreso y usuario `deploy`

```bash
ssh root@IP_DEL_DROPLET

# Actualizar el sistema
apt-get update && apt-get -y upgrade

# Zona horaria (el sistema registra fechas en hora de Argentina)
timedatectl set-timezone America/Argentina/Buenos_Aires

# Usuario sin privilegios para correr la app, con tu misma clave SSH
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy && chmod 440 /etc/sudoers.d/deploy
```

En **otra terminal**, verificá que entrás como `deploy` antes de seguir:

```bash
ssh deploy@IP_DEL_DROPLET
```

### 3.2 Endurecer SSH

Como `deploy`:

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
EOF
sudo systemctl restart ssh
```

### 3.3 Actualizaciones de seguridad automáticas

```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades     # elegir "Yes"
```

### 3.4 Swap (obligatorio con 1 GB de RAM, recomendable siempre)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.5 Docker, Git y Make

Desde el repositorio oficial de Docker (trae Docker Compose v2 actualizado; se necesita **2.24 o superior**):

```bash
sudo apt-get install -y ca-certificates curl git make
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker deploy
exit        # salir y volver a entrar para que tome el grupo docker
```

```bash
ssh deploy@IP_DEL_DROPLET
docker compose version      # debe ser v2.24 o superior
```

## 4. Instalar StockFlow

### 4.1 Código

```bash
cd ~
git clone https://github.com/redondomarco/stockflow.git
cd stockflow
git checkout v1.0.8        # versión a instalar (git tag -l lista las disponibles)
```

### 4.2 Configuración (`.env`)

```bash
cp .env.example .env
chmod 600 .env

# Generar secretos (copiá cada resultado en .env)
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(50))"
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_hex(24))"

nano .env
```

Dejá el archivo así (con tus valores):

```ini
SECRET_KEY=<generada>
DEBUG=False

ALLOWED_HOSTS=stockflow.example.com
CSRF_TRUSTED_ORIGINS=https://stockflow.example.com

POSTGRES_DB=stockflow
POSTGRES_USER=stockflow
POSTGRES_PASSWORD=<generada>

ADMIN_USERNAME=admin
ADMIN_PASSWORD=<solo si es una instalación nueva, ver 4.4; si no, vacío>

COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml
HTTPS=True
DOMAIN=stockflow.example.com
ACME_EMAIL=admin@example.com
HSTS_MAX_AGE=300
```

`COMPOSE_FILE` hace que todos los comandos (`make deploy`, `docker compose ...`) incluyan Caddy con HTTPS. `HTTP_PORT` no se usa en este modo.

> Guardá una copia de `SECRET_KEY` y `POSTGRES_PASSWORD` en tu gestor de contraseñas. Sin `POSTGRES_PASSWORD` no vas a poder reconectar la app a la base.

### 4.3 Primer despliegue

```bash
make deploy
```

La primera vez tarda unos minutos (compila backend y frontend). Después:

```bash
docker compose ps                         # los 5 servicios "Up"
docker compose logs caddy | grep -i "certificate obtained"
```

Abrí **https://stockflow.example.com**: tiene que cargar con candado.

### 4.4 Datos: instalación nueva o migración

**A) Instalación nueva (sin datos).** Con `ADMIN_PASSWORD` definida en `.env`, el primer arranque crea el superusuario `admin`. Ingresá con esa contraseña y después **vaciá `ADMIN_PASSWORD`** en `.env` (ya no se usa y no conviene dejarla en texto plano).

**B) Migrar los datos del servidor local (192.168.1.200).**

En el servidor local:

```bash
cd ~/projects/tapa14-v2/stockflow
make backup                               # crea backups/stockflow-AAAAMMDD-HHMMSS.sql.gz
ssh deploy@IP_DEL_DROPLET 'mkdir -p ~/stockflow/backups'
scp backups/stockflow-AAAAMMDD-HHMMSS.sql.gz deploy@IP_DEL_DROPLET:~/stockflow/backups/
```

En el Droplet:

```bash
cd ~/stockflow
make restore FILE=backups/stockflow-AAAAMMDD-HHMMSS.sql.gz      # pide escribir "si"
```

Se migran pedidos, clientes, productos, pagos, configuración **y usuarios con sus contraseñas** (entrás con el mismo usuario y contraseña que en el servidor local). La contraseña de PostgreSQL no viaja en el backup: el Droplet usa la de su `.env`.

> Después de migrar, dejá de cargar datos en el servidor local para que no queden dos versiones distintas.

### 4.5 Verificación

| Prueba | Resultado esperado |
|---|---|
| `https://stockflow.example.com` | Carga la app con candado |
| `http://stockflow.example.com` | Redirige a `https://` |
| Ingresar a la app | Funciona; las pantallas muestran los datos |
| `https://stockflow.example.com/admin/` | Login del admin de Django |
| 15 logins fallidos seguidos | Aparece "Demasiados intentos. Esperá un minuto…" |
| `nc -zv IP_DEL_DROPLET 5432` desde tu PC | Falla (la base no está expuesta) |

## 5. Backups automáticos

Backup diario a las 3 AM, conservando 14 días:

```bash
mkdir -p ~/stockflow/backups
crontab -e
```

Agregá la línea:

```cron
0 3 * * * cd /home/deploy/stockflow && BACKUP_KEEP_DAYS=14 ./scripts/backup.sh >> backups/backup.log 2>&1
```

Probalo una vez a mano: `./scripts/backup.sh`.

**Copias fuera del servidor.** Los backups en el mismo Droplet no sirven si se pierde el Droplet. Como mínimo:

- Activá los **Backups** del Droplet en DigitalOcean (snapshots semanales), y/o
- bajá periódicamente los backups a otra máquina:

  ```bash
  scp 'deploy@IP_DEL_DROPLET:~/stockflow/backups/stockflow-*.sql.gz' ~/backups-stockflow/
  ```

**Probá restaurar** un backup cada tanto (por ejemplo en el servidor local con `make restore FILE=...`): un backup que nunca se restauró no está probado.

## 6. Después de la primera semana

Cuando confirmes que HTTPS funciona bien, subí HSTS a un año en `.env`:

```ini
HSTS_MAX_AGE=31536000
```

y aplicalo con `docker compose up -d caddy`. HSTS hace que los navegadores solo usen HTTPS para el dominio; con un valor alto es difícil de deshacer, por eso se empieza con 5 minutos.

## 7. Actualizar a una versión nueva

```bash
cd ~/stockflow
make backup                         # siempre antes de actualizar
git fetch --tags
git checkout v1.1.0                 # la versión nueva
make deploy                         # recompila y aplica migraciones automáticamente
docker compose logs -f backend      # Ctrl+C para salir
```

**Volver atrás:** `git checkout <versión anterior> && make deploy`. Si la versión nueva aplicó migraciones que la anterior no entiende, además restaurá el backup previo: `make restore FILE=backups/...`.

## 8. Operación diaria

| Tarea | Comando (en `~/stockflow`) |
|---|---|
| Estado de los servicios | `docker compose ps` |
| Logs en vivo | `make logs` o `docker compose logs -f backend` |
| Reiniciar | `make restart` |
| Cambiar contraseña de un usuario | `docker compose exec backend python manage.py changepassword <usuario>` |
| Crear superusuario | `docker compose exec backend python manage.py createsuperuser` |
| Consola SQL | `make shell-db` |
| Backup / restaurar | `make backup` / `make restore FILE=...` |
| Espacio en disco | `df -h` y `docker system df` |
| Limpiar imágenes viejas | `docker image prune -f` |

## 9. Problemas frecuentes

| Síntoma | Causa probable y solución |
|---|---|
| Caddy no obtiene el certificado (`docker compose logs caddy`) | El DNS todavía no apunta al Droplet (`dig +short`), o el firewall bloquea 80/443. Corregí y `docker compose restart caddy`. Let's Encrypt limita los reintentos: no lo reinicies en loop |
| `Bad Request (400)` | El dominio no está en `ALLOWED_HOSTS` |
| Login del admin: "CSRF verification failed" | `CSRF_TRUSTED_ORIGINS` debe ser `https://stockflow.example.com` (con `https://`) y `HTTPS=True` |
| La app carga pero no deja ingresar ("No se pudo conectar") | El backend no arrancó: `docker compose logs backend`. Suele ser `SECRET_KEY` vacía o `POSTGRES_PASSWORD` distinta de la de la base |
| `make deploy` se corta compilando el frontend | Falta memoria: creá swap (3.4) |
| `Definí DOMAIN en .env` | Falta `DOMAIN` o `ACME_EMAIL` en `.env` |
| "Demasiados intentos" | Límite de 10 logins por minuto por IP. Esperá un minuto |

## 10. Seguridad: resumen

- Solo los puertos 22, 80 y 443 abiertos (Cloud Firewall); base, Redis y backend no expuestos.
- SSH solo con clave, sin root.
- HTTPS obligatorio, cookies `Secure`, HSTS.
- Límite de intentos en `/api/token/` y `/admin/login/`.
- `DEBUG=False`; secretos solo en `.env` (permisos 600, fuera de git).
- Actualizaciones automáticas de seguridad del sistema operativo.
- Pendiente de tu lado: contraseñas fuertes para todos los usuarios de la app, en especial los superusuarios.
