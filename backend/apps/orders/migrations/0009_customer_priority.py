from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0008_driver_per_route'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='priority',
            field=models.PositiveSmallIntegerField(default=5, help_text='Prioridad de entrega del 1 (más urgente) al 10'),
        ),
    ]
