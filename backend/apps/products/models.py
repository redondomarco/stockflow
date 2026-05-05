from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Categoría'
        verbose_name_plural = 'Categorías'
        ordering = ['name']

    def __str__(self):
        return self.name


class Supplier(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Proveedor'
        verbose_name_plural = 'Proveedores'
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name='products')
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    stock = models.IntegerField(default=0)
    stock_min = models.PositiveIntegerField(default=5, help_text='Stock mínimo para alertas')
    fixed_price = models.BooleanField(default=False, help_text='Si está activo, el multiplicador de lista de precios no se aplica')
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    sort_order = models.IntegerField(default=0, help_text='Índice de orden de visualización (menor = primero)')
    # Producto agrupado (ej: caja = N unidades de otro producto)
    is_bundle = models.BooleanField(default=False)
    bundle_child = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='parent_bundles',
        help_text='Producto unitario que compone este agrupado'
    )
    bundle_quantity = models.PositiveIntegerField(null=True, blank=True, help_text='Cantidad de unidades por agrupado')
    bundle_unit_weight = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True, help_text='Peso por unidad (kg)')
    bundle_unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text='Precio por unidad')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Producto'
        verbose_name_plural = 'Productos'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return f"{self.sku} - {self.name}"

    def save(self, *args, **kwargs):
        if self.is_bundle and self.bundle_quantity and self.bundle_unit_price:
            from decimal import Decimal
            self.price = Decimal(str(self.bundle_quantity)) * self.bundle_unit_price
        super().save(*args, **kwargs)

    @property
    def is_low_stock(self):
        return self.stock <= self.stock_min

    @property
    def margin(self):
        if self.cost > 0:
            return round(((self.price - self.cost) / self.price) * 100, 2)
        return None


class StockMovement(models.Model):
    MOVEMENT_TYPES = [
        ('in', 'Entrada'),
        ('out', 'Salida'),
        ('adjustment', 'Ajuste'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='movements')
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)
    quantity = models.IntegerField()
    stock_before = models.IntegerField()
    stock_after = models.IntegerField()
    reason = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Movimiento de Stock'
        verbose_name_plural = 'Movimientos de Stock'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.product.sku} - {self.movement_type} {self.quantity}"
