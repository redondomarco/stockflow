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


class NegativeStockStatsTests(ProductTestBase):
    def test_negative_stock_counts_as_out_of_stock(self):
        # Con la política de stock "permitir" el stock puede quedar negativo
        Product.objects.create(name='Vendido de más', sku='N1', price=Decimal('1'), stock=-3)
        res = self.client.get('/api/products/stats/')
        self.assertEqual(res.data['out_of_stock_count'], 1)
        self.assertIn('N1', [p['sku'] for p in self.client.get('/api/products/low_stock/').data])


class BundleFieldsBlankTests(ProductTestBase):
    """El formulario manda "" en los campos de caja de un producto no agrupado;
    antes bundle_quantity respondía "Introduzca un número entero válido"."""

    BLANK_BUNDLE = {'bundle_child': '', 'bundle_quantity': '', 'bundle_unit_weight': '', 'bundle_unit_price': ''}

    def test_editing_non_bundle_product_with_blank_bundle_fields(self):
        res = self.client.patch(f'/api/products/{self.product.id}/', {'name': 'Tapa nueva', **self.BLANK_BUNDLE}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, 'Tapa nueva')
        self.assertIsNone(self.product.bundle_quantity)
        self.assertIsNone(self.product.bundle_child)

    def test_creating_non_bundle_product_with_blank_bundle_fields(self):
        res = self.client.post('/api/products/', {'name': 'Nuevo', 'sku': 'N2', 'price': '10', **self.BLANK_BUNDLE}, format='json')
        self.assertEqual(res.status_code, 201, res.data)

    def test_bundle_values_are_still_saved(self):
        res = self.client.patch(f'/api/products/{self.product.id}/', {
            'is_bundle': True, 'bundle_child': '', 'bundle_quantity': '6', 'bundle_unit_price': '20', 'bundle_unit_weight': '',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data['bundle_quantity'], res.data['price']), (6, '120.00'))

    def test_invalid_quantity_is_still_rejected(self):
        res = self.client.patch(f'/api/products/{self.product.id}/', {'bundle_quantity': 'abc'}, format='json')
        self.assertEqual(res.status_code, 400)


class StockIntakeTests(ProductTestBase):
    def setUp(self):
        super().setUp()
        self.p2 = Product.objects.create(name='Envase', sku='E1', price=Decimal('5'), stock=0)
        self.p3 = Product.objects.create(name='Caja', sku='C1', price=Decimal('7'), stock=3)

    def configure(self, ids):
        return self.client.put('/api/products/intake/configure/', {'product_ids': ids}, format='json')

    def apply(self, items, reason=''):
        return self.client.post('/api/products/intake/apply/', {'items': items, 'reason': reason}, format='json')

    def stocks(self):
        return [Product.objects.get(pk=p.pk).stock for p in (self.product, self.p2, self.p3)]

    def test_configure_and_list_keep_order(self):
        res = self.configure([self.p3.id, self.product.id, self.p3.id])
        self.assertEqual([p['sku'] for p in res.data], ['C1', 'T1'])
        self.assertEqual([p['sku'] for p in self.client.get('/api/products/intake/').data], ['C1', 'T1'])

    def test_inactive_products_are_hidden_and_rejected(self):
        self.configure([self.product.id, self.p2.id])
        self.p2.is_active = False
        self.p2.save()
        self.assertEqual([p['sku'] for p in self.client.get('/api/products/intake/').data], ['T1'])
        self.assertEqual(self.configure([self.p2.id]).status_code, 400)

    def test_apply_adds_stock_and_records_movements(self):
        res = self.apply([{'product': self.product.id, 'quantity': 5}, {'product': self.p2.id, 'quantity': 12}], reason='Remito 0001-123')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['total_units'], 17)
        self.assertEqual(self.stocks(), [15, 12, 3])
        movements = StockMovement.objects.filter(movement_type='in').order_by('product_id')
        self.assertEqual([(m.quantity, m.stock_before, m.stock_after) for m in movements], [(5, 10, 15), (12, 0, 12)])
        self.assertTrue(all(m.reason == 'Ingreso de stock: Remito 0001-123' for m in movements))

    def test_invalid_rows_reject_the_whole_intake(self):
        for items in (
            [{'product': self.product.id, 'quantity': 5}, {'product': self.p2.id, 'quantity': 0}],
            [{'product': self.product.id, 'quantity': 5}, {'product': self.p2.id, 'quantity': 'x'}],
            [{'product': self.product.id, 'quantity': 5}, {'product': 99999, 'quantity': 1}],
            [{'product': self.product.id, 'quantity': 5}, {'product': self.product.id, 'quantity': 1}],
            [],
        ):
            with self.subTest(items=items):
                self.assertEqual(self.apply(items).status_code, 400)
        self.assertEqual(self.stocks(), [10, 0, 3])
        self.assertFalse(StockMovement.objects.exists())

    def test_permissions_use_stock_section(self):
        self.set_permission('stock', 'read')
        self.assertEqual(self.client.get('/api/products/intake/').status_code, 200)
        self.assertEqual(self.apply([{'product': self.product.id, 'quantity': 1}]).status_code, 403)
        self.assertEqual(self.configure([self.product.id]).status_code, 403)
        self.set_permission('stock', 'hidden')
        self.assertEqual(self.client.get('/api/products/intake/').status_code, 403)

    def test_intake_is_audited(self):
        from apps.users.models import AuditLog
        self.apply([{'product': self.product.id, 'quantity': 5}, {'product': self.p2.id, 'quantity': 12}])
        log = AuditLog.objects.latest('id')
        self.assertEqual((log.section, log.description), ('stock', 'Ingreso de stock · 2 productos, 17 unidades'))
