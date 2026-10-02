import csv
import io
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.users.permissions import SectionPermission
from django.db import transaction
from django.db.models import Count, DecimalField, F, Q, Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Category, Supplier, Product, StockIntakeItem, StockMovement
from .serializers import (
    CategorySerializer, SupplierSerializer, ProductSerializer,
    StockMovementSerializer, StockAdjustmentSerializer
)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.annotate(
        product_count=Count('products', filter=Q(products__is_active=True))
    ).order_by('name')
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'products'
    search_fields = ['name']


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by("name")
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'products'
    search_fields = ['name', 'email']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category', 'supplier').filter(is_active=True)
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'products'
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
        products = self.filter_queryset(self.get_queryset()).filter(stock__lte=F('stock_min'))
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
            product = Product.objects.select_for_update().get(pk=product.pk)
            stock_before = product.stock

            if movement_type == 'in':
                product.stock += quantity
            elif movement_type == 'out':
                product.stock -= quantity
            else:  # adjustment
                product.stock = quantity

            product.save(update_fields=['stock', 'updated_at'])

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
        totals = Product.objects.filter(is_active=True).aggregate(
            total=Count('id'),
            low_stock=Count('id', filter=Q(stock__lte=F('stock_min'))),
            # Con la política de stock "permitir" el stock puede quedar negativo: también es agotado
            out_of_stock=Count('id', filter=Q(stock__lte=0)),
            value=Sum(F('stock') * F('cost'), output_field=DecimalField(max_digits=16, decimal_places=2)),
        )
        return Response({
            'total_products': totals['total'],
            'low_stock_count': totals['low_stock'],
            'out_of_stock_count': totals['out_of_stock'],
            'total_inventory_value': float(totals['value'] or 0),
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
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'stock'
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['product', 'movement_type']
    ordering = ['-created_at']


class StockIntakeViewSet(viewsets.ViewSet):
    """
    Ingreso de stock por lote. La lista habitual de productos es compartida;
    cada ingreso suma stock a varios productos en una sola transacción.
      GET  /api/products/intake/            lista habitual (con stock actual)
      PUT  /api/products/intake/configure/  guardar la lista habitual {product_ids}
      POST /api/products/intake/apply/      ingresar {items: [{product, quantity}], reason}
    """
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'stock'

    def list(self, request):
        items = StockIntakeItem.objects.select_related(
            'product__category', 'product__supplier', 'product__bundle_child'
        ).filter(product__is_active=True)
        return Response(ProductSerializer([it.product for it in items], many=True).data)

    @action(detail=False, methods=['put'])
    def configure(self, request):
        ids = request.data.get('product_ids')
        if not isinstance(ids, list):
            return Response({'error': 'Indicá la lista de productos (product_ids).'}, status=400)
        try:
            ids = list(dict.fromkeys(int(i) for i in ids))  # sin repetidos, conservando el orden
        except (TypeError, ValueError):
            return Response({'error': 'Los productos deben indicarse por su id.'}, status=400)
        existing = set(Product.objects.filter(id__in=ids, is_active=True).values_list('id', flat=True))
        missing = [i for i in ids if i not in existing]
        if missing:
            return Response({'error': f'Productos inexistentes o dados de baja: {", ".join(map(str, missing))}.'}, status=400)
        with transaction.atomic():
            StockIntakeItem.objects.all().delete()
            StockIntakeItem.objects.bulk_create(
                StockIntakeItem(product_id=pid, position=pos) for pos, pid in enumerate(ids)
            )
        return self.list(request)

    @action(detail=False, methods=['post'])
    def apply(self, request):
        items = request.data.get('items')
        reason = (request.data.get('reason') or '').strip()[:200]
        if not isinstance(items, list) or not items:
            return Response({'error': 'Completá la cantidad de al menos un producto.'}, status=400)

        quantities = {}
        for idx, item in enumerate(items, start=1):
            try:
                product_id = int(item.get('product'))
                quantity = int(item.get('quantity'))
            except (AttributeError, TypeError, ValueError):
                return Response({'error': f'Fila {idx}: producto y cantidad deben ser números enteros.'}, status=400)
            if quantity <= 0:
                return Response({'error': f'Fila {idx}: la cantidad debe ser mayor a cero.'}, status=400)
            if product_id in quantities:
                return Response({'error': f'Fila {idx}: el producto está repetido.'}, status=400)
            quantities[product_id] = quantity

        movement_reason = f'Ingreso de stock: {reason}' if reason else 'Ingreso de stock'
        with transaction.atomic():
            # Orden por id para bloquear siempre en el mismo orden (evita deadlocks)
            products = {p.id: p for p in Product.objects.select_for_update().filter(id__in=quantities).order_by('id')}
            invalid = [pid for pid in quantities if pid not in products or not products[pid].is_active]
            if invalid:
                return Response({'error': f'Productos inexistentes o dados de baja: {", ".join(map(str, invalid))}.'}, status=400)
            result = []
            for pid, quantity in quantities.items():
                product = products[pid]
                stock_before = product.stock
                product.stock += quantity
                product.save(update_fields=['stock', 'updated_at'])
                StockMovement.objects.create(
                    product=product, movement_type='in', quantity=quantity,
                    stock_before=stock_before, stock_after=product.stock, reason=movement_reason,
                )
                result.append({'product': pid, 'sku': product.sku, 'name': product.name, 'quantity': quantity,
                               'stock_before': stock_before, 'stock_after': product.stock})
        return Response({'items': result, 'total_units': sum(quantities.values()), 'reason': reason}, status=201)
