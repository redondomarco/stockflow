from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0004_product_sort_order'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='is_bundle',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='product',
            name='bundle_child',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='parent_bundles',
                to='products.product',
                help_text='Producto unitario que compone este agrupado',
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='bundle_quantity',
            field=models.PositiveIntegerField(blank=True, null=True, help_text='Cantidad de unidades por agrupado'),
        ),
        migrations.AddField(
            model_name='product',
            name='bundle_unit_weight',
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=8, null=True, help_text='Peso por unidad (kg)'),
        ),
        migrations.AddField(
            model_name='product',
            name='bundle_unit_price',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True, help_text='Precio por unidad'),
        ),
    ]
