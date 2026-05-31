from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0013_customer_cuit'),
    ]

    operations = [
        migrations.CreateModel(
            name='Zone',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
                ('description', models.TextField(blank=True)),
                ('color', models.CharField(blank=True, default='#6366f1', max_length=7)),
            ],
            options={'verbose_name': 'Zona', 'verbose_name_plural': 'Zonas', 'ordering': ['name']},
        ),
        migrations.AddField(
            model_name='customer',
            name='zone',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='customers', to='orders.zone'),
        ),
        migrations.AddField(
            model_name='customer',
            name='latitude',
            field=models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='customer',
            name='longitude',
            field=models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True),
        ),
    ]
