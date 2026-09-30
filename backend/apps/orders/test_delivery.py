from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.products.models import Product
from .models import Customer, DeliveryRoute, DeliveryRouteItem, Order


class DeliveryTestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('logistica', password='x')
        self.client.force_authenticate(self.user)
        self.customer = Customer.objects.create(name='Almacén', priority=2)
        self.p1 = Product.objects.create(name='Tapa', sku='T1', price=Decimal('10'), stock=100)
        self.p2 = Product.objects.create(name='Envase', sku='E1', price=Decimal('5'), stock=100)
        self.customer.enabled_products.set([self.p1, self.p2])

    def new_order(self, customer=None, items=None):
        customer = customer or self.customer
        customer.enabled_products.add(self.p1, self.p2)
        res = self.client.post('/api/orders/', {
            'customer': customer.id,
            'items': items or [{'product': self.p1.id, 'quantity': 10}, {'product': self.p2.id, 'quantity': 4}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return Order.objects.get(id=res.data['id'])


class DeliverTests(DeliveryTestBase):
    def setUp(self):
        super().setUp()
        self.order = self.new_order()
        self.i1, self.i2 = self.order.items.order_by('id')

    def deliver(self, items, **extra):
        return self.client.post(f'/api/orders/{self.order.id}/deliver/', {'items': items, **extra}, format='json')

    def delivered(self):
        return [it.delivered_quantity for it in self.order.items.order_by('id')]

    def test_partial_then_total_delivery(self):
        res = self.deliver([{'order_item_id': self.i1.id, 'quantity': 4}])
        self.assertEqual(res.data['status'], 'partial')
        res = self.deliver([
            {'order_item_id': self.i1.id, 'quantity': 6},
            {'order_item_id': self.i2.id, 'quantity': 4},
        ], comment='Entregado completo')
        self.assertEqual(res.data['status'], 'delivered')
        self.assertEqual(self.delivered(), [10, 4])
        self.assertEqual(res.data['status_history'][0]['comment'], 'Entregado completo')

    def test_cannot_deliver_more_than_pending(self):
        self.deliver([{'order_item_id': self.i1.id, 'quantity': 8}])
        res = self.deliver([{'order_item_id': self.i1.id, 'quantity': 3}])
        self.assertEqual(res.status_code, 400)
        self.assertIn('máximo: 2', res.data['error'])

    def test_failed_delivery_does_not_save_earlier_items(self):
        # El primer ítem es válido y el segundo no: no debe quedar nada guardado.
        res = self.deliver([
            {'order_item_id': self.i1.id, 'quantity': 5},
            {'order_item_id': self.i2.id, 'quantity': 99},
        ])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.delivered(), [0, 0])
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'pending')

    def test_item_from_another_order_is_rejected(self):
        other_item = self.new_order().items.first()
        res = self.deliver([{'order_item_id': other_item.id, 'quantity': 1}])
        self.assertEqual(res.status_code, 400)

    def test_invalid_quantity_is_rejected(self):
        self.assertEqual(self.deliver([{'order_item_id': self.i1.id, 'quantity': 'x'}]).status_code, 400)
        self.assertEqual(self.deliver([]).status_code, 400)

    def test_cannot_deliver_cancelled_or_delivered_orders(self):
        self.client.post(f'/api/orders/{self.order.id}/change_status/', {'status': 'cancelled'}, format='json')
        self.assertEqual(self.deliver([{'order_item_id': self.i1.id, 'quantity': 1}]).status_code, 400)

    def test_partial_orders_cannot_edit_items_but_can_be_cancelled(self):
        self.deliver([{'order_item_id': self.i1.id, 'quantity': 4}])
        res = self.client.patch(f'/api/orders/{self.order.id}/', {'notes': 'tocar timbre'}, format='json')
        self.assertEqual(res.status_code, 200)
        res = self.client.post(f'/api/orders/{self.order.id}/change_status/', {'status': 'cancelled'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.stock, 96)  # solo vuelve lo no entregado (10 - 4)

    def test_invalid_status_change(self):
        res = self.client.post(f'/api/orders/{self.order.id}/change_status/', {'status': 'delivered'}, format='json')
        self.assertEqual(res.status_code, 400)
        res = self.client.post(f'/api/orders/{self.order.id}/change_status/', {'status': 'nope'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_order_stats(self):
        self.deliver([
            {'order_item_id': self.i1.id, 'quantity': 10},
            {'order_item_id': self.i2.id, 'quantity': 4},
        ])
        res = self.client.get('/api/orders/stats/')
        self.assertEqual((res.data['total'], res.data['delivered']), (1, 1))
        self.assertEqual(res.data['total_revenue'], 120.0)


class DeliveryRouteTests(DeliveryTestBase):
    def setUp(self):
        super().setUp()
        self.driver = User.objects.create_user('chofer', password='x', first_name='Juan', last_name='Pérez')
        self.o1 = self.new_order()
        self.o2 = self.new_order(customer=Customer.objects.create(name='Kiosco', priority=1))

    def create_route(self, orders, **extra):
        return self.client.post('/api/orders/routes/', {
            'date': date.today().isoformat(), 'driver': self.driver.id,
            'items': [{'order': o.id} for o in orders], **extra,
        }, format='json')

    def route_action(self, route_id, action, **data):
        return self.client.post(f'/api/orders/routes/{route_id}/{action}/', data, format='json')

    def test_create_route(self):
        res = self.create_route([self.o1, self.o2])
        self.assertEqual(res.status_code, 201, res.data)
        self.assertRegex(res.data['route_number'], r'^HR-\d{8}$')
        self.assertEqual(res.data['driver_name'], 'Juan Pérez')
        self.assertEqual([it['order'] for it in res.data['items']], [self.o1.id, self.o2.id])
        # ítems ordenados por sort_order y nombre: Envase antes que Tapa
        self.assertEqual([i['product_sku'] for i in res.data['items'][0]['order_items']], ['E1', 'T1'])

    def test_order_can_only_be_on_one_active_route(self):
        self.create_route([self.o1])
        res = self.create_route([self.o1])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(DeliveryRoute.objects.count(), 1)

    def test_order_is_available_again_when_route_is_cancelled(self):
        route_id = self.create_route([self.o1]).data['id']
        available = lambda: [o['id'] for o in self.client.get('/api/orders/routes/available_orders/').data]
        self.assertEqual(available(), [self.o2.id])
        self.route_action(route_id, 'change_status', status='cancelled')
        self.assertEqual(available(), [self.o2.id, self.o1.id])  # ordenado por prioridad del cliente
        self.assertEqual(self.create_route([self.o1]).status_code, 201)

    def test_rejects_duplicates_and_non_pending_orders(self):
        self.assertEqual(self.create_route([self.o1, self.o1]).status_code, 400)
        self.client.post(f'/api/orders/{self.o2.id}/change_status/', {'status': 'cancelled'}, format='json')
        self.assertEqual(self.create_route([self.o2]).status_code, 400)

    def test_status_transitions(self):
        route_id = self.create_route([self.o1]).data['id']
        self.assertEqual(self.route_action(route_id, 'change_status', status='completed').status_code, 400)
        for new_status in ('in_progress', 'completed'):
            self.assertEqual(self.route_action(route_id, 'change_status', status=new_status).data['status'], new_status)
        self.assertEqual(self.route_action(route_id, 'change_status', status='draft').status_code, 400)

    def test_add_remove_and_update_items(self):
        route_id = self.create_route([self.o1]).data['id']
        res = self.route_action(route_id, 'add_orders', items=[{'order': self.o2.id, 'notes': 'portón verde'}])
        self.assertEqual(res.data['items_count'], 2)
        item = DeliveryRouteItem.objects.get(route_id=route_id, order=self.o2)
        self.assertEqual((item.notes, item.sort_order), ('portón verde', 1))

        res = self.route_action(route_id, 'update_item', item_id=item.id, notes='llamar antes')
        self.assertEqual(res.data['items'][1]['notes'], 'llamar antes')
        self.assertEqual(self.route_action(route_id, 'update_item', item_id=9999).status_code, 404)

        res = self.route_action(route_id, 'remove_item', item_id=item.id)
        self.assertEqual(res.data['items_count'], 1)

    def test_add_orders_validates_like_create(self):
        route_id = self.create_route([self.o1]).data['id']
        other_route = self.create_route([self.o2]).data['id']
        self.assertEqual(self.route_action(route_id, 'add_orders', items=[{'order': self.o2.id}]).status_code, 400)

        o3 = self.new_order()
        self.client.post(f'/api/orders/{o3.id}/change_status/', {'status': 'cancelled'}, format='json')
        res = self.route_action(route_id, 'add_orders', items=[{'order': o3.id}])
        self.assertEqual(res.status_code, 400)
        self.assertFalse(DeliveryRouteItem.objects.filter(order=o3).exists())
        self.assertTrue(other_route)

    def test_only_draft_routes_can_change_items(self):
        route_id = self.create_route([self.o1]).data['id']
        self.route_action(route_id, 'change_status', status='in_progress')
        o3 = self.new_order()
        self.assertEqual(self.route_action(route_id, 'add_orders', items=[{'order': o3.id}]).status_code, 400)
        item_id = DeliveryRouteItem.objects.get(route_id=route_id).id
        self.assertEqual(self.route_action(route_id, 'remove_item', item_id=item_id).status_code, 400)

    def test_changing_driver_returns_full_route(self):
        # El frontend reemplaza la hoja seleccionada con la respuesta: debe incluir los ítems.
        route_id = self.create_route([self.o1]).data['id']
        res = self.client.patch(f'/api/orders/routes/{route_id}/', {'driver': None}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data['driver'])
        self.assertEqual(res.data['id'], route_id)
        self.assertEqual(res.data['items_count'], 1)
