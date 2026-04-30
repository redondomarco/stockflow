from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0007_driver_deliveryroute_deliveryrouteitem'),
    ]

    operations = [
        migrations.AddField(
            model_name='deliveryroute',
            name='driver',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='routes', to='orders.driver',
            ),
        ),
        migrations.RemoveField(
            model_name='deliveryrouteitem',
            name='driver',
        ),
    ]
