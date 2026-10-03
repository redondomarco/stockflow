from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.users.permissions import SectionPermission
from django.db import transaction
from django.db.models import Sum
from apps.orders.models import Order
from apps.orders.services import BusinessRuleError
from apps.orders.periods import month_range
from .models import Payment
from .services import (
    OPEN_STATUSES, check_can_manage, check_transition, check_order_accepts_payments,
    enforce_overpayment_policy, append_note, is_confirmed,
)


class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    method_display = serializers.CharField(source='get_payment_method_display', read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'
        # El estado solo cambia con las acciones approve / reject / refund.
        read_only_fields = ['status', 'needs_review', 'created_at', 'updated_at']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('El monto debe ser mayor a cero.')
        return value

    def validate_order(self, value):
        if self.instance and value != self.instance.order:
            raise serializers.ValidationError('No se puede cambiar el pedido de un pago.')
        if value.status == 'cancelled':
            raise serializers.ValidationError(f'El pedido {value.order_number} está anulado y no admite pagos.')
        return value


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related('order').order_by('-created_at')
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated, SectionPermission]
    permission_section = 'payments'
    filterset_fields = ['status', 'payment_method', 'order', 'needs_review']
    ordering = ['-created_at']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                # Bloquear el pedido serializa los pagos concurrentes sobre el mismo saldo.
                order = Order.objects.select_for_update().get(pk=serializer.validated_data['order'].pk)
                note = enforce_overpayment_policy(order, serializer.validated_data['amount'], is_confirmed(request.data))
                payment = serializer.save()
                if note:
                    append_note(payment, note)
                    payment.save(update_fields=['notes'])
        except BusinessRuleError as e:
            return e.response()
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        payment = self.get_object()
        if payment.status not in OPEN_STATUSES:
            return Response({'error': 'Solo se pueden editar pagos pendientes.'}, status=400)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        payment = self.get_object()
        if payment.status not in (*OPEN_STATUSES, 'rejected'):
            return Response(
                {'error': 'No se puede eliminar un pago aprobado o reembolsado; reembolsalo en su lugar.'},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)

    def _change_status(self, request, new_status, apply):
        """Aplica una transición de estado bajo bloqueo, validando permiso y transición."""
        try:
            with transaction.atomic():
                check_can_manage(request.user)
                payment = Payment.objects.select_for_update().select_related('order').get(pk=self.get_object().pk)
                check_transition(payment, new_status)
                apply(payment)
                payment.status = new_status
                payment.save()
        except BusinessRuleError as e:
            return e.response()
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        def apply(payment):
            order = Order.objects.select_for_update().get(pk=payment.order_id)
            check_order_accepts_payments(order)
            note = enforce_overpayment_policy(order, payment.amount, is_confirmed(request.data))
            if note:
                append_note(payment, note)
            if request.data.get('transaction_id'):
                payment.transaction_id = request.data['transaction_id']
        return self._change_status(request, 'approved', apply)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        def apply(payment):
            reason = (request.data.get('reason') or '').strip()
            if reason:
                append_note(payment, f'Rechazo: {reason}')
        return self._change_status(request, 'rejected', apply)

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        def apply(payment):
            payment.needs_review = False
            reason = (request.data.get('reason') or '').strip()
            if reason:
                append_note(payment, f'Reembolso: {reason}')
        return self._change_status(request, 'refunded', apply)

    @action(detail=True, methods=['post'])
    def mark_reviewed(self, request, pk=None):
        """Descarta la marca de revisión de un pago aprobado de un pedido anulado (se conserva el cobro)."""
        try:
            check_can_manage(request.user)
        except BusinessRuleError as e:
            return e.response()
        payment = self.get_object()
        if not payment.needs_review:
            return Response({'error': 'El pago no está marcado para revisión.'}, status=400)
        payment.needs_review = False
        append_note(payment, f'Revisado por {request.user.username}: se conserva el cobro.')
        payment.save()
        return Response(PaymentSerializer(payment).data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Resumen de pagos; con ?month=AAAA-MM, solo los pagos registrados en ese mes."""
        try:
            period = month_range(request.query_params.get('month'))
        except BusinessRuleError as e:
            return e.response()
        payments = Payment.objects.all()
        if period:
            payments = payments.filter(created_at__gte=period[0], created_at__lt=period[1])
        return Response({
            'total_approved': float(payments.filter(status='approved').aggregate(Sum('amount'))['amount__sum'] or 0),
            'total_pending': float(payments.filter(status='pending').aggregate(Sum('amount'))['amount__sum'] or 0),
            'total_refunded': float(payments.filter(status='refunded').aggregate(Sum('amount'))['amount__sum'] or 0),
            'needs_review_count': payments.filter(needs_review=True).count(),
            'count_by_method': {
                m: payments.filter(status='approved', payment_method=m).count()
                for m, _ in Payment.METHOD_CHOICES
            },
        })
