from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0003_product_fixed_price'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='sort_order',
            field=models.IntegerField(default=0, help_text='Índice de orden de visualización (menor = primero)'),
        ),
        migrations.AlterModelOptions(
            name='product',
            options={'ordering': ['sort_order', 'name'], 'verbose_name': 'Producto', 'verbose_name_plural': 'Productos'},
        ),
    ]
