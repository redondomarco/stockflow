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


class SecurityHeadersTests(APITestCase):
    def test_referrer_policy_allows_osm_tiles(self):
        # Los tiles de OpenStreetMap se bloquean ("Access blocked") si el navegador no envía
        # Referer: no usar same-origin ni no-referrer (ver también nginx/nginx.conf).
        res = self.client.get('/api/users/config/')
        self.assertEqual(res['Referrer-Policy'], 'strict-origin-when-cross-origin')


class FaviconTests(APITestCase):
    PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    def setUp(self):
        self.admin = User.objects.create_superuser('jefe', password='x')

    def set_favicon(self, value, user=None):
        self.client.force_authenticate(user or self.admin)
        res = self.client.patch('/api/users/config/', {'favicon': value}, format='json')
        self.client.force_authenticate(None)
        return res

    def test_default_icon_is_public(self):
        res = self.client.get('/api/users/favicon/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'image/svg+xml')
        self.assertIn(b'SF', res.content)
        self.assertIn('sandbox', res['Content-Security-Policy'])

    def test_configured_favicon_is_served(self):
        self.assertEqual(self.set_favicon(self.PNG).status_code, 200)
        res = self.client.get('/api/users/favicon/')
        self.assertEqual(res['Content-Type'], 'image/png')
        self.assertTrue(res.content.startswith(b'\x89PNG'))

    def test_etag_revalidation(self):
        etag = self.client.get('/api/users/favicon/')['ETag']
        self.assertEqual(self.client.get('/api/users/favicon/', HTTP_IF_NONE_MATCH=etag).status_code, 304)
        self.set_favicon(self.PNG)
        self.assertEqual(self.client.get('/api/users/favicon/', HTTP_IF_NONE_MATCH=etag).status_code, 200)

    def test_invalid_favicons_are_rejected(self):
        too_big = 'data:image/png;base64,' + 'A' * (140 * 1024)
        for value in ('no-es-un-data-url', 'data:text/html;base64,PGgxPmhpPC9oMT4=', too_big):
            with self.subTest(value=value[:30]):
                self.assertEqual(self.set_favicon(value).status_code, 400)

    def test_clearing_restores_default(self):
        self.set_favicon(self.PNG)
        self.assertEqual(self.set_favicon('').status_code, 200)
        self.assertEqual(self.client.get('/api/users/favicon/')['Content-Type'], 'image/svg+xml')

    def test_only_superuser_can_change(self):
        user = User.objects.create_user('vendedor', password='x')
        self.assertEqual(self.set_favicon(self.PNG, user=user).status_code, 403)

    def test_works_with_invalid_token(self):
        # La pantalla de login puede tener un token vencido guardado: el favicon no debe fallar
        res = self.client.get('/api/users/favicon/', HTTP_AUTHORIZATION='Bearer vencido')
        self.assertEqual(res.status_code, 200)


class PresenceTests(APITestCase):
    """Monitor de usuarios conectados: actividad registrada por la autenticación JWT."""

    def setUp(self):
        self.admin = User.objects.create_superuser('jefe', password='x')
        self.user = User.objects.create_user('vendedor', password='clave-123')

    def auth(self, user):
        from rest_framework_simplejwt.tokens import AccessToken
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}')

    def users_by_name(self):
        self.auth(self.admin)
        return {u['username']: u for u in self.client.get('/api/users/').data}

    def test_never_seen_user_is_offline(self):
        data = self.users_by_name()['vendedor']
        self.assertEqual((data['online'], data['last_seen'], data['last_login']), (False, None, None))

    def test_heartbeat_marks_user_online(self):
        self.auth(self.user)
        self.assertEqual(self.client.post('/api/users/heartbeat/').status_code, 204)
        self.assertTrue(self.users_by_name()['vendedor']['online'])

    def test_any_authenticated_request_counts_as_activity(self):
        self.auth(self.user)
        self.client.get('/api/users/me/')
        self.user.profile.refresh_from_db()
        self.assertIsNotNone(self.user.profile.last_seen)

    def test_inactive_for_more_than_window_is_offline(self):
        from datetime import timedelta
        from django.utils import timezone
        UserProfile.objects.filter(user=self.user).update(last_seen=timezone.now() - timedelta(minutes=6))
        self.assertFalse(self.users_by_name()['vendedor']['online'])

    def test_activity_is_written_at_most_once_per_minute(self):
        from datetime import timedelta
        from django.utils import timezone
        recent = timezone.now() - timedelta(seconds=10)
        UserProfile.objects.filter(user=self.user).update(last_seen=recent)
        self.auth(self.user)
        self.client.post('/api/users/heartbeat/')
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.last_seen, recent)

    def test_login_updates_last_login(self):
        res = self.client.post('/api/token/', {'username': 'vendedor', 'password': 'clave-123'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(self.users_by_name()['vendedor']['last_login'])

    def test_only_admins_see_the_monitor(self):
        self.auth(self.user)
        self.assertEqual(self.client.get('/api/users/').status_code, 403)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/users/heartbeat/').status_code, 401)
