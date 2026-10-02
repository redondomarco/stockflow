"""
Presencia de usuarios: la app usa JWT (sin sesiones en el servidor), así que
"conectado" se define por actividad. Cada request autenticado registra
UserProfile.last_seen (como mucho una escritura por minuto) y el frontend envía
un heartbeat mientras la app está abierta y visible.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication

TOUCH_INTERVAL = timedelta(seconds=60)   # frecuencia máxima de escritura de last_seen
ONLINE_WINDOW = timedelta(minutes=5)     # sin actividad por más tiempo = desconectado


def touch(user):
    from .models import UserProfile
    now = timezone.now()
    # Un único UPDATE condicional: no escribe si ya se registró actividad hace menos de un minuto
    UserProfile.objects.filter(user=user).exclude(last_seen__gt=now - TOUCH_INTERVAL).update(last_seen=now)


def is_online(last_seen):
    return bool(last_seen) and timezone.now() - last_seen <= ONLINE_WINDOW


class PresenceJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            touch(result[0])
        return result
