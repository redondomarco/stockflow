"""
Reglas de negocio para armar pedidos: validación de ítems, precios calculados
en el servidor y política de stock configurable.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from rest_framework.response import Response

from apps.products.models import Product, StockMovement
from apps.users.models import SystemConfig
from .models import Customer, OrderItem

CENT = Decimal('0.01')


class BusinessRuleError(Exception):
    def __init__(self, message, status=400, **extra):
        super().__init__(message)
        self.message = message
        self.status = status
        self.extra = extra

    def response(self):
        return Response({'error': self.message, **self.extra}, status=self.status)


def get_orderable_customer(customer_id):
    try:
        customer = Customer.objects.select_related('price_list').get(pk=customer_id)
    except (Customer.DoesNotExist, ValueError, TypeError):
        raise BusinessRuleError('Cliente inexistente.')
    if not customer.is_active:
        raise BusinessRuleError(f'El cliente "{customer.name}" está inactivo.')
    return customer


def parse_amount(raw, label):
    try:
        value = Decimal(str(raw if raw not in (None, '') else 0))
    except InvalidOperation:
        raise BusinessRuleError(f'Valor inválido para {label}: "{raw}".')
    if not value.is_finite() or value < 0:
        raise BusinessRuleError(f'El {label} no puede ser negativo.')
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def unit_price_for(customer, product):
    """Precio del producto para el cliente, aplicando su lista de precios salvo precio fijo."""
    price = product.price
    if customer.price_list and not product.fixed_price:
        price = price * customer.price_list.multiplier
    return price.quantize(CENT, rounding=ROUND_HALF_UP)


def price_order_items(customer, items_data):
    """
    Valida los ítems pedidos y calcula su precio. Bloquea las filas de producto
    (select_for_update), así que debe llamarse dentro de transaction.atomic().

    Devuelve (lines, shortages): lines es una lista de (product, quantity, unit_price);
    shortages lista los productos con control de stock cuya cantidad supera lo disponible.
    """
    if not isinstance(items_data, list) or not items_data:
        raise BusinessRuleError('El pedido debe tener al menos un ítem')

    requested = {}
    for idx, item in enumerate(items_data, start=1):
        if not isinstance(item, dict):
            raise BusinessRuleError(f'Ítem {idx}: formato inválido.')
        try:
            product_id = int(item.get('product'))
            quantity = int(item.get('quantity'))
        except (TypeError, ValueError):
            raise BusinessRuleError(f'Ítem {idx}: producto y cantidad deben ser números enteros.')
        if quantity <= 0:
            raise BusinessRuleError(f'Ítem {idx}: la cantidad debe ser mayor a cero.')
        if product_id in requested:
            raise BusinessRuleError(f'Ítem {idx}: el producto está repetido en el pedido.')
        requested[product_id] = quantity

    # Orden por id para bloquear filas siempre en el mismo orden y evitar deadlocks.
    products = {
        p.id: p for p in Product.objects.select_for_update().filter(id__in=requested).order_by('id')
    }
    missing = [pid for pid in requested if pid not in products]
    if missing:
        raise BusinessRuleError(f'Productos inexistentes: {", ".join(map(str, missing))}.')

    enabled_ids = set(customer.enabled_products.values_list('id', flat=True))
    lines = []
    shortages = []
    for product_id, quantity in requested.items():
        product = products[product_id]
        if not product.is_active:
            raise BusinessRuleError(f'El producto {product.sku} está dado de baja.')
        if product_id not in enabled_ids:
            raise BusinessRuleError(
                f'El producto {product.sku} no está habilitado para el cliente "{customer.name}".'
            )
        if product.track_stock and quantity > product.stock:
            shortages.append({
                'product': product.id,
                'sku': product.sku,
                'name': product.name,
                'requested': quantity,
                'available': max(product.stock, 0),
            })
        lines.append((product, quantity, unit_price_for(customer, product)))
    return lines, shortages


def can_override_stock(user):
    if user.is_superuser:
        return True
    profile = getattr(user, 'profile', None)
    return bool(profile and profile.can_override_stock)


def enforce_stock_policy(user, shortages, confirmed):
    """
    Aplica la política de stock configurada. Devuelve una nota para el historial
    si el pedido se acepta con faltantes, o lanza BusinessRuleError.

    - allow: se acepta siempre.
    - warn:  responde 409 con los faltantes hasta que el cliente reenvíe con confirm_stock.
    - block: rechaza con 400, salvo usuarios con can_override_stock, que reciben el aviso de 'warn'.
    """
    if not shortages:
        return ''
    policy = SystemConfig.get().stock_policy
    if policy == 'block' and not can_override_stock(user):
        raise BusinessRuleError(
            'Stock insuficiente para completar el pedido.',
            status=400, code='insufficient_stock', shortages=shortages, can_confirm=False,
        )
    if policy in ('warn', 'block') and not confirmed:
        raise BusinessRuleError(
            'Hay productos sin stock suficiente. Confirmá para registrar el pedido igual.',
            status=409, code='stock_warning', shortages=shortages, can_confirm=True,
        )
    detail = ', '.join(f"{s['sku']} (pedido {s['requested']}, disponible {s['available']})" for s in shortages)
    return f'Aceptado con stock insuficiente: {detail}'


def add_order_items(order, lines, reason):
    """Crea los ítems del pedido y descuenta stock. Los productos ya deben estar bloqueados."""
    for product, quantity, unit_price in lines:
        OrderItem.objects.create(order=order, product=product, quantity=quantity, unit_price=unit_price)
        stock_before = product.stock
        product.stock -= quantity
        product.save(update_fields=['stock', 'updated_at'])
        StockMovement.objects.create(
            product=product,
            movement_type='out',
            quantity=quantity,
            stock_before=stock_before,
            stock_after=product.stock,
            reason=reason,
        )


def remove_order_items(order, reason):
    """Devuelve al stock las cantidades de los ítems del pedido y los elimina."""
    items = list(order.items.all())
    products = {
        p.id: p for p in Product.objects.select_for_update()
        .filter(id__in=[it.product_id for it in items]).order_by('id')
    }
    for item in items:
        product = products[item.product_id]
        stock_before = product.stock
        product.stock += item.quantity
        product.save(update_fields=['stock', 'updated_at'])
        StockMovement.objects.create(
            product=product,
            movement_type='in',
            quantity=item.quantity,
            stock_before=stock_before,
            stock_after=product.stock,
            reason=reason,
        )
    order.items.all().delete()


def is_confirmed(data):
    return data.get('confirm_stock') in (True, 'true', 'True', '1', 1)
