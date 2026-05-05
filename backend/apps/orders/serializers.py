from rest_framework import serializers
from django.contrib.auth.models import User
from .models import PriceList, Customer, Order, OrderItem, OrderStatusHistory, DeliveryRoute, DeliveryRouteItem


class PriceListSerializer(serializers.ModelSerializer):
    customer_count = serializers.SerializerMethodField()

    class Meta:
        model = PriceList
        fields = '__all__'

    def get_customer_count(self, obj):
        return obj.customers.count()


class CustomerSerializer(serializers.ModelSerializer):
    order_count = serializers.SerializerMethodField()
    last_order_date = serializers.SerializerMethodField()
    price_list_name = serializers.CharField(source='price_list.name', read_only=True)
    price_list_multiplier = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = '__all__'
        # El UniqueValidator auto-generado no maneja NULL correctamente;
        # la unicidad real se controla en validate_email.
        extra_kwargs = {'email': {'validators': []}, 'cuit': {'validators': []}}

    def get_order_count(self, obj):
        return obj.orders.count()

    def get_last_order_date(self, obj):
        last = obj.orders.exclude(status='cancelled').order_by('-created_at').values('created_at').first()
        return last['created_at'].date().isoformat() if last else None

    def get_price_list_multiplier(self, obj):
        return float(obj.price_list.multiplier) if obj.price_list else None

    def validate_cuit(self, value):
        if not value:
            return None
        qs = Customer.objects.filter(cuit=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un cliente con este CUIT.")
        return value

    def validate_email(self, value):
        if not value:
            return None
        qs = Customer.objects.filter(email=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un cliente con este email.")
        return value


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'product_sku', 'quantity', 'delivered_quantity', 'unit_price', 'subtotal']
        read_only_fields = ['subtotal']


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source='changed_by.username', read_only=True)

    class Meta:
        model = OrderStatusHistory
        fields = '__all__'


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    customer_email = serializers.CharField(source='customer.email', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    payment_status = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    route_info = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'customer', 'customer_name', 'customer_email',
            'status', 'status_display', 'notes', 'shipping_address',
            'subtotal', 'shipping_cost', 'discount', 'total',
            'amount_paid', 'balance',
            'items', 'status_history', 'payment_status',
            'route_info',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['order_number', 'subtotal', 'total', 'created_by']

    def get_amount_paid(self, obj):
        return float(sum(p.amount for p in obj.payments.all() if p.status == 'approved'))

    def get_balance(self, obj):
        amount_paid = sum(p.amount for p in obj.payments.all() if p.status == 'approved')
        return float(obj.total - amount_paid)

    def get_route_info(self, obj):
        item = obj.route_items.select_related('route').first()
        if not item:
            return None
        return {
            'route_id': item.route.id,
            'route_number': item.route.route_number,
            'route_status': item.route.status,
        }

    def get_payment_status(self, obj):
        payments = list(obj.payments.all())
        if not payments:
            return None
        amount_paid = sum(p.amount for p in payments if p.status == 'approved')
        return {
            'count': len(payments),
            'amount_paid': float(amount_paid),
            'has_pending': any(p.status == 'pending' for p in payments),
        }


class DeliveryRouteItemSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    customer_name = serializers.CharField(source='order.customer.name', read_only=True)
    customer_phone = serializers.CharField(source='order.customer.phone', read_only=True)
    customer_address = serializers.CharField(source='order.customer.address', read_only=True)
    customer_priority = serializers.IntegerField(source='order.customer.priority', read_only=True)
    shipping_address = serializers.CharField(source='order.shipping_address', read_only=True)
    order_total = serializers.DecimalField(source='order.total', max_digits=12, decimal_places=2, read_only=True)
    order_status = serializers.CharField(source='order.status', read_only=True)
    order_items = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryRouteItem
        fields = [
            'id', 'route', 'order', 'order_number', 'customer_name', 'customer_phone',
            'customer_address', 'customer_priority', 'shipping_address', 'order_total', 'order_status',
            'sort_order', 'notes', 'order_items',
        ]

    def get_order_items(self, obj):
        return [
            {
                'product_name': it.product.name,
                'product_sku': it.product.sku,
                'quantity': it.quantity,
                'delivered_quantity': it.delivered_quantity,
            }
            for it in obj.order.items.select_related('product').all()
        ]


class DeliveryRouteSerializer(serializers.ModelSerializer):
    items = DeliveryRouteItemSerializer(many=True, read_only=True)
    items_count = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    driver_name = serializers.SerializerMethodField()

    def get_driver_name(self, obj):
        if not obj.driver:
            return None
        full = ' '.join(filter(None, [obj.driver.first_name, obj.driver.last_name]))
        return full or obj.driver.username

    class Meta:
        model = DeliveryRoute
        fields = ['id', 'route_number', 'date', 'driver', 'driver_name', 'status', 'status_display',
                  'notes', 'items', 'items_count', 'created_at', 'updated_at']
        read_only_fields = ['route_number']

    def get_items_count(self, obj):
        return obj.items.count()


class DeliveryRouteItemInputSerializer(serializers.Serializer):
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all())
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class DeliveryRouteWriteSerializer(serializers.ModelSerializer):
    items = DeliveryRouteItemInputSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = DeliveryRoute
        fields = ['date', 'driver', 'notes', 'items']

    def validate(self, data):
        items_data = data.get('items', [])
        if not items_data:
            return data
        order_ids = [item['order'].id for item in items_data]
        if len(order_ids) != len(set(order_ids)):
            raise serializers.ValidationError('Hay pedidos duplicados en la lista.')
        for item in items_data:
            order = item['order']
            if order.status not in ('pending', 'partial'):
                raise serializers.ValidationError(
                    f'El pedido {order.order_number} no está pendiente ni parcial.')
        conflicts = DeliveryRouteItem.objects.filter(
            order_id__in=order_ids,
            route__status__in=['draft', 'in_progress'],
        )
        if conflicts.exists():
            nums = ', '.join(c.order.order_number for c in conflicts)
            raise serializers.ValidationError(
                f'Los pedidos {nums} ya están en otra hoja de ruta activa.')
        return data

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        route = DeliveryRoute.objects.create(**validated_data)
        for idx, item_data in enumerate(items_data):
            DeliveryRouteItem.objects.create(
                route=route,
                order=item_data['order'],
                notes=item_data.get('notes', ''),
                sort_order=idx,
            )
        return route


class CreateOrderSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=__import__('apps.orders.models', fromlist=['Customer']).Customer.objects.all())
    items = serializers.ListField(child=serializers.DictField())
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    shipping_cost = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = serializers.CharField(required=False, allow_blank=True)
