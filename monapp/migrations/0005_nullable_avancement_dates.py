from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('monapp', '0004_enfantagent_noteservice_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='avancement',
            name='date_prevue',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='avancement',
            name='date_effective',
            field=models.DateField(blank=True, null=True),
        ),
    ]
