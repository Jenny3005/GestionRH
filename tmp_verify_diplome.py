import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
import django
django.setup()
from monapp.views import analyser_candidature_avec_ia

cv = "Master in Information Technology Management Institution: University of Technology Year of Graduation: 2020 Dean's List Honors IT Management Award Bachelor's in Computer Science with Minor in Business Administration Institution: City College of Science Year of Graduation: 2015 Graduated with Honors, top 10% of class. Completed a capstone project on cybersecurity solutions"
result = analyser_candidature_avec_ia(
    1,
    cv,
    '',
    '',
    'Master en Informatique, Réseaux ou Télécommunications BAC+5 ou équivalent',
    'Master en Informatique, Réseaux ou Télécommunications BAC+5 ou équivalent',
    ['CV', 'LM', 'DIPLOME'],
    ['CV', 'LM', 'DIPLOME'],
)
print(result[1])
