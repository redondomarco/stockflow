from django.db import models
from django.contrib.auth.models import User

SECTIONS = ['products', 'stock', 'orders', 'payments', 'customers', 'price_lists', 'routes']


def default_permissions():
    return {s: 'write' for s in SECTIONS}


class SystemConfig(models.Model):
    STOCK_POLICY_CHOICES = [
        ('allow', 'Permitir sin stock'),
        ('warn', 'Avisar y pedir confirmación'),
        ('block', 'Bloquear pedidos sin stock'),
    ]

    logo_svg = models.TextField(blank=True)
    logo_width = models.PositiveIntegerField(default=140)
    pdf_logo_width = models.PositiveIntegerField(default=35)
    OVERPAYMENT_POLICY_CHOICES = [
        ('allow', 'Permitir (queda saldo a favor)'),
        ('warn', 'Avisar y pedir confirmación'),
        ('block', 'Bloquear pagos mayores al saldo'),
    ]
    CANCELLED_ORDER_PAYMENTS_CHOICES = [
        ('keep', 'Dejar los pagos como están'),
        ('review', 'Marcar para revisión'),
        ('refund', 'Reembolsar automáticamente'),
    ]
    PAYMENT_APPROVAL_CHOICES = [
        ('section', 'Cualquier usuario con escritura en Pagos'),
        ('restricted', 'Solo usuarios habilitados para aprobar pagos'),
    ]

    stock_policy = models.CharField(max_length=10, choices=STOCK_POLICY_CHOICES, default='allow')
    overpayment_policy = models.CharField(max_length=10, choices=OVERPAYMENT_POLICY_CHOICES, default='allow')
    cancelled_order_payments = models.CharField(max_length=10, choices=CANCELLED_ORDER_PAYMENTS_CHOICES, default='keep')
    payment_approval = models.CharField(max_length=10, choices=PAYMENT_APPROVAL_CHOICES, default='section')

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
    can_override_stock = models.BooleanField(
        default=False, help_text='Con política "bloquear", puede confirmar pedidos sin stock suficiente'
    )
    can_approve_payments = models.BooleanField(
        default=False, help_text='Con aprobación restringida, puede aprobar, rechazar y reembolsar pagos'
    )

    class Meta:
        verbose_name = 'Perfil de usuario'
        verbose_name_plural = 'Perfiles de usuario'

    def __str__(self):
        return f'Perfil de {self.user.username}'

    def get_level(self, section):
        return self.permissions.get(section, 'write')
