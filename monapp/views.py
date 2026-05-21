from django.contrib.auth.hashers import make_password, check_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.db import connection
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from .models import Agent, Role
import json
from datetime import datetime
import random
import requests

# ==================== CONFIGURATION WHATSAPP API ====================
WHATSAPP_TOKEN = "EAAKdVZAFWol0BRr3v2LHDWG0gcUwQZBgzZADYU7I2a7NkYxqqXZCBBcffzZAFWfmm0rKRoVtxI98tleJabIRzVO6UevyoqQR55Wdz9yfmdcqdtThZCWZAHXaW0dZBAY3ybl0vKe2Ca8SiY1NF0VC99MexFHPQWY1hvo2b7CuUY6OxUX0NgYBu02OSoySQjYdeATZAhJqnBrCs7xSgKcZCx9xJUd8XCkJjtqXko9OXGE9rgB546UghOkdYyGthUSm74omWFeCLbm6SmnmsCQqaAuBkY"
WHATSAPP_PHONE_ID = "1156341157560185"

def send_whatsapp_message(phone_number, message):
    """Envoyer un message WhatsApp via Meta API"""
    try:
        clean_number = ''.join(filter(str.isdigit, phone_number))
        if not clean_number.startswith('229'):
            clean_number = '229' + clean_number.lstrip('0')
        
        url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_ID}/messages"
        headers = {
            "Authorization": f"Bearer {WHATSAPP_TOKEN}",
            "Content-Type": "application/json"
        }
        data = {
            "messaging_product": "whatsapp",
            "to": clean_number,
            "type": "text",
            "text": {"body": message}
        }
        
        response = requests.post(url, headers=headers, json=data)
        result = response.json()
        
        if response.status_code == 200:
            print(f"✅ WhatsApp envoyé à {phone_number}")
            return True, result
        else:
            print(f"❌ Erreur WhatsApp: {result}")
            return False, result
    except Exception as e:
        print(f"❌ Exception WhatsApp: {e}")
        return False, {'error': str(e)}

# ==================== FONCTIONS PRINCIPALES ====================

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
            mot_de_passe='',
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
        
        if not agent.mot_de_passe:
            return JsonResponse({'error': 'Compte non activé'}, status=401)
        
        if check_password(password, agent.mot_de_passe):
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT r.libelle 
                    FROM agent_role ar
                    JOIN role r ON ar.role_id = r.id
                    WHERE ar.agent_id = %s
                """, [agent.id])
                roles = [row[0] for row in cursor.fetchall()]
            
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
                'id': agent.id,
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
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_all_agents(request):
    """Récupérer tous les agents"""
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
                """, [agent.id])
                roles = cursor.fetchall()
            
            result.append({
                'id': agent.id,
                'matricule': agent.matricule,
                'nom': agent.nom,
                'prenom': agent.prenom,
                'email': agent.email,
                'telephone': agent.telephone,
                'actif': agent.actif,
                'role_id': roles[0][0] if roles else 1,
                'role_libelle': roles[0][1] if roles else 'agent'
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
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
            'total_demandes': 0
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
                    date_prise_service=agent_data.get('date_prise_service', '2024-01-01'),
                    mot_de_passe='',
                    actif=0
                )
                
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO agent_role (agent_id, role_id) VALUES (%s, %s)",
                        [agent.id, role_agent.id]
                    )
                
                # ===== ENVOI D'EMAIL POUR CHAQUE AGENT IMPORTÉ =====
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
                
                success_count += 1
                
            except Exception as e:
                error_count += 1
                errors.append(f"{agent_data.get('matricule', '?')}: {str(e)}")
        
        return JsonResponse({
            'success': True,
            'success_count': success_count,
            'error_count': error_count,
            'errors': errors[:10]
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def send_otp(request):
    """Envoyer un code OTP par WhatsApp"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        
        agent = Agent.objects.get(matricule=matricule)
        code = ''.join(random.choices('0123456789', k=6))
        
        request.session['otp_code'] = code
        request.session['otp_matricule'] = matricule
        request.session.set_expiry(300)
        
        message = f"🔐 *MND - Activation de compte*\n\nVotre code de vérification est : *{code}*\n\nCe code est valable 5 minutes.\n\nNe partagez ce code avec personne."
        
        success, result = send_whatsapp_message(agent.telephone, message)
        
        if success:
            print(f"✅ WhatsApp envoyé à {agent.telephone}")
            return JsonResponse({'success': True, 'message': 'Code envoyé par WhatsApp'})
        else:
            return JsonResponse({'error': result.get('error', 'Erreur d\'envoi WhatsApp')}, status=500)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Matricule non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def verify_otp(request):
    """Vérifier le code OTP"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        otp_code = data.get('otp_code')
        
        stored_code = request.session.get('otp_code')
        stored_matricule = request.session.get('otp_matricule')
        
        if stored_code and stored_matricule == matricule and otp_code == stored_code:
            return JsonResponse({'success': True})
        else:
            return JsonResponse({'error': 'Code invalide ou expiré'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def activate_account(request):
    """Activer le compte avec mot de passe"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        password = data.get('password')
        
        agent = Agent.objects.get(matricule=matricule)
        
        if agent.actif == 1:
            return JsonResponse({'error': 'Compte déjà activé'}, status=400)
        
        agent.mot_de_passe = make_password(password)
        agent.actif = 1
        agent.save()
        
        return JsonResponse({'success': True, 'message': 'Compte activé'})
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


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
@require_http_methods(["GET"])
def get_agent_by_matricule(request, matricule):
    print(f"=== GET_AGENT_BY_MATRICULE called for: {matricule}")
    try:
        agent = Agent.objects.get(matricule=matricule)
        print(f"Agent trouvé: {agent.nom} {agent.prenom}")
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT r.libelle 
                FROM agent_role ar
                JOIN role r ON ar.role_id = r.id
                WHERE ar.agent_id = %s
            """, [agent.id])
            roles = cursor.fetchall()
        
        return JsonResponse({
            'id': agent.id,
            'matricule': agent.matricule,
            'nom': agent.nom,
            'prenom': agent.prenom,
            'email': agent.email,
            'telephone': agent.telephone,
            'poste': agent.poste,
            'direction': agent.direction,
            'typecontrat': agent.typecontrat,
            'actif': agent.actif,
            'roles': [r[0] for r in roles]
        })
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)