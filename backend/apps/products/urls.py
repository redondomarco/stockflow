from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, SupplierViewSet, ProductViewSet, StockIntakeViewSet, StockMovementViewSet

router = DefaultRouter()
router.register('categories', CategoryViewSet)
router.register('suppliers', SupplierViewSet)
router.register('movements', StockMovementViewSet)
# Antes que '' para que /api/products/intake/ no se tome como el producto con pk="intake"
router.register('intake', StockIntakeViewSet, basename='stock-intake')
router.register('', ProductViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
