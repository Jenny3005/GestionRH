from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('activate/', views.activate_account, name='activate_account'),
    path('agents/', views.get_all_agents, name='get_all_agents'),
    path('stats/', views.get_stats, name='get_stats'),
    path('roles/', views.get_all_roles, name='get_all_roles'),
    path('roles/add/', views.add_role, name='add_role'),
    path('roles/<int:role_id>/delete/', views.delete_role, name='delete_role'),
    path('agents/<int:agent_id>/role/', views.update_agent_role, name='update_agent_role'),
    path('import-agents/', views.import_agents, name='import_agents'),
    path('agent/<str:matricule>/', views.get_agent_by_matricule, name='get_agent'),
    # M2 - Congés
    path('conges/demander/', views.demande_conge, name='demande_conge'),
    path('conges/mes-demandes/<str:matricule>/', views.mes_demandes_conge, name='mes_demandes_conge'),
    path('conges/solde/<str:matricule>/', views.solde_conge, name='solde_conge'),
    path('conges/direction/<str:matricule_chef>/', views.demandes_direction, name='demandes_direction'),
    path('conges/<int:demande_id>/valider/', views.valider_demande_conge, name='valider_demande_conge'),
    path('types-demande/', views.get_types_demande, name='get_types_demande'),
    path('types-demande/add/', views.add_type_demande, name='add_type_demande'),
    path('types-demande/<int:type_id>/delete/', views.delete_type_demande, name='delete_type_demande'),
    path('types-demande/<int:type_id>/edit/', views.edit_type_demande, name='edit_type_demande'),
    path('types-piece/', views.get_types_piece, name='get_types_piece'),
    path('types-piece/add/', views.add_type_piece, name='add_type_piece'),
    path('types-piece/<int:type_id>/delete/', views.delete_type_piece, name='delete_type_piece'),
    path('types-piece/<int:type_id>/edit/', views.edit_type_piece, name='edit_type_piece'),
    path('notifications/<str:matricule>/', views.get_notifications, name='get_notifications'),
    path('notifications/<str:matricule>/lues/', views.marquer_toutes_notifications_lues, name='marquer_toutes_notifications_lues'),
    path('notifications/<int:notification_id>/lue/', views.marquer_notification_lue, name='marquer_notification_lue'),
]
