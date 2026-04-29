from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, SupplierViewSet, ProductViewSet, StockMovementViewSet

router = DefaultRouter()
router.register('categories', CategoryViewSet)
router.register('suppliers', SupplierViewSet)
router.register('movements', StockMovementViewSet)
router.register('', ProductViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
