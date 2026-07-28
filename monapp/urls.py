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
    path('smtp-test/', views.smtp_test, name='smtp_test'),
    path('agent/<str:matricule>/', views.get_agent_by_matricule, name='get_agent'),
    path('agents/<str:matricule>/role/update/', views.update_agent_role_by_matricule, name='update_agent_role_by_matricule'),
    path('agents/<str:agent_id>/role/add/', views.add_role_to_agent, name='add_role_to_agent'),
    path('agents/<str:agent_id>/role/remove/', views.remove_role_from_agent, name='remove_role_from_agent'),
    
    # ==================== GESTION DES CONGÉS ====================
    path('conges/demander/', views.demande_conge, name='demande_conge'),
    path('conges/solde/<str:matricule>/', views.solde_conge, name='solde_conge'),
    path('conges/direction/<str:matricule_chef>/', views.demandes_direction, name='demandes_direction'),
    path('conges/<int:demande_id>/valider/', views.valider_demande_conge, name='valider_demande_conge'),
    path('absences/demander/', views.demande_absence, name='demande_absence'),
    path('absences/total/<str:matricule>/', views.total_absences_annee, name='total_absences_annee'),
    path('conges/mes-demandes/<str:matricule>/', views.mes_demandes, name='mes_demandes'),
    
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
    path('actes/agent/<str:matricule>/', views.get_actes_by_agent, name='get_actes_by_agent'),
    path('attestations/validite-services/', views.generer_attestation_validite_services, name='attestation_validite_services'),
    path('certificats/non-jouissance/', views.generer_certificat_non_jouissance, name='certificat_non_jouissance'),
    path('certificats/verifier/<str:matricule>/<int:annee>/', views.verifier_conge_par_annee, name='verifier_conge_annee'),
    path('dpaf/demandes-historique/<str:matricule_dpaf>/', views.get_demandes_historique_dpaf, name='demandes_historique_dpaf'),
    path('anniversaires/check/', views.check_anniversaires, name='check_anniversaires'),
    
    
    # ==================== SIGNATURE ET CACHET ====================
    path('agent/signature-cachet/<str:matricule>/', views.get_signature_cachet, name='get_signature_cachet'),
    path('agent/upload-signature/<str:matricule>/', views.upload_signature, name='upload_signature'),
    path('agent/upload-cachet/<str:matricule>/', views.upload_cachet, name='upload_cachet'),
    path('agent/delete-signature/<str:matricule>/', views.delete_signature, name='delete_signature'),
    path('agent/delete-cachet/<str:matricule>/', views.delete_cachet, name='delete_cachet'),
    path('documents/expired-count/', views.get_all_expired_documents, name='get_all_expired_documents'),
    path('anomalies/<str:matricule>/', views.detect_anomalies, name='detect_anomalies'),
    path('api/actes/signer/dapaf/<str:reference>/', views.signer_acte_dapaf, name='signer_acte_dapaf'),
    path('api/actes/a-signer-dapaf/<str:matricule_dapaf>/', views.get_actes_a_signer_dapaf, name='get_actes_a_signer_dapaf'),

    # ==================== AVANCEMENTS ====================
    path('avancements/calculer/', views.trigger_avancements, name='trigger_avancements'),
    path('avancements/agent/<str:matricule>/', views.get_avancements_agent, name='get_avancements_agent'),
    path('avancements/periode/', views.get_avancements_periode, name='get_avancements_periode'),
    path('avancements/alertes/', views.check_alertes_avancement, name='check_alertes_avancement'),
    path('avancements/bordereau/', views.generer_bordereau, name='generer_bordereau'),

    # ==================== ARCHIVAGE ====================
    path('actes/archives/', views.get_actes_archives, name='get_actes_archives'),
    path('actes/<path:reference>/archiver/', views.archiver_acte, name='archiver_acte'),
    
    # Module 7 - Postes vacants
    path('postes-vacants/', views.postes_vacants, name='postes_vacants'),
    path('postes-vacants/<int:poste_id>/cloturer/', views.cloturer_poste_vacant, name='cloturer_poste_vacant'),
    path('postes-vacants/<int:poste_id>/', views.update_poste_vacant, name='update_poste_vacant'),

    # Module 7 - Candidatures
    path('candidatures/postuler/', views.postuler, name='postuler'),
    path('candidatures/poste/<int:poste_id>/', views.get_candidatures_by_poste, name='get_candidatures_by_poste'),
    path('candidatures/<int:candidature_id>/upload-piece/', views.upload_piece_candidature, name='upload_piece_candidature'),
    path('candidatures/<int:candidature_id>/analyser/', views.analyser_candidature, name='analyser_candidature'),
    path('candidatures/exporter/<int:poste_id>/', views.exporter_candidatures, name='exporter_candidatures'),
    path('candidatures/<int:candidature_id>/pieces/', views.get_candidature_pieces, name='get_candidature_pieces'),
    path('candidatures/', views.get_candidatures_agent, name='get_candidatures_agent'),
    path('candidatures/<int:candidature_id>/status/', views.check_candidature_status, name='check_candidature_status'),

    path('notes-service/', views.notes_service, name='notes_service'),
    path('notes-service/<int:note_id>/', views.note_service_detail, name='note_service_detail'),

        # ==================== DPAF/DAPAF (Fonctions génériques par rôle) ====================
        # ==================== DPAF/DAPAF (Fonctions génériques) ====================
    path('dashboard/demandes-a-assigner/<str:matricule>/', views.get_demandes_a_assigner, name='get_demandes_a_assigner'),
    path('dashboard/demandes-assignees/<str:matricule>/', views.get_demandes_assignees_by_role, name='get_demandes_assignees_by_role'),
    path('dashboard/actes-a-signer/<str:matricule>/', views.get_actes_a_signer_by_role, name='get_actes_a_signer_by_role'),
    path('dashboard/demandes-historique/<str:matricule>/', views.get_demandes_historique_by_role, name='get_demandes_historique_by_role'),

    # ==================== DAPAF spécifique (si besoin) ====================
    path('dapaf/demandes-transmises/<str:matricule_dapaf>/', views.get_demandes_transmises_dapaf, name='demandes_transmises_dapaf'),
    path('dapaf/demandes-assignees/<str:matricule_dapaf>/', views.get_demandes_assignees_dapaf, name='demandes_assignees_dapaf'),
    path('dapaf/actes-a-signer/<str:matricule_dapaf>/', views.get_actes_a_signer_dapaf, name='actes_a_signer_dapaf'),
    path('dapaf/signer-acte/<path:reference>/', views.signer_acte_dapaf, name='signer_acte_dapaf'),

    # ==================== Suivi des demandes (historique) ====================
    path('demandes/<int:demande_id>/historique/', views.get_demande_historique, name='get_demande_historique'),
    path('actes/<path:reference>/historique/', views.get_acte_historique, name='get_acte_historique'),

    # ==================== SECRÉTARIAT ====================
    path('secretaire/demandes-validees/<str:matricule_secretaire>/', views.get_demandes_validees_secretaire, name='get_demandes_validees_secretaire'),
    path('secretaire/transmettre-demande/<int:demande_id>/', views.transmettre_demande, name='transmettre_demande'),
    path('secretaire/demandes-transmises-dpaf/<str:matricule_secretaire>/', views.get_demandes_transmises_secretaire, name='get_demandes_transmises_secretaire'),
    path('secretaire/demandes-transmises-dapaf/<str:matricule_secretaire>/', views.get_demandes_transmises_secretaire_dapaf, name='get_demandes_transmises_secretaire_dapaf'),
    path('secretaire/actes-a-transmettre-dpaf/<str:matricule_secretaire>/', views.get_actes_a_transmettre_secretaire_dpaf, name='actes_a_transmettre_secretaire_dpaf'),
    path('secretaire/actes-a-transmettre-dapaf/<str:matricule_secretaire>/', views.get_actes_a_transmettre_secretaire_dapaf, name='actes_a_transmettre_secretaire_dapaf'),
    path('secretaire/actes-a-remettre/<str:matricule_secretaire>/', views.get_actes_a_remettre_secretaire, name='actes_a_remettre_secretaire'),
    path('secretaire/actes-recus/<str:matricule_secretaire>/', views.get_actes_recus_secretaire, name='get_actes_recus_secretaire'),
    path('secretaire/transmettre-acte/<path:reference>/', views.transmettre_acte, name='transmettre_acte'),
    path('secretaire/remettre-acte/<path:reference>/', views.remettre_acte, name='remettre_acte'),

    # ==================== BULLETIN DE NOTES ====================
    path('agent/<str:matricule>/bulletin/', views.bulletin_agent, name='bulletin_agent'),
    path('agent/<str:matricule>/bulletin/generer/', views.generer_bulletin_pdf, name='generer_bulletin_pdf'),
    path('agent/<str:matricule>/enfants/', views.enfants_agent, name='enfants_agent'),
    path('agent/<str:matricule>/enfants/<int:enfant_id>/', views.supprimer_enfant, name='supprimer_enfant'),

    # Attestations - Workflow sans Chef
    path('attestations/demander/', views.demande_attestation, name='demande_attestation'),
    path('secretaire/demandes-attestations/<str:matricule_secretaire>/', views.get_demandes_attestations_secretaire, name='get_demandes_attestations_secretaire'),
    path('secretaire/attestations-transmises/<str:matricule_secretaire>/', views.get_attestations_transmises_secretaire, name='get_attestations_transmises_secretaire'),
    path('secretaire/attestations/transmettre/<int:demande_id>/', views.transmettre_attestation_destinataire, name='transmettre_attestation_destinataire'),
    path('rh/attestations/generer/<int:demande_id>/', views.generer_attestation_rh, name='generer_attestation_rh'),
    path('rh/actes/envoyer-signature/<path:reference>/', views.envoyer_acte_signature_rh, name='envoyer_acte_signature_rh'),
    path('actes/apres-signature/envoyer-secretaire/<path:reference>/', views.envoyer_acte_secretaire_apres_signature, name='envoyer_acte_secretaire_apres_signature'),

    # Attestations DPAF/DAPAF
    path('dashboard/attestations-recues/<str:matricule>/', views.get_attestations_recues, name='get_attestations_recues'),
    path('dashboard/attestations-transmises/<str:matricule>/', views.get_attestations_transmises, name='get_attestations_transmises'),
    path('dpaf/assigner-attestation/<int:attestation_id>/', views.assigner_attestation_rh, name='assigner_attestation_rh'),

    # Attestations assignées et historique pour DPAF
    path('dashboard/attestations-assignees/<str:matricule>/', views.get_attestations_assignees, name='get_attestations_assignees'),
    path('dashboard/attestations-historique/<str:matricule>/', views.get_attestations_historique, name='get_attestations_historique'),
    # Signature des attestations
    path('attestations/signer/<path:reference>/', views.signer_attestation, name='signer_attestation'),

    path('forgot-password/', views.forgot_password, name='forgot_password'),
    path('verify-reset-code/', views.verify_reset_code, name='verify_reset_code'),
    path('reset-password/', views.reset_password, name='reset_password'),

    # Health checks
    path('health/ollama/', views.health_ollama, name='health_ollama'),
    path('health/', views.health, name='health'),

    
]