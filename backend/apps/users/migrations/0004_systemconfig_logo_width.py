from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_systemconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='systemconfig',
            name='logo_width',
            field=models.PositiveIntegerField(default=140),
        ),
    ]
