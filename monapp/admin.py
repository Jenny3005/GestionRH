from django.contrib import admin
from monapp.models import (
    Agent, ActeAdministratif, Avancement, Candidature, Demande, 
    DemandeAbsence, DemandeConge, DossierAgent, Notification, 
    Permission, Piece, PosteVacant, Role, SoldeConge, 
    TypeDemande, TypePiece, Validation, AgentRole, RolePermission
)

# Enregistre chaque modèle pour l'admin
admin.site.register(Agent)
admin.site.register(ActeAdministratif)
admin.site.register(Avancement)
admin.site.register(Candidature)
admin.site.register(Demande)
admin.site.register(DemandeAbsence)
admin.site.register(DemandeConge)
admin.site.register(DossierAgent)
admin.site.register(Notification)
admin.site.register(Permission)
admin.site.register(Piece)
admin.site.register(PosteVacant)
admin.site.register(Role)
admin.site.register(SoldeConge)
admin.site.register(TypeDemande)
admin.site.register(TypePiece)
admin.site.register(Validation)
admin.site.register(AgentRole)
admin.site.register(RolePermission)