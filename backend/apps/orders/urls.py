from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PriceListViewSet, CustomerViewSet, OrderViewSet

router = DefaultRouter()
router.register('price-lists', PriceListViewSet)
router.register('customers', CustomerViewSet)
router.register('', OrderViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
