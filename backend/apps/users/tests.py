import csv
import io

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from .models import UserProfile, default_permissions


class UserAdminTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('jefe', password='x')
        self.client.force_authenticate(self.admin)

    def test_profile_is_created_with_default_permissions(self):
        user = User.objects.create_user('nuevo', password='x')
        self.assertEqual(user.profile.permissions, default_permissions())

    def test_create_user_with_profile_fields(self):
        res = self.client.post('/api/users/', {
            'username': 'chofer', 'password': 'clave-segura-123', 'is_driver': True,
            'can_override_stock': True, 'permissions': {**default_permissions(), 'payments': 'hidden'},
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertNotIn('password', res.data)
        user = User.objects.get(username='chofer')
        self.assertTrue(user.check_password('clave-segura-123'))
        self.assertTrue(user.profile.is_driver)
        self.assertTrue(user.profile.can_override_stock)
        self.assertFalse(user.profile.can_approve_payments)
        self.assertEqual(user.profile.permissions['payments'], 'hidden')

    def test_update_keeps_password_when_blank(self):
        user = User.objects.create_user('vendedor', password='original')
        res = self.client.patch(f'/api/users/{user.id}/', {'password': '', 'first_name': 'Ana'}, format='json')
        self.assertEqual(res.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password('original'))
        self.assertEqual(user.first_name, 'Ana')

    def test_cannot_delete_self_or_superusers(self):
        other_admin = User.objects.create_superuser('otro', password='x')
        self.assertEqual(self.client.delete(f'/api/users/{self.admin.id}/').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/users/{other_admin.id}/').status_code, 400)
        user = User.objects.create_user('temporal', password='x')
        self.assertEqual(self.client.delete(f'/api/users/{user.id}/').status_code, 204)

    def test_non_admin_only_sees_me(self):
        user = User.objects.create_user('vendedor', password='x')
        user.profile.permissions['orders'] = 'read'
        user.profile.save()
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/users/').status_code, 403)
        me = self.client.get('/api/users/me/').data
        self.assertEqual((me['username'], me['is_superuser'], me['permissions']['orders']), ('vendedor', False, 'read'))

    def test_config_patch_is_superuser_only(self):
        user = User.objects.create_user('vendedor', password='x')
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/users/config/').status_code, 200)
        self.assertEqual(self.client.patch('/api/users/config/', {'logo_width': 200}, format='json').status_code, 403)


class UserCsvTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('jefe', password='x')
        self.client.force_authenticate(self.admin)

    def import_csv(self, text):
        upload = SimpleUploadedFile('u.csv', text.encode('utf-8'), content_type='text/csv')
        return self.client.post('/api/users/import_csv/', {'file': upload}, format='multipart')

    def test_export_excludes_superusers(self):
        User.objects.create_user('vendedor', password='x')
        content = self.client.get('/api/users/export_csv/').content.decode('utf-8-sig')
        users = [row['usuario'] for row in csv.DictReader(io.StringIO(content))]
        self.assertEqual(users, ['vendedor'])

    def test_import_creates_updates_and_protects_superusers(self):
        existing = User.objects.create_user('vendedor', password='vieja')
        res = self.import_csv(
            'usuario,email,nombre,activo,password,orders,payments\n'
            'nuevo,n@example.com,Nora,si,,write,hidden\n'
            'vendedor,,,no,nueva-clave,read,nivel_invalido\n'
            'jefe,,,si,,write,write\n'
            ',,,,,,\n'
        )
        self.assertEqual(res.data['updated'], 1)
        self.assertEqual(len(res.data['errors']), 2)  # superusuario y fila sin usuario
        created = res.data['created'][0]
        self.assertEqual(created['username'], 'nuevo')
        self.assertTrue(User.objects.get(username='nuevo').check_password(created['generated_password']))
        self.assertEqual(UserProfile.objects.get(user__username='nuevo').permissions['payments'], 'hidden')

        existing.refresh_from_db()
        self.assertFalse(existing.is_active)
        self.assertTrue(existing.check_password('nueva-clave'))
        self.assertEqual(existing.profile.permissions['orders'], 'read')
        self.assertEqual(existing.profile.permissions['payments'], 'write')  # nivel inválido → write
