from django.contrib.auth.hashers import make_password, check_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.db import connection
from django.db import models  # Ajoutez ceci pour utiliser Sum
from django.db.models import Sum
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from datetime import datetime, date, timedelta
from .models import (
    Agent, Role, AgentRole, TypeDemande, Demande, DemandeAbsence,
    DemandeConge, Notification, SoldeConge, TypePiece, Compte
)
import json
import random

# ==================== SYSTÈME D'ACTIVATION 1: NOUVEL AGENT (AVEC EMAIL) ====================

@csrf_exempt
@require_http_methods(["POST"])
def register(request):
    """Inscription d'un nouvel agent (sans mot de passe requis) avec envoi d'email"""
    print("=== REGISTER CALLED ===")
    try:
        data = json.loads(request.body)
        print("Données reçues:", data)
        
        if Agent.objects.filter(matricule=data.get('matricule')).exists():
            return JsonResponse({'error': 'Ce matricule existe déjà'}, status=400)
        
        if Agent.objects.filter(email=data.get('email')).exists():
            return JsonResponse({'error': 'Cet email existe déjà'}, status=400)
        
        required_fields = ['matricule', 'nom', 'prenom', 'email', 'telephone']
        for field in required_fields:
            if not data.get(field):
                return JsonResponse({'error': f'Le champ {field} est requis'}, status=400)
        
        date_prise_service_str = data.get('date_prise_service')
        if not date_prise_service_str:
            date_prise_service = datetime.strptime('2024-01-01', '%Y-%m-%d').date()
        else:
            try:
                date_prise_service = datetime.strptime(date_prise_service_str, '%Y-%m-%d').date()
            except ValueError:
                return JsonResponse({'error': 'Format de date invalide'}, status=400)
        
        adresse = data.get('adresse') or 'À renseigner'
        poste = data.get('poste') or 'Agent'
        direction = data.get('direction') or 'À renseigner'
        typecontrat = data.get('typecontrat') or 'APE'
        
        if typecontrat not in ['APE', 'ACDPE']:
            return JsonResponse({'error': 'Type de contrat invalide'}, status=400)
        
        agent = Agent.objects.create(
            matricule=data.get('matricule'),
            nom=data.get('nom'),
            prenom=data.get('prenom'),
            email=data.get('email'),
            telephone=data.get('telephone'),
            date_prise_service=date_prise_service,
            adresse=adresse,
            poste=poste,
            direction=direction,
            typecontrat=typecontrat,
            actif=0
        )
        print(f"Agent créé avec ID: {agent.id}")
        
        role_agent, _ = Role.objects.get_or_create(libelle='agent')
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO agent_role (agent_id, role_id) VALUES (%s, %s)",
                [agent.id, role_agent.id]
            )
        
        activation_link = f"http://localhost:5173/activate?matricule={agent.matricule}"
        
        try:
            context = {
                'prenom': agent.prenom,
                'nom': agent.nom,
                'matricule': agent.matricule,
                'email': agent.email,
                'activation_link': activation_link,
            }
            html_message = render_to_string('emails/activation_email.html', context)
            plain_message = strip_tags(html_message)
            
            send_mail(
                subject='🔐 Activation de votre compte MND',
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[agent.email],
                html_message=html_message,
                fail_silently=False,
            )
            print(f"✅ Email envoyé à {agent.email}")
        except Exception as e:
            print(f"❌ Erreur envoi email: {e}")
        
        return JsonResponse({
            'success': True,
            'message': 'Agent ajouté avec succès',
            'id': agent.id,
            'matricule': agent.matricule,
            'activation_link': activation_link
        })
        
    except json.JSONDecodeError as e:
        return JsonResponse({'error': 'Données JSON invalides'}, status=400)
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def activate_account_via_email(request):
    """Activation de compte via le lien reçu par email (pour les nouveaux inscrits)"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        password = data.get('password')
        
        if not matricule or not password:
            return JsonResponse({'error': 'Matricule et mot de passe requis'}, status=400)
        
        if len(password) < 6:
            return JsonResponse({'error': 'Le mot de passe doit contenir au moins 6 caractères'}, status=400)
        
        try:
            agent = Agent.objects.get(matricule=matricule)
            
            if agent.actif == 1:
                return JsonResponse({'error': 'Compte déjà activé'}, status=400)
            
            # Créer le compte dans la table Compte
            compte, created = Compte.objects.get_or_create(
                agent=agent,
                defaults={
                    'login': matricule,
                    'mot_de_passe': make_password(password),
                    'dateactivation': date.today()
                }
            )
            
            if not created:
                compte.mot_de_passe = make_password(password)
                compte.dateactivation = date.today()
                compte.save()
            
            agent.actif = 1
            agent.save()
            
            return JsonResponse({
                'success': True, 
                'message': 'Compte activé avec succès ! Vous pouvez maintenant vous connecter.'
            })
            
        except Agent.DoesNotExist:
            return JsonResponse({
                'error': 'Matricule invalide. Veuillez contacter l\'administrateur.'
            }, status=404)
            
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

# ==================== SYSTÈME D'ACTIVATION 2: AGENT EXISTANT (IMPORTÉ PAR RH) ====================

@csrf_exempt
@require_http_methods(["POST"])
def activate_agent_account(request):
    """Activer le compte d'un agent existant (importé par RH)"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        password = data.get('password')
        
        if not matricule or not password:
            return JsonResponse({'error': 'Matricule et mot de passe requis'}, status=400)
        
        if len(password) < 6:
            return JsonResponse({'error': 'Le mot de passe doit contenir au moins 6 caractères'}, status=400)
        
        try:
            agent = Agent.objects.get(matricule=matricule)
            
            if agent.actif == 1:
                return JsonResponse({'error': 'Compte déjà activé'}, status=400)
            
            # Créer ou mettre à jour le compte dans la table Compte
            compte, created = Compte.objects.get_or_create(
                agent=agent,
                defaults={
                    'login': matricule,
                    'mot_de_passe': make_password(password),
                    'dateactivation': date.today()
                }
            )
            
            if not created:
                # Mettre à jour le mot de passe si le compte existe déjà
                compte.mot_de_passe = make_password(password)
                compte.dateactivation = date.today()
                compte.save()
            
            # Activer l'agent
            agent.actif = 1
            agent.save()
            
            return JsonResponse({
                'success': True, 
                'message': 'Compte activé avec succès'
            })
            
        except Agent.DoesNotExist:
            return JsonResponse({
                'error': 'Matricule non trouvé dans la base de données. Veuillez contacter les RH.'
            }, status=404)
            
    except Exception as e:
        print(f"Erreur activate_agent_account: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)
    
# ==================== AUTHENTIFICATION ====================
@csrf_exempt
@require_http_methods(["POST"])
def login(request):
    """Connexion d'un agent"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        password = data.get('password')
        
        if not matricule:
            return JsonResponse({'error': 'Matricule requis'}, status=400)
        if not password:
            return JsonResponse({'error': 'Mot de passe requis'}, status=400)
        
        # Chercher l'agent par matricule
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Matricule incorrect'}, status=401)
        
        # Vérifier si l'agent est actif
        if not agent.actif:
            return JsonResponse({'error': 'Compte désactivé'}, status=401)
        
        # Chercher le compte associé à l'agent (c'est là qu'est le mot de passe)
        try:
            compte = Compte.objects.get(agent=agent)
        except Compte.DoesNotExist:
            return JsonResponse({'error': 'Compte non trouvé. Veuillez contacter l\'administrateur.'}, status=401)
        
        # Vérifier le mot de passe
        if check_password(password, compte.mot_de_passe):
            # Récupérer les rôles de l'agent
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT r.libelle 
                    FROM agent_role ar
                    JOIN role r ON ar.role_id = r.id
                    WHERE ar.agent_id = %s
                """, [agent.matricule])  # Note: agent.matricule est la clé primaire
                roles = [row[0] for row in cursor.fetchall()]
            
            # Déterminer le rôle principal
            if 'admin' in roles:
                user_role = 'admin'
            elif 'chef' in roles:
                user_role = 'chef'
            elif 'rh' in roles:
                user_role = 'rh'
            else:
                user_role = 'agent'
            
            return JsonResponse({
                'success': True,
                'id': agent.matricule,  # Utiliser matricule comme id
                'matricule': agent.matricule,
                'nom': agent.nom,
                'prenom': agent.prenom,
                'email': agent.email,
                'telephone': agent.telephone,
                'poste': agent.poste,
                'direction': agent.direction,
                'typecontrat': agent.typecontrat,
                'actif': agent.actif,
                'roles': roles,
                'role': user_role
            })
        else:
            return JsonResponse({'error': 'Mot de passe incorrect'}, status=401)
            
    except Exception as e:
        print(f"Erreur login: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

# ==================== GESTION DES AGENTS ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_all_agents(request):
    """Récupérer tous les agents avec leurs rôles et leur direction"""
    try:
        agents = Agent.objects.all()
        result = []
        for agent in agents:
            # Utilisez agent.matricule (clé primaire) au lieu de agent.id
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT r.id, r.libelle 
                    FROM agent_role ar
                    JOIN role r ON ar.role_id = r.id
                    WHERE ar.agent_id = %s
                """, [agent.matricule])  # ✅ Changement important ici
                roles = cursor.fetchall()
            
            result.append({
                'id': agent.matricule,  # Utilisez matricule comme identifiant
                'matricule': agent.matricule,
                'nom': agent.nom,
                'prenom': agent.prenom,
                'email': agent.email,
                'telephone': agent.telephone,
                'direction': agent.direction or 'À renseigner',
                'poste': agent.poste,
                'actif': agent.actif,
                'roles': [{'id': r[0], 'libelle': r[1]} for r in roles]
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
        print(f"Erreur get_all_agents: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_stats(request):
    """Récupérer les statistiques"""
    try:
        return JsonResponse({
            'total_agents': Agent.objects.count(),
            'agents_actifs': Agent.objects.filter(actif=1).count(),
            'total_roles': Role.objects.count(),
            'total_types_demande': TypeDemande.objects.count(),
            'total_types_piece': TypePiece.objects.count(),
            'total_demandes': Demande.objects.count()
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def import_agents(request):
    """Importer plusieurs agents en une seule requête"""
    try:
        data = json.loads(request.body)
        agents_data = data.get('agents', [])
        
        success_count = 0
        error_count = 0
        errors = []
        
        role_agent, _ = Role.objects.get_or_create(libelle='agent')
        
        for agent_data in agents_data:
            try:
                # Vérifier si l'agent existe déjà
                if Agent.objects.filter(matricule=agent_data.get('matricule')).exists():
                    error_count += 1
                    errors.append(f"{agent_data.get('matricule')}: Matricule existe déjà")
                    continue
                
                if Agent.objects.filter(email=agent_data.get('email')).exists():
                    error_count += 1
                    errors.append(f"{agent_data.get('matricule')}: Email existe déjà")
                    continue
                
                # Convertir la date de prise de service
                date_prise_service = agent_data.get('date_prise_service', '2024-01-01')
                if isinstance(date_prise_service, str):
                    try:
                        date_prise_service = datetime.strptime(date_prise_service, '%Y-%m-%d').date()
                    except ValueError:
                        date_prise_service = datetime.strptime('2024-01-01', '%Y-%m-%d').date()
                
                # Convertir la date de naissance
                date_naissance = agent_data.get('date_naissance')
                if date_naissance and isinstance(date_naissance, str):
                    try:
                        # Essayer différents formats de date
                        if '/' in date_naissance:
                            date_naissance = datetime.strptime(date_naissance, '%d/%m/%Y').date()
                        else:
                            date_naissance = datetime.strptime(date_naissance, '%Y-%m-%d').date()
                    except ValueError:
                        date_naissance = None
                else:
                    date_naissance = None
                
                # Créer l'agent avec TOUS les champs
                agent = Agent.objects.create(
                    matricule=agent_data.get('matricule'),
                    nom=agent_data.get('nom'),
                    prenom=agent_data.get('prenom'),
                    email=agent_data.get('email'),
                    telephone=agent_data.get('telephone', ''),
                    adresse=agent_data.get('adresse', 'À renseigner'),
                    direction=agent_data.get('direction', 'À renseigner'),
                    typecontrat=agent_data.get('typecontrat', 'APE'),
                    poste=agent_data.get('poste', 'Agent'),
                    date_prise_service=date_prise_service,
                    date_naissance=date_naissance,  # ✅ Ajouté
                    corps=agent_data.get('corps', ''),  # ✅ Ajouté
                    echelon=agent_data.get('grade') or agent_data.get('Grade') or agent_data.get('echelon') or '', # ✅ Ajouté (grade -> echelon)
                    actif=0  # Désactivé par défaut
                )
                print(f"✅ Agent créé: {agent.matricule} - {agent.nom} {agent.prenom}")
                
                # Assigner le rôle agent
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO agent_role (agent_id, role_id) VALUES (%s, %s)",
                        [agent.matricule, role_agent.id]
                    )
                
                # Envoyer l'email d'activation
                activation_link = f"http://localhost:5173/activate?matricule={agent.matricule}"
                try:
                    context = {
                        'prenom': agent.prenom,
                        'nom': agent.nom,
                        'matricule': agent.matricule,
                        'email': agent.email,
                        'activation_link': activation_link,
                    }
                    html_message = render_to_string('emails/activation_email.html', context)
                    plain_message = strip_tags(html_message)
                    
                    send_mail(
                        subject='🔐 Activation de votre compte MND',
                        message=plain_message,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[agent.email],
                        html_message=html_message,
                        fail_silently=False,
                    )
                    print(f"✅ Email envoyé à {agent.email}")
                except Exception as email_error:
                    print(f"❌ Erreur email pour {agent.email}: {email_error}")
                    errors.append(f"{agent.matricule}: Email non envoyé - {str(email_error)}")
                
                success_count += 1
                
            except Exception as e:
                error_count += 1
                errors.append(f"{agent_data.get('matricule', '?')}: {str(e)}")
                print(f"❌ Erreur import agent {agent_data.get('matricule', '?')}: {str(e)}")
        
        return JsonResponse({
            'success': True,
            'success_count': success_count,
            'error_count': error_count,
            'errors': errors[:10]
        })
        
    except Exception as e:
        print(f"Erreur import_agents: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)
    
# ==================== GESTION DES RÔLES ====================

@csrf_exempt
@require_http_methods(["POST"])
def add_role(request):
    """Ajouter un nouveau rôle"""
    try:
        data = json.loads(request.body)
        libelle = data.get('libelle')
        
        if Role.objects.filter(libelle=libelle).exists():
            return JsonResponse({'error': 'Ce rôle existe déjà'}, status=400)
        
        role = Role.objects.create(libelle=libelle)
        return JsonResponse({'success': True, 'id': role.id, 'libelle': role.libelle})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_role(request, role_id):
    """Supprimer un rôle"""
    try:
        role = Role.objects.get(id=role_id)
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM agent_role WHERE role_id = %s", [role_id])
            count = cursor.fetchone()[0]
        
        if count > 0:
            return JsonResponse({'error': 'Des agents ont encore ce rôle'}, status=400)
        
        role.delete()
        return JsonResponse({'success': True})
    except Role.DoesNotExist:
        return JsonResponse({'error': 'Rôle non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_all_roles(request):
    """Récupérer tous les rôles"""
    try:
        roles = Role.objects.all()
        result = [{'id': r.id, 'libelle': r.libelle} for r in roles]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def update_agent_role(request, agent_id):
    """Modifier le rôle d'un agent"""
    try:
        data = json.loads(request.body)
        role_id = data.get('role_id')
        
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM agent_role WHERE agent_id = %s", [agent_id])
            cursor.execute("INSERT INTO agent_role (agent_id, role_id) VALUES (%s, %s)", [agent_id, role_id])
        
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def get_agent_by_matricule(request, matricule):
    print(f"=== GET_AGENT_BY_MATRICULE called for: {matricule}")
    try:
        agent = Agent.objects.get(matricule=matricule)

        if request.method == "PUT":
            data = json.loads(request.body)
            agent.nom = data.get('nom', agent.nom)
            agent.prenom = data.get('prenom', agent.prenom)
            agent.email = data.get('email', agent.email)
            agent.telephone = data.get('telephone', agent.telephone)
            agent.poste = data.get('poste', agent.poste)
            agent.direction = data.get('direction', agent.direction)
            agent.adresse = data.get('adresse', agent.adresse)
            agent.corps = data.get('corps', agent.corps)
            agent.echelon = data.get('echelon', agent.echelon)

            typecontrat = data.get('typecontrat')
            if typecontrat:
                agent.typecontrat = typecontrat

            date_prise_service = data.get('date_prise_service')
            if date_prise_service:
                agent.date_prise_service = datetime.strptime(date_prise_service, '%Y-%m-%d').date()
            
            date_naissance = data.get('date_naissance')
            if date_naissance:
                agent.date_naissance = datetime.strptime(date_naissance, '%Y-%m-%d').date()

            agent.save()
            return JsonResponse({'success': True})

        print(f"Agent trouvé: {agent.nom} {agent.prenom}")
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT r.libelle 
                FROM agent_role ar
                JOIN role r ON ar.role_id = r.id
                WHERE ar.agent_id = %s
            """, [agent.matricule])  # ✅ Corrigé: utilise matricule au lieu de id
            roles = cursor.fetchall()
        
        return JsonResponse({
            'matricule': agent.matricule,
            'nom': agent.nom,
            'prenom': agent.prenom,
            'email': agent.email,
            'telephone': agent.telephone,
            'poste': agent.poste,
            'direction': agent.direction,
            'typecontrat': agent.typecontrat,
            'date_prise_service': str(agent.date_prise_service) if agent.date_prise_service else '',
            'date_naissance': str(agent.date_naissance) if agent.date_naissance else '',
            'adresse': agent.adresse or '',
            'corps': agent.corps or '',
            'echelon': agent.echelon or '',
            'actif': agent.actif,
            'roles': [r[0] for r in roles]
        })
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur get_agent_by_matricule: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

# ==================== GESTION DES CONGÉS (M2) ====================

@csrf_exempt
@require_http_methods(["POST"])
def demande_conge(request):
    """Agent soumet une demande de congé avec vérification complète d'éligibilité"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        
        agent = Agent.objects.get(matricule=matricule)
        
        date_debut = datetime.strptime(data.get('date_debut'), '%Y-%m-%d').date()
        date_fin = datetime.strptime(data.get('date_fin'), '%Y-%m-%d').date()
        nombre_jours = (date_fin - date_debut).days + 1
        
        # Vérification 1 : Ancienneté (1 an minimum)
        if agent.date_prise_service:
            anciennete_jours = (datetime.now().date() - agent.date_prise_service).days
            if anciennete_jours < 365:
                return JsonResponse({
                    'error': f'Ancienneté insuffisante. Vous devez avoir au moins 1 an de service.'
                }, status=400)
        
        # Vérification 2 : Maximum 2 demandes par an
        annee_courante = datetime.now().year
        nb_demandes_annee = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            date_soumission__year=annee_courante
        ).count()
        
        if nb_demandes_annee >= 2:
            return JsonResponse({
                'error': f'Vous avez déjà effectué {nb_demandes_annee} demande(s) de congé cette année. Maximum 2 demandes par an.'
            }, status=400)
        
        # Vérification 3 : Solde suffisant
        solde, _ = SoldeConge.objects.get_or_create(
            agent=agent,
            annee=annee_courante,
            defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
        )
        
        if nombre_jours > solde.jours_restants:
            return JsonResponse({
                'error': f'Solde insuffisant. Vous avez {solde.jours_restants} jours restants, vous demandez {nombre_jours} jours.'
            }, status=400)
        
        # Vérification 4 : Pas plus de 30 jours consécutifs
        if nombre_jours > 30:
            return JsonResponse({
                'error': 'La durée maximale d\'un congé est de 30 jours consécutifs.'
            }, status=400)
        
        # Vérification 5 : Pas de chevauchement
        chevauchement = DemandeConge.objects.filter(
            demande__agent=agent,
            date_debut__lte=date_fin,
            date_fin__gte=date_debut,
            demande__statut__in=['en_attente_chef', 'valide']
        ).exists()
        
        if chevauchement:
            return JsonResponse({
                'error': 'Vous avez déjà une demande de congé sur cette période.'
            }, status=400)
        
        try:
            type_demande = TypeDemande.objects.get(libelle='Congé')
        except TypeDemande.DoesNotExist:
            return JsonResponse({
                'error': 'Le type de demande "Congé" n\'a pas été configuré par l\'administrateur.'
            }, status=500)
        
        demande = Demande.objects.create(
            agent=agent,
            type_demande=type_demande,
            statut='en_attente_chef',
            date_soumission=datetime.now().date(),
            numero_suivi=f"CONGE-{datetime.now().strftime('%Y%m%d%H%M%S')}-{agent.matricule}"
        )
        
        conge = DemandeConge.objects.create(
            demande=demande,
            date_debut=date_debut,
            date_fin=date_fin,
            nombrejours=nombre_jours
        )
        
        role_chef = Role.objects.get(libelle__iexact='chef')
        chef_direction = (agent.direction or '').strip()
        chef = Agent.objects.filter(
            direction__iexact=chef_direction,
            agentrole__role=role_chef,
            actif=1
        ).first()
        
        if chef:
            Notification.objects.create(
                agent_id=chef.id,
                message=f"Nouvelle demande de congé de {agent.prenom} {agent.nom} ({nombre_jours} jours)",
                type_notification='demande_conge',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        return JsonResponse({
            'success': True,
            'numero_suivi': demande.numero_suivi,
            'message': f'Demande de {nombre_jours} jours envoyée pour validation',
            'jours_restants_apres': solde.jours_restants - nombre_jours
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR demande_conge: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def mes_demandes_conge(request, matricule):
    """Agent consulte ses demandes de congé"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        
        # Correction : type_demande au lieu de typedemande
        demandes = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé'  # ← ICI : type_demande, pas typedemande
        ).order_by('-date_soumission')
        
        result = []
        for d in demandes:
            try:
                if hasattr(d, 'demandeconge'):
                    result.append({
                        'id': d.id,
                        'numero_suivi': d.numerosuivi,
                        'date_debut': str(d.demandeconge.date_debut),
                        'date_fin': str(d.demandeconge.date_fin),
                        'nombre_jours': d.demandeconge.nombrejours,
                        'statut': d.statut,
                        'date_soumission': str(d.date_soumission)
                    })
            except Exception as e:
                print(f"Erreur sur demande {d.id}: {e}")
                continue
        
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur mes_demandes_conge: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)
    
@csrf_exempt
@require_http_methods(["GET"])
def demandes_direction(request, matricule_chef):
    """Chef consulte les demandes de sa direction"""
    try:
        print(f"=== demandes_direction called for chef: {matricule_chef}")
        
        chef = Agent.objects.get(matricule=matricule_chef)
        
        role_chef = Role.objects.get(libelle__iexact='chef')
        if not AgentRole.objects.filter(agent=chef, role=role_chef).exists():
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        chef_direction = (chef.direction or '').strip()
        demandes = Demande.objects.filter(
            agent__direction__iexact=chef_direction,
            statut='en_attente_chef'
        ).select_related('agent', 'type_demande', 'demandeconge', 'demandeabsence')
        
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            nombre_jours = None

            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
                nombre_jours = d.demandeconge.nombrejours
            elif hasattr(d, 'demandeabsence') and d.demandeabsence:
                date_debut = str(d.demandeabsence.date_debut)
                date_fin = str(d.demandeabsence.date_fin)
                nombre_jours = d.demandeabsence.nombrejours

            if date_debut is None or date_fin is None:
                continue

            result.append({
                'id': d.id,
                'agent': f"{d.agent.prenom} {d.agent.nom}",
                'matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle,
                'date_debut': date_debut,
                'date_fin': date_fin,
                'nombre_jours': nombre_jours,
                'date_soumission': str(d.date_soumission),
                'numero_suivi': d.numerosuivi
            })
        
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': f'Agent {matricule_chef} non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def valider_demande_conge(request, demande_id):
    """Chef valide ou rejette une demande de congé ou d'absence"""
    try:
        data = json.loads(request.body)
        matricule_chef = data.get('matricule_chef')
        decision = data.get('decision')
        commentaire = data.get('commentaire', '')
        
        chef = Agent.objects.get(matricule=matricule_chef)
        demande = Demande.objects.get(id=demande_id)
        
        if (chef.direction or '').strip().lower() != (demande.agent.direction or '').strip().lower():
            return JsonResponse({'error': 'Vous ne pouvez pas valider cette demande'}, status=403)
        
        if decision == 'valide':
            demande.statut = 'valide'
            
            if hasattr(demande, 'demandeconge') and demande.demandeconge:
                annee = datetime.now().year
                solde, _ = SoldeConge.objects.get_or_create(
                    agent=demande.agent,
                    annee=annee,
                    defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
                )
                solde.jours_pris = (solde.jours_pris or 0) + demande.demandeconge.nombrejours
                solde.jours_restants = (solde.jours_acquis or 30) - solde.jours_pris
                solde.save()
        else:
            demande.statut = 'refuse'
        
        demande.commentaire_chef = commentaire
        demande.save()
        
        Notification.objects.create(
            agent_id=demande.agent.id,
            message=f"Votre demande de congé a été {decision}e",
            type_notification='validation_conge',
            date_envoi=datetime.now().date(),
            lue=0
        )
        
        return JsonResponse({'success': True, 'message': f'Demande {decision}e'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== TYPES DE DEMANDE ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_types_demande(request):
    """Récupérer tous les types de demande"""
    try:
        types = TypeDemande.objects.all()
        result = [{'id': t.id, 'libelle': t.libelle, 'duree_traitement_moyenne': t.duree_traitement_moyenne, 'acte_generable': t.acte_generable} for t in types]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def add_type_demande(request):
    """Ajouter un type de demande"""
    try:
        data = json.loads(request.body)
        type_demande = TypeDemande.objects.create(
            libelle=data.get('libelle'),
            duree_traitement_moyenne=data.get('duree_traitement_moyenne'),
            acte_generable=data.get('acte_generable', 0)
        )
        return JsonResponse({'success': True, 'id': type_demande.id})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_type_demande(request, type_id):
    """Supprimer un type de demande"""
    try:
        type_demande = TypeDemande.objects.get(id=type_id)
        type_demande.delete()
        return JsonResponse({'success': True})
    except TypeDemande.DoesNotExist:
        return JsonResponse({'error': 'Type non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def edit_type_demande(request, type_id):
    """Modifier un type de demande"""
    try:
        data = json.loads(request.body)
        type_demande = TypeDemande.objects.get(id=type_id)
        type_demande.libelle = data.get('libelle')
        type_demande.duree_traitement_moyenne = data.get('duree_traitement_moyenne')
        type_demande.acte_generable = data.get('acte_generable', 0)
        type_demande.save()
        return JsonResponse({'success': True})
    except TypeDemande.DoesNotExist:
        return JsonResponse({'error': 'Type non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== TYPES DE PIÈCE ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_types_piece(request):
    """Récupérer tous les types de pièce"""
    try:
        types = TypePiece.objects.all()
        result = [{
            'id': t.id,
            'libelle': t.libelle,
            'obligatoire': t.obligatoire or 0,
            'duree_validite': t.duree_validite
        } for t in types]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def add_type_piece(request):
    """Ajouter un type de pièce"""
    try:
        data = json.loads(request.body)
        type_piece = TypePiece.objects.create(
            libelle=data.get('libelle'),
            obligatoire=data.get('obligatoire', 0),
            duree_validite=data.get('duree_validite', '')
        )
        return JsonResponse({'success': True, 'id': type_piece.id})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_type_piece(request, type_id):
    """Supprimer un type de pièce"""
    try:
        type_piece = TypePiece.objects.get(id=type_id)
        type_piece.delete()
        return JsonResponse({'success': True})
    except TypePiece.DoesNotExist:
        return JsonResponse({'error': 'Type de pièce non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def edit_type_piece(request, type_id):
    """Modifier un type de pièce"""
    try:
        data = json.loads(request.body)
        type_piece = TypePiece.objects.get(id=type_id)
        type_piece.libelle = data.get('libelle')
        type_piece.obligatoire = data.get('obligatoire', 0)
        type_piece.duree_validite = data.get('duree_validite', '')
        type_piece.save()
        return JsonResponse({'success': True})
    except TypePiece.DoesNotExist:
        return JsonResponse({'error': 'Type de pièce non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== SOLDE CONGÉ ====================

@csrf_exempt
@require_http_methods(["GET"])
def solde_conge(request, matricule):
    """Agent consulte son solde de congés"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        annee = datetime.now().year
        
        # Correction : type_demande au lieu de typedemande
        demandes_validees = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',  # ← ICI : type_demande
            statut='valide',
            date_soumission__year=annee
        )
        
        jours_pris = 0
        for d in demandes_validees:
            try:
                if hasattr(d, 'demandeconge'):
                    jours_pris += d.demandeconge.nombrejours
            except:
                pass
        
        # Récupérer ou créer le solde
        solde, created = SoldeConge.objects.get_or_create(
            agent=agent,
            annee=annee,
            defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
        )
        
        solde.jours_pris = jours_pris
        solde.jours_restants = (solde.jours_acquis or 30) - jours_pris
        solde.save()
        
        return JsonResponse({
            'annee': annee,
            'jours_acquis': solde.jours_acquis or 30,
            'jours_pris': jours_pris,
            'jours_restants': solde.jours_restants
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur solde_conge: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)
# ==================== NOTIFICATIONS ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_notifications(request, matricule):
    """Récupérer les notifications d'un agent"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        notifications = Notification.objects.filter(agent_id=agent.id).order_by('-date_envoi')[:10]
        result = [{
            'id': n.id,
            'message': n.message,
            'type': n.type_notification,
            'date_envoi': n.date_envoi,
            'lue': n.lue == 1
        } for n in notifications]
        return JsonResponse(result, safe=False)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def marquer_notification_lue(request, notification_id):
    """Marquer une notification comme lue"""
    try:
        notification = Notification.objects.get(id=notification_id)
        notification.lue = 1
        notification.save()
        return JsonResponse({'success': True})
    except Notification.DoesNotExist:
        return JsonResponse({'error': 'Notification non trouvée'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def marquer_toutes_notifications_lues(request, matricule):
    """Marquer toutes les notifications d'un agent comme lues"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        updated = Notification.objects.filter(agent_id=agent.id, lue=0).update(lue=1)
        return JsonResponse({'success': True, 'updated': updated})
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def update_agent_role_by_matricule(request, matricule):
    """Modifier le rôle d'un agent en utilisant son matricule"""
    try:
        data = json.loads(request.body)
        role_id = data.get('role_id')
        
        # Récupérer l'agent par son matricule
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Agent non trouvé'}, status=404)
        
        # Mettre à jour le rôle (remplace tous les rôles)
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM agent_role WHERE agent_id = %s", [agent.matricule])
            cursor.execute("INSERT INTO agent_role (agent_id, role_id) VALUES (%s, %s)", 
                          [agent.matricule, role_id])
        
        return JsonResponse({'success': True})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def demande_absence(request):
    """Agent soumet une demande d'absence exceptionnelle"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        date_debut_str = data.get('date_debut')
        date_fin_str = data.get('date_fin')
        motif = data.get('motif', '')
        
        if not date_debut_str or not date_fin_str:
            return JsonResponse({'error': 'Veuillez renseigner les dates'}, status=400)
        
        agent = Agent.objects.get(matricule=matricule)
        
        date_debut = datetime.strptime(date_debut_str, '%Y-%m-%d').date()
        date_fin = datetime.strptime(date_fin_str, '%Y-%m-%d').date()
        
        if date_debut > date_fin:
            return JsonResponse({'error': 'La date de début doit être antérieure'}, status=400)
        
        nombre_jours = (date_fin - date_debut).days + 1
        annee_courante = datetime.now().year
        
        # Calculer le total des jours déjà consommés et validés
        total_consommes = Demande.objects.filter(
            agent=agent,
            annee=annee_courante,
            type_demande__libelle='Absence',
            statut='valide'
        ).aggregate(total=models.Sum('jours_consommes'))['total'] or 0
        
        nouveau_total = total_consommes + nombre_jours
        
        if nouveau_total > 10:
            jours_restants = 10 - total_consommes
            return JsonResponse({
                'error': f'Maximum 10 jours par an. Il vous reste {jours_restants} jours.'
            }, status=400)
        
        # Récupérer ou créer le type de demande
        type_demande_obj, _ = TypeDemande.objects.get_or_create(
            libelle='Absence',
            defaults={'acte_generable': 0}
        )
        
        # Créer la demande avec les colonnes remplies
        numero_suivi = f"ABS-{datetime.now().strftime('%Y%m%d%H%M%S')}-{agent.matricule}"
        
        demande = Demande.objects.create(
            agent=agent,
            type_demande=type_demande_obj,
            statut='en_attente_chef',
            date_soumission=datetime.now().date(),
            numerosuivi=numero_suivi,
            # ✅ Remplir les nouvelles colonnes
            jours_consommes=nombre_jours,
            jours_restants=10 - nouveau_total,
            annee=annee_courante
        )
        
        # Créer l'absence
        absence = DemandeAbsence.objects.create(
            demande=demande,
            date_debut=date_debut,
            date_fin=date_fin,
            nombrejours=nombre_jours,
            motif=motif
        )
        
        return JsonResponse({
            'success': True,
            'numero_suivi': demande.numerosuivi,
            'message': f'Demande envoyée',
            'jours_consommes': demande.jours_consommes,
            'jours_restants': demande.jours_restants
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR demande_absence: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def total_absences_annee(request, matricule):
    """Récupérer le total des absences exceptionnelles de l'année"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        annee_courante = datetime.now().year
        
        # Récupérer depuis les colonnes jours_consommes
        total = Demande.objects.filter(
            agent=agent,
            annee=annee_courante,
            type_demande__libelle='Absence',
            statut='valide'
        ).aggregate(total=models.Sum('jours_consommes'))['total'] or 0
        
        return JsonResponse({'total': total, 'max': 10})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def valider_demande_absence(request, demande_id):
    """Chef valide ou rejette une demande d'absence"""
    try:
        data = json.loads(request.body)
        decision = data.get('decision')
        
        demande = Demande.objects.get(id=demande_id)
        
        if decision == 'valide':
            demande.statut = 'valide'
            # Les colonnes sont déjà remplies, rien à faire de plus
        else:
            demande.statut = 'refuse'
        
        demande.save()
        
        return JsonResponse({'success': True})
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)