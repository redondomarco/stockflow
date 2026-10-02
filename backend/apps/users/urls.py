from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuditLogViewSet, UserViewSet, SystemConfigView, FaviconView

router = DefaultRouter()
# 'audit' antes que '' para que /api/users/audit/ no se tome como el usuario con pk="audit"
router.register('audit', AuditLogViewSet, basename='audit')
router.register('', UserViewSet, basename='user')

urlpatterns = [
    path('config/', SystemConfigView.as_view(), name='system-config'),
    path('favicon/', FaviconView.as_view(), name='favicon'),
    path('', include(router.urls)),
]
