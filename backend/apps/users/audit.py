"""
Registro de auditoría de las acciones de los usuarios.

AuditMiddleware registra, después de responder, cada request de escritura
(POST/PUT/PATCH/DELETE) a la API y al admin de Django, y los inicios de sesión
(exitosos y fallidos). Las consultas (GET), el heartbeat de presencia y la
renovación de tokens no se registran. Si algo falla al registrar, el request
del usuario no se ve afectado.
"""
import json
import logging
import time
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import Resolver404, resolve
from django.utils import timezone

logger = logging.getLogger(__name__)

WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
SKIP_PATHS = {'/api/users/heartbeat/', '/api/token/refresh/'}
LOGIN_PATH = '/api/token/'
SENSITIVE_KEYS = ('password', 'token', 'secret', 'refresh', 'access')
MAX_BODY_BYTES = 20_000
MAX_STRING = 300
MAX_DETAILS_CHARS = 4_000

ACTION_LABELS = {
    'create': 'Alta',
    'update': 'Edición',
    'partial_update': 'Edición',
    'destroy': 'Eliminación',
    'change_status': 'Cambio de estado',
    'deliver': 'Entrega',
    'approve': 'Aprobación',
    'reject': 'Rechazo',
    'refund': 'Reembolso',
    'mark_reviewed': 'Revisión',
    'adjust_stock': 'Ajuste de stock',
    'import_csv': 'Importación CSV',
    'products': 'Productos habilitados',
    'add_orders': 'Pedidos agregados',
    'remove_item': 'Pedido quitado',
    'update_item': 'Nota editada',
    'apply': 'Ingreso de stock',
    'configure': 'Lista de ingreso de stock actualizada',
}

STATUS_LABELS = {
    'pending': 'Pendiente', 'partial': 'Entrega parcial', 'delivered': 'Entregado', 'cancelled': 'Anulado',
    'draft': 'Borrador', 'in_progress': 'En reparto', 'completed': 'Finalizada',
}


# ── Datos del request ───────────────────────────────────────────────────────

def _sanitize(value, depth=0):
    """Copia de los datos enviados sin secretos y con textos/listas acotados."""
    if depth > 4:
        return '…'
    if isinstance(value, dict):
        return {
            k: ('***' if any(s in str(k).lower() for s in SENSITIVE_KEYS) else _sanitize(v, depth + 1))
            for k, v in list(value.items())[:50]
        }
    if isinstance(value, list):
        items = [_sanitize(v, depth + 1) for v in value[:50]]
        if len(value) > 50:
            items.append(f'… ({len(value) - 50} más)')
        return items
    if isinstance(value, str) and len(value) > MAX_STRING:
        return f'{value[:MAX_STRING]}… ({len(value)} caracteres)'
    return value


def _request_details(request, body):
    details = {}
    content_type = request.META.get('CONTENT_TYPE', '')
    if 'multipart/form-data' in content_type:
        details['datos'] = 'archivo adjunto'
    elif body:
        try:
            details['datos'] = _sanitize(json.loads(body))
        except (ValueError, UnicodeDecodeError):
            details['datos'] = 'contenido no JSON'
    if request.GET:
        details['parametros'] = _sanitize(request.GET.dict())
    return details


def _client_ip(request):
    # nginx reemplaza X-Real-IP con la IP real del cliente (ver nginx.conf)
    return request.META.get('HTTP_X_REAL_IP') or request.META.get('REMOTE_ADDR') or None


def _json_response(response):
    data = getattr(response, 'data', None)
    if data is None and response.get('Content-Type', '').startswith('application/json'):
        try:
            data = json.loads(response.content)
        except ValueError:
            data = None
    return data


# ── Objeto afectado ─────────────────────────────────────────────────────────

def _view_model(view_cls):
    queryset = getattr(view_cls, 'queryset', None)
    if queryset is not None:
        return queryset.model
    serializer = getattr(view_cls, 'serializer_class', None)
    model = getattr(getattr(serializer, 'Meta', None), 'model', None)
    if model is not None:
        return model
    if view_cls.__name__ == 'DeliveryRouteViewSet':
        from apps.orders.models import DeliveryRoute
        return DeliveryRoute
    return None


def _label(obj_or_data):
    """Identificación legible: número de pedido/hoja, SKU, usuario o nombre."""
    get = obj_or_data.get if isinstance(obj_or_data, dict) else (lambda k: getattr(obj_or_data, k, None))
    if get('amount') is not None and get('order_number'):
        return f"${get('amount')} de {get('order_number')}"
    for key in ('order_number', 'route_number'):
        if get(key):
            return str(get(key))
    if get('sku'):
        return f"{get('sku')} {get('name') or ''}".strip()
    for key in ('username', 'name'):
        if get(key):
            return str(get(key))
    return ''


# ── Middleware ──────────────────────────────────────────────────────────────

class AuditMiddleware:
    _last_purge = None  # por proceso: la limpieza por retención corre como mucho una vez por día

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        audited = request.method in WRITE_METHODS and request.path not in SKIP_PATHS and (
            request.path.startswith('/api/') or request.path.startswith('/admin/')
        )
        if not audited:
            return self.get_response(request)

        context = self._before(request)
        response = self.get_response(request)
        try:
            self._record(request, response, context)
        except Exception:  # la auditoría nunca debe romper la acción del usuario
            logger.exception('No se pudo registrar la auditoría de %s %s', request.method, request.path)
        return response

    def _before(self, request):
        context = {'body': None, 'view': None, 'action': None, 'kwargs': {}, 'object_label': ''}
        # El cuerpo se lee antes que la vista (queda en caché para DRF); los archivos no se leen
        if 'multipart/form-data' not in request.META.get('CONTENT_TYPE', ''):
            try:
                if int(request.META.get('CONTENT_LENGTH') or 0) <= MAX_BODY_BYTES:
                    context['body'] = request.body
            except Exception:  # cuerpo ilegible: se registra sin datos
                pass
        try:
            match = resolve(request.path_info)
        except Resolver404:
            return context
        view_cls = getattr(match.func, 'cls', None) or getattr(match.func, 'view_class', None)
        actions = getattr(match.func, 'actions', None) or {}
        context.update(view=view_cls, kwargs=match.kwargs,
                       action=actions.get(request.method.lower()) or (match.url_name or '').split('-')[-1])
        # Etiqueta del objeto antes de la acción (necesaria para eliminaciones)
        pk = match.kwargs.get('pk')
        model = _view_model(view_cls) if view_cls else None
        if pk and model is not None:
            obj = model._default_manager.filter(pk=pk).first()
            if obj is not None:
                context['object_label'] = _label(obj) or str(obj)
        return context

    def _record(self, request, response, context):
        from .models import AuditLog, SystemConfig

        success = response.status_code < 400
        details = _request_details(request, context['body'])
        data = _json_response(response)
        if not success and isinstance(data, dict):
            message = data.get('error') or data.get('detail') or data
            details['respuesta'] = _sanitize(message if isinstance(message, (str, dict, list)) else str(message))

        user = getattr(request, 'user', None)
        user = user if getattr(user, 'is_authenticated', False) else None
        view_cls, action, kwargs = context['view'], context['action'], context['kwargs']
        model = _view_model(view_cls) if view_cls else None
        section = getattr(view_cls, 'permission_section', '') if view_cls else ''
        object_type = str(model._meta.verbose_name).capitalize() if model is not None else ''
        object_id = str(kwargs.get('pk', '') or '')
        object_label = context['object_label']
        if not object_id and isinstance(data, dict) and data.get('id'):
            object_id = str(data['id'])
            object_label = object_label or _label(data)

        body = details.get('datos') if isinstance(details.get('datos'), dict) else {}
        if request.path == LOGIN_PATH:
            username = str(body.get('username', ''))[:150]
            section, action = 'auth', 'login' if success else 'login_failed'
            description = 'Inicio de sesión' if success else f'Inicio de sesión fallido (usuario: {username or "?"})'
            if success:
                user = get_user_model().objects.filter(username=username).first()
            object_type = object_id = ''
        elif view_cls is not None and view_cls.__name__ == 'SystemConfigView':
            section, action = 'config', 'config'
            description = 'Cambio de configuración: ' + ', '.join(sorted(body)) if body else 'Cambio de configuración'
        elif request.path.startswith('/admin/'):
            section, action = 'admin', 'django_admin'
            description = f'Admin de Django: {request.method} {request.path}'
        else:
            label = ACTION_LABELS.get(action, (action or request.method).replace('_', ' ').capitalize())
            description = f'{label} · {object_type} {object_label}'.strip(' ·')
            if action == 'change_status' and body.get('status'):
                description += f" → {STATUS_LABELS.get(body['status'], body['status'])}"
            if action == 'apply' and success and isinstance(data, dict) and data.get('total_units'):
                count = len(data.get('items') or [])
                description += f" · {count} producto{'s' if count != 1 else ''}, {data['total_units']} unidades"
        if view_cls is not None and view_cls.__name__ == 'UserViewSet':
            section = 'users'

        AuditLog.objects.create(
            user=user,
            username=user.username if user else (str(body.get('username', ''))[:150] if request.path == LOGIN_PATH else ''),
            section=section or '',
            action=(action or request.method.lower())[:40],
            description=description[:300],
            object_type=object_type[:60],
            object_id=object_id[:40],
            method=request.method,
            path=request.path[:300],
            status_code=response.status_code,
            success=success,
            ip=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:200],
            details=self._cap(details),
        )
        self._purge_if_due(SystemConfig, AuditLog)

    @staticmethod
    def _cap(details):
        if len(json.dumps(details, default=str)) > MAX_DETAILS_CHARS:
            return {'nota': 'datos demasiado grandes, no se guardaron completos',
                    'claves': sorted(details.get('datos', {})) if isinstance(details.get('datos'), dict) else []}
        return json.loads(json.dumps(details, default=str))

    @classmethod
    def _purge_if_due(cls, SystemConfig, AuditLog):
        now = time.monotonic()
        if cls._last_purge is not None and now - cls._last_purge < 24 * 3600:
            return
        cls._last_purge = now
        days = SystemConfig.get().audit_retention_days
        if days:
            AuditLog.objects.filter(created_at__lt=timezone.now() - timedelta(days=days)).delete()
