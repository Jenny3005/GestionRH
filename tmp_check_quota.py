import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from monapp.ia_utils import _valider_quota_conge

class DummySolde:
    pass

DummySolde.jours_restants = 10
ok1, msg1 = _valider_quota_conge(DummySolde(), 5)
ok2, msg2 = _valider_quota_conge(DummySolde(), 11)
print('ok1=', ok1, 'msg1=', msg1)
print('ok2=', ok2, 'msg2=', msg2)
assert ok1 is True and msg1 is None
assert ok2 is False and 'Solde insuffisant' in msg2
