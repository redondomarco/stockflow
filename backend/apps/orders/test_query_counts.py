"""
Regresión de rendimiento: la cantidad de consultas SQL de cada listado no debe
crecer con la cantidad de registros (problema N+1).
"""
from datetime import date

from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.payments.models import Payment
from apps.products.models import Category, Product
from .models import (
    Customer, DeliveryRoute, DeliveryRouteItem, Order, OrderItem, OrderStatusHistory, PriceList, Zone,
)

LIST_ENDPOINTS = [
    '/api/orders/customers/',
    '/api/orders/',
    '/api/orders/routes/',
    '/api/orders/routes/available_orders/',
    '/api/orders/zones/',
    '/api/orders/price-lists/',
    '/api/orders/customers/debt_dashboard/',
    '/api/orders/monthly/',
    '/api/orders/stats/',
    '/api/products/',
    '/api/products/stats/',
    '/api/products/low_stock/',
    '/api/products/categories/',
    '/api/products/movements/',
    '/api/payments/',
]


class QueryCountTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', password='x')
        self.client.force_authenticate(self.user)
        self.batch = 0

    def add_rows(self, n):
        """Crea n clientes, cada uno con zona, lista, producto habilitado, pedido, pago e ítem de hoja de ruta."""
        self.batch += 1
        category = Category.objects.create(name=f'Cat {self.batch}')
        route = DeliveryRoute.objects.create(date=date.today(), driver=self.user)
        for i in range(n):
            tag = f'{self.batch}-{i}'
            product = Product.objects.create(name=f'P{tag}', sku=f'S{tag}', price=10, stock=1, category=category)
            customer = Customer.objects.create(
                name=f'C{tag}', zone=Zone.objects.create(name=f'Z{tag}'),
                price_list=PriceList.objects.create(name=f'L{tag}', multiplier=1),
            )
            customer.enabled_products.add(product)
            order = Order.objects.create(customer=customer, created_by=self.user, subtotal=10)
            OrderItem.objects.create(order=order, product=product, quantity=1, unit_price=10)
            OrderStatusHistory.objects.create(order=order, new_status='pending', changed_by=self.user)
            Payment.objects.create(order=order, amount=1, payment_method='cash', status='approved')
            DeliveryRouteItem.objects.create(route=route, order=order, sort_order=i)
            # Un pedido sin hoja de ruta para que available_orders tenga filas
            Order.objects.create(customer=customer, created_by=self.user, subtotal=5)

    def count_queries(self, url):
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(url)
        self.assertEqual(res.status_code, 200, url)
        return len(ctx)

    def test_list_endpoints_do_not_grow_with_rows(self):
        self.add_rows(3)
        before = {url: self.count_queries(url) for url in LIST_ENDPOINTS}
        self.add_rows(6)
        for url in LIST_ENDPOINTS:
            with self.subTest(url=url):
                self.assertEqual(self.count_queries(url), before[url])
