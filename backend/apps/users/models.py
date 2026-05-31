from django.db import models
from django.contrib.auth.models import User

SECTIONS = ['products', 'stock', 'orders', 'payments', 'customers', 'price_lists', 'routes']


def default_permissions():
    return {s: 'write' for s in SECTIONS}


class SystemConfig(models.Model):
    logo_svg = models.TextField(blank=True)
    logo_width = models.PositiveIntegerField(default=140)
    pdf_logo_width = models.PositiveIntegerField(default=35)

    class Meta:
        verbose_name = 'Configuración del sistema'

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    permissions = models.JSONField(default=default_permissions)
    is_driver = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Perfil de usuario'
        verbose_name_plural = 'Perfiles de usuario'

    def __str__(self):
        return f'Perfil de {self.user.username}'

    def get_level(self, section):
        return self.permissions.get(section, 'write')
