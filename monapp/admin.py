from django.contrib import admin
from monapp.models import (
    Agent, Acteadministratif, Avancement, Candidature, Demande, 
    Demandeabsence, Demandeconge, Dossieragent, Notification, 
    Permission, Piece, PosteVacant, Role, Soldeconge, 
    Typedemande, Typepiece, Validation, AgentRole, RolePermission
)

# Enregistre chaque modèle pour l'admin
admin.site.register(Agent)
admin.site.register(Acteadministratif)
admin.site.register(Avancement)
admin.site.register(Candidature)
admin.site.register(Demande)
admin.site.register(Demandeabsence)
admin.site.register(Demandeconge)
admin.site.register(Dossieragent)
admin.site.register(Notification)
admin.site.register(Permission)
admin.site.register(Piece)
admin.site.register(PosteVacant)
admin.site.register(Role)
admin.site.register(Soldeconge)
admin.site.register(Typedemande)
admin.site.register(Typepiece)
admin.site.register(Validation)
admin.site.register(AgentRole)
admin.site.register(RolePermission)