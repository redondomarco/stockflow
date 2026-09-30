from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.products.models import Product, StockMovement
from apps.users.models import SystemConfig
from .models import Customer, Order, PriceList


class OrderTestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('vendedor', password='x')
        self.client.force_authenticate(self.user)
        self.price_list = PriceList.objects.create(name='Mayorista', multiplier=Decimal('1.2500'))
        self.customer = Customer.objects.create(name='Almacén Don José', price_list=self.price_list)
        self.product = Product.objects.create(name='Tapa', sku='T1', price=Decimal('100.00'), stock=10)
        self.fixed = Product.objects.create(name='Envase', sku='E1', price=Decimal('33.33'), stock=10, fixed_price=True)
        self.customer.enabled_products.set([self.product, self.fixed])

    def set_policy(self, policy):
        config = SystemConfig.get()
        config.stock_policy = policy
        config.save()

    def create_order(self, items, **extra):
        return self.client.post('/api/orders/', {'customer': self.customer.id, 'items': items, **extra}, format='json')


class OrderPricingTests(OrderTestBase):
    def test_price_is_computed_server_side_ignoring_client_price(self):
        res = self.create_order([
            {'product': self.product.id, 'quantity': 2, 'unit_price': 1},
            {'product': self.fixed.id, 'quantity': 1, 'unit_price': 1},
        ])
        self.assertEqual(res.status_code, 201, res.data)
        prices = {it['product']: Decimal(it['unit_price']) for it in res.data['items']}
        self.assertEqual(prices[self.product.id], Decimal('125.00'))  # 100 × 1.25
        self.assertEqual(prices[self.fixed.id], Decimal('33.33'))     # precio fijo, sin multiplicador
        self.assertEqual(Decimal(res.data['total']), Decimal('283.33'))

    def test_customer_without_price_list_pays_base_price(self):
        self.customer.price_list = None
        self.customer.save()
        res = self.create_order([{'product': self.product.id, 'quantity': 1}])
        self.assertEqual(Decimal(res.data['items'][0]['unit_price']), Decimal('100.00'))

    def test_product_not_enabled_for_customer_is_rejected(self):
        other = Product.objects.create(name='Otro', sku='O1', price=Decimal('5'), stock=10)
        res = self.create_order([{'product': other.id, 'quantity': 1}])
        self.assertEqual(res.status_code, 400)
        self.assertIn('no está habilitado', res.data['error'])
        self.assertFalse(Order.objects.exists())

    def test_inactive_product_is_rejected(self):
        self.product.is_active = False
        self.product.save()
        res = self.create_order([{'product': self.product.id, 'quantity': 1}])
        self.assertEqual(res.status_code, 400)

    def test_inactive_customer_is_rejected(self):
        self.customer.is_active = False
        self.customer.save()
        res = self.create_order([{'product': self.product.id, 'quantity': 1}])
        self.assertEqual(res.status_code, 400)
        self.assertIn('inactivo', res.data['error'])


class OrderInputValidationTests(OrderTestBase):
    def assert_rejected(self, items, **extra):
        res = self.create_order(items, **extra)
        self.assertEqual(res.status_code, 400, res.data)
        self.assertFalse(Order.objects.exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        return res

    def test_zero_or_negative_quantity(self):
        self.assert_rejected([{'product': self.product.id, 'quantity': 0}])
        self.assert_rejected([{'product': self.product.id, 'quantity': -5}])

    def test_non_numeric_quantity(self):
        self.assert_rejected([{'product': self.product.id, 'quantity': 'abc'}])

    def test_missing_product(self):
        self.assert_rejected([{'product': 99999, 'quantity': 1}])

    def test_duplicated_product(self):
        self.assert_rejected([
            {'product': self.product.id, 'quantity': 1},
            {'product': self.product.id, 'quantity': 2},
        ])

    def test_empty_items(self):
        self.assert_rejected([])

    def test_negative_or_invalid_amounts(self):
        self.assert_rejected([{'product': self.product.id, 'quantity': 1}], discount='-10')
        self.assert_rejected([{'product': self.product.id, 'quantity': 1}], shipping_cost='abc')

    def test_unknown_customer(self):
        res = self.client.post('/api/orders/', {'customer': 99999, 'items': [{'product': self.product.id, 'quantity': 1}]}, format='json')
        self.assertEqual(res.status_code, 400)


class StockPolicyTests(OrderTestBase):
    too_many = property(lambda self: [{'product': self.product.id, 'quantity': 15}])

    def assert_stock(self, expected):
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, expected)

    def test_allow_policy_accepts_and_goes_negative(self):
        self.set_policy('allow')
        res = self.create_order(self.too_many)
        self.assertEqual(res.status_code, 201)
        self.assert_stock(-5)
        self.assertIn('stock insuficiente', res.data['status_history'][0]['comment'])

    def test_sufficient_stock_never_warns(self):
        self.set_policy('block')
        res = self.create_order([{'product': self.product.id, 'quantity': 10}])
        self.assertEqual(res.status_code, 201)
        self.assert_stock(0)

    def test_warn_policy_requires_confirmation(self):
        self.set_policy('warn')
        res = self.create_order(self.too_many)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['code'], 'stock_warning')
        self.assertTrue(res.data['can_confirm'])
        self.assertEqual(res.data['shortages'][0], {
            'product': self.product.id, 'sku': 'T1', 'name': 'Tapa', 'requested': 15, 'available': 10,
        })
        self.assert_stock(10)
        self.assertFalse(Order.objects.exists())

        res = self.create_order(self.too_many, confirm_stock=True)
        self.assertEqual(res.status_code, 201)
        self.assert_stock(-5)

    def test_block_policy_rejects_even_with_confirmation(self):
        self.set_policy('block')
        res = self.create_order(self.too_many, confirm_stock=True)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['code'], 'insufficient_stock')
        self.assertFalse(res.data['can_confirm'])
        self.assert_stock(10)

    def test_block_policy_lets_authorized_user_confirm(self):
        self.set_policy('block')
        self.user.profile.can_override_stock = True
        self.user.profile.save()
        res = self.create_order(self.too_many)
        self.assertEqual(res.status_code, 409)
        res = self.create_order(self.too_many, confirm_stock=True)
        self.assertEqual(res.status_code, 201)

    def test_superuser_can_confirm_under_block(self):
        self.set_policy('block')
        admin = User.objects.create_superuser('jefe', password='x')
        self.client.force_authenticate(admin)
        res = self.create_order(self.too_many, confirm_stock=True)
        self.assertEqual(res.status_code, 201)

    def test_untracked_product_skips_stock_check(self):
        self.set_policy('block')
        self.product.track_stock = False
        self.product.save()
        res = self.create_order(self.too_many)
        self.assertEqual(res.status_code, 201)
        self.assert_stock(-5)  # el movimiento se sigue registrando


class OrderEditTests(OrderTestBase):
    def setUp(self):
        super().setUp()
        res = self.create_order([{'product': self.product.id, 'quantity': 8}])
        self.order_id = res.data['id']

    def edit(self, items, **extra):
        return self.client.patch(f'/api/orders/{self.order_id}/', {'items': items, **extra}, format='json')

    def test_edit_counts_stock_already_reserved_by_the_order(self):
        # Quedan 2 en stock + 8 reservados por este pedido = 10 disponibles.
        self.set_policy('block')
        res = self.edit([{'product': self.product.id, 'quantity': 10}])
        self.assertEqual(res.status_code, 200, res.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 0)

    def test_rejected_edit_leaves_order_and_stock_untouched(self):
        self.set_policy('block')
        movements = StockMovement.objects.count()
        res = self.edit([{'product': self.product.id, 'quantity': 11}])
        self.assertEqual(res.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 2)
        self.assertEqual(Order.objects.get(id=self.order_id).items.get().quantity, 8)
        self.assertEqual(StockMovement.objects.count(), movements)

    def test_edit_reprices_server_side(self):
        res = self.edit([{'product': self.product.id, 'quantity': 1, 'unit_price': '0.01'}], discount='5')
        self.assertEqual(Decimal(res.data['items'][0]['unit_price']), Decimal('125.00'))
        self.assertEqual(Decimal(res.data['total']), Decimal('120.00'))

    def test_edit_rejects_negative_discount(self):
        res = self.client.patch(f'/api/orders/{self.order_id}/', {'discount': '-1'}, format='json')
        self.assertEqual(res.status_code, 400)


class StockPolicyConfigTests(APITestCase):
    def test_only_valid_policies_are_saved(self):
        admin = User.objects.create_superuser('jefe', password='x')
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get('/api/users/config/').data['stock_policy'], 'allow')
        self.assertEqual(self.client.patch('/api/users/config/', {'stock_policy': 'nope'}, format='json').status_code, 400)
        res = self.client.patch('/api/users/config/', {'stock_policy': 'warn'}, format='json')
        self.assertEqual(res.data['stock_policy'], 'warn')


class TodayOrdersTests(OrderTestBase):
    """Aviso de pedidos del día: se cuenta por fecha local (Argentina), no UTC."""

    def local_dt(self, days=0, hour=12, minute=0):
        from datetime import datetime, time, timedelta
        from django.utils import timezone
        day = timezone.localdate() + timedelta(days=days)
        return timezone.make_aware(datetime.combine(day, time(hour, minute)))

    def order_at(self, dt, status='pending'):
        res = self.create_order([{'product': self.product.id, 'quantity': 1}])
        Order.objects.filter(id=res.data['id']).update(created_at=dt, status=status)
        return res.data['order_number']

    def today(self, customer=None):
        return self.client.get('/api/orders/today/', {'customer': (customer or self.customer).id})

    def test_lists_only_todays_active_orders_for_the_customer(self):
        today_nv = self.order_at(self.local_dt(hour=0, minute=10))
        self.order_at(self.local_dt(days=-1, hour=23, minute=30))  # ayer 23:30 local = hoy en UTC
        self.order_at(self.local_dt(hour=9), status='cancelled')
        other = Customer.objects.create(name='Otro')

        res = self.today()
        self.assertEqual(res.status_code, 200)
        self.assertEqual([o['order_number'] for o in res.data], [today_nv])
        self.assertEqual(res.data[0]['created_by'], 'vendedor')
        self.assertEqual(self.today(other).data, [])

    def test_customer_is_required(self):
        self.assertEqual(self.client.get('/api/orders/today/').status_code, 400)

    def test_last_order_date_uses_local_date(self):
        self.order_at(self.local_dt(days=-1, hour=23, minute=30))
        res = self.client.get(f'/api/orders/customers/{self.customer.id}/')
        self.assertEqual(res.data['last_order_date'], self.local_dt(days=-1).date().isoformat())
