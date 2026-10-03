from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.payments.models import Payment
from .models import Customer, Order
from .periods import last_months


def local(year, month, day, hour=12, minute=0):
    return timezone.make_aware(datetime(year, month, day, hour, minute))


class MonthlyDashboardTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('jefe', password='x')
        self.client.force_authenticate(self.admin)
        self.customer = Customer.objects.create(name='Kiosco')
        today = timezone.localdate()
        self.this_month = (today.year, today.month)
        self.prev_month = last_months(2)[0]

    def order(self, when, total, status='pending'):
        o = Order.objects.create(customer=self.customer, subtotal=Decimal(total), status=status)
        Order.objects.filter(pk=o.pk).update(created_at=when)
        return o

    def pay(self, order, amount, when, status='approved'):
        p = Payment.objects.create(order=order, amount=Decimal(amount), payment_method='cash', status=status)
        Payment.objects.filter(pk=p.pk).update(created_at=when)
        return p

    def month_param(self, ym):
        return f'{ym[0]}-{ym[1]:02d}'

    def test_stats_filtered_by_month_using_local_time(self):
        y, m = self.this_month
        first_day = local(y, m, 1, 0, 30)
        self.order(first_day, 100, status='delivered')
        self.order(first_day - timedelta(hours=1), 50)          # 23:30 del último día del mes anterior
        self.order(local(y, m, 1, 10), 70, status='cancelled')

        res = self.client.get('/api/orders/stats/', {'month': self.month_param(self.this_month)})
        self.assertEqual((res.data['total'], res.data['delivered'], res.data['cancelled']), (2, 1, 1))
        self.assertEqual((res.data['total_revenue'], res.data['total_billed']), (100.0, 100.0))

        prev = self.client.get('/api/orders/stats/', {'month': self.month_param(self.prev_month)})
        self.assertEqual((prev.data['total'], prev.data['total_billed']), (1, 50.0))

        everything = self.client.get('/api/orders/stats/')
        self.assertEqual((everything.data['total'], everything.data['total_billed']), (3, 150.0))

    def test_invalid_month_is_rejected(self):
        for value in ('2026-13', 'octubre', '2026-1'):
            with self.subTest(value=value):
                self.assertEqual(self.client.get('/api/orders/stats/', {'month': value}).status_code, 400)

    def test_debt_dashboard_by_month(self):
        y, m = self.this_month
        py, pm = self.prev_month
        old = self.order(local(py, pm, 10), 300)                # deuda del mes anterior, sin pagar
        new = self.order(local(y, m, 1, 12), 200)
        self.pay(new, 50, local(y, m, 1, 13))

        month = self.client.get('/api/orders/customers/debt_dashboard/', {'month': self.month_param(self.this_month)}).data
        self.assertEqual([(d['total_billed'], d['total_paid'], d['balance'], d['order_count']) for d in month], [(200.0, 50.0, 150.0, 1)])
        total = self.client.get('/api/orders/customers/debt_dashboard/').data
        self.assertEqual(total[0]['balance'], 450.0)
        self.assertTrue(old)

    def test_monthly_series(self):
        y, m = self.this_month
        py, pm = self.prev_month
        o1 = self.order(local(y, m, 1, 12), 100, status='delivered')
        self.order(local(py, pm, 5), 40)
        self.order(local(py, pm, 6), 999, status='cancelled')   # anulados no cuentan
        self.pay(o1, 60, local(y, m, 1, 13))
        self.pay(o1, 500, local(y, m, 1, 14), status='pending')  # solo aprobados

        res = self.client.get('/api/orders/monthly/', {'months': 3})
        self.assertTrue(res.data['includes_collected'])
        months = res.data['months']
        self.assertEqual([x['month'] for x in months], [f'{a}-{b:02d}' for a, b in last_months(3)])
        self.assertEqual(months[-1], {'month': self.month_param(self.this_month), 'orders': 1, 'billed': 100.0, 'delivered': 100.0, 'collected': 60.0})
        self.assertEqual((months[-2]['orders'], months[-2]['billed'], months[-2]['collected']), (1, 40.0, 0.0))
        self.assertEqual(months[0]['orders'], 0)                 # meses sin datos en cero

    def test_collected_is_hidden_without_payments_permission(self):
        user = User.objects.create_user('vendedor', password='x')
        user.profile.permissions['payments'] = 'hidden'
        user.profile.save()
        self.client.force_authenticate(user)
        res = self.client.get('/api/orders/monthly/')
        self.assertFalse(res.data['includes_collected'])
        self.assertNotIn('collected', res.data['months'][0])
        self.assertEqual(len(res.data['months']), 12)

    def test_payments_stats_by_month(self):
        y, m = self.this_month
        py, pm = self.prev_month
        o = self.order(local(y, m, 1, 12), 100)
        self.pay(o, 30, local(y, m, 1, 13))
        self.pay(o, 20, local(py, pm, 3))
        res = self.client.get('/api/payments/stats/', {'month': self.month_param(self.this_month)})
        self.assertEqual(res.data['total_approved'], 30.0)
        self.assertEqual(self.client.get('/api/payments/stats/').data['total_approved'], 50.0)
