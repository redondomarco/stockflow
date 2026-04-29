from rest_framework import serializers
from .models import PriceList, Customer, Order, OrderItem, OrderStatusHistory


class PriceListSerializer(serializers.ModelSerializer):
    customer_count = serializers.SerializerMethodField()

    class Meta:
        model = PriceList
        fields = '__all__'

    def get_customer_count(self, obj):
        return obj.customers.count()


class CustomerSerializer(serializers.ModelSerializer):
    order_count = serializers.SerializerMethodField()
    price_list_name = serializers.CharField(source='price_list.name', read_only=True)
    price_list_multiplier = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = '__all__'
        # El UniqueValidator auto-generado no maneja NULL correctamente;
        # la unicidad real se controla en validate_email.
        extra_kwargs = {'email': {'validators': []}}

    def get_order_count(self, obj):
        return obj.orders.count()

    def get_price_list_multiplier(self, obj):
        return float(obj.price_list.multiplier) if obj.price_list else None

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

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'customer', 'customer_name', 'customer_email',
            'status', 'status_display', 'notes', 'shipping_address',
            'subtotal', 'shipping_cost', 'discount', 'total',
            'amount_paid', 'balance',
            'items', 'status_history', 'payment_status',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['order_number', 'subtotal', 'total', 'created_by']

    def get_amount_paid(self, obj):
        return float(sum(p.amount for p in obj.payments.all() if p.status == 'approved'))

    def get_balance(self, obj):
        amount_paid = sum(p.amount for p in obj.payments.all() if p.status == 'approved')
        return float(obj.total - amount_paid)

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


class CreateOrderSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=__import__('apps.orders.models', fromlist=['Customer']).Customer.objects.all())
    items = serializers.ListField(child=serializers.DictField())
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    shipping_cost = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = serializers.CharField(required=False, allow_blank=True)
