import csv
import io
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Category, Supplier, Product, StockMovement
from .serializers import (
    CategorySerializer, SupplierSerializer, ProductSerializer,
    StockMovementSerializer, StockAdjustmentSerializer
)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all().order_by("name")
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['name']


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by("name")
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['name', 'email']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category', 'supplier').filter(is_active=True)
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'supplier', 'is_active']
    search_fields = ['name', 'sku', 'description']
    ordering_fields = ['sort_order', 'name', 'price', 'stock', 'created_at']
    ordering = ['sort_order', 'name']

    def get_queryset(self):
        qs = Product.objects.select_related('category', 'supplier')
        if self.action in ('list', 'low_stock'):
            if not self.request.query_params.get('all'):
                return qs.filter(is_active=True)
        return qs

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Productos con stock bajo el mínimo"""
        products = [p for p in self.get_queryset() if p.is_low_stock]
        serializer = self.get_serializer(products, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def adjust_stock(self, request, pk=None):
        """Ajustar stock de un producto"""
        product = self.get_object()
        serializer = StockAdjustmentSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        quantity = data['quantity']
        movement_type = data['movement_type']

        with transaction.atomic():
            stock_before = product.stock

            if movement_type == 'in':
                product.stock += quantity
            elif movement_type == 'out':
                product.stock -= quantity
            else:  # adjustment
                product.stock = quantity

            product.save()

            StockMovement.objects.create(
                product=product,
                movement_type=movement_type,
                quantity=quantity,
                stock_before=stock_before,
                stock_after=product.stock,
                reason=data.get('reason', ''),
            )

        return Response(ProductSerializer(product).data)

    @action(detail=True, methods=['get'])
    def movements(self, request, pk=None):
        """Historial de movimientos de un producto"""
        product = self.get_object()
        movements = product.movements.all()[:50]
        serializer = StockMovementSerializer(movements, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Estadísticas generales de productos"""
        products = Product.objects.filter(is_active=True)
        total = products.count()
        low_stock = sum(1 for p in products if p.is_low_stock)
        out_of_stock = products.filter(stock=0).count()
        total_value = sum(p.stock * p.cost for p in products)

        return Response({
            'total_products': total,
            'low_stock_count': low_stock,
            'out_of_stock_count': out_of_stock,
            'total_inventory_value': float(total_value),
        })


    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        products = Product.objects.select_related('category', 'supplier').filter(is_active=True).order_by('name')
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="productos.csv"'
        response.write('﻿')  # BOM para compatibilidad con Excel
        writer = csv.writer(response)
        writer.writerow(['sku', 'nombre', 'descripcion', 'categoria', 'proveedor', 'precio', 'costo', 'stock', 'stock_min', 'orden'])
        for p in products:
            writer.writerow([
                p.sku, p.name, p.description,
                p.category.name if p.category else '',
                p.supplier.name if p.supplier else '',
                p.price, p.cost, p.stock, p.stock_min, p.sort_order,
            ])
        return response

    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió ningún archivo'}, status=400)

        try:
            decoded = file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(decoded))
        except Exception:
            return Response({'error': 'No se pudo leer el archivo. Verificá que sea un CSV UTF-8.'}, status=400)

        created = 0
        updated = 0
        errors = []

        for i, row in enumerate(reader, start=2):
            sku = (row.get('sku') or '').strip()
            name = (row.get('nombre') or '').strip()
            price_raw = (row.get('precio') or '').strip()

            if not sku or not name:
                errors.append(f'Fila {i}: sku y nombre son requeridos')
                continue

            try:
                price = float(price_raw)
            except (ValueError, TypeError):
                errors.append(f'Fila {i}: precio inválido "{price_raw}"')
                continue

            sort_order_raw = (row.get('orden') or '').strip()
            try:
                sort_order = int(sort_order_raw)
            except (ValueError, TypeError):
                sort_order = 0

            existing = Product.objects.filter(sku=sku).first()
            if existing:
                update_fields = ['price', 'updated_at']
                existing.price = price
                if sort_order_raw != '':
                    existing.sort_order = sort_order
                    update_fields.append('sort_order')
                existing.save(update_fields=update_fields)
                updated += 1
                continue

            category = None
            cat_name = (row.get('categoria') or '').strip()
            if cat_name:
                category, _ = Category.objects.get_or_create(name=cat_name)

            supplier = None
            sup_name = (row.get('proveedor') or '').strip()
            if sup_name:
                supplier, _ = Supplier.objects.get_or_create(name=sup_name)

            try:
                cost = float((row.get('costo') or '0').strip())
            except (ValueError, TypeError):
                cost = 0

            try:
                stock = int((row.get('stock') or '0').strip())
            except (ValueError, TypeError):
                stock = 0

            try:
                stock_min = int((row.get('stock_min') or '5').strip())
            except (ValueError, TypeError):
                stock_min = 5

            Product.objects.create(
                sku=sku,
                name=name,
                description=(row.get('descripcion') or '').strip(),
                category=category,
                supplier=supplier,
                price=price,
                cost=cost,
                stock=stock,
                stock_min=stock_min,
                sort_order=sort_order,
            )
            created += 1

        return Response({'created': created, 'updated': updated, 'errors': errors})


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related('product').order_by('-created_at')
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['product', 'movement_type']
    ordering = ['-created_at']
