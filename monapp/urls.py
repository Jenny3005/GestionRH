from django.urls import path
from . import views

urlpatterns = [
    # ==================== SYSTÈME D'AUTHENTIFICATION ====================
    path('register/', views.register, name='register'),
    path('activate-account/', views.activate_agent_account, name='activate_agent_account'),
    path('activate/', views.activate_account_via_email, name='activate_account_via_email'),
    path('login/', views.login, name='login'),
    
    # ==================== GESTION DES AGENTS ====================
    path('agents/', views.get_all_agents, name='get_all_agents'),
    path('stats/', views.get_stats, name='get_stats'),
    path('roles/', views.get_all_roles, name='get_all_roles'),
    path('roles/add/', views.add_role, name='add_role'),
    path('roles/<int:role_id>/delete/', views.delete_role, name='delete_role'),
    path('agents/<int:agent_id>/role/', views.update_agent_role, name='update_agent_role'),
    path('import-agents/', views.import_agents, name='import_agents'),
    path('agent/<str:matricule>/', views.get_agent_by_matricule, name='get_agent'),
    path('agents/<str:matricule>/role/update/', views.update_agent_role_by_matricule, name='update_agent_role_by_matricule'),
    path('agents/<str:agent_id>/role/add/', views.add_role_to_agent, name='add_role_to_agent'),
    path('agents/<str:agent_id>/role/remove/', views.remove_role_from_agent, name='remove_role_from_agent'),
    
    # ==================== GESTION DES CONGÉS ====================
    path('conges/demander/', views.demande_conge, name='demande_conge'),
    path('conges/mes-demandes/<str:matricule>/', views.mes_demandes_conge, name='mes_demandes_conge'),
    path('conges/solde/<str:matricule>/', views.solde_conge, name='solde_conge'),
    path('conges/direction/<str:matricule_chef>/', views.demandes_direction, name='demandes_direction'),
    path('conges/<int:demande_id>/valider/', views.valider_demande_conge, name='valider_demande_conge'),
    path('absences/demander/', views.demande_absence, name='demande_absence'),
    path('absences/total/<str:matricule>/', views.total_absences_annee, name='total_absences_annee'),
    path('api/conges/mes-demandes/<str:matricule>/', views.mes_demandes, name='mes_demandes'),
    
    # ==================== TYPES DE DEMANDE ====================
    path('types-demande/', views.get_types_demande, name='get_types_demande'),
    path('types-demande/add/', views.add_type_demande, name='add_type_demande'),
    path('types-demande/<int:type_id>/delete/', views.delete_type_demande, name='delete_type_demande'),
    path('types-demande/<int:type_id>/edit/', views.edit_type_demande, name='edit_type_demande'),
    
    # ==================== TYPES DE PIÈCE ====================
    path('types-piece/', views.get_types_piece, name='get_types_piece'),
    path('types-piece/add/', views.add_type_piece, name='add_type_piece'),
    path('types-piece/<int:type_id>/delete/', views.delete_type_piece, name='delete_type_piece'),
    path('types-piece/<int:type_id>/edit/', views.edit_type_piece, name='edit_type_piece'),
    
    # ==================== NOTIFICATIONS ====================
    path('notifications/<str:matricule>/', views.get_notifications, name='get_notifications'),
    path('notifications/<str:matricule>/lues/', views.marquer_toutes_notifications_lues, name='marquer_toutes_notifications_lues'),
    path('notifications/<int:notification_id>/lue/', views.marquer_notification_lue, name='marquer_notification_lue'),
    path('notifications/<int:notification_id>/supprimer/', views.supprimer_notification, name='supprimer_notification'),
    path('notifications/<str:matricule>/supprimer-toutes/', views.supprimer_toutes_notifications, name='supprimer_toutes_notifications'),

    # ==================== GESTION DES DOCUMENTS ====================
    path('documents/', views.get_documents, name='get_documents'),
    path('documents/upload/', views.upload_document, name='upload_document'),
    path('documents/download/<int:piece_id>/', views.download_document, name='download_document'),
    path('documents/delete/<int:piece_id>/', views.delete_document, name='delete_document'),
    path('rh/documents/<str:matricule>/', views.get_documents_by_matricule, name='get_documents_by_matricule'),
    path('documents/check-expired/', views.check_expired_documents, name='check_expired_documents'),

    # ==================== GESTION DES PERMISSIONS ====================
    path('permissions/', views.get_permissions, name='get_permissions'),
    path('permissions/add/', views.add_permission, name='add_permission'),
    path('permissions/<str:code>/delete/', views.delete_permission, name='delete_permission'),
    path('role-permissions/', views.get_role_permissions, name='get_role_permissions'),
    path('role-permissions/toggle/', views.toggle_role_permission, name='toggle_role_permission'),

    path('user-permissions/<str:matricule>/', views.get_user_permissions, name='user_permissions'),

    # ==================== SECRÉTARIAT ====================
    path('secretaire/demandes-validees/<str:matricule_secretaire>/', views.get_demandes_validees_secretaire, name='get_demandes_validees_secretaire'),
    path('secretaire/transmettre-dpaf/<int:demande_id>/', views.transmettre_demande_dpaf, name='transmettre_demande_dpaf'),
    path('secretaire/demandes-transmises/<str:matricule_secretaire>/', views.get_demandes_transmises_secretaire, name='get_demandes_transmises_secretaire'),
    path('secretaire/actes-a-transmettre/<str:matricule_secretaire>/', views.get_actes_a_transmettre_secretaire, name='actes_a_transmettre_secretaire'),
    path('secretaire/actes-a-remettre/<str:matricule_secretaire>/', views.get_actes_a_remettre_secretaire, name='actes_a_remettre_secretaire'),
    path('secretaire/actes-recus/<str:matricule_secretaire>/', views.get_actes_recus_secretaire, name='get_actes_recus_secretaire'),
    path('secretaire/transmettre-acte-dpaf/<path:reference>/', views.transmettre_acte_dpaf, name='transmettre_acte_dpaf'),
    path('secretaire/remettre-acte/<path:reference>/', views.remettre_acte, name='remettre_acte'),

    # ==================== DPAF ====================
    path('dpaf/demandes-transmises/<str:matricule_dpaf>/', views.get_demandes_transmises_dpaf, name='demandes_transmises_dpaf'),
    path('dpaf/demandes-assignees/<str:matricule_dpaf>/', views.get_demandes_assignees_dpaf, name='demandes_assignees_dpaf'),
    path('dpaf/actes-a-signer/<str:matricule_dpaf>/', views.get_actes_a_signer_dpaf, name='actes_a_signer_dpaf'),
    path('agents/rh/', views.get_agents_rh, name='agents_rh'),
    path('dpaf/assigner-rh/<int:demande_id>/', views.assigner_demande_rh, name='assigner_demande_rh'),
    path('dpaf/signer-acte/<path:reference>/', views.signer_acte_dpaf, name='signer_acte_dpaf'),
    
    # ==================== RH ====================
    path('rh/demandes-assignees/<str:matricule_rh>/', views.get_demandes_assignees_rh, name='demandes_assignees_rh'),
    path('rh/demandes-cours/<str:matricule_rh>/', views.get_demandes_cours_rh, name='demandes_cours_rh'),
    path('rh/demandes-terminees/<str:matricule_rh>/', views.get_demandes_terminees_rh, name='demandes_terminees_rh'),
    path('rh/actes-a-envoyer/<str:matricule_rh>/', views.get_actes_a_envoyer_rh, name='actes_a_envoyer_rh'),
    path('rh/commencer-traitement/<int:demande_id>/', views.commencer_traitement_rh, name='commencer_traitement_rh'),
    path('rh/generer-acte/<int:demande_id>/', views.generer_acte_rh, name='generer_acte_rh'),
    path('rh/envoyer-acte-secretaire/<path:reference>/', views.envoyer_acte_secretaire, name='envoyer_acte_secretaire'),

    # ==================== AUTRES ====================
    path('check-expiry/', views.check_expired_documents, name='check_expired_documents'),
    path('attestations/presence/', views.generer_attestation_presence, name='generer_attestation_presence'),
    path('attestations/travail/', views.generer_attestation_travail, name='generer_attestation_travail'),
    path('actes/<path:reference>/download/', views.download_acte, name='download_acte'),

    # ==================== SIGNATURE ET CACHET ====================
    path('agent/signature-cachet/<str:matricule>/', views.get_signature_cachet, name='get_signature_cachet'),
    path('agent/upload-signature/<str:matricule>/', views.upload_signature, name='upload_signature'),
    path('agent/upload-cachet/<str:matricule>/', views.upload_cachet, name='upload_cachet'),
    path('agent/delete-signature/<str:matricule>/', views.delete_signature, name='delete_signature'),
    path('agent/delete-cachet/<str:matricule>/', views.delete_cachet, name='delete_cachet'),
    path('documents/expired-count/', views.get_all_expired_documents, name='get_all_expired_documents'),
    path('anomalies/<str:matricule>/', views.detect_anomalies, name='detect_anomalies'),

    # ==================== AVANCEMENTS ====================
    path('avancements/calculer/', views.trigger_avancements, name='trigger_avancements'),
    path('avancements/agent/<str:matricule>/', views.get_avancements_agent, name='get_avancements_agent'),
    path('avancements/periode/', views.get_avancements_periode, name='get_avancements_periode'),
    path('avancements/alertes/', views.check_alertes_avancement, name='check_alertes_avancement'),
    path('avancements/bordereau/', views.generer_bordereau, name='generer_bordereau'),
]