# ia_utils.py
from datetime import date
from .models import Agent, Soldeconge, Demandeconge, Demande

def verifier_eligibilite_conge(agent, date_debut, date_fin):
    """
    Vérifie si l'agent est éligible pour un congé
    Retourne: (est_eligible, liste_des_erreurs)
    """
    erreurs = []
    aujourd_hui = date.today()
    
    # Règle 1: Ancienneté minimale (1 an = 365 jours)
    if agent.date_prise_service:
        anciennete_jours = (aujourd_hui - agent.date_prise_service).days
        if anciennete_jours < 365:
            reste = 365 - anciennete_jours
            erreurs.append(f"Ancienneté insuffisante. {reste} jours restants avant de pouvoir poser un congé.")
    
    # Règle 2: Nombre de demandes par an (max 2)
    annee_courante = aujourd_hui.year
    nb_demandes_annee = Demande.objects.filter(
        agent=agent,
        typedemande__libelle='Congé',
        date_soumission__year=annee_courante
    ).count()
    
    if nb_demandes_annee >= 2:
        erreurs.append(f"Vous avez déjà effectué {nb_demandes_annee} demande(s) de congé cette année. Maximum 2 demandes par an.")
    
    # Règle 3: Solde suffisant
    nb_jours = (date_fin - date_debut).days + 1
    solde = Soldeconge.objects.filter(agent=agent, annee=annee_courante).first()
    
    if not solde:
        jours_restants = 30
    else:
        jours_restants = solde.jours_restants
    
    if nb_jours > jours_restants:
        erreurs.append(f"Solde insuffisant. Vous demandez {nb_jours} jours, il vous reste {jours_restants} jours.")
    
    # Règle 4: Pas de chevauchement avec une demande existante
    chevauchement = Demandeconge.objects.filter(
        demande__agent=agent,
        date_debut__lte=date_fin,
        date_fin__gte=date_debut,
        demande__statut__in=['en_attente_chef', 'valide']
    ).exists()
    
    if chevauchement:
        erreurs.append("Vous avez déjà une demande de congé sur cette période.")
    
    # Règle 5: Pas plus de 30 jours consécutifs
    if nb_jours > 30:
        erreurs.append("La durée maximale d'un congé est de 30 jours consécutifs.")
    
    return {
        'eligible': len(erreurs) == 0,
        'erreurs': erreurs
    }