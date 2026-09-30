import re
from django.db import models, transaction
from django.contrib.auth.models import User
from apps.products.models import Product
from decimal import Decimal


def max_numbered(queryset, field, pattern):
    """Mayor número N entre los valores de `field` con formato `pattern` (regex con un grupo)."""
    values = queryset.filter(**{f'{field}__regex': pattern}).values_list(field, flat=True)
    return max((int(re.match(pattern, v).group(1)) for v in values), default=0)


class NumberSequence(models.Model):
    """
    Contador para numeraciones correlativas (NV, HR, CUIT automático).

    La fila se bloquea con select_for_update hasta el fin de la transacción:
    dos creaciones simultáneas no pueden obtener el mismo número, y si la
    transacción falla el número no se consume (no quedan huecos).
    """
    name = models.CharField(max_length=30, primary_key=True)
    last_value = models.PositiveBigIntegerField(default=0)

    class Meta:
        verbose_name = 'Secuencia de numeración'
        verbose_name_plural = 'Secuencias de numeración'

    def __str__(self):
        return f'{self.name}: {self.last_value}'

    @classmethod
    def next_value(cls, name, seed, is_taken):
        """
        Devuelve el próximo número de la secuencia `name`.
        seed(): valor inicial si la secuencia no existe (mayor número ya usado).
        is_taken(n): True si n ya está en uso (p. ej. cargado a mano); se saltea.
        """
        with transaction.atomic():
            seq = cls.objects.select_for_update().filter(pk=name).first()
            if seq is None:
                cls.objects.get_or_create(pk=name, defaults={'last_value': seed()})
                seq = cls.objects.select_for_update().get(pk=name)
            value = seq.last_value + 1
            while is_taken(value):
                value += 1
            seq.last_value = value
            seq.save(update_fields=['last_value'])
            return value


class PriceList(models.Model):
    name = models.CharField(max_length=100, unique=True)
    multiplier = models.DecimalField(max_digits=10, decimal_places=4, default=1.0000)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Lista de precios'
        verbose_name_plural = 'Listas de precios'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} (×{self.multiplier})"


class Zone(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=7, default='#6366f1', blank=True)

    class Meta:
        verbose_name = 'Zona'
        verbose_name_plural = 'Zonas'
        ordering = ['name']

    def __str__(self):
        return self.name


class Customer(models.Model):
    name = models.CharField(max_length=200)
    cuit = models.CharField(max_length=20, blank=True, null=True, unique=True)
    email = models.EmailField(blank=True, null=True, unique=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    localidad = models.CharField(max_length=100, blank=True)
    zone = models.ForeignKey(Zone, on_delete=models.SET_NULL, null=True, blank=True, related_name='customers')
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    price_list = models.ForeignKey(PriceList, on_delete=models.SET_NULL, null=True, blank=True, related_name='customers')
    enabled_products = models.ManyToManyField(Product, blank=True, related_name='enabled_for_customers')
    priority = models.PositiveSmallIntegerField(default=5, help_text='Prioridad de entrega del 1 (más urgente) al 10')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Cliente'
        verbose_name_plural = 'Clientes'
        ordering = ['name']

    def save(self, *args, **kwargs):
        # Número y registro en la misma transacción: el contador queda bloqueado hasta el INSERT.
        with transaction.atomic():
            if not self.cuit:
                self.cuit = self._next_auto_cuit()
            super().save(*args, **kwargs)

    AUTO_CUIT_PATTERN = r'^00-(\d+)-0$'

    @classmethod
    def _format_auto_cuit(cls, n):
        return f"00-{n:08d}-0"

    @classmethod
    def _next_auto_cuit(cls):
        n = NumberSequence.next_value(
            'customer_auto_cuit',
            seed=lambda: max_numbered(cls.objects.all(), 'cuit', cls.AUTO_CUIT_PATTERN),
            is_taken=lambda n: cls.objects.filter(cuit=cls._format_auto_cuit(n)).exists(),
        )
        return cls._format_auto_cuit(n)

    def __str__(self):
        return f"{self.name} ({self.email})"


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pendiente'),
        ('partial', 'Entrega parcial'),
        ('delivered', 'Entregado'),
        ('cancelled', 'Anulado'),
    ]

    order_number = models.CharField(max_length=20, unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True)
    shipping_address = models.TextField(blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='orders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Pedido'
        verbose_name_plural = 'Pedidos'
        ordering = ['-created_at']

    def __str__(self):
        return f"Pedido #{self.order_number}"

    def save(self, *args, **kwargs):
        self.total = self.subtotal + self.shipping_cost - self.discount
        with transaction.atomic():
            if not self.order_number:
                self.order_number = self._next_order_number()
            super().save(*args, **kwargs)

    NUMBER_PATTERN = r'^NV-(\d+)$'

    @classmethod
    def _next_order_number(cls):
        n = NumberSequence.next_value(
            'order_number',
            seed=lambda: max_numbered(cls.objects.all(), 'order_number', cls.NUMBER_PATTERN),
            is_taken=lambda n: cls.objects.filter(order_number=f"NV-{n:08d}").exists(),
        )
        return f"NV-{n:08d}"

    @property
    def amount_paid(self):
        from django.db.models import Sum
        result = self.payments.filter(status='approved').aggregate(total=Sum('amount'))['total']
        return result or Decimal('0')

    @property
    def balance(self):
        return self.total - self.amount_paid

    def calculate_totals(self):
        self.subtotal = sum(item.subtotal for item in self.items.all())
        self.total = self.subtotal + self.shipping_cost - self.discount
        self.save(update_fields=['subtotal', 'total'])


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='order_items')
    quantity = models.PositiveIntegerField()
    delivered_quantity = models.PositiveIntegerField(default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, editable=False)

    class Meta:
        verbose_name = 'Ítem de pedido'
        verbose_name_plural = 'Ítems de pedido'

    def __str__(self):
        return f"{self.product.name} x{self.quantity}"

    def save(self, *args, **kwargs):
        self.subtotal = self.unit_price * self.quantity
        super().save(*args, **kwargs)


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_history')
    old_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class DeliveryRoute(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Borrador'),
        ('in_progress', 'En reparto'),
        ('completed', 'Finalizada'),
        ('cancelled', 'Cancelada'),
    ]

    route_number = models.CharField(max_length=20, unique=True, editable=False)
    date = models.DateField()
    driver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='driven_routes')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Hoja de Ruta'
        verbose_name_plural = 'Hojas de Ruta'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return self.route_number

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if not self.route_number:
                self.route_number = self._next_route_number()
            super().save(*args, **kwargs)

    NUMBER_PATTERN = r'^HR-(\d+)$'

    @classmethod
    def _next_route_number(cls):
        n = NumberSequence.next_value(
            'route_number',
            seed=lambda: max_numbered(cls.objects.all(), 'route_number', cls.NUMBER_PATTERN),
            is_taken=lambda n: cls.objects.filter(route_number=f"HR-{n:08d}").exists(),
        )
        return f"HR-{n:08d}"


class DeliveryRouteItem(models.Model):
    route = models.ForeignKey(DeliveryRoute, on_delete=models.CASCADE, related_name='items')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='route_items')
    sort_order = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Ítem de Hoja de Ruta'
        verbose_name_plural = 'Ítems de Hoja de Ruta'
        ordering = ['sort_order', 'id']
        unique_together = [('route', 'order')]

    def __str__(self):
        return f"{self.route} — {self.order.order_number}"
