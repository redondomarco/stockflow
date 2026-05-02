from django.contrib import admin
from .models import Customer, Order, OrderItem, OrderStatusHistory, DeliveryRoute, DeliveryRouteItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ['subtotal']


class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = ['created_at']


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'phone', 'created_at']
    search_fields = ['name', 'email']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['order_number', 'customer', 'status', 'total', 'created_at']
    list_filter = ['status']
    search_fields = ['order_number', 'customer__name']
    inlines = [OrderItemInline, OrderStatusHistoryInline]
    readonly_fields = ['order_number', 'subtotal', 'total', 'created_at', 'updated_at']



class DeliveryRouteItemInline(admin.TabularInline):
    model = DeliveryRouteItem
    extra = 0
    raw_id_fields = ['order']


@admin.register(DeliveryRoute)
class DeliveryRouteAdmin(admin.ModelAdmin):
    list_display = ['route_number', 'date', 'status', 'created_at']
    list_filter = ['status']
    readonly_fields = ['route_number', 'created_at', 'updated_at']
    inlines = [DeliveryRouteItemInline]
