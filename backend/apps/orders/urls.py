from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PriceListViewSet, CustomerViewSet, OrderViewSet, DriverViewSet, DeliveryRouteViewSet

router = DefaultRouter()
router.register('price-lists', PriceListViewSet)
router.register('customers', CustomerViewSet)
router.register('routes', DeliveryRouteViewSet, basename='deliveryroute')
router.register('drivers', DriverViewSet, basename='driver')
router.register('', OrderViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
