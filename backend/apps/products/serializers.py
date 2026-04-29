from rest_framework import serializers
from .models import Category, Supplier, Product, StockMovement


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'product_count', 'created_at']

    def get_product_count(self, obj):
        return obj.products.filter(is_active=True).count()


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    margin = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'sku', 'description', 'category', 'category_name',
            'supplier', 'supplier_name', 'price', 'cost', 'stock', 'stock_min',
            'fixed_price', 'image', 'is_active', 'is_low_stock', 'margin', 'created_at', 'updated_at'
        ]


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = ['stock_before', 'stock_after']


class StockAdjustmentSerializer(serializers.Serializer):
    quantity = serializers.IntegerField()
    movement_type = serializers.ChoiceField(choices=['in', 'out', 'adjustment'])
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True)
