from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0011_customer_localidad'),
    ]

    operations = [
        migrations.AlterField(
            model_name='pricelist',
            name='multiplier',
            field=models.DecimalField(decimal_places=4, default=1.0, max_digits=10),
        ),
    ]
