from django.contrib.auth.hashers import make_password, check_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.db import connection
from django.db import models
from django.db.models import Sum
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from datetime import datetime, date, timedelta
from .models import (
    Agent, Role, AgentRole, Permission, RolePermission, TypeDemande, Demande, DemandeAbsence,
    DemandeConge, Notification, SoldeConge, TypePiece, Compte, DossierAgent, Piece, ActeAdministratif
)
import json
import random
import base64
import re

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
        print(f"Agent créé avec Matricule: {agent.matricule}")
        
        role_agent, _ = Role.objects.get_or_create(libelle='agent')
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO agent_role (agent_id, role_id) VALUES (%s, %s)",
                [agent.matricule, role_agent.id]
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
            'id': agent.matricule,
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
        
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Matricule incorrect'}, status=401)
        
        if not agent.actif:
            return JsonResponse({'error': 'Compte désactivé'}, status=401)
        
        try:
            compte = Compte.objects.get(agent=agent)
        except Compte.DoesNotExist:
            return JsonResponse({'error': 'Compte non trouvé. Veuillez contacter l\'administrateur.'}, status=401)
        
        if check_password(password, compte.mot_de_passe):
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT r.libelle 
                    FROM agent_role ar
                    JOIN role r ON ar.role_id = r.id
                    WHERE ar.agent_id = %s
                """, [agent.matricule])
                roles = [row[0] for row in cursor.fetchall()]
            
            print(f"Rôles trouvés pour {matricule}: {roles}")
            
            # Déterminer le rôle principal
            if 'admin' in roles:
                user_role = 'admin'
            elif 'dpaf' in roles:
                user_role = 'dpaf'
            elif 'rh/secretaire' in roles or 'rh/secrétaire' in roles:
                user_role = 'rh/secretaire'
            elif 'chef' in roles:
                user_role = 'chef'
            elif 'rh' in roles:
                user_role = 'rh'
            elif 'secretaire' in roles or 'secrétaire' in roles:
                user_role = 'secretaire'
            else:
                user_role = 'agent'
            
            print(f"Rôle principal déterminé: {user_role}")
            
            return JsonResponse({
                'success': True,
                'id': agent.matricule,
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
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT r.id, r.libelle 
                    FROM agent_role ar
                    JOIN role r ON ar.role_id = r.id
                    WHERE ar.agent_id = %s
                """, [agent.matricule])
                roles = cursor.fetchall()
            
            result.append({
                'id': agent.matricule,
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
                if Agent.objects.filter(matricule=agent_data.get('matricule')).exists():
                    error_count += 1
                    errors.append(f"{agent_data.get('matricule')}: Matricule existe déjà")
                    continue
                
                if Agent.objects.filter(email=agent_data.get('email')).exists():
                    error_count += 1
                    errors.append(f"{agent_data.get('matricule')}: Email existe déjà")
                    continue
                
                date_prise_service = agent_data.get('date_prise_service', '2024-01-01')
                if isinstance(date_prise_service, str):
                    try:
                        date_prise_service = datetime.strptime(date_prise_service, '%Y-%m-%d').date()
                    except ValueError:
                        date_prise_service = datetime.strptime('2024-01-01', '%Y-%m-%d').date()
                
                date_naissance = agent_data.get('date_naissance')
                if date_naissance and isinstance(date_naissance, str):
                    try:
                        if '/' in date_naissance:
                            date_naissance = datetime.strptime(date_naissance, '%d/%m/%Y').date()
                        else:
                            date_naissance = datetime.strptime(date_naissance, '%Y-%m-%d').date()
                    except ValueError:
                        date_naissance = None
                else:
                    date_naissance = None
                
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
                    date_naissance=date_naissance,
                    corps=agent_data.get('corps', ''),
                    echelon=agent_data.get('grade') or agent_data.get('Grade') or agent_data.get('echelon') or '',
                    actif=0
                )
                print(f"✅ Agent créé: {agent.matricule} - {agent.nom} {agent.prenom}")
                
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO agent_role (agent_id, role_id) VALUES (%s, %s)",
                        [agent.matricule, role_agent.id]
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
            """, [agent.matricule])
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


# ==================== GESTION DES CONGÉS ====================

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
        
        if agent.date_prise_service:
            anciennete_jours = (datetime.now().date() - agent.date_prise_service).days
            if anciennete_jours < 365:
                return JsonResponse({
                    'error': f'Ancienneté insuffisante. Vous devez avoir au moins 1 an de service.'
                }, status=400)
        
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
        
        solde, _ = SoldeConge.objects.get_or_create(
            agent=agent,
            annee=annee_courante,
            defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
        )
        
        if nombre_jours > solde.jours_restants:
            return JsonResponse({
                'error': f'Solde insuffisant. Vous avez {solde.jours_restants} jours restants, vous demandez {nombre_jours} jours.'
            }, status=400)
        
        if nombre_jours > 30:
            return JsonResponse({
                'error': 'La durée maximale d\'un congé est de 30 jours consécutifs.'
            }, status=400)
        
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
                agent_id=chef.matricule,
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


# ==================== GESTION DES ABSENCES ====================

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
        
        type_demande_obj, _ = TypeDemande.objects.get_or_create(
            libelle='Absence',
            defaults={'acte_generable': 0}
        )
        
        numero_suivi = f"ABS-{datetime.now().strftime('%Y%m%d%H%M%S')}-{agent.matricule}"
        
        demande = Demande.objects.create(
            agent=agent,
            type_demande=type_demande_obj,
            statut='en_attente_chef',
            date_soumission=datetime.now().date(),
            numerosuivi=numero_suivi,
            jours_consommes=nombre_jours,
            jours_restants=10 - nouveau_total,
            annee=annee_courante
        )
        
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
        else:
            demande.statut = 'refuse'
        
        demande.save()
        
        return JsonResponse({'success': True})
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== DEMANDES POUR CHEF ====================

@csrf_exempt
@require_http_methods(["GET"])
def demandes_direction(request, matricule_chef):
    """Chef consulte les demandes de sa direction"""
    try:
        print(f"=== demandes_direction called for chef: {matricule_chef}")
        
        chef = Agent.objects.get(matricule=matricule_chef)
        
        role_chef = Role.objects.get(libelle__iexact='chef')
        if not AgentRole.objects.filter(agent=chef, role=role_chef).exists():
            return JsonResponse({'error': 'Non autorisé - Vous n\'avez pas le rôle Chef'}, status=403)
        
        chef_direction = (chef.direction or '').strip()
        print(f"Direction du chef: {chef_direction}")
        
        if not chef_direction:
            return JsonResponse({'error': 'Ce chef n\'a pas de direction assignée'}, status=400)
        
        demandes = Demande.objects.filter(
            agent__direction__iexact=chef_direction
        ).select_related('agent', 'type_demande', 'demandeconge', 'demandeabsence').order_by('-date_soumission')
        
        print(f"Nombre total de demandes trouvées: {demandes.count()}")
        
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
                print(f"Demande {d.id} sans date, ignorée")
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
                'statut': d.statut,
                'commentaire': getattr(d, 'commentaire', ''),
                'numero_suivi': d.numerosuivi
            })
        
        print(f"Demandes retournées: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        print(f"ERREUR: Agent {matricule_chef} non trouvé")
        return JsonResponse({'error': f'Agent avec matricule {matricule_chef} non trouvé'}, status=404)
    except Role.DoesNotExist:
        return JsonResponse({'error': 'Rôle "chef" non trouvé dans la base'}, status=500)
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
        
        print(f"=== valider_demande_conge - Demande ID: {demande_id}, Décision: {decision}")
        
        chef = Agent.objects.get(matricule=matricule_chef)
        demande = Demande.objects.get(id=demande_id)
        
        print(f"Chef: {chef.matricule} - Direction: {chef.direction}")
        print(f"Demandeur: {demande.agent.matricule} - Direction: {demande.agent.direction}")
        
        if (chef.direction or '').strip().lower() != (demande.agent.direction or '').strip().lower():
            return JsonResponse({'error': 'Vous ne pouvez pas valider cette demande'}, status=403)
        
        if decision == 'valide':
            demande.statut = 'valide'
            print("✅ Demande validée")
            
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
            print("❌ Demande rejetée")
        
        demande.commentaire_chef = commentaire
        demande.save()
        
        try:
            type_libelle = demande.type_demande.libelle if demande.type_demande else "demande"
            
            if decision == 'valide':
                message = f"✅ Votre {type_libelle} a été APPROUVÉE par votre chef"
            else:
                message = f"❌ Votre {type_libelle} a été REJETÉE par votre chef"
                if commentaire:
                    message += f"\nMotif: {commentaire}"
            
            notification = Notification.objects.create(
                agent_id=demande.agent.matricule,
                message=message,
                type_notification='validation_conge',
                date_envoi=datetime.now().date(),
                lue=0
            )
            print(f"✅ Notification créée avec succès - ID: {notification.id} pour l'agent: {demande.agent.matricule}")
            
        except Exception as notif_error:
            print(f"⚠️ ERREUR lors de la création de la notification: {notif_error}")
            import traceback
            traceback.print_exc()
        
        return JsonResponse({'success': True, 'message': f'Demande {decision}e'})
        
    except Agent.DoesNotExist:
        print(f"❌ Chef non trouvé: {matricule_chef}")
        return JsonResponse({'error': 'Chef non trouvé'}, status=404)
    except Demande.DoesNotExist:
        print(f"❌ Demande non trouvée: {demande_id}")
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        print(f"❌ ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


# ==================== MES DEMANDES (AGENT) ====================

@csrf_exempt
@require_http_methods(["GET"])
def mes_demandes(request, matricule):
    """Agent consulte TOUTES ses demandes (Congé + Absence)"""
    try:
        print("=" * 50)
        print(f"🔍 mes_demandes appelée avec matricule: '{matricule}'")
        print("=" * 50)
        
        try:
            agent = Agent.objects.get(matricule=matricule)
            print(f"✅ Agent trouvé: {agent.nom} {agent.prenom}")
        except Agent.DoesNotExist:
            print(f"❌ Agent non trouvé pour matricule: '{matricule}'")
            return JsonResponse({'error': f'Agent {matricule} non trouvé'}, status=404)
        
        demandes = Demande.objects.filter(
            agent=agent
        ).select_related('type_demande', 'demandeconge', 'demandeabsence').order_by('-date_soumission')
        
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            nombre_jours = None
            
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut) if d.demandeconge.date_debut else None
                date_fin = str(d.demandeconge.date_fin) if d.demandeconge.date_fin else None
                nombre_jours = d.demandeconge.nombrejours
            elif hasattr(d, 'demandeabsence') and d.demandeabsence:
                date_debut = str(d.demandeabsence.date_debut) if d.demandeabsence.date_debut else None
                date_fin = str(d.demandeabsence.date_fin) if d.demandeabsence.date_fin else None
                nombre_jours = d.demandeabsence.nombrejours
            
            result.append({
                'id': d.id,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'nombre_jours': nombre_jours,
                'statut': d.statut,
                'date_soumission': str(d.date_soumission),
                'numero_suivi': d.numerosuivi
            })
        
        print(f"\n✅ FINAL - Demandes retournées: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"❌ ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


# ==================== SOLDE CONGÉ ====================

@csrf_exempt
@require_http_methods(["GET"])
def solde_conge(request, matricule):
    """Agent consulte son solde de congés"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        annee = datetime.now().year
        
        demandes_validees = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
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
        notifications = Notification.objects.filter(agent_id=agent.matricule).order_by('-date_envoi')[:10]
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
        updated = Notification.objects.filter(agent_id=agent.matricule, lue=0).update(lue=1)
        return JsonResponse({'success': True, 'updated': updated})
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
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


# ==================== GESTION DES PERMISSIONS ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_permissions(request):
    """Récupérer toutes les permissions"""
    try:
        permissions = Permission.objects.all()
        result = [{'code': p.code, 'description': p.description} for p in permissions]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def add_permission(request):
    """Ajouter une permission"""
    try:
        data = json.loads(request.body)
        code = data.get('code')
        description = data.get('description')
        
        if Permission.objects.filter(code=code).exists():
            return JsonResponse({'error': 'Cette permission existe déjà'}, status=400)
        
        permission = Permission.objects.create(code=code, description=description)
        return JsonResponse({'success': True, 'code': permission.code})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_permission(request, code):
    """Supprimer une permission"""
    try:
        permission = Permission.objects.get(code=code)
        permission.delete()
        return JsonResponse({'success': True})
    except Permission.DoesNotExist:
        return JsonResponse({'error': 'Permission non trouvée'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_role_permissions(request):
    """Récupérer les permissions par rôle"""
    try:
        role_perms = RolePermission.objects.select_related('role', 'permission').all()
        result = {}
        for rp in role_perms:
            role_id = rp.role.id
            if role_id not in result:
                result[role_id] = []
            result[role_id].append(rp.permission.code)
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def toggle_role_permission(request):
    """Ajouter ou retirer une permission à un rôle"""
    try:
        data = json.loads(request.body)
        role_id = data.get('role_id')
        permission_code = data.get('permission_code')
        assign = data.get('assign')
        
        role = Role.objects.get(id=role_id)
        permission = Permission.objects.get(code=permission_code)
        
        if assign:
            RolePermission.objects.get_or_create(role=role, permission=permission)
        else:
            RolePermission.objects.filter(role=role, permission=permission).delete()
        
        return JsonResponse({'success': True})
    except Role.DoesNotExist:
        return JsonResponse({'error': 'Rôle non trouvé'}, status=404)
    except Permission.DoesNotExist:
        return JsonResponse({'error': 'Permission non trouvée'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_user_permissions(request, matricule):
    """Récupérer les permissions d'un utilisateur"""
    try:
        print(f"=== get_user_permissions for: {matricule}")
        
        agent = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=agent).select_related('role')
        
        permissions = []
        for ar in agent_roles:
            role_perms = RolePermission.objects.filter(role=ar.role).select_related('permission')
            for rp in role_perms:
                permissions.append(rp.permission.code)
        
        permissions = list(set(permissions))
        print(f"Permissions trouvées: {permissions}")
        
        return JsonResponse({'matricule': matricule, 'permissions': permissions})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== SECRÉTARIAT ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_validees_secretaire(request, matricule_secretaire):
    """Récupérer les demandes validées à transmettre au DPAF"""
    try:
        print(f"=== get_demandes_validees_secretaire for: {matricule_secretaire}")
        
        try:
            secretaire = Agent.objects.get(matricule=matricule_secretaire)
            print(f"Secrétaire trouvé: {secretaire.nom} {secretaire.prenom}")
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Secrétaire non trouvé'}, status=404)
        
        demandes = Demande.objects.filter(statut='valide').select_related(
            'agent', 'type_demande', 'demandeconge', 'demandeabsence'
        ).order_by('-date_soumission')
        
        print(f"Demandes avec statut 'valide': {demandes.count()}")
        
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
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'nombre_jours': nombre_jours,
                'date_validation': str(d.date_soumission),
                'statut': d.statut,
                'numero_suivi': d.numerosuivi
            })
        
        print(f"✅ Demandes retournées: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def transmettre_demande_dpaf(request, demande_id):
    """Secrétaire transmet une demande validée au DPAF"""
    try:
        data = json.loads(request.body)
        matricule_secretaire = data.get('secretaire_matricule')
        commentaire = data.get('commentaire', '')
        
        demande = Demande.objects.get(id=demande_id)
        demande.statut = 'transmise_dpaf'
        demande.save()
        
        print(f"✅ Demande {demande_id} transmise au DPAF par {matricule_secretaire}")
        
        return JsonResponse({'success': True, 'message': 'Demande transmise au DPAF'})
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== DPAF ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_transmises_dpaf(request, matricule_dpaf):
    """Récupérer les demandes transmises par la secrétaire (statut='transmise_dpaf')"""
    try:
        print(f"=== get_demandes_transmises_dpaf for: {matricule_dpaf}")
        
        demandes = Demande.objects.filter(statut='transmise_dpaf').select_related('agent', 'type_demande')
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
            elif hasattr(d, 'demandeabsence') and d.demandeabsence:
                date_debut = str(d.demandeabsence.date_debut)
                date_fin = str(d.demandeabsence.date_fin)
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'date_transmission': str(d.date_soumission),
                'statut': d.statut
            })
        
        print(f"✅ {len(result)} demandes transmises trouvées")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_assignees_dpaf(request, matricule_dpaf):
    """Récupérer les demandes déjà assignées par le DPAF"""
    try:
        print(f"=== get_demandes_assignees_dpaf for: {matricule_dpaf}")
        
        demandes = Demande.objects.filter(
            statut__in=['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine']
        ).select_related('agent', 'type_demande')
        
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
            elif hasattr(d, 'demandeabsence') and d.demandeabsence:
                date_debut = str(d.demandeabsence.date_debut)
                date_fin = str(d.demandeabsence.date_fin)
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'agent_rh_nom': getattr(d, 'agent_rh_nom', 'Non assigné'),
                'agent_rh_prenom': getattr(d, 'agent_rh_prenom', ''),
                'statut': d.statut,
                'date_assignation': str(getattr(d, 'date_assignation', d.date_soumission))
            })
        
        print(f"✅ {len(result)} demandes assignées trouvées")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_agents_rh(request):
    """Récupérer tous les agents ayant le rôle RH"""
    try:
        print(f"=== get_agents_rh called")
        
        role_rh = Role.objects.get(libelle='rh')
        agents_rh = Agent.objects.filter(agentrole__role=role_rh, actif=1)
        
        result = [{
            'matricule': a.matricule,
            'nom': a.nom,
            'prenom': a.prenom,
            'poste': a.poste or 'Agent RH',
            'email': a.email
        } for a in agents_rh]
        
        print(f"✅ {len(result)} agents RH trouvés")
        return JsonResponse(result, safe=False)
        
    except Role.DoesNotExist:
        return JsonResponse({'error': 'Rôle RH non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def assigner_demande_rh(request, demande_id):
    """DPAF assigne une demande à un agent RH"""
    try:
        data = json.loads(request.body)
        agent_rh_matricule = data.get('agent_rh_matricule')
        commentaire = data.get('commentaire', '')
        dpaf_matricule = data.get('dpaf_matricule')
        
        print(f"=== assigner_demande_rh - Demande ID: {demande_id}")
        print(f"Agent RH matricule: {agent_rh_matricule}")
        
        demande = Demande.objects.get(id=demande_id)
        agent_rh = Agent.objects.get(matricule=agent_rh_matricule)
        
        demande.statut = 'assignee_rh'
        demande.agent_rh_matricule = agent_rh_matricule
        demande.agent_rh_nom = agent_rh.nom
        demande.agent_rh_prenom = agent_rh.prenom
        demande.date_assignation = datetime.now().date()
        demande.commentaire_dpaf = commentaire
        demande.save()
        
        print(f"✅ Demande {demande_id} assignée à {agent_rh.nom} {agent_rh.prenom}")
        
        Notification.objects.create(
            agent_id=agent_rh_matricule,
            message=f"Nouvelle demande assignée: {demande.type_demande.libelle} pour {demande.agent.nom} {demande.agent.prenom}",
            type_notification='assignation',
            date_envoi=datetime.now().date(),
            lue=0
        )
        
        return JsonResponse({'success': True, 'message': 'Demande assignée avec succès'})
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent RH non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== RH ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_assignees_rh(request, matricule_rh):
    """Récupérer les demandes assignées à un agent RH"""
    try:
        demandes = Demande.objects.filter(
            agent_rh_matricule=matricule_rh,
            statut='assignee_rh'
        ).select_related('agent', 'type_demande')
        
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
            elif hasattr(d, 'demandeabsence') and d.demandeabsence:
                date_debut = str(d.demandeabsence.date_debut)
                date_fin = str(d.demandeabsence.date_fin)
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'date_assignation': str(getattr(d, 'date_assignation', d.date_soumission))
            })
        
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def commencer_traitement_rh(request, demande_id):
    """RH commence le traitement d'une demande"""
    try:
        demande = Demande.objects.get(id=demande_id)
        demande.statut = 'en_cours_traitement'
        demande.date_debut_traitement = datetime.now().date()
        demande.save()
        
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def generer_acte_rh(request, demande_id):
    """RH génère un acte pour une demande"""
    try:
        data = json.loads(request.body)
        reference = data.get('reference')
        contenu = data.get('contenu', '')
        observations = data.get('observations', '')
        
        demande = Demande.objects.get(id=demande_id)
        demande.statut = 'acte_genere'
        demande.reference_acte = reference
        demande.contenu_acte = contenu
        demande.date_generation_acte = datetime.now().date()
        demande.save()
        
        acte = ActeAdministratif.objects.create(
            demande=demande,
            reference=reference,
            type_acte=demande.type_demande.libelle,
            statut='genere',
            date_generation=datetime.now().date(),
            contenu=contenu
        )
        
        return JsonResponse({'success': True, 'acte_id': acte.reference})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

# ==================== RH (SUITE) - FONCTIONS MANQUANTES ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_cours_rh(request, matricule_rh):
    """Récupérer les demandes en cours de traitement pour un agent RH"""
    try:
        demandes = Demande.objects.filter(
            agent_rh_matricule=matricule_rh,
            statut='en_cours_traitement'
        ).select_related('agent', 'type_demande')
        
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
            elif hasattr(d, 'demandeabsence') and d.demandeabsence:
                date_debut = str(d.demandeabsence.date_debut)
                date_fin = str(d.demandeabsence.date_fin)
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'statut': d.statut,
                'date_debut_traitement': str(getattr(d, 'date_debut_traitement', ''))
            })
        
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_terminees_rh(request, matricule_rh):
    """Récupérer les demandes terminées pour un agent RH"""
    try:
        demandes = Demande.objects.filter(
            agent_rh_matricule=matricule_rh,
            statut__in=['acte_genere', 'termine']
        ).select_related('agent', 'type_demande')
        
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
            elif hasattr(d, 'demandeabsence') and d.demandeabsence:
                date_debut = str(d.demandeabsence.date_debut)
                date_fin = str(d.demandeabsence.date_fin)
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'statut': d.statut,
                'reference_acte': getattr(d, 'reference_acte', ''),
                'date_generation_acte': str(getattr(d, 'date_generation_acte', ''))
            })
        
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_envoyer_rh(request, matricule_rh):
    """Récupérer les actes générés à envoyer à la secrétaire"""
    try:
        actes = ActeAdministratif.objects.filter(
            statut='genere'
        ).select_related('demande__agent')
        
        result = []
        for acte in actes:
            result.append({
                'id': acte.id,
                'agent_nom': acte.demande.agent.nom,
                'agent_prenom': acte.demande.agent.prenom,
                'agent_matricule': acte.demande.agent.matricule,
                'type_acte': acte.type_acte,
                'reference': acte.reference,
                'date_generation': str(acte.date_generation),
                'contenu': acte.contenu
            })
        
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def mes_demandes_conge(request, matricule):
    """Agent consulte ses demandes de congé (pour compatibilité)"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        
        demandes = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé'
        ).select_related('type_demande', 'demandeconge').order_by('-date_soumission')
        
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            nombre_jours = None
            
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut) if d.demandeconge.date_debut else None
                date_fin = str(d.demandeconge.date_fin) if d.demandeconge.date_fin else None
                nombre_jours = d.demandeconge.nombrejours
            
            result.append({
                'id': d.id,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Congé',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'nombre_jours': nombre_jours,
                'statut': d.statut,
                'date_soumission': str(d.date_soumission),
                'numero_suivi': d.numerosuivi
            })
        
        return JsonResponse(result, safe=False)
        
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
        
        # Vérifier que le rôle existe
        try:
            role = Role.objects.get(id=role_id)
        except Role.DoesNotExist:
            return JsonResponse({'error': 'Rôle non trouvé'}, status=404)
        
        # Récupérer l'agent par son matricule
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Agent non trouvé'}, status=404)
        
        # Vérifier si l'agent a déjà ce rôle
        existing = AgentRole.objects.filter(agent=agent, role=role).first()
        
        if existing:
            # Si le rôle existe déjà, on ne fait rien ou on peut le supprimer selon le besoin
            return JsonResponse({'success': True, 'message': 'Ce rôle est déjà attribué à cet agent'})
        
        # Ajouter le nouveau rôle (sans supprimer les anciens)
        AgentRole.objects.create(agent=agent, role=role, date_attribution=date.today())
        
        return JsonResponse({'success': True, 'message': f'Rôle {role.libelle} attribué avec succès'})
        
    except Exception as e:
        print(f"Erreur update_agent_role_by_matricule: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

# ==================== GESTION DES DOCUMENTS (PIÈCES) - STOCKAGE EN BASE DE DONNÉES ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_documents(request):
    """Récupérer tous les documents d'un agent avec son dossier"""
    try:
        matricule = request.GET.get('matricule') or request.headers.get('X-User-Matricule')
        
        if not matricule:
            return JsonResponse({'error': 'Matricule requis'}, status=400)
        
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Agent non trouvé'}, status=404)
        
        # Récupérer ou créer le dossier de l'agent
        dossier, created = DossierAgent.objects.get_or_create(
            agent=agent,
            defaults={
                'datecreation': date.today(),
                'taux_completude': 0
            }
        )
        
        # Récupérer toutes les pièces du dossier
        pieces = Piece.objects.filter(dossier_agent=dossier).select_related('type_piece')
        
        # Récupérer tous les types de pièces
        types_pieces = TypePiece.objects.all()
        
        # Construire la liste des documents
        documents = []
        for piece in pieces:
            est_expire = False
            jours_avant_expiration = None
            
            if piece.date_expiration:
                jours_restants = (piece.date_expiration - date.today()).days
                if jours_restants < 0:
                    est_expire = True
                jours_avant_expiration = jours_restants
            
            documents.append({
                'id': piece.id,
                'type_piece_id': piece.type_piece.id,
                'type_piece_libelle': piece.type_piece.libelle,
                'nom_fichier': piece.nom_fichier,
                'date_upload': str(piece.date_upload),
                'date_expiration': str(piece.date_expiration) if piece.date_expiration else None,
                'est_expire': est_expire,
                'jours_avant_expiration': jours_avant_expiration,
                'valide': piece.valide
            })
        
        # Identifier les documents manquants (obligatoires non uploadés)
        documents_uploades_ids = [d['type_piece_id'] for d in documents]
        missing_documents = []
        
        for type_piece in types_pieces:
            if type_piece.obligatoire == 1 and type_piece.id not in documents_uploades_ids:
                missing_documents.append({
                    'id': type_piece.id,
                    'libelle': type_piece.libelle,
                    'obligatoire': True
                })
        
        # Calculer le taux de complétude
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        documents_obligatoires_uploades = len([d for d in documents if d['type_piece_id'] in 
            [tp.id for tp in types_pieces if tp.obligatoire == 1]])
        
        if total_obligatoire > 0:
            taux_completude = round((documents_obligatoires_uploades / total_obligatoire) * 100)
        else:
            taux_completude = 100
        
        # Mettre à jour le taux de complétude dans la base
        dossier.taux_completude = taux_completude
        dossier.save()
        
        return JsonResponse({
            'success': True,
            'dossier': {
                'id': dossier.id,
                'date_creation': str(dossier.datecreation),
                'taux_completude': taux_completude
            },
            'documents': documents,
            'missing_documents': missing_documents,
            'total_obligatoire': total_obligatoire,
            'total_uploades': len(documents)
        })
        
    except Exception as e:
        print(f"Erreur get_documents: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def upload_document(request):
    """Uploader un document et le stocker en base de données"""
    try:
        matricule = request.POST.get('matricule') or request.headers.get('X-User-Matricule')
        type_piece_id = request.POST.get('type_piece_id')
        file_base64 = request.POST.get('file_base64')
        file_name = request.POST.get('file_name')
        
        print(f"Upload demandé - matricule: {matricule}, type_piece: {type_piece_id}, fichier: {file_name}")
        
        if not all([matricule, type_piece_id, file_base64, file_name]):
            return JsonResponse({
                'error': 'Tous les champs sont requis (matricule, type_piece_id, file_base64, file_name)'
            }, status=400)
        
        # Vérifier que l'agent existe
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': f'Agent {matricule} non trouvé'}, status=404)
        
        # Vérifier que le type de pièce existe
        try:
            type_piece = TypePiece.objects.get(id=type_piece_id)
        except TypePiece.DoesNotExist:
            return JsonResponse({'error': f'Type de pièce {type_piece_id} non trouvé'}, status=404)
        
        # Récupérer ou créer le dossier de l'agent
        dossier, created = DossierAgent.objects.get_or_create(
            agent=agent,
            defaults={
                'datecreation': date.today(),
                'taux_completude': 0
            }
        )
        
        if created:
            print(f"Nouveau dossier créé pour l'agent {matricule}")
        
        # Nettoyer le base64 (enlever le préfixe "data:application/pdf;base64," si présent)
        cleaned_base64 = file_base64
        if 'base64,' in file_base64:
            cleaned_base64 = file_base64.split('base64,')[1]
        
        # Calculer la date d'expiration si le type de pièce a une durée de validité
        date_expiration = None
        if type_piece.duree_validite:
            try:
                # Extraire le nombre d'années (ex: "5 ans" -> 5)
                import re
                match = re.search(r'(\d+)', type_piece.duree_validite)
                if match:
                    duree_annees = int(match.group(1))
                    date_expiration = date.today() + timedelta(days=duree_annees * 365)
                    print(f"Date d'expiration calculée: {date_expiration} ({duree_annees} ans)")
            except Exception as e:
                print(f"Impossible de calculer la date d'expiration: {e}")
                # Pas de date d'expiration si le format n'est pas reconnu
        
        # Supprimer l'ancienne pièce du même type si elle existe (remplacement)
        anciennes_pieces = Piece.objects.filter(
            dossier_agent=dossier,
            type_piece=type_piece
        )
        if anciennes_pieces.exists():
            anciennes_pieces.delete()
            print(f"Ancienne pièce de type {type_piece.libelle} supprimée")
        
        # Créer la nouvelle pièce avec le contenu stocké dans cheminfichier
        piece = Piece.objects.create(
            dossier_agent=dossier,
            type_piece=type_piece,
            nom_fichier=file_name,
            date_expiration=date_expiration,
            date_upload=date.today(),
            valide=1,
            cheminfichier=cleaned_base64  # Stockage direct du contenu en base64
        )
        
        print(f"Pièce créée - ID: {piece.id}, Type: {type_piece.libelle}")
        
        # Recalculer le taux de complétude
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        pieces_obligatoires = Piece.objects.filter(
            dossier_agent=dossier,
            type_piece__obligatoire=1
        ).count()
        
        if total_obligatoire > 0:
            taux = round((pieces_obligatoires / total_obligatoire) * 100)
        else:
            taux = 100
        
        dossier.taux_completude = taux
        dossier.save()
        print(f"Taux de complétude mis à jour: {taux}%")
        
        # Créer une notification pour l'agent
        try:
            Notification.objects.create(
                agent=agent,
                message=f"✅ Document '{type_piece.libelle}' importé avec succès",
                type_notification='document',
                date_envoi=date.today(),
                lue=0
            )
        except Exception as e:
            print(f"Erreur création notification: {e}")
            # On continue même si la notification échoue
        
        return JsonResponse({
            'success': True,
            'message': f'Document "{file_name}" importé avec succès',
            'piece_id': piece.id,
            'taux_completude': taux,
            'date_expiration': str(date_expiration) if date_expiration else None,
            'type_piece': type_piece.libelle
        })
        
    except Exception as e:
        print(f"❌ Erreur upload_document: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def download_document(request, piece_id):
    """Télécharger un document stocké en base de données"""
    try:
        matricule = request.GET.get('matricule') or request.headers.get('X-User-Matricule')
        
        if not matricule:
            return JsonResponse({'error': 'Matricule requis'}, status=400)
        
        # Récupérer la pièce
        try:
            piece = Piece.objects.select_related('dossier_agent__agent', 'type_piece').get(id=piece_id)
        except Piece.DoesNotExist:
            return JsonResponse({'error': 'Document non trouvé'}, status=404)
        
        # Vérifier les droits d'accès
        agent_demandeur = piece.dossier_agent.agent
        
        if agent_demandeur.matricule != matricule:
            # Vérifier si c'est un RH ou admin qui fait la demande
            try:
                agent = Agent.objects.get(matricule=matricule)
                roles = AgentRole.objects.filter(agent=agent).values_list('role__libelle', flat=True)
                if 'rh' not in roles and 'admin' not in roles:
                    return JsonResponse({'error': 'Non autorisé'}, status=403)
            except:
                return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        # Vérifier que le contenu existe
        if not piece.cheminfichier:
            return JsonResponse({'error': 'Document vide ou corrompu'}, status=404)
        
        print(f"Téléchargement du document {piece.id} - {piece.nom_fichier}")
        
        # Déterminer le type MIME
        mime_type = 'application/pdf'
        if piece.nom_fichier.lower().endswith(('.jpg', '.jpeg')):
            mime_type = 'image/jpeg'
        elif piece.nom_fichier.lower().endswith('.png'):
            mime_type = 'image/png'
        
        # Le contenu est déjà en base64 dans la base de données
        return JsonResponse({
            'success': True,
            'file_name': piece.nom_fichier,
            'file_base64': piece.cheminfichier,
            'mime_type': mime_type,
            'type_piece': piece.type_piece.libelle
        })
        
    except Exception as e:
        print(f"❌ Erreur download_document: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_document(request, piece_id):
    """Supprimer un document"""
    try:
        matricule = request.headers.get('X-User-Matricule')
        
        if not matricule:
            return JsonResponse({'error': 'Non autorisé'}, status=401)
        
        try:
            piece = Piece.objects.select_related('dossier_agent__agent').get(id=piece_id)
        except Piece.DoesNotExist:
            return JsonResponse({'error': 'Document non trouvé'}, status=404)
        
        # Vérifier que l'agent est propriétaire du document
        if piece.dossier_agent.agent.matricule != matricule:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        # Supprimer le document
        piece.delete()
        
        # Recalculer le taux de complétude
        dossier = piece.dossier_agent
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        pieces_obligatoires = Piece.objects.filter(
            dossier_agent=dossier,
            type_piece__obligatoire=1
        ).count()
        
        taux = round((pieces_obligatoires / total_obligatoire) * 100) if total_obligatoire > 0 else 100
        dossier.taux_completude = taux
        dossier.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Document supprimé avec succès',
            'taux_completude': taux
        })
        
    except Exception as e:
        print(f"Erreur delete_document: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)