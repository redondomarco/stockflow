from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0002_alter_product_stock_alter_stockmovement_stock_after_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='fixed_price',
            field=models.BooleanField(default=False, help_text='Si está activo, el multiplicador de lista de precios no se aplica'),
        ),
    ]
