from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    method_display = serializers.CharField(source='get_payment_method_display', read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related('order').order_by('-created_at')
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'payment_method', 'order']
    ordering = ['-created_at']

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        payment = self.get_object()
        payment.status = 'approved'
        payment.transaction_id = request.data.get('transaction_id', '')
        payment.save()
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        payment = self.get_object()
        payment.status = 'rejected'
        payment.notes = request.data.get('reason', '')
        payment.save()
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        payment = self.get_object()
        if payment.status != 'approved':
            return Response({'error': 'Solo se pueden reembolsar pagos aprobados'}, status=400)
        payment.status = 'refunded'
        payment.save()
        return Response(PaymentSerializer(payment).data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        payments = Payment.objects.all()
        return Response({
            'total_approved': float(payments.filter(status='approved').aggregate(Sum('amount'))['amount__sum'] or 0),
            'total_pending': float(payments.filter(status='pending').aggregate(Sum('amount'))['amount__sum'] or 0),
            'total_refunded': float(payments.filter(status='refunded').aggregate(Sum('amount'))['amount__sum'] or 0),
            'count_by_method': {
                m: payments.filter(status='approved', payment_method=m).count()
                for m, _ in Payment.METHOD_CHOICES
            },
        })
