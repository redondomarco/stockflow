from rest_framework import serializers
from .models import Category, Supplier, Product, StockMovement


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'product_count', 'created_at']

    def get_product_count(self, obj):
        count = getattr(obj, 'product_count', None)  # anotado en CategoryViewSet
        return count if count is not None else obj.products.filter(is_active=True).count()


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    bundle_child_name = serializers.CharField(source='bundle_child.name', read_only=True)
    bundle_child_sku = serializers.CharField(source='bundle_child.sku', read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    margin = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'sku', 'description', 'category', 'category_name',
            'supplier', 'supplier_name', 'price', 'cost', 'stock', 'stock_min', 'track_stock',
            'fixed_price', 'image', 'sort_order',
            'is_bundle', 'bundle_child', 'bundle_child_name', 'bundle_child_sku',
            'bundle_quantity', 'bundle_unit_weight', 'bundle_unit_price',
            'is_active', 'is_low_stock', 'margin', 'created_at', 'updated_at'
        ]


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = ['stock_before', 'stock_after']


class StockAdjustmentSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=0)
    movement_type = serializers.ChoiceField(choices=['in', 'out', 'adjustment'])
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True)

    def validate(self, data):
        # Entradas y salidas mueven al menos una unidad; un ajuste fija el stock (puede ser 0).
        if data['movement_type'] in ('in', 'out') and data['quantity'] == 0:
            raise serializers.ValidationError({'quantity': 'La cantidad debe ser mayor a cero.'})
        return data
