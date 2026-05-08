from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, SystemConfigView

router = DefaultRouter()
router.register('', UserViewSet, basename='user')

urlpatterns = [
    path('config/', SystemConfigView.as_view(), name='system-config'),
    path('', include(router.urls)),
]
