from django.db import models
from django.contrib.auth.models import User
from apps.products.models import Product
from decimal import Decimal


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


class Customer(models.Model):
    name = models.CharField(max_length=200)
    cuit = models.CharField(max_length=20, blank=True, null=True, unique=True)
    email = models.EmailField(blank=True, null=True, unique=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    localidad = models.CharField(max_length=100, blank=True)
    price_list = models.ForeignKey(PriceList, on_delete=models.SET_NULL, null=True, blank=True, related_name='customers')
    enabled_products = models.ManyToManyField(Product, blank=True, related_name='enabled_for_customers')
    priority = models.PositiveSmallIntegerField(default=5, help_text='Prioridad de entrega del 1 (más urgente) al 10')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Cliente'
        verbose_name_plural = 'Clientes'
        ordering = ['name']

    def save(self, *args, **kwargs):
        if not self.cuit:
            self.cuit = self._next_auto_cuit()
        super().save(*args, **kwargs)

    @classmethod
    def _next_auto_cuit(cls):
        import re
        existing = cls.objects.filter(
            cuit__startswith='00-', cuit__endswith='-0'
        ).values_list('cuit', flat=True)
        max_num = 0
        for cuit in existing:
            m = re.match(r'^00-(\d+)-0$', cuit)
            if m:
                max_num = max(max_num, int(m.group(1)))
        return f"00-{max_num + 1:08d}-0"

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
        if not self.order_number:
            self.order_number = self._next_order_number()
        self.total = self.subtotal + self.shipping_cost - self.discount
        super().save(*args, **kwargs)

    @classmethod
    def _next_order_number(cls):
        import re
        nums = cls.objects.filter(
            order_number__regex=r'^NV-\d+$'
        ).values_list('order_number', flat=True)
        max_num = max(
            (int(re.match(r'^NV-(\d+)$', n).group(1)) for n in nums),
            default=0
        )
        return f"NV-{max_num + 1:08d}"

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
        if not self.route_number:
            import uuid
            self.route_number = f"HR-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)


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
