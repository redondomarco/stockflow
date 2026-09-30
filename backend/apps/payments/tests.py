from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.orders.models import Customer, Order
from apps.products.models import Product
from apps.users.models import SystemConfig
from .models import Payment


class PaymentTestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('cobrador', password='x')
        self.client.force_authenticate(self.user)
        customer = Customer.objects.create(name='Kiosco')
        self.product = Product.objects.create(name='Tapa', sku='T1', price=Decimal('100.00'), stock=10)
        customer.enabled_products.set([self.product])
        res = self.client.post('/api/orders/', {
            'customer': customer.id, 'items': [{'product': self.product.id, 'quantity': 10}],
        }, format='json')
        self.order = Order.objects.get(id=res.data['id'])  # total $1000

    def configure(self, **fields):
        config = SystemConfig.get()
        for k, v in fields.items():
            setattr(config, k, v)
        config.save()

    def pay(self, amount, **extra):
        return self.client.post('/api/payments/', {
            'order': self.order.id, 'amount': str(amount), 'payment_method': 'cash', **extra,
        }, format='json')

    def make_payment(self, amount, status='pending'):
        return Payment.objects.create(order=self.order, amount=Decimal(amount), payment_method='cash', status=status)

    def act(self, payment, action, **data):
        return self.client.post(f'/api/payments/{payment.id}/{action}/', data, format='json')

    def cancel_order(self):
        return self.client.post(f'/api/orders/{self.order.id}/change_status/', {'status': 'cancelled'}, format='json')


class PaymentCreationTests(PaymentTestBase):
    def test_status_cannot_be_set_on_create(self):
        res = self.pay(500, status='approved')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['status'], 'pending')

    def test_amount_must_be_positive(self):
        self.assertEqual(self.pay(0).status_code, 400)
        self.assertEqual(self.pay(-10).status_code, 400)

    def test_cancelled_order_rejects_new_payments(self):
        self.cancel_order()
        res = self.pay(100)
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Payment.objects.exists())

    def test_status_cannot_be_changed_by_update(self):
        payment = self.make_payment(100)
        res = self.client.patch(f'/api/payments/{payment.id}/', {'status': 'approved'}, format='json')
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'pending')

    def test_only_pending_payments_are_editable(self):
        payment = self.make_payment(100, status='approved')
        res = self.client.patch(f'/api/payments/{payment.id}/', {'amount': '1'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_approved_payment_cannot_be_deleted(self):
        payment = self.make_payment(100, status='approved')
        self.assertEqual(self.client.delete(f'/api/payments/{payment.id}/').status_code, 400)
        self.assertTrue(Payment.objects.filter(id=payment.id).exists())


class PaymentTransitionTests(PaymentTestBase):
    def test_happy_path(self):
        payment = self.make_payment(100)
        self.assertEqual(self.act(payment, 'approve', transaction_id='TX1').data['status'], 'approved')
        res = self.act(payment, 'refund')
        self.assertEqual(res.data['status'], 'refunded')
        self.assertEqual(res.data['transaction_id'], 'TX1')

    def test_invalid_transitions(self):
        rejected = self.make_payment(100, status='rejected')
        refunded = self.make_payment(100, status='refunded')
        approved = self.make_payment(100, status='approved')
        pending = self.make_payment(100)
        for payment, action in [(rejected, 'approve'), (refunded, 'approve'), (approved, 'approve'),
                                (approved, 'reject'), (pending, 'refund'), (refunded, 'refund')]:
            with self.subTest(status=payment.status, action=action):
                old = payment.status
                res = self.act(payment, action)
                self.assertEqual(res.status_code, 400)
                payment.refresh_from_db()
                self.assertEqual(payment.status, old)

    def test_reject_keeps_existing_notes(self):
        payment = self.make_payment(100)
        payment.notes = 'Cheque 123'
        payment.save()
        res = self.act(payment, 'reject', reason='Sin fondos')
        self.assertEqual(res.data['notes'], 'Cheque 123\nRechazo: Sin fondos')


class OverpaymentPolicyTests(PaymentTestBase):
    def test_allow_accepts_and_notes_excess(self):
        res = self.pay(1200)
        self.assertEqual(res.status_code, 201)
        self.assertIn('saldo a favor', res.data['notes'])

    def test_exact_balance_is_not_overpayment(self):
        self.configure(overpayment_policy='block')
        self.make_payment(400, status='approved')
        self.assertEqual(self.pay(600).status_code, 201)

    def test_warn_requires_confirmation(self):
        self.configure(overpayment_policy='warn')
        res = self.pay(1200)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['code'], 'overpayment_warning')
        self.assertEqual(res.data['excess'], 200.0)
        self.assertFalse(Payment.objects.exists())
        self.assertEqual(self.pay(1200, confirm_overpayment=True).status_code, 201)

    def test_block_rejects_even_confirmed(self):
        self.configure(overpayment_policy='block')
        res = self.pay(1200, confirm_overpayment=True)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['code'], 'overpayment')

    def test_checked_again_on_approval(self):
        # Dos pagos pendientes que por separado entran en el saldo, pero juntos lo superan.
        self.configure(overpayment_policy='block')
        first = self.pay(700)
        second = self.pay(700)
        self.assertEqual(self.act(Payment.objects.get(id=first.data['id']), 'approve').status_code, 200)
        res = self.act(Payment.objects.get(id=second.data['id']), 'approve')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Payment.objects.get(id=second.data['id']).status, 'pending')


class PaymentApprovalPermissionTests(PaymentTestBase):
    def test_section_mode_lets_any_payments_writer_approve(self):
        payment = self.make_payment(100)
        self.assertEqual(self.act(payment, 'approve').status_code, 200)

    def test_restricted_mode_requires_flag(self):
        self.configure(payment_approval='restricted')
        payment = self.make_payment(100)
        for action in ('approve', 'reject'):
            self.assertEqual(self.act(payment, action).status_code, 403)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'pending')

        self.user.profile.can_approve_payments = True
        self.user.profile.save()
        self.assertEqual(self.act(payment, 'approve').status_code, 200)

    def test_restricted_mode_lets_superuser_approve(self):
        self.configure(payment_approval='restricted')
        self.client.force_authenticate(User.objects.create_superuser('jefe', password='x'))
        self.assertEqual(self.act(self.make_payment(100), 'approve').status_code, 200)

    def test_restricted_mode_still_allows_registering_payments(self):
        self.configure(payment_approval='restricted')
        self.assertEqual(self.pay(100).status_code, 201)


class CancelledOrderPaymentsTests(PaymentTestBase):
    def setUp(self):
        super().setUp()
        self.approved = self.make_payment(300, status='approved')
        self.pending = self.make_payment(200)

    def statuses(self):
        self.approved.refresh_from_db()
        self.pending.refresh_from_db()
        return self.approved.status, self.pending.status

    def test_keep_policy(self):
        self.assertEqual(self.cancel_order().status_code, 200)
        self.assertEqual(self.statuses(), ('approved', 'rejected'))
        self.assertFalse(self.approved.needs_review)

    def test_review_policy_flags_approved_payments(self):
        self.configure(cancelled_order_payments='review')
        self.cancel_order()
        self.assertEqual(self.statuses(), ('approved', 'rejected'))
        self.assertTrue(self.approved.needs_review)
        self.assertEqual(self.client.get('/api/payments/stats/').data['needs_review_count'], 1)

        res = self.act(self.approved, 'mark_reviewed')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['needs_review'])

    def test_refund_after_review_clears_flag(self):
        self.configure(cancelled_order_payments='review')
        self.cancel_order()
        res = self.act(self.approved, 'refund')
        self.assertEqual(res.data['status'], 'refunded')
        self.assertFalse(res.data['needs_review'])

    def test_refund_policy(self):
        self.configure(cancelled_order_payments='refund')
        res = self.cancel_order()
        self.assertEqual(self.statuses(), ('refunded', 'rejected'))
        comment = res.data['status_history'][0]['comment']
        self.assertIn('1 pago(s) reembolsado(s)', comment)
        self.assertIn('1 pago(s) pendiente(s) rechazado(s)', comment)

    def test_cancel_restores_stock(self):
        self.cancel_order()
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_cancelling_twice_fails_without_side_effects(self):
        self.cancel_order()
        self.assertEqual(self.cancel_order().status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
