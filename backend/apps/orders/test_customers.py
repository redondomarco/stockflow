import csv
import io
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from apps.payments.models import Payment
from apps.products.models import Product
from .models import Customer, Order, PriceList, Zone


def csv_upload(text):
    return SimpleUploadedFile('data.csv', text.encode('utf-8'), content_type='text/csv')


class CustomerTestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('ventas', password='x')
        self.client.force_authenticate(self.user)
        self.product = Product.objects.create(name='Tapa', sku='T1', price=Decimal('100'), stock=100)
        self.other_product = Product.objects.create(name='Envase', sku='E1', price=Decimal('10'), stock=100)
        self.price_list = PriceList.objects.create(name='Mayorista', multiplier=Decimal('0.9'))
        self.zone = Zone.objects.create(name='Centro', color='#ff0000')
        self.customer = Customer.objects.create(
            name='Almacén Norte', cuit='20-11111111-1', email='norte@example.com', phone='341-555',
            address='Calle 1', localidad='Rosario', zone=self.zone, latitude=Decimal('-32.9'),
            longitude=Decimal('-60.6'), priority=3, price_list=self.price_list,
        )
        self.customer.enabled_products.set([self.product, self.other_product])

    def new_order(self, quantity=1):
        res = self.client.post('/api/orders/', {
            'customer': self.customer.id, 'items': [{'product': self.product.id, 'quantity': quantity}],
        }, format='json')
        return Order.objects.get(id=res.data['id'])


class CustomerCrudTests(CustomerTestBase):
    def test_inactive_customers_are_filtered(self):
        Customer.objects.create(name='Cerrado', is_active=False)
        names = lambda params=None: sorted(c['name'] for c in self.client.get('/api/orders/customers/', params).data)
        self.assertEqual(names(), ['Almacén Norte'])
        self.assertEqual(names({'inactive': '1'}), ['Cerrado'])
        self.assertEqual(names({'all': '1'}), ['Almacén Norte', 'Cerrado'])

    def test_duplicated_cuit_or_email_is_rejected(self):
        for field, value in [('cuit', '20-11111111-1'), ('email', 'norte@example.com')]:
            with self.subTest(field=field):
                res = self.client.post('/api/orders/customers/', {'name': 'Otro', field: value}, format='json')
                self.assertEqual(res.status_code, 400)

    def test_blank_email_does_not_collide(self):
        for name in ('A', 'B'):
            res = self.client.post('/api/orders/customers/', {'name': name, 'email': ''}, format='json')
            self.assertEqual(res.status_code, 201, res.data)
            self.assertIsNone(res.data['email'])

    def test_customer_with_orders_cannot_be_deleted(self):
        self.new_order()
        res = self.client.delete(f'/api/orders/customers/{self.customer.id}/')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Customer.objects.filter(id=self.customer.id).exists())

    def test_enabled_products(self):
        url = f'/api/orders/customers/{self.customer.id}/products/'
        self.assertEqual({p['sku'] for p in self.client.get(url).data}, {'T1', 'E1'})
        self.assertEqual(self.client.post(url, {'product_ids': [self.product.id]}, format='json').data['count'], 1)
        self.other_product.is_active = False
        self.other_product.save()
        self.assertEqual([p['sku'] for p in self.client.get(url).data], ['T1'])

    def test_zone_customer_count(self):
        res = self.client.get('/api/orders/zones/')
        self.assertEqual(res.data[0]['customer_count'], 1)


class CustomerCsvTests(CustomerTestBase):
    def export_rows(self):
        res = self.client.get('/api/orders/customers/export_csv/')
        return list(csv.DictReader(io.StringIO(res.content.decode('utf-8-sig'))))

    def test_export_includes_all_fields(self):
        row = self.export_rows()[0]
        self.assertEqual(row['nombre'], 'Almacén Norte')
        self.assertEqual(row['zona'], 'Centro')
        self.assertEqual(row['prioridad'], '3')
        self.assertEqual(row['lista_de_precios'], 'Mayorista')
        self.assertEqual(row['productos_habilitados'], 'E1|T1')
        self.assertEqual(row['activo'], 'si')

    def test_export_import_roundtrip_preserves_data(self):
        exported = self.client.get('/api/orders/customers/export_csv/').content.decode('utf-8-sig')
        self.customer.delete()

        res = self.client.post('/api/orders/customers/import_csv/', {'file': csv_upload(exported)}, format='multipart')
        self.assertEqual((res.data['created'], res.data['errors']), (1, []))

        c = Customer.objects.get(cuit='20-11111111-1')
        self.assertEqual(
            (c.name, c.email, c.phone, c.address, c.localidad, c.zone, c.priority, c.price_list, c.is_active),
            ('Almacén Norte', 'norte@example.com', '341-555', 'Calle 1', 'Rosario', self.zone, 3, self.price_list, True),
        )
        self.assertEqual((c.latitude, c.longitude), (Decimal('-32.9000000'), Decimal('-60.6000000')))
        self.assertEqual(set(c.enabled_products.values_list('sku', flat=True)), {'T1', 'E1'})

    def test_import_skips_existing_and_reports_errors(self):
        text = (
            'nombre,cuit,email,zona,prioridad,lista_de_precios\n'
            'Duplicado,20-11111111-1,,,,\n'
            ',,,,,\n'
            'Nuevo,,,Sur,,Inexistente\n'
            'Prioridad mala,,,,abc,\n'
        )
        res = self.client.post('/api/orders/customers/import_csv/', {'file': csv_upload(text)}, format='multipart')
        self.assertEqual(res.data['skipped'], 1)
        self.assertEqual(res.data['created'], 2)
        self.assertEqual(len(res.data['errors']), 3)  # fila sin nombre, lista inexistente, prioridad inválida
        nuevo = Customer.objects.get(name='Nuevo')
        self.assertEqual(nuevo.zone.name, 'Sur')  # la zona se crea al importar
        self.assertIsNone(nuevo.price_list)
        self.assertEqual(Customer.objects.get(name='Prioridad mala').priority, 5)


class AccountStatementTests(CustomerTestBase):
    def test_statement_and_debt_dashboard(self):
        o1 = self.new_order(quantity=10)  # 10 × 100 × 0,9 = 900
        o2 = self.new_order(quantity=5)   # 450
        cancelled = self.new_order(quantity=1)
        self.client.post(f'/api/orders/{cancelled.id}/change_status/', {'status': 'cancelled'}, format='json')
        Payment.objects.create(order=o1, amount=Decimal('900'), payment_method='cash', status='approved')
        Payment.objects.create(order=o2, amount=Decimal('100'), payment_method='cash', status='approved')
        Payment.objects.create(order=o2, amount=Decimal('50'), payment_method='cash', status='pending')

        res = self.client.get(f'/api/orders/customers/{self.customer.id}/account_statement/')
        self.assertEqual(res.data['summary'], {
            'total_billed': 1350.0, 'total_paid': 1000.0, 'balance': 350.0, 'order_count': 2,
        })
        by_number = {o['order_number']: o for o in res.data['orders']}
        self.assertEqual(by_number[o2.order_number]['balance'], 350.0)
        self.assertEqual(len(by_number[o2.order_number]['payments']), 2)

        debtors = self.client.get('/api/orders/customers/debt_dashboard/').data
        self.assertEqual([(d['customer_name'], d['balance']) for d in debtors], [('Almacén Norte', 350.0)])

    def test_customers_without_debt_are_not_listed(self):
        o1 = self.new_order(quantity=1)
        Payment.objects.create(order=o1, amount=o1.total, payment_method='cash', status='approved')
        self.assertEqual(self.client.get('/api/orders/customers/debt_dashboard/').data, [])


class PriceListCsvTests(CustomerTestBase):
    def import_csv(self, text, replace=False):
        url = '/api/orders/price-lists/import_csv/' + ('?replace=1' if replace else '')
        return self.client.post(url, {'file': csv_upload(text)}, format='multipart')

    def test_preview_then_apply(self):
        text = 'nombre,multiplicador,descripcion\nMayorista,0.85,nueva\nMinorista,1.2,\nMala,-1,\n'
        preview = self.import_csv(text)
        self.assertTrue(preview.data['preview'])
        self.assertEqual([e['nombre'] for e in preview.data['to_create']], ['Minorista'])
        self.assertEqual(preview.data['to_update'][0]['current_multiplier'], 0.9)
        self.assertEqual(len(preview.data['errors']), 1)
        self.assertFalse(PriceList.objects.filter(name='Minorista').exists())

        res = self.import_csv(text, replace=True)
        self.assertEqual((res.data['created'], res.data['updated']), (1, 1))
        self.assertEqual(PriceList.objects.get(name='Mayorista').multiplier, Decimal('0.85'))

    def test_export(self):
        content = self.client.get('/api/orders/price-lists/export_csv/').content.decode('utf-8-sig')
        self.assertIn('Mayorista,0.9000', content)
