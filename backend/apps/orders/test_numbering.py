import threading
from datetime import date

from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase

from .models import Customer, DeliveryRoute, NumberSequence, Order


class NumberingTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(name='Cliente')

    def new_order(self):
        return Order.objects.create(customer=self.customer)

    def last_order_number(self):
        seq = NumberSequence.objects.filter(pk='order_number').first()
        return seq.last_value if seq else 0

    def test_orders_are_sequential(self):
        numbers = [self.new_order().order_number for _ in range(3)]
        first = int(numbers[0][3:])
        self.assertEqual(numbers, [f'NV-{n:08d}' for n in range(first, first + 3)])

    def test_missing_sequence_is_seeded_from_existing_numbers(self):
        NumberSequence.objects.filter(pk='order_number').delete()
        Order.objects.create(customer=self.customer, order_number='NV-00000041')
        self.assertEqual(self.new_order().order_number, 'NV-00000042')

    def test_numbers_already_in_use_are_skipped(self):
        seq_next = self.last_order_number() + 1
        Order.objects.create(customer=self.customer, order_number=f'NV-{seq_next:08d}')
        self.assertEqual(self.new_order().order_number, f'NV-{seq_next + 1:08d}')

    def test_rolled_back_creation_does_not_consume_a_number(self):
        before = self.last_order_number()
        try:
            with transaction.atomic():
                self.new_order()
                raise RuntimeError('falla después de numerar')
        except RuntimeError:
            pass
        self.assertEqual(self.last_order_number(), before)
        self.assertEqual(self.new_order().order_number, f'NV-{before + 1:08d}')

    def test_explicit_number_is_kept(self):
        self.assertEqual(
            Order.objects.create(customer=self.customer, order_number='NV-00000999').order_number,
            'NV-00000999',
        )

    def test_routes_and_auto_cuits(self):
        r1 = DeliveryRoute.objects.create(date=date.today())
        r2 = DeliveryRoute.objects.create(date=date.today())
        self.assertEqual(int(r2.route_number[3:]), int(r1.route_number[3:]) + 1)

        c2 = Customer.objects.create(name='Otro')
        self.assertRegex(c2.cuit, r'^00-\d{8}-0$')
        self.assertEqual(int(c2.cuit[3:11]), int(self.customer.cuit[3:11]) + 1)

    def test_explicit_cuit_is_kept(self):
        self.assertEqual(Customer.objects.create(name='Con CUIT', cuit='20-12345678-9').cuit, '20-12345678-9')


class ConcurrentNumberingTests(TransactionTestCase):
    """Creaciones simultáneas en conexiones distintas no deben chocar ni repetir números."""

    THREADS = 8

    def test_concurrent_orders_get_unique_consecutive_numbers(self):
        customer = Customer.objects.create(name='Cliente')
        barrier = threading.Barrier(self.THREADS)
        numbers, errors = [], []

        def worker():
            try:
                barrier.wait()
                with transaction.atomic():
                    numbers.append(Order.objects.create(customer=customer).order_number)
            except Exception as e:  # noqa: BLE001 — se reporta en el assert
                errors.append(repr(e))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(self.THREADS)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(errors, [])
        values = sorted(int(n[3:]) for n in numbers)
        self.assertEqual(values, list(range(values[0], values[0] + self.THREADS)))
