from decimal import Decimal

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from apps.orders.models import Customer
from .models import Category, Product, StockMovement


def csv_file(content, name='data.csv'):
    return SimpleUploadedFile(name, content.encode('utf-8'), content_type='text/csv')


class ProductTestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('deposito', password='x')
        self.client.force_authenticate(self.user)
        self.product = Product.objects.create(name='Tapa', sku='T1', price=Decimal('100'), cost=Decimal('60'), stock=10, stock_min=5)

    def set_permission(self, section, level):
        self.user.profile.permissions[section] = level
        self.user.profile.save()


class ProductCrudTests(ProductTestBase):
    def test_list_hides_inactive_unless_all(self):
        Product.objects.create(name='Viejo', sku='V1', price=Decimal('1'), is_active=False)
        skus = lambda res: {p['sku'] for p in res.data}
        self.assertEqual(skus(self.client.get('/api/products/')), {'T1'})
        self.assertEqual(skus(self.client.get('/api/products/', {'all': 'true'})), {'T1', 'V1'})

    def test_bundle_price_is_quantity_times_unit_price(self):
        res = self.client.post('/api/products/', {
            'name': 'Caja x12', 'sku': 'C12', 'price': '1', 'is_bundle': True,
            'bundle_child': self.product.id, 'bundle_quantity': 12, 'bundle_unit_price': '95.50',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data['price']), Decimal('1146.00'))

    def test_margin_and_low_stock(self):
        res = self.client.get(f'/api/products/{self.product.id}/')
        self.assertEqual(Decimal(str(res.data['margin'])), Decimal('40.00'))
        self.assertFalse(res.data['is_low_stock'])
        self.product.stock = 5
        self.product.save()
        self.assertEqual([p['sku'] for p in self.client.get('/api/products/low_stock/').data], ['T1'])

    def test_stats(self):
        Product.objects.create(name='Agotado', sku='A1', price=Decimal('1'), cost=Decimal('2'), stock=0)
        res = self.client.get('/api/products/stats/')
        self.assertEqual(res.data['total_products'], 2)
        self.assertEqual(res.data['out_of_stock_count'], 1)
        self.assertEqual(res.data['low_stock_count'], 1)
        self.assertEqual(res.data['total_inventory_value'], 600.0)

    def test_product_with_orders_cannot_be_hard_deleted(self):
        from apps.orders.models import Order, OrderItem
        order = Order.objects.create(customer=Customer.objects.create(name='C'))
        OrderItem.objects.create(order=order, product=self.product, quantity=1, unit_price=Decimal('100'))
        res = self.client.delete(f'/api/products/{self.product.id}/')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())


class StockAdjustmentTests(ProductTestBase):
    def adjust(self, movement_type, quantity, reason='conteo'):
        return self.client.post(f'/api/products/{self.product.id}/adjust_stock/', {
            'movement_type': movement_type, 'quantity': quantity, 'reason': reason,
        }, format='json')

    def assert_stock(self, expected):
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, expected)

    def test_in_out_and_adjustment_record_movements(self):
        self.assertEqual(self.adjust('in', 5).status_code, 200)
        self.assert_stock(15)
        self.adjust('out', 3)
        self.assert_stock(12)
        self.adjust('adjustment', 7)
        self.assert_stock(7)
        movements = list(StockMovement.objects.filter(product=self.product).order_by('id')
                         .values_list('movement_type', 'quantity', 'stock_before', 'stock_after'))
        self.assertEqual(movements, [('in', 5, 10, 15), ('out', 3, 15, 12), ('adjustment', 7, 12, 7)])

    def test_invalid_quantities_are_rejected(self):
        for movement_type, quantity in [('in', 0), ('in', -5), ('out', -1), ('adjustment', -3)]:
            with self.subTest(movement_type=movement_type, quantity=quantity):
                self.assertEqual(self.adjust(movement_type, quantity).status_code, 400)
        self.assert_stock(10)
        self.assertFalse(StockMovement.objects.exists())

    def test_adjustment_to_zero_is_allowed(self):
        self.assertEqual(self.adjust('adjustment', 0).status_code, 200)
        self.assert_stock(0)

    def test_movements_endpoints(self):
        self.adjust('in', 2)
        self.assertEqual(len(self.client.get(f'/api/products/{self.product.id}/movements/').data), 1)
        res = self.client.get('/api/products/movements/', {'movement_type': 'in'})
        self.assertEqual(res.data['count'], 1)


class ProductCsvTests(ProductTestBase):
    HEADER = 'sku,nombre,descripcion,categoria,proveedor,precio,costo,stock,stock_min,orden\n'

    def import_csv(self, rows):
        return self.client.post('/api/products/import_csv/', {'file': csv_file(self.HEADER + rows)}, format='multipart')

    def test_export(self):
        res = self.client.get('/api/products/export_csv/')
        content = res.content.decode('utf-8-sig')
        self.assertTrue(content.startswith('sku,nombre'))
        self.assertIn('T1,Tapa', content)

    def test_import_creates_and_updates(self):
        res = self.import_csv(
            'N1,Nuevo,desc,Bebidas,Proveedor SA,50,30,8,2,3\n'
            'T1,Tapa,,,,120,,,,\n'
        )
        self.assertEqual((res.data['created'], res.data['updated'], res.data['errors']), (1, 1, []))
        nuevo = Product.objects.get(sku='N1')
        self.assertEqual((nuevo.stock, nuevo.stock_min, nuevo.sort_order), (8, 2, 3))
        self.assertEqual(nuevo.category.name, 'Bebidas')
        self.assertEqual(nuevo.supplier.name, 'Proveedor SA')
        self.product.refresh_from_db()
        self.assertEqual(self.product.price, Decimal('120'))
        self.assertEqual(self.product.stock, 10)  # la actualización no toca stock

    def test_import_reports_row_errors(self):
        res = self.import_csv(',SinSku,,,,1,,,,\nX1,Precio malo,,,,abc,,,,\n')
        self.assertEqual(res.data['created'], 0)
        self.assertEqual(len(res.data['errors']), 2)
        self.assertIn('Fila 2', res.data['errors'][0])

    def test_import_requires_file(self):
        self.assertEqual(self.client.post('/api/products/import_csv/', {}, format='multipart').status_code, 400)


class SectionPermissionTests(ProductTestBase):
    def test_hidden_section_denies_everything(self):
        self.set_permission('products', 'hidden')
        self.assertEqual(self.client.get('/api/products/').status_code, 403)

    def test_read_section_allows_only_safe_methods(self):
        self.set_permission('products', 'read')
        self.assertEqual(self.client.get('/api/products/').status_code, 200)
        res = self.client.patch(f'/api/products/{self.product.id}/', {'price': '1'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.client.post('/api/products/categories/', {'name': 'X'}, format='json').status_code, 403)

    def test_sections_are_independent(self):
        self.set_permission('stock', 'hidden')
        self.assertEqual(self.client.get('/api/products/').status_code, 200)
        self.assertEqual(self.client.get('/api/products/movements/').status_code, 403)

    def test_superuser_bypasses_section_permissions(self):
        admin = User.objects.create_superuser('jefe', password='x')
        admin.profile.permissions['products'] = 'hidden'
        admin.profile.save()
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get('/api/products/').status_code, 200)

    def test_anonymous_is_rejected(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/products/').status_code, 401)

    def test_categories_count_only_active_products(self):
        cat = Category.objects.create(name='Tapas')
        self.product.category = cat
        self.product.save()
        Product.objects.create(name='Baja', sku='B1', price=Decimal('1'), category=cat, is_active=False)
        res = self.client.get('/api/products/categories/')
        self.assertEqual(res.data['results'][0]['product_count'], 1)
