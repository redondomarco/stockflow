from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_systemconfig_logo_width'),
    ]

    operations = [
        migrations.AddField(
            model_name='systemconfig',
            name='pdf_logo_width',
            field=models.PositiveIntegerField(default=35),
        ),
    ]
