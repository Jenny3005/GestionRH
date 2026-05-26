# ia_utils.py
from datetime import date, datetime
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

def calculer_score_priorite(demande):
    """
    Calcule un score de priorité pour une demande de congé.
    Plus le score est élevé, plus la demande est prioritaire.
    """
    score = 0
    today = datetime.now().date()
    
    # Critère 1 : Demande en attente depuis plus de 5 jours → +20
    jours_attente = (today - demande.date_soumission).days
    if jours_attente > 5:
        score += 20
    elif jours_attente > 3:
        score += 10
    
    # Critère 2 : Congé qui commence dans moins de 7 jours → +25
    jours_avant_depart = (demande.demandeconge.date_debut - today).days
    if 0 <= jours_avant_depart <= 3:
        score += 25
    elif 4 <= jours_avant_depart <= 7:
        score += 15
    
    # Critère 3 : Congé de plus de 15 jours → +10
    if demande.demandeconge.nombrejours > 15:
        score += 10
    
    # Critère 4 : Ancienneté de l'agent (>10 ans) → +5
    if demande.agent.date_prise_service:
        anciennete = (today - demande.agent.date_prise_service).days / 365
        if anciennete > 10:
            score += 5
        elif anciennete > 5:
            score += 3
    
    # Critère 5 : Demande avec anomalies détectées → +15
    if getattr(demande, 'anomalies_detectees', False):
        score += 15
    
    return score
