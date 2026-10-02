from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.orders.models import Customer
from apps.products.models import Product
from .audit import AuditMiddleware
from .models import AuditLog, SystemConfig


class AuditTestBase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('jefe', password='x')
        self.user = User.objects.create_user('vendedor', password='clave-123')
        self.client.force_authenticate(self.user)
        self.product = Product.objects.create(name='Tapa', sku='T1', price=Decimal('100'), stock=50)
        self.customer = Customer.objects.create(name='Kiosco')
        self.customer.enabled_products.set([self.product])

    def last(self):
        return AuditLog.objects.order_by('-id').first()

    def create_order(self):
        return self.client.post('/api/orders/', {
            'customer': self.customer.id, 'items': [{'product': self.product.id, 'quantity': 2}],
        }, format='json')


class AuditRecordingTests(AuditTestBase):
    def test_write_action_is_recorded(self):
        res = self.create_order()
        log = self.last()
        self.assertEqual((log.user, log.username, log.section, log.action, log.success), (self.user, 'vendedor', 'orders', 'create', True))
        self.assertEqual(log.description, f"Alta · Pedido {res.data['order_number']}")
        self.assertEqual(log.object_id, str(res.data['id']))
        self.assertEqual(log.details['datos']['items'][0]['quantity'], 2)

    def test_reads_and_heartbeat_are_not_recorded(self):
        self.client.get('/api/orders/')
        self.client.get('/api/products/')
        self.client.post('/api/users/heartbeat/')
        self.assertFalse(AuditLog.objects.exists())

    def test_rejected_action_is_recorded_as_failure(self):
        self.user.profile.permissions['products'] = 'read'
        self.user.profile.save()
        self.client.patch(f'/api/products/{self.product.id}/', {'price': '1'}, format='json')
        log = self.last()
        self.assertFalse(log.success)
        self.assertEqual(log.status_code, 403)
        self.assertEqual(log.description, 'Edición · Producto T1 Tapa')
        self.assertIn('respuesta', log.details)

    def test_status_change_includes_new_status(self):
        order_id = self.create_order().data['id']
        self.client.post(f'/api/orders/{order_id}/change_status/', {'status': 'cancelled'}, format='json')
        self.assertTrue(self.last().description.endswith('→ Anulado'))

    def test_deleted_object_keeps_its_label(self):
        extra = Product.objects.create(name='Envase', sku='E9', price=Decimal('5'))
        self.client.force_authenticate(self.admin)
        self.client.delete(f'/api/products/{extra.id}/')
        log = self.last()
        self.assertEqual((log.action, log.description, log.success), ('destroy', 'Eliminación · Producto E9 Envase', True))

    def test_successful_and_failed_logins(self):
        self.client.force_authenticate(None)
        self.client.post('/api/token/', {'username': 'vendedor', 'password': 'clave-123'}, format='json')
        ok = self.last()
        self.assertEqual((ok.action, ok.user, ok.description, ok.success), ('login', self.user, 'Inicio de sesión', True))
        self.assertEqual(ok.details['datos']['password'], '***')

        self.client.post('/api/token/', {'username': 'vendedor', 'password': 'mala'}, format='json')
        bad = self.last()
        self.assertEqual((bad.action, bad.user, bad.username, bad.success), ('login_failed', None, 'vendedor', False))
        self.assertIn('usuario: vendedor', bad.description)
        self.assertNotIn('mala', str(bad.details))

    def test_passwords_are_never_stored(self):
        self.client.force_authenticate(self.admin)
        self.client.post('/api/users/', {'username': 'nuevo', 'password': 'super-secreta-123'}, format='json')
        log = self.last()
        self.assertEqual((log.section, log.description), ('users', 'Alta · Usuario nuevo'))
        self.assertNotIn('super-secreta-123', str(log.details))

    def test_config_change(self):
        self.client.force_authenticate(self.admin)
        self.client.patch('/api/users/config/', {'stock_policy': 'warn'}, format='json')
        self.assertEqual(self.last().description, 'Cambio de configuración: stock_policy')

    def test_file_upload_is_not_stored(self):
        self.client.force_authenticate(self.admin)
        upload = SimpleUploadedFile('p.csv', b'sku,nombre,precio\nN1,Nuevo,10\n', content_type='text/csv')
        self.client.post('/api/products/import_csv/', {'file': upload}, format='multipart')
        log = self.last()
        self.assertEqual((log.action, log.details['datos']), ('import_csv', 'archivo adjunto'))

    def test_audit_failure_does_not_break_the_request(self):
        with mock.patch.object(AuditLog.objects, 'create', side_effect=RuntimeError('db caída')):
            res = self.create_order()
        self.assertEqual(res.status_code, 201)

    def test_retention_purges_old_entries(self):
        old = AuditLog.objects.create(username='x', action='a', description='viejo', method='POST', path='/', status_code=200, success=True)
        AuditLog.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=400))
        AuditMiddleware._last_purge = None
        self.create_order()
        self.assertFalse(AuditLog.objects.filter(pk=old.pk).exists())

    def test_retention_zero_keeps_everything(self):
        config = SystemConfig.get()
        config.audit_retention_days = 0
        config.save()
        old = AuditLog.objects.create(username='x', action='a', description='viejo', method='POST', path='/', status_code=200, success=True)
        AuditLog.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=4000))
        AuditMiddleware._last_purge = None
        self.create_order()
        self.assertTrue(AuditLog.objects.filter(pk=old.pk).exists())


class AuditApiTests(AuditTestBase):
    def setUp(self):
        super().setUp()
        self.create_order()
        self.client.force_authenticate(self.admin)
        self.client.patch(f'/api/products/{self.product.id}/', {'price': '90'}, format='json')

    def test_only_superusers_can_read(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get('/api/users/audit/').status_code, 403)
        self.assertFalse(AuditLog.objects.filter(path='/api/users/audit/').exists())  # las consultas no se registran

    def test_list_and_filters(self):
        res = self.client.get('/api/users/audit/')
        self.assertEqual(res.data['count'], 2)
        self.assertEqual(res.data['results'][0]['user_display'], 'jefe')  # más reciente primero
        self.assertEqual(self.client.get('/api/users/audit/', {'user': self.user.id}).data['count'], 1)
        self.assertEqual(self.client.get('/api/users/audit/', {'section': 'products'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/users/audit/', {'success': 'false'}).data['count'], 0)
        self.assertEqual(self.client.get('/api/users/audit/', {'q': 'pedido'}).data['count'], 1)
        today = timezone.localdate().isoformat()
        self.assertEqual(self.client.get('/api/users/audit/', {'date_from': today, 'date_to': today}).data['count'], 2)

    def test_user_filter_includes_failed_logins_for_that_account(self):
        self.client.force_authenticate(None)
        self.client.post('/api/token/', {'username': 'vendedor', 'password': 'mala'}, format='json')
        self.client.force_authenticate(self.admin)
        logs = self.client.get('/api/users/audit/', {'user': self.user.id}).data['results']
        self.assertEqual([log['action'] for log in logs], ['login_failed', 'create'])

    def test_export_csv(self):
        content = self.client.get('/api/users/audit/export_csv/').content.decode('utf-8-sig')
        self.assertTrue(content.startswith('fecha,usuario,seccion'))
        self.assertIn('Alta · Pedido', content)

    def test_retention_setting(self):
        self.assertEqual(self.client.get('/api/users/config/').data['audit_retention_days'], 365)
        self.assertEqual(self.client.patch('/api/users/config/', {'audit_retention_days': -1}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/users/config/', {'audit_retention_days': 90}, format='json').data['audit_retention_days'], 90)
