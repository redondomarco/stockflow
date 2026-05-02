from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0009_customer_priority'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveField(
            model_name='deliveryroute',
            name='driver',
        ),
        migrations.AddField(
            model_name='deliveryroute',
            name='driver',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='driven_routes',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.DeleteModel(
            name='Driver',
        ),
    ]
