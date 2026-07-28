from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('monapp', '0005_nullable_avancement_dates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='piece',
            name='cheminfichier',
            field=models.TextField(),
        ),
    ]
