import csv
import io
import secrets
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.views import APIView
from django.contrib.auth.models import User
from .models import UserProfile, SystemConfig, default_permissions
from .serializers import UserSerializer

SECTIONS = ['products', 'stock', 'orders', 'payments', 'customers', 'price_lists', 'routes']
VALID_LEVELS = {'write', 'read', 'hidden'}


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('profile').order_by('username')
    serializer_class = UserSerializer
    pagination_class = None

    def get_permissions(self):
        if self.action == 'me':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminUser()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        user = request.user
        profile = getattr(user, 'profile', None)
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_superuser': user.is_superuser,
            'permissions': profile.permissions if profile else default_permissions(),
        })

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance == request.user:
            return Response({'error': 'No podés eliminar tu propio usuario.'}, status=400)
        if instance.is_superuser:
            return Response({'error': 'No se puede eliminar un superusuario.'}, status=400)
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        users = User.objects.select_related('profile').exclude(is_superuser=True).order_by('username')
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="usuarios.csv"'
        response.write('﻿')
        writer = csv.writer(response)
        writer.writerow(['usuario', 'email', 'nombre', 'apellido', 'activo', 'password'] + SECTIONS)
        for u in users:
            profile = getattr(u, 'profile', None)
            perms = profile.permissions if profile else {}
            writer.writerow([
                u.username, u.email or '', u.first_name, u.last_name,
                'si' if u.is_active else 'no',
                '',  # password vacío — se completa si se quiere cambiar
                *[perms.get(s, 'write') for s in SECTIONS],
            ])
        return response

    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió ningún archivo.'}, status=400)
        try:
            decoded = file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(decoded))
        except Exception:
            return Response({'error': 'No se pudo leer el archivo. Verificá que sea CSV UTF-8.'}, status=400)

        created = []
        updated = 0
        errors = []

        for i, row in enumerate(reader, start=2):
            username = (row.get('usuario') or '').strip()
            if not username:
                errors.append(f'Fila {i}: campo "usuario" requerido.')
                continue

            email = (row.get('email') or '').strip() or None
            first_name = (row.get('nombre') or '').strip()
            last_name = (row.get('apellido') or '').strip()
            activo_raw = (row.get('activo') or 'si').strip().lower()
            is_active = activo_raw in ('si', 'sí', 'true', '1', 'yes')
            password = (row.get('password') or '').strip()

            permissions = {}
            for s in SECTIONS:
                level = (row.get(s) or 'write').strip().lower()
                permissions[s] = level if level in VALID_LEVELS else 'write'

            existing = User.objects.filter(username=username).first()
            if existing:
                if existing.is_superuser:
                    errors.append(f'Fila {i}: no se puede modificar al superusuario "{username}".')
                    continue
                if email:
                    existing.email = email
                if first_name:
                    existing.first_name = first_name
                if last_name:
                    existing.last_name = last_name
                existing.is_active = is_active
                if password:
                    existing.set_password(password)
                existing.save()
                profile, _ = UserProfile.objects.get_or_create(user=existing)
                profile.permissions = permissions
                profile.save()
                updated += 1
            else:
                auto_pwd = None
                if not password:
                    auto_pwd = secrets.token_urlsafe(10)
                    password = auto_pwd
                user = User.objects.create_user(
                    username=username,
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    is_active=is_active,
                    password=password,
                )
                profile, _ = UserProfile.objects.get_or_create(user=user)
                profile.permissions = permissions
                profile.save()
                entry = {'username': username}
                if auto_pwd:
                    entry['generated_password'] = auto_pwd
                created.append(entry)

        return Response({'created': created, 'updated': updated, 'errors': errors})


class SystemConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = SystemConfig.get()
        return Response({'logo_svg': config.logo_svg})

    def patch(self, request):
        if not request.user.is_superuser:
            return Response({'error': 'No autorizado.'}, status=403)
        config = SystemConfig.get()
        if 'logo_svg' in request.data:
            config.logo_svg = request.data['logo_svg']
            config.save()
        return Response({'logo_svg': config.logo_svg})
