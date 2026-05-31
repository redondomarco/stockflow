from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PriceListViewSet, CustomerViewSet, OrderViewSet, DeliveryRouteViewSet, ZoneViewSet

router = DefaultRouter()
router.register('price-lists', PriceListViewSet)
router.register('zones', ZoneViewSet, basename='zone')
router.register('customers', CustomerViewSet)
router.register('routes', DeliveryRouteViewSet, basename='deliveryroute')
router.register('', OrderViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
