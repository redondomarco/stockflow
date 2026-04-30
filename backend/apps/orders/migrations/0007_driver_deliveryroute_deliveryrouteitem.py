from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0006_alter_order_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='Driver',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('phone', models.CharField(blank=True, max_length=20)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Chofer',
                'verbose_name_plural': 'Choferes',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='DeliveryRoute',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('route_number', models.CharField(editable=False, max_length=20, unique=True)),
                ('date', models.DateField()),
                ('status', models.CharField(
                    choices=[('draft', 'Borrador'), ('in_progress', 'En reparto'),
                             ('completed', 'Finalizada'), ('cancelled', 'Cancelada')],
                    default='draft', max_length=20)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Hoja de Ruta',
                'verbose_name_plural': 'Hojas de Ruta',
                'ordering': ['-date', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='DeliveryRouteItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('notes', models.TextField(blank=True)),
                ('route', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                            related_name='items', to='orders.deliveryroute')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                            related_name='route_items', to='orders.order')),
                ('driver', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                             related_name='route_items', to='orders.driver')),
            ],
            options={
                'verbose_name': 'Ítem de Hoja de Ruta',
                'verbose_name_plural': 'Ítems de Hoja de Ruta',
                'ordering': ['sort_order', 'id'],
                'unique_together': {('route', 'order')},
            },
        ),
    ]
