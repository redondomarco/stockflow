"""
Reglas de negocio de pagos: transiciones de estado, control de pagos mayores al
saldo, permiso de aprobación y tratamiento de pagos de pedidos anulados.
Todas las políticas se leen de SystemConfig.
"""
from decimal import Decimal

from django.db.models import Sum

from apps.orders.services import BusinessRuleError
from apps.users.models import SystemConfig
from .models import Payment

# Estado actual -> estados a los que puede pasar
TRANSITIONS = {
    'pending': {'approved', 'rejected'},
    'processing': {'approved', 'rejected'},
    'approved': {'refunded'},
    'rejected': set(),
    'refunded': set(),
}
OPEN_STATUSES = ('pending', 'processing')


def fmt_money(value):
    return f'${value:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def append_note(payment, text):
    payment.notes = f'{payment.notes}\n{text}' if payment.notes else text


def check_can_manage(user):
    """Con aprobación restringida, solo superusuarios y usuarios habilitados cambian el estado de pagos."""
    if SystemConfig.get().payment_approval != 'restricted' or user.is_superuser:
        return
    profile = getattr(user, 'profile', None)
    if not (profile and profile.can_approve_payments):
        raise BusinessRuleError('No tenés permiso para aprobar, rechazar o reembolsar pagos.', status=403)


def check_transition(payment, new_status):
    if new_status not in TRANSITIONS.get(payment.status, set()):
        labels = dict(Payment.STATUS_CHOICES)
        raise BusinessRuleError(
            f'No se puede pasar un pago {labels[payment.status].lower()} a {labels[new_status].lower()}.'
        )


def check_order_accepts_payments(order):
    if order.status == 'cancelled':
        raise BusinessRuleError(f'El pedido {order.order_number} está anulado y no admite pagos.')


def approved_total(order):
    return order.payments.filter(status='approved').aggregate(total=Sum('amount'))['total'] or Decimal('0')


def enforce_overpayment_policy(order, amount, confirmed):
    """
    Compara el monto con el saldo del pedido (total - pagos aprobados).
    Devuelve una nota para el pago si se acepta un excedente, o lanza BusinessRuleError.
    """
    balance = order.total - approved_total(order)
    if amount <= balance:
        return ''
    excess = amount - balance
    policy = SystemConfig.get().overpayment_policy
    detail = {'balance': float(balance), 'amount': float(amount), 'excess': float(excess)}
    if policy == 'block':
        raise BusinessRuleError(
            f'El pago supera el saldo del pedido ({fmt_money(balance)}).',
            status=400, code='overpayment', can_confirm=False, **detail,
        )
    if policy == 'warn' and not confirmed:
        raise BusinessRuleError(
            f'El pago supera el saldo del pedido ({fmt_money(balance)}) en {fmt_money(excess)}. '
            'Confirmá para registrarlo igual.',
            status=409, code='overpayment_warning', can_confirm=True, **detail,
        )
    return f'Excede el saldo en {fmt_money(excess)} (saldo a favor del cliente).'


def handle_order_cancellation(order):
    """
    Aplica la política de pagos al anular un pedido. Los pagos pendientes se
    rechazan siempre (un pedido anulado no admite aprobaciones). Devuelve un
    resumen para el historial del pedido.
    """
    policy = SystemConfig.get().cancelled_order_payments
    rejected = refunded = flagged = 0
    for payment in order.payments.select_for_update():
        if payment.status in OPEN_STATUSES:
            payment.status = 'rejected'
            append_note(payment, 'Rechazado automáticamente: pedido anulado.')
            rejected += 1
        elif payment.status == 'approved' and policy == 'refund':
            payment.status = 'refunded'
            append_note(payment, 'Reembolsado automáticamente: pedido anulado.')
            refunded += 1
        elif payment.status == 'approved' and policy == 'review':
            payment.needs_review = True
            flagged += 1
        else:
            continue
        payment.save()

    parts = []
    if rejected:
        parts.append(f'{rejected} pago(s) pendiente(s) rechazado(s)')
    if refunded:
        parts.append(f'{refunded} pago(s) reembolsado(s)')
    if flagged:
        parts.append(f'{flagged} pago(s) marcado(s) para revisión')
    return '; '.join(parts)


def is_confirmed(data):
    return data.get('confirm_overpayment') in (True, 'true', 'True', '1', 1)
