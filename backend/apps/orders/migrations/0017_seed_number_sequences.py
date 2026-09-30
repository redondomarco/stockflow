import re

from django.db import migrations

# (secuencia, modelo, campo, patrón) — mismos formatos que en models.py
SEQUENCES = [
    ('order_number', 'Order', 'order_number', r'^NV-(\d+)$'),
    ('route_number', 'DeliveryRoute', 'route_number', r'^HR-(\d+)$'),
    ('customer_auto_cuit', 'Customer', 'cuit', r'^00-(\d+)-0$'),
]


def seed(apps, schema_editor):
    """Inicializa cada contador con el mayor número ya usado, para continuar la numeración."""
    NumberSequence = apps.get_model('orders', 'NumberSequence')
    for name, model_name, field, pattern in SEQUENCES:
        Model = apps.get_model('orders', model_name)
        values = Model.objects.filter(**{f'{field}__regex': pattern}).values_list(field, flat=True)
        last = max((int(re.match(pattern, v).group(1)) for v in values), default=0)
        NumberSequence.objects.update_or_create(name=name, defaults={'last_value': last})


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0016_number_sequence'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
