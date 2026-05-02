from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0010_driver_to_user'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='localidad',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
