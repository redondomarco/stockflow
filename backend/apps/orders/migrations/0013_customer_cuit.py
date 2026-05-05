from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0012_alter_pricelist_multiplier'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='cuit',
            field=models.CharField(blank=True, max_length=20, null=True, unique=True),
        ),
    ]
