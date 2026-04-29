from django.db import migrations, models


def migrate_old_statuses(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    Order.objects.filter(status__in=['confirmed', 'processing', 'shipped']).update(status='pending')


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0004_customer_enabled_products'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderitem',
            name='delivered_quantity',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(migrate_old_statuses, migrations.RunPython.noop),
    ]
