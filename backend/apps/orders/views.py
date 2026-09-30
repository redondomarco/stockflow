import csv
import io
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.users.permissions import SectionPermission
from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from django.contrib.auth.models import User
from .models import PriceList, Customer, Order, OrderItem, OrderStatusHistory, DeliveryRoute, DeliveryRouteItem, Zone
from .serializers import (
    PriceListSerializer, CustomerSerializer, OrderSerializer,
    OrderItemSerializer, OrderStatusHistorySerializer,
    DeliveryRouteSerializer, DeliveryRouteWriteSerializer,
    DeliveryRouteItemInputSerializer, ZoneSerializer,
)
from apps.products.models import Product, StockMovement
from apps.products.serializers import ProductSerializer
from .services import (
    BusinessRuleError, get_orderable_customer, parse_amount, price_order_items,
    enforce_stock_policy, add_order_items, remove_order_items, is_confirmed,
)
from apps.payments.services import handle_order_cancellation


VALID_TRANSITIONS = {
    'pending': ['cancelled'],
    'partial': ['cancelled'],
    'delivered': [],
    'cancelled': [],
}


class ZoneViewSet(viewsets.ModelViewSet):
    queryset = Zone.objects.all()
    serializer_class = ZoneSerializer
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'customers'
    pagination_class = None


class PriceListViewSet(viewsets.ModelViewSet):
    queryset = PriceList.objects.all().order_by('name')
    serializer_class = PriceListSerializer
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'price_lists'
    search_fields = ['name']

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        price_lists = PriceList.objects.all().order_by('name')
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="listas_precios.csv"'
        response.write('﻿')
        writer = csv.writer(response)
        writer.writerow(['nombre', 'multiplicador', 'descripcion'])
        for pl in price_lists:
            writer.writerow([pl.name, pl.multiplier, pl.description])
        return response

    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        file = request.FILES.get('file')
        replace = request.query_params.get('replace') == '1'

        if not file:
            return Response({'error': 'No se envió ningún archivo'}, status=400)

        try:
            decoded = file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(decoded))
        except Exception:
            return Response({'error': 'No se pudo leer el archivo. Verificá que sea CSV UTF-8.'}, status=400)

        to_create = []
        to_update = []
        errors = []

        for i, row in enumerate(reader, start=2):
            nombre = (row.get('nombre') or '').strip()
            mult_raw = (row.get('multiplicador') or '').strip()
            desc = (row.get('descripcion') or '').strip()

            if not nombre:
                errors.append(f'Fila {i}: nombre es requerido')
                continue

            try:
                mult = float(mult_raw)
                if mult <= 0:
                    raise ValueError()
            except (ValueError, TypeError):
                errors.append(f'Fila {i}: multiplicador inválido "{mult_raw}"')
                continue

            existing = PriceList.objects.filter(name=nombre).first()
            entry = {'nombre': nombre, 'multiplicador': mult, 'descripcion': desc}

            if existing:
                to_update.append({**entry, 'current_multiplier': float(existing.multiplier)})
            else:
                to_create.append(entry)

        if not replace:
            return Response({
                'preview': True,
                'to_create': to_create,
                'to_update': to_update,
                'errors': errors,
            })

        created = 0
        updated = 0
        for entry in to_create:
            PriceList.objects.create(
                name=entry['nombre'],
                multiplier=entry['multiplicador'],
                description=entry['descripcion'],
            )
            created += 1
        for entry in to_update:
            PriceList.objects.filter(name=entry['nombre']).update(
                multiplier=entry['multiplicador'],
                description=entry['descripcion'],
            )
            updated += 1

        return Response({'created': created, 'updated': updated, 'errors': errors})


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'customers'
    pagination_class = None
    search_fields = ['name', 'email', 'phone']
    ordering = ['name']

    def get_queryset(self):
        qs = Customer.objects.all().order_by('name')
        show_all = self.request.query_params.get('all')
        show_inactive = self.request.query_params.get('inactive')
        if show_inactive:
            qs = qs.filter(is_active=False)
        elif not show_all:
            qs = qs.filter(is_active=True)
        return qs

    @action(detail=True, methods=['get', 'post'])
    def products(self, request, pk=None):
        customer = self.get_object()
        if request.method == 'GET':
            prods = customer.enabled_products.filter(is_active=True).order_by('sort_order', 'name')
            return Response(ProductSerializer(prods, many=True).data)
        product_ids = request.data.get('product_ids', [])
        customer.enabled_products.set(product_ids)
        return Response({'count': customer.enabled_products.count()})

    @action(detail=True, methods=['get'])
    def account_statement(self, request, pk=None):
        customer = self.get_object()
        orders = (
            Order.objects.filter(customer=customer)
            .exclude(status='cancelled')
            .prefetch_related('payments', 'items')
            .order_by('-created_at')
        )

        statement = []
        for order in orders:
            payments = list(order.payments.all())
            amount_paid = sum(p.amount for p in payments if p.status == 'approved')
            balance = order.total - amount_paid
            statement.append({
                'id': order.id,
                'order_number': order.order_number,
                'date': order.created_at,
                'status': order.status,
                'status_display': order.get_status_display(),
                'total': float(order.total),
                'amount_paid': float(amount_paid),
                'balance': float(balance),
                'payments': [
                    {
                        'id': p.id,
                        'amount': float(p.amount),
                        'payment_method': p.payment_method,
                        'method_display': p.get_payment_method_display(),
                        'status': p.status,
                        'created_at': p.created_at,
                    }
                    for p in payments
                ],
            })

        total_billed = sum(o['total'] for o in statement)
        total_paid = sum(o['amount_paid'] for o in statement)

        return Response({
            'customer': CustomerSerializer(customer).data,
            'orders': statement,
            'summary': {
                'total_billed': total_billed,
                'total_paid': total_paid,
                'balance': total_billed - total_paid,
                'order_count': len(statement),
            },
        })

    @action(detail=False, methods=['get'])
    def debt_dashboard(self, request):
        all_orders = (
            Order.objects.exclude(status='cancelled')
            .select_related('customer')
            .prefetch_related('payments')
        )

        customer_data = {}
        for order in all_orders:
            cid = order.customer_id
            if cid not in customer_data:
                customer_data[cid] = {
                    'customer_id': cid,
                    'customer_name': order.customer.name,
                    'customer_email': order.customer.email,
                    'total_billed': 0.0,
                    'total_paid': 0.0,
                    'order_count': 0,
                }
            customer_data[cid]['total_billed'] += float(order.total)
            customer_data[cid]['total_paid'] += sum(
                float(p.amount) for p in order.payments.all() if p.status == 'approved'
            )
            customer_data[cid]['order_count'] += 1

        result = []
        for data in customer_data.values():
            balance = round(data['total_billed'] - data['total_paid'], 2)
            if balance <= 0:
                continue
            result.append({**data, 'balance': balance})

        result.sort(key=lambda x: x['balance'], reverse=True)
        return Response(result)

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        customers = Customer.objects.select_related('price_list', 'zone').prefetch_related('enabled_products').all().order_by('name')
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="clientes.csv"'
        response.write('﻿')
        writer = csv.writer(response)
        writer.writerow(['nombre', 'activo', 'cuit', 'email', 'telefono', 'direccion', 'localidad', 'zona', 'latitud', 'longitud', 'prioridad', 'lista_de_precios', 'productos_habilitados'])
        for c in customers:
            skus = '|'.join(p.sku for p in c.enabled_products.all().order_by('sku'))
            writer.writerow([
                c.name, 'si' if c.is_active else 'no',
                c.cuit or '', c.email or '', c.phone, c.address, c.localidad,
                c.zone.name if c.zone else '',
                c.latitude or '', c.longitude or '',
                c.priority,
                c.price_list.name if c.price_list else '',
                skus,
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

        from apps.products.models import Product as Prod
        created = 0
        skipped = 0
        errors = []

        for i, row in enumerate(reader, start=2):
            name = (row.get('nombre') or '').strip()
            activo_raw = (row.get('activo') or 'si').strip().lower()
            is_active = activo_raw not in ('no', 'false', '0')
            cuit = (row.get('cuit') or '').strip() or None
            email = (row.get('email') or '').strip() or None
            phone = (row.get('telefono') or '').strip()
            address = (row.get('direccion') or '').strip()
            localidad = (row.get('localidad') or '').strip()
            zona_name = (row.get('zona') or '').strip()
            lat_raw = (row.get('latitud') or '').strip()
            lng_raw = (row.get('longitud') or '').strip()
            skus_raw = (row.get('productos_habilitados') or '').strip()

            if not name:
                errors.append(f'Fila {i}: nombre es requerido')
                continue

            if cuit and Customer.objects.filter(cuit=cuit).exists():
                skipped += 1
                continue

            if email and Customer.objects.filter(email=email).exists():
                skipped += 1
                continue

            zone = None
            if zona_name:
                zone, _ = Zone.objects.get_or_create(name=zona_name)

            try:
                latitude = float(lat_raw) if lat_raw else None
            except ValueError:
                latitude = None
            try:
                longitude = float(lng_raw) if lng_raw else None
            except ValueError:
                longitude = None

            customer = Customer.objects.create(
                name=name, cuit=cuit, email=email, phone=phone,
                address=address, localidad=localidad,
                zone=zone, latitude=latitude, longitude=longitude,
                is_active=is_active,
            )

            if skus_raw:
                skus = [s.strip() for s in skus_raw.split('|') if s.strip()]
                products = Prod.objects.filter(sku__in=skus)
                customer.enabled_products.set(products)

            created += 1

        return Response({'created': created, 'skipped': skipped, 'errors': errors})


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.select_related('customer', 'created_by').prefetch_related('items', 'status_history', 'payments')
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'orders'
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'customer']
    search_fields = ['order_number', 'customer__name', 'customer__email']
    ordering = ['-created_at']

    def create(self, request, *args, **kwargs):
        data = request.data
        try:
            with transaction.atomic():
                customer = get_orderable_customer(data.get('customer'))
                shipping_cost = parse_amount(data.get('shipping_cost'), 'costo de envío')
                discount = parse_amount(data.get('discount'), 'descuento')
                lines, shortages = price_order_items(customer, data.get('items'))
                stock_note = enforce_stock_policy(request.user, shortages, is_confirmed(data))

                order = Order.objects.create(
                    customer=customer,
                    shipping_address=data.get('shipping_address', ''),
                    shipping_cost=shipping_cost,
                    discount=discount,
                    notes=data.get('notes', ''),
                    created_by=request.user,
                )
                add_order_items(order, lines, reason=f'Pedido #{order.order_number}')
                order.calculate_totals()

                OrderStatusHistory.objects.create(
                    order=order,
                    old_status='',
                    new_status='pending',
                    changed_by=request.user,
                    comment='. '.join(filter(None, ['Pedido creado', stock_note])),
                )
        except BusinessRuleError as e:
            return e.response()

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        order = self.get_object()

        if order.status not in ('pending', 'partial'):
            return Response(
                {'error': 'Solo se pueden editar pedidos pendientes o con entrega parcial'},
                status=400,
            )

        FIELD_LABELS = {
            'shipping_address': 'dirección',
            'shipping_cost': 'costo de envío',
            'discount': 'descuento',
            'notes': 'notas',
        }
        try:
            with transaction.atomic():
                changed_fields = []
                for field, label in FIELD_LABELS.items():
                    if field not in request.data:
                        continue
                    value = request.data[field]
                    if field in ('shipping_cost', 'discount'):
                        value = parse_amount(value, label)
                    if str(value) != str(getattr(order, field)):
                        changed_fields.append(label)
                        setattr(order, field, value)

                items_edited = False
                stock_note = ''
                if order.status == 'pending' and 'items' in request.data:
                    # Primero se devuelve el stock de los ítems actuales, así la
                    # validación de disponibilidad cuenta lo que este pedido ya reservaba.
                    remove_order_items(order, reason=f'Edición pedido #{order.order_number} — restauración')
                    lines, shortages = price_order_items(order.customer, request.data['items'])
                    stock_note = enforce_stock_policy(request.user, shortages, is_confirmed(request.data))
                    add_order_items(order, lines, reason=f'Edición pedido #{order.order_number}')
                    items_edited = True

                order.subtotal = sum(it.subtotal for it in OrderItem.objects.filter(order=order))
                order.save()  # Order.save recalcula total

                parts = []
                if items_edited:
                    parts.append('ítems actualizados')
                parts.extend(changed_fields)
                if parts:
                    OrderStatusHistory.objects.create(
                        order=order,
                        old_status=order.status,
                        new_status=order.status,
                        changed_by=request.user,
                        comment='. '.join(filter(None, [f'Pedido editado: {", ".join(parts)}', stock_note])),
                    )
        except BusinessRuleError as e:
            return e.response()

        order.refresh_from_db()
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def deliver(self, request, pk=None):
        """Registrar entrega (total o parcial) de ítems del pedido."""
        order = self.get_object()
        if order.status in ('delivered', 'cancelled'):
            return Response(
                {'error': f'No se puede entregar un pedido {order.get_status_display()}'},
                status=400,
            )

        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'error': 'Indicá al menos un ítem a entregar'}, status=400)

        with transaction.atomic():
            for item_data in items_data:
                item_id = item_data.get('order_item_id')
                quantity = int(item_data.get('quantity', 0))
                if quantity <= 0:
                    continue
                try:
                    item = order.items.get(id=item_id)
                except OrderItem.DoesNotExist:
                    return Response({'error': f'Ítem {item_id} no pertenece a este pedido'}, status=400)
                max_deliverable = item.quantity - item.delivered_quantity
                if quantity > max_deliverable:
                    return Response(
                        {'error': f'No se pueden entregar {quantity} de "{item.product.name}" (máximo: {max_deliverable})'},
                        status=400,
                    )
                item.delivered_quantity += quantity
                item.save()

            items = list(OrderItem.objects.filter(order=order))
            all_delivered = all(it.quantity == it.delivered_quantity for it in items)
            any_delivered = any(it.delivered_quantity > 0 for it in items)
            old_status = order.status
            new_status = 'delivered' if all_delivered else ('partial' if any_delivered else old_status)

            if new_status != old_status:
                order.status = new_status
                order.save()
                OrderStatusHistory.objects.create(
                    order=order,
                    old_status=old_status,
                    new_status=new_status,
                    changed_by=request.user,
                    comment=request.data.get('comment', ''),
                )

        order.refresh_from_db()
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        order = self.get_object()
        new_status = request.data.get('status')
        comment = request.data.get('comment', '')

        if new_status not in dict(Order.STATUS_CHOICES):
            return Response({'error': 'Estado inválido'}, status=400)

        allowed = VALID_TRANSITIONS.get(order.status, [])
        if new_status not in allowed:
            return Response(
                {'error': f'No se puede pasar de {order.get_status_display()} a {dict(Order.STATUS_CHOICES).get(new_status, new_status)}'},
                status=400,
            )

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.pk)
            # Revalidar con la fila bloqueada: otro request pudo cambiar el estado.
            if new_status not in VALID_TRANSITIONS.get(order.status, []):
                return Response({'error': f'El pedido ya está {order.get_status_display().lower()}.'}, status=400)

            old_status = order.status
            order.status = new_status
            order.save()

            payments_note = ''
            if new_status == 'cancelled':
                items = list(order.items.all())
                products = {
                    p.id: p for p in Product.objects.select_for_update()
                    .filter(id__in=[it.product_id for it in items]).order_by('id')
                }
                for item in items:
                    undelivered = item.quantity - item.delivered_quantity
                    if undelivered <= 0:
                        continue
                    product = products[item.product_id]
                    stock_before = product.stock
                    product.stock += undelivered
                    product.save(update_fields=['stock', 'updated_at'])
                    StockMovement.objects.create(
                        product=product,
                        movement_type='in',
                        quantity=undelivered,
                        stock_before=stock_before,
                        stock_after=product.stock,
                        reason=f'Anulación pedido #{order.order_number}',
                    )
                payments_note = handle_order_cancellation(order)

            OrderStatusHistory.objects.create(
                order=order,
                old_status=old_status,
                new_status=new_status,
                changed_by=request.user,
                comment='. '.join(filter(None, [comment, payments_note])),
            )

        return Response(OrderSerializer(order).data)

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Pedidos no anulados cargados hoy (hora local) para un cliente: ?customer=<id>."""
        try:
            customer_id = int(request.query_params.get('customer', ''))
        except ValueError:
            return Response({'error': 'Indicá el cliente (?customer=<id>).'}, status=400)
        orders = (
            Order.objects.filter(customer_id=customer_id, created_at__date=timezone.localdate())
            .exclude(status='cancelled')
            .select_related('created_by')
            .order_by('created_at')
        )
        return Response([
            {
                'id': o.id,
                'order_number': o.order_number,
                'created_at': o.created_at,
                'created_by': o.created_by.username if o.created_by else None,
                'status': o.status,
                'status_display': o.get_status_display(),
                'total': float(o.total),
            }
            for o in orders
        ])

    @action(detail=False, methods=['get'])
    def stats(self, request):
        orders = Order.objects.all()
        from django.db.models import Sum

        return Response({
            'total': orders.count(),
            'pending': orders.filter(status='pending').count(),
            'partial': orders.filter(status='partial').count(),
            'delivered': orders.filter(status='delivered').count(),
            'cancelled': orders.filter(status='cancelled').count(),
            'total_revenue': float(orders.filter(status='delivered').aggregate(Sum('total'))['total__sum'] or 0),
        })


VALID_ROUTE_TRANSITIONS = {
    'draft': ['in_progress', 'cancelled'],
    'in_progress': ['completed', 'cancelled'],
    'cancelled': ['draft'],
}



class DeliveryRouteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'routes'
    pagination_class = None

    def get_queryset(self):
        return DeliveryRoute.objects.prefetch_related(
            'items__order__items',
            'items__order__customer',
        ).select_related('driver').all()

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return DeliveryRouteWriteSerializer
        return DeliveryRouteSerializer

    def create(self, request, *args, **kwargs):
        serializer = DeliveryRouteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            route = serializer.save()
        return Response(DeliveryRouteSerializer(route).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def available_orders(self, request):
        """Pedidos pendientes/parciales que no están en ninguna hoja activa."""
        active_order_ids = DeliveryRouteItem.objects.filter(
            route__status__in=['draft', 'in_progress']
        ).values_list('order_id', flat=True)
        orders = Order.objects.filter(
            status__in=['pending', 'partial']
        ).exclude(id__in=active_order_ids).select_related('customer').prefetch_related('items').order_by('customer__priority', 'customer__name')
        from .serializers import OrderSerializer as OS
        return Response(OS(orders, many=True).data)

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        route = self.get_object()
        new_status = request.data.get('status')
        allowed = VALID_ROUTE_TRANSITIONS.get(route.status, [])
        if new_status not in allowed:
            return Response(
                {'error': f'No se puede pasar de {route.get_status_display()} a {new_status}'},
                status=400,
            )
        route.status = new_status
        route.save()
        return Response(DeliveryRouteSerializer(route).data)

    @action(detail=True, methods=['post'])
    def add_orders(self, request, pk=None):
        route = self.get_object()
        if route.status != 'draft':
            return Response({'error': 'Solo se pueden agregar pedidos a hojas en borrador.'}, status=400)
        serializer = DeliveryRouteItemInputSerializer(data=request.data.get('items', []), many=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        items_data = serializer.validated_data
        order_ids = [item['order'].id for item in items_data]
        conflicts = DeliveryRouteItem.objects.filter(
            order_id__in=order_ids,
            route__status__in=['draft', 'in_progress'],
        ).exclude(route=route)
        if conflicts.exists():
            nums = ', '.join(c.order.order_number for c in conflicts)
            return Response({'error': f'Los pedidos {nums} ya están en otra hoja activa.'}, status=400)
        for idx, item_data in enumerate(items_data):
            DeliveryRouteItem.objects.get_or_create(
                route=route, order=item_data['order'],
                defaults={'notes': item_data.get('notes', ''),
                          'sort_order': route.items.count() + idx},
            )
        route.refresh_from_db()
        return Response(DeliveryRouteSerializer(route).data)

    @action(detail=True, methods=['post'])
    def remove_item(self, request, pk=None):
        route = self.get_object()
        if route.status != 'draft':
            return Response({'error': 'Solo se pueden quitar pedidos de hojas en borrador.'}, status=400)
        item_id = request.data.get('item_id')
        DeliveryRouteItem.objects.filter(id=item_id, route=route).delete()
        route.refresh_from_db()
        return Response(DeliveryRouteSerializer(route).data)

    @action(detail=True, methods=['post'])
    def update_item(self, request, pk=None):
        route = self.get_object()
        item_id = request.data.get('item_id')
        item = DeliveryRouteItem.objects.filter(id=item_id, route=route).first()
        if not item:
            return Response({'error': 'Ítem no encontrado.'}, status=404)
        if 'notes' in request.data:
            item.notes = request.data['notes']
        item.save()
        route.refresh_from_db()
        return Response(DeliveryRouteSerializer(route).data)
