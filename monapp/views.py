# -*- coding: utf-8 -*-
from django.contrib.auth.hashers import make_password, check_password
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx import Document
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import pythoncom
from django.views.decorators.http import require_http_methods
from django.db import connection
from django.db import models
from django.db.models import Sum
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from django.http import HttpResponse
from collections import Counter
import io
import os
import subprocess
import tempfile
from datetime import datetime, date, timedelta

from .emails import (
    envoyer_email_activation,
    envoyer_email_rappel_avancement,
    envoyer_email_avancement_effectue,
    envoyer_email_avancement_agent, 
)
from .models import (
    Agent, Role, AgentRole, Permission, RolePermission, TypeDemande, Demande, DemandeAbsence,
    DemandeConge, Notification, SoldeConge, TypePiece, Compte, DossierAgent, Piece, ActeAdministratif, Avancement, Candidature
)
import json
import random
import base64
import ollama
import re

try:
    from docx2pdf import convert as docx2pdf_convert
    from docx.shared import Pt
except ImportError:
    docx2pdf_convert = None

# ==================== UTILITAIRES DOCX & PDF ====================

def _copy_run_format(source_run, target_run):
    try:
        target_run.font.name = source_run.font.name
        target_run.font.size = source_run.font.size
        target_run.bold = source_run.bold
        target_run.italic = source_run.italic
        target_run.underline = source_run.underline
    except Exception:
        pass


def _replace_placeholders_in_paragraph(paragraph, replacements, reference_number=None):
    text = ''.join(run.text for run in paragraph.runs)
    if not text:
        return False

    if '{{REFERENCE}}' in text and reference_number is not None:
        text = re.sub(r'\{\{REFERENCE\}\}(/MND/DPAF/[A-Z/]+)', reference_number + r'\1', text)

    for key, value in replacements.items():
        if key in text:
            text = text.replace(key, value)

    text = re.sub(r'(\d{2}/\d{2}/\d{4})\1+', r'\1', text)
    if replacements.get('{{REFERENCE}}'):
        ref = replacements['{{REFERENCE}}']
        text = re.sub(re.escape(ref) + r'(?:\s*' + re.escape(ref) + r')+', ref, text)

    if text != ''.join(run.text for run in paragraph.runs):
        first_run = paragraph.runs[0] if paragraph.runs else None
        for run in paragraph.runs:
            run.text = ''
        new_run = paragraph.add_run(text)
        if first_run:
            _copy_run_format(first_run, new_run)
        return True

    return False


def _replace_placeholders_in_doc(doc, replacements, reference_number=None):
    changed = False
    for paragraph in doc.paragraphs:
        if _replace_placeholders_in_paragraph(paragraph, replacements, reference_number=reference_number):
            changed = True

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    if _replace_placeholders_in_paragraph(paragraph, replacements, reference_number=reference_number):
                        changed = True

    for section in doc.sections:
        header = section.header
        footer = section.footer
        for paragraph in header.paragraphs:
            if _replace_placeholders_in_paragraph(paragraph, replacements, reference_number=reference_number):
                changed = True
        for paragraph in footer.paragraphs:
            if _replace_placeholders_in_paragraph(paragraph, replacements, reference_number=reference_number):
                changed = True

    return changed


def _set_document_font(doc, font_name='Times New Roman', font_size_pt=12):
    try:
        normal_style = doc.styles['Normal']
        normal_style.font.name = font_name
        normal_style.font.size = Pt(font_size_pt)
    except Exception:
        pass

    for paragraph in doc.paragraphs:
        for run in paragraph.runs:
            try:
                run.font.name = font_name
                if run.font.size is None:
                    run.font.size = Pt(font_size_pt)
            except Exception:
                pass

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        try:
                            run.font.name = font_name
                            if run.font.size is None:
                                run.font.size = Pt(font_size_pt)
                        except Exception:
                            pass


def _docx_bytes_to_pdf_bytes(docx_bytes):
    """Convertit un fichier DOCX (bytes) en PDF (bytes)"""
    import tempfile
    import os
    import pythoncom
    from docx2pdf import convert
    
    pythoncom.CoInitialize()
    
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            docx_path = os.path.join(tmpdir, 'document.docx')
            pdf_path = os.path.join(tmpdir, 'document.pdf')
            
            with open(docx_path, 'wb') as f:
                f.write(docx_bytes)
            
            convert(docx_path, pdf_path)
            
            if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
                with open(pdf_path, 'rb') as f:
                    return f.read()
            else:
                raise RuntimeError("Conversion échouée - fichier PDF vide ou inexistant")
    finally:
        pythoncom.CoUninitialize()

def _create_pdf_response(pdf_bytes, filename):
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}.pdf"'
    return response

def _create_docx_response(docx_bytes, filename):
    response = HttpResponse(docx_bytes, content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    response['Content-Disposition'] = f'attachment; filename="{filename}.docx"'
    return response

# ==================== SYSTÈME D'ACTIVATION ====================

@csrf_exempt
@require_http_methods(["POST"])
def register(request):
    """Inscription d'un nouvel agent"""
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
            date_naissance=datetime.strptime(data.get('date_naissance'), '%Y-%m-%d').date() if data.get('date_naissance') else None,
            telephone=data.get('telephone'),
            date_prise_service=date_prise_service,
            adresse=adresse,
            poste=poste,
            direction=direction,
            typecontrat=typecontrat,
            corps=data.get('corps') or ' ',
            echelon=data.get('echelon') or 'A1-1',
            actif=0
        )
        print(f"Agent créé avec Matricule: {agent.matricule}")
        
        role_agent, _ = Role.objects.get_or_create(libelle='agent')
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO agent_role (agent_id, role_id) VALUES (%s, %s)",
                [agent.matricule, role_agent.id]
            )
        
        # Calcul des avancements
        try:
            premier_delai = 4 * 365 if agent.typecontrat == 'ACE' else 2 * 365

            if agent.echelon and '-' in agent.echelon:
                partie_fixe = get_partie_fixe(agent.echelon)
            else:
                partie_fixe = get_type_echelon(agent.echelon or 'A1-1') + '1'

            echelon_base = f"{partie_fixe}-1" 
            echelon_courant = echelon_base

            prochaine_date = ajouter_annees(agent.date_prise_service, 2 if agent.typecontrat != 'ACE' else 4)

            while True:
                if not peut_avancer(agent, prochaine_date):
                    break
                nouvel_echelon = calculer_nouvel_echelon(echelon_courant)
                if nouvel_echelon is None:
                    Avancement.objects.create(
                        agent=agent,
                        date_prevue=None,
                        date_effective=None,
                        type_avancement='plafonne',
                        echelon_ancien=echelon_courant,
                        echelon_nouveau=echelon_courant,
                    )
                    break
                Avancement.objects.create(
                    agent=agent,
                    date_prevue=prochaine_date,
                    date_effective=None,
                    type_avancement='normal',
                    echelon_ancien=echelon_courant,
                    echelon_nouveau=nouvel_echelon,
                )
                echelon_courant = nouvel_echelon
                prochaine_date = ajouter_annees(prochaine_date, 2)

            print(f"✅ Avancements calculés pour {agent.matricule}")
        except Exception as e:
            print(f"⚠️ Erreur calcul avancements pour {agent.matricule}: {e}")

        activation_link = f"http://localhost:5173/activate?matricule={agent.matricule}"
        envoyer_email_activation(agent)
        
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

import base64
import json

def fix_base64_padding(base64_string):
    """Ajoute le padding = manquant à une chaîne base64"""
    # Compter le nombre de caractères de padding manquants
    missing_padding = len(base64_string) % 4
    if missing_padding:
        base64_string += '=' * (4 - missing_padding)
    return base64_string

 
@csrf_exempt
@require_http_methods(["POST"])
def activate_account_via_email(request):
    """Activation de compte via le lien reçu par email"""
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
                'message': 'Compte activé avec succès !'
            })
            
        except Agent.DoesNotExist:
            return JsonResponse({
                'error': 'Matricule invalide.'
            }, status=404)
            
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def activate_agent_account(request):
    """Activer le compte d'un agent existant"""
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
            
            return JsonResponse({'success': True, 'message': 'Compte activé avec succès'})
            
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Matricule non trouvé'}, status=404)
            
    except Exception as e:
        print(f"Erreur activate_agent_account: {str(e)}")
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
        
        try:
            compte = Compte.objects.get(agent=agent)
        except Compte.DoesNotExist:
            return JsonResponse({'error': 'Compte non trouvé.'}, status=401)
        
        if check_password(password, compte.mot_de_passe):
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT r.libelle 
                    FROM agent_role ar
                    JOIN role r ON ar.role_id = r.id
                    WHERE ar.agent_id = %s
                """, [agent.matricule])
                roles = [row[0] for row in cursor.fetchall()]
            
            if 'admin' in roles:
                user_role = 'admin'
            elif 'dpaf' in roles:
                user_role = 'dpaf'
            elif 'dapaf' in roles:
                user_role = 'dapaf'
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
                'date_prise_service': str(agent.date_prise_service) if agent.date_prise_service else None,
                'date_naissance': str(agent.date_naissance) if agent.date_naissance else None,
                'typecontrat': agent.typecontrat or 'APE',
                'echelon': agent.echelon or '',
                'roles': [{'id': r[0], 'libelle': r[1]} for r in roles]
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
        print(f"Erreur get_all_agents: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_stats(request):
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
    try:
        roles = Role.objects.all()
        result = [{'id': r.id, 'libelle': r.libelle} for r in roles]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def update_agent_role(request, agent_id):
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


@csrf_exempt
@require_http_methods(["POST"])
def add_role_to_agent(request, agent_id):
    try:
        data = json.loads(request.body)
        role_id = data.get('role_id')
        
        print(f"=== add_role_to_agent - Agent: {agent_id}, Role: {role_id}")
        
        agent = Agent.objects.get(matricule=agent_id)
        role = Role.objects.get(id=role_id)
        
        existing = AgentRole.objects.filter(agent=agent, role=role).first()
        
        if not existing:
            AgentRole.objects.create(
                agent=agent, 
                role=role, 
                date_attribution=datetime.now().date()
            )
            print(f"✅ Rôle {role.libelle} ajouté à {agent.nom} {agent.prenom}")
            return JsonResponse({'success': True, 'message': f'Rôle {role.libelle} ajouté avec succès'})
        else:
            print(f"ℹ️ L'agent a déjà le rôle {role.libelle}")
            return JsonResponse({'success': True, 'message': 'L\'agent a déjà ce rôle'})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': f'Agent {agent_id} non trouvé'}, status=404)
    except Role.DoesNotExist:
        return JsonResponse({'error': f'Rôle {role_id} non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR add_role_to_agent: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def remove_role_from_agent(request, agent_id):
    try:
        data = json.loads(request.body)
        role_id = data.get('role_id')
        
        print(f"=== remove_role_from_agent - Agent: {agent_id}, Role: {role_id}")
        
        agent = Agent.objects.get(matricule=agent_id)
        role = Role.objects.get(id=role_id)
        
        deleted, _ = AgentRole.objects.filter(agent=agent, role=role).delete()
        
        if deleted:
            print(f"✅ Rôle {role.libelle} supprimé de {agent.nom} {agent.prenom}")
            return JsonResponse({'success': True, 'message': f'Rôle {role.libelle} supprimé avec succès'})
        else:
            print(f"ℹ️ L'agent n'avait pas le rôle {role.libelle}")
            return JsonResponse({'success': True, 'message': 'L\'agent n\'avait pas ce rôle'})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': f'Agent {agent_id} non trouvé'}, status=404)
    except Role.DoesNotExist:
        return JsonResponse({'error': f'Rôle {role_id} non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR remove_role_from_agent: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== GESTION DES CONGÉS ET ABSENCES ====================

@csrf_exempt
@require_http_methods(["POST"])
def demande_conge(request):
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        date_debut_str = data.get('date_debut')
        date_fin_str = data.get('date_fin')
        
        if not date_debut_str or not date_fin_str:
            return JsonResponse({'error': 'Veuillez renseigner les dates'}, status=400)
        
        agent = Agent.objects.get(matricule=matricule)
        
        date_debut = datetime.strptime(date_debut_str, '%Y-%m-%d').date()
        date_fin = datetime.strptime(date_fin_str, '%Y-%m-%d').date()
        
        if date_debut > date_fin:
            return JsonResponse({'error': 'La date de début doit être antérieure à la date de fin'}, status=400)
        
        annee_demande = date_debut.year
        annee_courante = datetime.now().year
        
        if annee_demande < annee_courante:
            return JsonResponse({'error': f'Impossible de demander un congé pour {annee_demande} (année déjà passée)'}, status=400)
        
        if annee_demande > annee_courante:
            return JsonResponse({'error': f'Impossible de demander un congé pour {annee_demande} (année future)'}, status=400)
        
        nombre_jours = (date_fin - date_debut).days + 1
        
        if agent.date_prise_service:
            anciennete_jours = (datetime.now().date() - agent.date_prise_service).days
            if anciennete_jours < 365:
                return JsonResponse({'error': 'Ancienneté insuffisante. Vous devez avoir au moins 1 an de service.'}, status=400)
        
        nb_demandes_annee = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            date_soumission__year=annee_courante
        ).count()
        
        if nb_demandes_annee >= 2:
            return JsonResponse({'error': f'Vous avez déjà effectué {nb_demandes_annee} demande(s) de congé cette année. Maximum 2 demandes par an.'}, status=400)
        
        solde, _ = SoldeConge.objects.get_or_create(
            agent=agent,
            annee=annee_courante,
            defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
        )
        
        if nombre_jours > solde.jours_restants:
            return JsonResponse({'error': f'Solde insuffisant. Vous avez {solde.jours_restants} jours restants, vous demandez {nombre_jours} jours.'}, status=400)
        
        if nombre_jours > 30:
            return JsonResponse({'error': 'La durée maximale d\'un congé est de 30 jours consécutifs.'}, status=400)
        
        chevauchement = DemandeConge.objects.filter(
            demande__agent=agent,
            date_debut__lte=date_fin,
            date_fin__gte=date_debut,
            demande__statut__in=['en_attente_chef', 'valide']
        ).exists()
        
        if chevauchement:
            return JsonResponse({'error': 'Vous avez déjà une demande de congé sur cette période.'}, status=400)
        
        try:
            type_demande = TypeDemande.objects.get(libelle='Congé')
        except TypeDemande.DoesNotExist:
            return JsonResponse({'error': 'Le type de demande "Congé" n\'a pas été configuré.'}, status=500)
        
        demande = Demande.objects.create(
            agent=agent,
            type_demande=type_demande,
            statut='en_attente_chef',
            date_soumission=datetime.now().date(),
            numerosuivi=f"CONGE-{datetime.now().strftime('%Y%m%d%H%M%S')}-{agent.matricule}"
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
            'numerosuivi': demande.numerosuivi,
            'message': f'Demande de {nombre_jours} jours envoyée pour validation',
            'jours_restants_apres': solde.jours_restants - nombre_jours
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR demande_conge: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def demande_absence(request):
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
        
        numerosuivi = f"ABS-{datetime.now().strftime('%Y%m%d%H%M%S')}-{agent.matricule}"
        
        demande = Demande.objects.create(
            agent=agent,
            type_demande=type_demande_obj,
            statut='en_attente_chef',
            date_soumission=datetime.now().date(),
            numerosuivi=numerosuivi,
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
            'numerosuivi': demande.numerosuivi,
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


@csrf_exempt
@require_http_methods(["GET"])
def demandes_direction(request, matricule_chef):
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
                'numerosuivi': d.numerosuivi
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
                annee_conge = demande.demandeconge.date_debut.year
                nombre_jours = demande.demandeconge.nombrejours
                
                solde, _ = SoldeConge.objects.get_or_create(
                    agent=demande.agent,
                    annee=annee_conge,
                    defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
                )
                
                solde.jours_pris = (solde.jours_pris or 0) + nombre_jours
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
            
            Notification.objects.create(
                agent_id=demande.agent.matricule,
                message=message,
                type_notification='validation_conge',
                date_envoi=datetime.now().date(),
                lue=0
            )
            
        except Exception as notif_error:
            print(f"⚠️ ERREUR notification: {notif_error}")
        
        return JsonResponse({'success': True, 'message': f'Demande {decision}e'})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Chef non trouvé'}, status=404)
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        print(f"❌ ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def mes_demandes(request, matricule):
    try:
        print("=" * 50)
        print(f"🔍 mes_demandes appelée avec matricule: '{matricule}'")
        
        agent = Agent.objects.get(matricule=matricule)
        print(f"✅ Agent trouvé: {agent.nom} {agent.prenom}")
        
        demandes = Demande.objects.filter(
            agent=agent
        ).select_related('type_demande', 'demandeconge', 'demandeabsence').order_by('-date_soumission')
        
        print(f"📋 Nombre total de demandes trouvées: {demandes.count()}")
        
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
            
            agent_rh_nom = d.agent_rh.nom if d.agent_rh else None
            agent_rh_prenom = d.agent_rh.prenom if d.agent_rh else None
            
            result.append({
                'id': d.id,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'nombre_jours': nombre_jours,
                'statut': d.statut,
                'date_soumission': str(d.date_soumission),
                'numerosuivi': d.numerosuivi,
                'agent_rh_nom': agent_rh_nom,
                'agent_rh_prenom': agent_rh_prenom
            })
        
        print(f"✅ FINAL - {len(result)} demandes retournées")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': f'Agent {matricule} non trouvé'}, status=404)
    except Exception as e:
        print(f"❌ ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def solde_conge(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        annee_courante = datetime.now().year
        
        print(f"=== solde_conge pour {matricule}, année: {annee_courante}")
        
        demandes_validees = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            statut='valide',
            demandeconge__date_debut__year=annee_courante
        )
        
        jours_pris = 0
        for d in demandes_validees:
            if hasattr(d, 'demandeconge') and d.demandeconge:
                jours_pris += d.demandeconge.nombrejours
        
        solde, _ = SoldeConge.objects.get_or_create(
            agent=agent,
            annee=annee_courante,
            defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
        )
        
        solde.jours_pris = jours_pris
        solde.jours_restants = (solde.jours_acquis or 30) - jours_pris
        solde.save()
        
        return JsonResponse({
            'annee': annee_courante,
            'jours_acquis': solde.jours_acquis or 30,
            'jours_pris': jours_pris,
            'jours_restants': solde.jours_restants
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur solde_conge: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


# ==================== NOTIFICATIONS ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_notifications(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        notifications = Notification.objects.filter(agent_id=agent.matricule).order_by('-date_envoi')[:20]
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
    try:
        agent = Agent.objects.get(matricule=matricule)
        updated = Notification.objects.filter(agent_id=agent.matricule, lue=0).update(lue=1)
        return JsonResponse({'success': True, 'updated': updated})
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def supprimer_notification(request, notification_id):
    try:
        notification = Notification.objects.get(id=notification_id)
        notification.delete()
        return JsonResponse({'success': True, 'message': 'Notification supprimée'})
    except Notification.DoesNotExist:
        return JsonResponse({'error': 'Notification non trouvée'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def supprimer_toutes_notifications(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        deleted, _ = Notification.objects.filter(agent_id=agent.matricule).delete()
        return JsonResponse({'success': True, 'message': f'{deleted} notification(s) supprimée(s)'})
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== TYPES DE DEMANDE ET PIÈCE ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_types_demande(request):
    try:
        types = TypeDemande.objects.all()
        result = [{'id': t.id, 'libelle': t.libelle, 'duree_traitement_moyenne': t.duree_traitement_moyenne, 'acte_generable': t.acte_generable} for t in types]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def add_type_demande(request):
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


@csrf_exempt
@require_http_methods(["GET"])
def get_types_piece(request):
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


# ==================== PERMISSIONS ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_permissions(request):
    try:
        permissions = Permission.objects.all()
        result = [{'code': p.code, 'description': p.description} for p in permissions]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def add_permission(request):
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
                'numerosuivi': d.numerosuivi
            })
        
        print(f"✅ Demandes retournées: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def transmettre_demande(request, demande_id):
    try:
        data = json.loads(request.body)
        matricule_secretaire = data.get('secretaire_matricule')
        commentaire = data.get('commentaire', '')
        
        demande = Demande.objects.get(id=demande_id)
        
        type_demande = demande.type_demande.libelle if demande.type_demande else ''
        
        if type_demande == 'Congé':
            demande.statut = 'transmise_dapaf'
            destinataire = 'DAPAF'
        elif type_demande == 'Absence':
            demande.statut = 'transmise_dpaf'
            destinataire = 'DPAF'
        else:
            demande.statut = 'transmise_dpaf'
            destinataire = 'DPAF'
        
        demande.save()
        
        print(f"✅ Demande {demande_id} transmise au {destinataire} par {matricule_secretaire}")
        
        return JsonResponse({
            'success': True,
            'message': f'Demande transmise au {destinataire}',
            'destinataire': destinataire
        })
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        print(f"ERREUR transmettre_demande: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_transmises_secretaire(request, matricule_secretaire):
    try:
        print(f"=== get_demandes_transmises_secretaire for: {matricule_secretaire}")
        
        secretaire = Agent.objects.get(matricule=matricule_secretaire)
        
        demandes = Demande.objects.filter(
            statut='transmise_dpaf',
            agent__direction=secretaire.direction
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
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'nombre_jours': nombre_jours,
                'date_transmission': str(d.date_soumission),
                'statut': d.statut
            })
        
        print(f"✅ {len(result)} demandes transmises trouvées")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Secrétaire non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_demandes_transmises_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_transmises_secretaire_dapaf(request, matricule_secretaire):
    try:
        print(f"=== get_demandes_transmises_secretaire_dapaf for: {matricule_secretaire}")
        
        secretaire = Agent.objects.get(matricule=matricule_secretaire)
        
        demandes = Demande.objects.filter(
            statut='transmise_dapaf',
            agent__direction=secretaire.direction
        ).select_related('agent', 'type_demande', 'demandeconge')
        
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            nombre_jours = None
            
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
                nombre_jours = d.demandeconge.nombrejours
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'nombre_jours': nombre_jours,
                'date_transmission': str(d.date_soumission),
                'statut': d.statut
            })
        
        print(f"✅ {len(result)} demandes transmises au DAPAF trouvées")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Secrétaire non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_demandes_transmises_secretaire_dapaf: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_transmettre_secretaire_dpaf(request, matricule_secretaire):
    try:
        print(f"=== get_actes_a_transmettre_secretaire_dpaf for: {matricule_secretaire}")
        
        types_dpaf = [
            "Autorisation d'absence exceptionnelle",
            'Reprise de service', 
            'Attestation de travail'
        ]
        
        actes = ActeAdministratif.objects.filter(
            statut='envoye_secretaire',
            type_acte__in=types_dpaf
        ).select_related('demande__agent')
        
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'id': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'reference': acte.reference,
                    'date_reception': str(acte.date_generation)
                })
                print(f"✅ Acte trouvé: {acte.reference} - {acte.type_acte}")
        
        print(f"✅ Total actes à transmettre au DPAF: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_a_transmettre_secretaire_dpaf: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_transmettre_secretaire_dapaf(request, matricule_secretaire):
    try:
        print(f"=== get_actes_a_transmettre_secretaire_dapaf for: {matricule_secretaire}")
        
        types_dapaf = [
            'Autorisation de jouissance de congé administratif',
            'Attestation de présence au poste',
            'Attestation de validité de services',
            'Certificat de non-jouissance de congé'
        ]
        
        actes = ActeAdministratif.objects.filter(
            statut='envoye_secretaire',
            type_acte__in=types_dapaf
        ).select_related('demande__agent')
        
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'id': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'reference': acte.reference,
                    'date_reception': str(acte.date_generation)
                })
        
        print(f"✅ Total actes à transmettre au DAPAF: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_a_transmettre_secretaire_dapaf: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_transmettre_secretaire(request, matricule_secretaire):
    """Récupérer les actes reçus des RH à transmettre au DPAF"""
    try:
        print(f"=== get_actes_a_transmettre_secretaire for: {matricule_secretaire}")
        
        actes = ActeAdministratif.objects.filter(
            statut='envoye_secretaire'
        ).select_related('demande__agent')
        
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'id': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'reference': acte.reference,
                    'date_reception': str(acte.date_generation)
                })
                print(f"✅ Acte ajouté: {acte.reference} pour {acte.demande.agent.nom}")
        
        print(f"✅ Total actes à transmettre: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_a_transmettre_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_remettre_secretaire(request, matricule_secretaire):
    try:
        print(f"=== get_actes_a_remettre_secretaire for: {matricule_secretaire}")
        
        actes = ActeAdministratif.objects.filter(
            statut='signe'
        ).select_related('demande__agent')
        
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'id': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'reference': acte.reference,
                    'date_signature': str(acte.date_generation)
                })
        
        print(f"✅ Total actes à remettre: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_a_remettre_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_recus_secretaire(request, matricule_secretaire):
    try:
        print(f"=== get_actes_recus_secretaire for: {matricule_secretaire}")
        
        actes = ActeAdministratif.objects.filter(
            statut='envoye_secretaire'
        ).select_related('demande__agent')
        
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'id': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'reference': acte.reference,
                    'date_reception': str(acte.date_generation)
                })
        
        print(f"✅ Total actes reçus: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_recus_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def transmettre_acte(request, reference):
    try:
        data = json.loads(request.body)
        secretaire_matricule = data.get('secretaire_matricule')
        commentaire = data.get('commentaire', '')
        destinataire = data.get('destinataire', 'DPAF')
        
        acte = ActeAdministratif.objects.get(reference=reference)
        
        if destinataire == 'DPAF':
            acte.statut = 'attente_signature_dpaf'
        else:
            acte.statut = 'attente_signature_dapaf'
        
        acte.save()
        
        if destinataire == 'DPAF':
            responsable = Agent.objects.filter(
                agentrole__role__libelle='dpaf',
                actif=1
            ).first()
        else:
            responsable = Agent.objects.filter(
                agentrole__role__libelle='dapaf',
                actif=1
            ).first()
        
        if responsable:
            Notification.objects.create(
                agent_id=responsable.matricule,
                message=f"📄 Acte à signer pour {acte.demande.agent.nom} {acte.demande.agent.prenom} - Réf: {reference}",
                type_notification='acte_a_signer',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        return JsonResponse({'success': True, 'message': f'Acte transmis au {destinataire} pour signature', 'destinataire': destinataire})
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR transmettre_acte: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def transmettre_acte_dpaf(request, reference):
    """Secrétaire transmet un acte au DPAF pour signature"""
    try:
        data = json.loads(request.body)
        secretaire_matricule = data.get('secretaire_matricule')
        
        acte = ActeAdministratif.objects.get(reference=reference)
        
        acte.statut = 'attente_signature_dpaf'
        acte.save()
        
        dpaf = Agent.objects.filter(
            agentrole__role__libelle='dpaf',
            actif=1
        ).first()
        
        if dpaf:
            Notification.objects.create(
                agent_id=dpaf.matricule,
                message=f"📄 Acte à signer pour {acte.demande.agent.nom} {acte.demande.agent.prenom} - Réf: {reference}",
                type_notification='acte_a_signer',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        return JsonResponse({'success': True, 'message': 'Acte transmis au DPAF pour signature'})
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR transmettre_acte_dpaf: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def remettre_acte(request, reference):
    try:
        data = json.loads(request.body)
        secretaire_matricule = data.get('secretaire_matricule')
        
        acte = ActeAdministratif.objects.get(reference=reference)
        
        acte.statut = 'remis'
        acte.save()
        
        if acte.demande:
            acte.demande.statut = 'remis'
            acte.demande.save()
            
            Notification.objects.create(
                agent_id=acte.demande.agent.matricule,
                message=f"📄 Votre acte {acte.reference} est disponible au secrétariat",
                type_notification='acte_disponible',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        return JsonResponse({'success': True, 'message': 'Acte remis avec succès'})
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR remettre_acte: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== DPAF/DAPAF (FONCTIONS GÉNÉRIQUES) ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_a_assigner(request, matricule):
    try:
        user = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        
        print(f"🔍 Rôles de {matricule}: {roles}")
        
        if 'dpaf' in roles:
            statut = 'transmise_dpaf'
            destinataire = 'DPAF'
        elif 'dapaf' in roles:
            statut = 'transmise_dapaf'
            destinataire = 'DAPAF'
        else:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        demandes = Demande.objects.filter(statut=statut).select_related('agent', 'type_demande')
        
        result = []
        for d in demandes:
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_transmission': str(d.date_soumission),
                'statut': d.statut,
                'destinataire': destinataire
            })
        
        print(f"✅ {len(result)} demandes à assigner pour {matricule} ({destinataire})")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_demandes_a_assigner: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_assignees_by_role(request, matricule):
    try:
        user = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        
        print(f"🔍 Rôles pour demandes assignées: {roles}")
        
        if 'dpaf' in roles:
            types_demandes = ['Absence', 'Reprise de service']
            demandes = Demande.objects.filter(
                statut__in=['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine', 'remis'],
                type_demande__libelle__in=types_demandes
            ).select_related('agent', 'type_demande', 'agent_rh')
        elif 'dapaf' in roles:
            types_demandes = ['Congé', 'Autorisation de jouissance de congé administratif']
            demandes = Demande.objects.filter(
                statut__in=['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine', 'remis'],
                type_demande__libelle__in=types_demandes
            ).select_related('agent', 'type_demande', 'agent_rh')
        else:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        result = []
        for d in demandes:
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'statut': d.statut,
                'agent_rh_nom': d.agent_rh.nom if d.agent_rh else None,
                'agent_rh_prenom': d.agent_rh.prenom if d.agent_rh else None,
                'date_assignation': str(d.date_assignation) if hasattr(d, 'date_assignation') and d.date_assignation else str(d.date_soumission)
            })
        
        print(f"✅ {len(result)} demandes assignées pour {matricule}")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_demandes_assignees_by_role: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_signer_by_role(request, matricule):
    """Récupérer les actes à signer selon le rôle (DPAF ou DAPAF) - VERSION AVEC LOGS"""
    try:
        print("=" * 70)
        print("🔍 [DEBUG] get_actes_a_signer_by_role - DÉBUT")
        print(f"📌 Matricule reçu: {matricule}")
        print("=" * 70)
        
        user = Agent.objects.get(matricule=matricule)
        print(f"✅ Utilisateur trouvé: {user.nom} {user.prenom}")
        
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        print(f"📌 Rôles de l'utilisateur: {roles}")
        
        if 'dpaf' in roles:
            types_actes = [
                'Attestation de travail', 
                'Absence', 
                'Reprise de service', 
                "Autorisation d'absence exceptionnelle"
            ]
            statut_cible = 'attente_signature_dpaf'
            destinataire = 'DPAF'
            print(f"🎯 Destinataire: {destinataire}")
            print(f"📋 Types d'actes à chercher: {types_actes}")
            print(f"📋 Statut cible: {statut_cible}")
            
            tous_actes_absence = ActeAdministratif.objects.filter(type_acte="Autorisation d'absence exceptionnelle")
            print(f"\n🔍 Vérification de tous les actes 'Autorisation d'absence exceptionnelle':")
            print(f"   Total trouvés: {tous_actes_absence.count()}")
            for a in tous_actes_absence:
                print(f"   - Réf: {a.reference}, Statut: '{a.statut}', Date: {a.date_generation}")
            
            tous_actes_attente = ActeAdministratif.objects.filter(statut='attente_signature_dpaf')
            print(f"\n🔍 Vérification de tous les actes avec statut 'attente_signature_dpaf':")
            print(f"   Total trouvés: {tous_actes_attente.count()}")
            for a in tous_actes_attente:
                print(f"   - Réf: {a.reference}, Type: '{a.type_acte}', Date: {a.date_generation}")
            
            actes = ActeAdministratif.objects.filter(
                statut=statut_cible,
                type_acte__in=types_actes
            ).select_related('demande__agent')
            
            print(f"\n🔍 Actes après filtrage complet:")
            print(f"   Nombre trouvé: {actes.count()}")
            
        elif 'dapaf' in roles:
            types_actes = [
                'Autorisation de jouissance de congé administratif',
                'Attestation de présence au poste',
                'Attestation de validité de services',
                'Certificat de non-jouissance de congé'
            ]
            statut_cible = 'attente_signature_dapaf'
            destinataire = 'DAPAF'
            print(f"🎯 Destinataire: {destinataire}")
            print(f"📋 Types d'actes à chercher: {types_actes}")
            print(f"📋 Statut cible: {statut_cible}")
            
            tous_actes_conge = ActeAdministratif.objects.filter(type_acte="Autorisation de jouissance de congé administratif")
            print(f"\n🔍 Vérification de tous les actes 'Autorisation de jouissance de congé administratif':")
            print(f"   Total trouvés: {tous_actes_conge.count()}")
            for a in tous_actes_conge:
                print(f"   - Réf: {a.reference}, Statut: '{a.statut}', Date: {a.date_generation}")
            
            tous_actes_attente = ActeAdministratif.objects.filter(statut='attente_signature_dapaf')
            print(f"\n🔍 Vérification de tous les actes avec statut 'attente_signature_dapaf':")
            print(f"   Total trouvés: {tous_actes_attente.count()}")
            for a in tous_actes_attente:
                print(f"   - Réf: {a.reference}, Type: '{a.type_acte}', Date: {a.date_generation}")
            
            actes = ActeAdministratif.objects.filter(
                statut=statut_cible,
                type_acte__in=types_actes
            ).select_related('demande__agent')
            
            print(f"\n🔍 Actes après filtrage complet:")
            print(f"   Nombre trouvé: {actes.count()}")
            
        else:
            print(f"❌ Rôle non autorisé: {roles}")
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'reference': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'date_generation': str(acte.date_generation),
                    'date_demande': str(acte.date_generation)
                })
                print(f"   ✅ Acte ajouté: {acte.reference} - {acte.type_acte}")
        
        print(f"\n✅ FINAL - {len(result)} acte(s) à signer pour {matricule} ({destinataire})")
        print("=" * 70)
        
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        print(f"❌ ERREUR: Agent {matricule} non trouvé")
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"❌ ERREUR get_actes_a_signer_by_role: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_historique_by_role(request, matricule):
    try:
        user = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        
        print(f"🔍 Rôles pour historique: {roles}")
        
        if 'dpaf' in roles:
            types_demandes = ['Absence', 'Reprise de service']
            demandes = Demande.objects.filter(
                statut__in=['termine', 'remis', 'signe'],
                type_demande__libelle__in=types_demandes
            ).select_related('agent', 'type_demande', 'agent_rh').order_by('-date_soumission')
        elif 'dapaf' in roles:
            types_demandes = ['Congé', 'Autorisation de jouissance de congé administratif']
            demandes = Demande.objects.filter(
                statut__in=['termine', 'remis', 'signe'],
                type_demande__libelle__in=types_demandes
            ).select_related('agent', 'type_demande', 'agent_rh').order_by('-date_soumission')
        else:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        result = []
        for d in demandes:
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'statut': d.statut,
                'agent_rh_nom': d.agent_rh.nom if d.agent_rh else None,
                'agent_rh_prenom': d.agent_rh.prenom if d.agent_rh else None,
                'date_soumission': str(d.date_soumission)
            })
        
        print(f"✅ {len(result)} demandes dans l'historique pour {matricule}")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_demandes_historique_by_role: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== AUTRES FONCTIONS DPAF/DAPAF ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_agents_rh(request):
    try:
        print(f"=== get_agents_rh called")
        agents_rh = Agent.objects.filter(
            agentrole__role__libelle='rh',
            actif=1
        ).select_related('agentrole__role')
        
        result = [{
            'matricule': a.matricule,
            'nom': a.nom,
            'prenom': a.prenom,
            'poste': a.poste or 'Agent RH',
            'email': a.email
        } for a in agents_rh]
        
        print(f"✅ {len(result)} agents RH trouvés")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def assigner_demande_rh(request, demande_id):
    try:
        data = json.loads(request.body)
        agent_rh_matricule = data.get('agent_rh_matricule')
        commentaire = data.get('commentaire', '')
        
        demande = Demande.objects.get(id=demande_id)
        agent_rh = Agent.objects.get(matricule=agent_rh_matricule)
        
        demande.statut = 'assignee_rh'
        demande.agent_rh = agent_rh
        demande.date_assignation = datetime.now().date()
        demande.commentaire_responsable = commentaire
        demande.save()
        
        return JsonResponse({'success': True, 'message': 'Demande assignée avec succès'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_transmises_dpaf(request, matricule_dpaf):
    try:
        print(f"=== get_demandes_transmises_dpaf for: {matricule_dpaf}")
        demandes = Demande.objects.filter(statut='transmise_dpaf').select_related('agent', 'type_demande')
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            if hasattr(d, 'demandeabsence') and d.demandeabsence:
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
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_transmises_dapaf(request, matricule_dapaf):
    try:
        print(f"=== get_demandes_transmises_dapaf for: {matricule_dapaf}")
        demandes = Demande.objects.filter(statut='transmise_dapaf').select_related('agent', 'type_demande', 'demandeconge')
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
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
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_assignees_dpaf(request, matricule_dpaf):
    try:
        print(f"=== get_demandes_assignees_dpaf for: {matricule_dpaf}")
        demandes = Demande.objects.filter(
            statut__in=['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine'],
            type_demande__libelle='Absence'
        ).select_related('agent', 'type_demande', 'agent_rh')
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            if hasattr(d, 'demandeabsence') and d.demandeabsence:
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
                'agent_rh_nom': d.agent_rh.nom if d.agent_rh else None,
                'agent_rh_prenom': d.agent_rh.prenom if d.agent_rh else None,
                'statut': d.statut,
                'date_assignation': str(getattr(d, 'date_assignation', d.date_soumission))
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_assignees_dapaf(request, matricule_dapaf):
    try:
        print(f"=== get_demandes_assignees_dapaf for: {matricule_dapaf}")
        demandes = Demande.objects.filter(
            statut__in=['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine'],
            type_demande__libelle='Congé'
        ).select_related('agent', 'type_demande', 'agent_rh')
        result = []
        for d in demandes:
            date_debut = None
            date_fin = None
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut)
                date_fin = str(d.demandeconge.date_fin)
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'agent_rh_nom': d.agent_rh.nom if d.agent_rh else None,
                'agent_rh_prenom': d.agent_rh.prenom if d.agent_rh else None,
                'statut': d.statut,
                'date_assignation': str(getattr(d, 'date_assignation', d.date_soumission))
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_signer_dpaf(request, matricule_dpaf):
    try:
        print(f"=== get_actes_a_signer_dpaf for: {matricule_dpaf}")
        types_dpaf = ['Absence', 'Reprise de service']
        actes = ActeAdministratif.objects.filter(
            statut='attente_signature_dpaf',
            type_acte__in=types_dpaf
        ).select_related('demande__agent')
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'id': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'reference': acte.reference,
                    'date_demande': str(acte.date_generation)
                })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_signer_dapaf(request, matricule_dapaf):
    try:
        print(f"=== get_actes_a_signer_dapaf for: {matricule_dapaf}")
        types_dapaf = [
            'Autorisation de jouissance de congé administratif',
            'Attestation de présence au poste',
            'Attestation de validité de services',
            'Certificat de non-jouissance de congé'
        ]
        actes = ActeAdministratif.objects.filter(
            statut='attente_signature_dapaf',
            type_acte__in=types_dapaf
        ).select_related('demande__agent')
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'id': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'reference': acte.reference,
                    'date_demande': str(acte.date_generation)
                })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def signer_acte_dpaf(request, reference):
    """DPAF signe l'acte - Ajoute automatiquement signature et cachet au template"""
    try:
        data = json.loads(request.body)
        dpaf_matricule = data.get('dpaf_matricule')
        commentaire = data.get('commentaire', '')
        
        acte = ActeAdministratif.objects.get(reference=reference)
        demande = acte.demande
        dpaf = Agent.objects.get(matricule=dpaf_matricule)
        
        # ✅ CORRECTION : Ajouter "Autorisation d'absence exceptionnelle"
        types_dpaf = [
            'Attestation de travail', 
            'Absence', 
            'Reprise de service',
            "Autorisation d'absence exceptionnelle"  # ← AJOUTE CETTE LIGNE
        ]
        
        if acte.type_acte not in types_dpaf:
            return JsonResponse({
                'error': f"Vous n'êtes pas autorisé à signer ce type d'acte: {acte.type_acte}"
            }, status=403)
        
        # Récupérer signature et cachet du DPAF
        signature_base64 = dpaf.signature if hasattr(dpaf, 'signature') and dpaf.signature else None
        cachet_base64 = dpaf.cachet if hasattr(dpaf, 'cachet') and dpaf.cachet else None
        
        if not signature_base64 or not cachet_base64:
            return JsonResponse({
                'error': 'Signature ou cachet manquant. Veuillez uploader votre signature et votre cachet dans votre profil.'
            }, status=400)
        
        pdf_bytes = generer_acte_avec_signature_et_cachet(
            acte=acte,
            demande=demande,
            signataire=dpaf,
            signature_base64=signature_base64,
            cachet_base64=cachet_base64,
            commentaire=commentaire
        )
        
        acte.statut = 'signe'
        acte.signe_par = f"{dpaf.prenom} {dpaf.nom}"
        acte.signe_le = datetime.now()
        acte.fichier_pdf_signe = base64.b64encode(pdf_bytes).decode('utf-8')
        acte.save()
        
        # Notifier la secrétaire
        secretaire = Agent.objects.filter(
            agentrole__role__libelle='secretaire',
            direction=demande.agent.direction,
            actif=1
        ).first()
        
        if secretaire:
            Notification.objects.create(
                agent_id=secretaire.matricule,
                message=f"✅ Acte signé par {dpaf.prenom} {dpaf.nom} (DPAF) - Réf: {reference}",
                type_notification='acte_signe',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        # Notifier l'agent
        Notification.objects.create(
            agent_id=demande.agent.matricule,
            message=f"📄 Votre acte {reference} a été signé par le DPAF et est disponible au secrétariat",
            type_notification='acte_signe',
            date_envoi=datetime.now().date(),
            lue=0
        )
        
        return _create_pdf_response(pdf_bytes, f'Acte_Signe_{reference}')
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'DPAF non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR signer_acte_dpaf: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)
    

@csrf_exempt
@require_http_methods(["PUT"])
def signer_acte_dapaf(request, reference):
    try:
        data = json.loads(request.body)
        dapaf_matricule = data.get('dapaf_matricule')
        commentaire = data.get('commentaire', '')
        
        acte = ActeAdministratif.objects.get(reference=reference)
        demande = acte.demande
        dapaf = Agent.objects.get(matricule=dapaf_matricule)
        
        types_dapaf = [
            'Autorisation de jouissance de congé administratif',
            'Attestation de présence au poste',
            'Attestation de validité de services',
            'Certificat de non-jouissance de congé'
        ]
        
        if acte.type_acte not in types_dapaf:
            return JsonResponse({'error': f"Vous n'êtes pas autorisé à signer ce type d'acte: {acte.type_acte}"}, status=403)
        
        signature_base64 = dapaf.signature if hasattr(dapaf, 'signature') and dapaf.signature else None
        cachet_base64 = dapaf.cachet if hasattr(dapaf, 'cachet') and dapaf.cachet else None
        
        if not signature_base64 or not cachet_base64:
            return JsonResponse({'error': 'Signature ou cachet manquant.'}, status=400)
        
        pdf_bytes = generer_acte_avec_signature_et_cachet(
            acte=acte, demande=demande, signataire=dapaf,
            signature_base64=signature_base64, cachet_base64=cachet_base64, commentaire=commentaire
        )
        
        acte.statut = 'signe'
        acte.signe_par = f"{dapaf.prenom} {dapaf.nom}"
        acte.signe_le = datetime.now()
        acte.fichier_pdf_signe = base64.b64encode(pdf_bytes).decode('utf-8')
        acte.save()
        
        secretaire = Agent.objects.filter(
            agentrole__role__libelle='secretaire',
            direction=demande.agent.direction,
            actif=1
        ).first()
        
        if secretaire:
            Notification.objects.create(
                agent_id=secretaire.matricule,
                message=f"✅ Acte signé par {dapaf.prenom} {dapaf.nom} (DAPAF) - Réf: {reference}",
                type_notification='acte_signe',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        Notification.objects.create(
            agent_id=demande.agent.matricule,
            message=f"📄 Votre acte {reference} a été signé par le DAPAF et est disponible au secrétariat",
            type_notification='acte_signe',
            date_envoi=datetime.now().date(),
            lue=0
        )
        
        return _create_pdf_response(pdf_bytes, f'Acte_Signe_{reference}')
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'DAPAF non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR signer_acte_dapaf: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


def generer_acte_avec_signature_et_cachet(acte, demande, signataire, signature_base64=None, cachet_base64=None, commentaire=""):
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from io import BytesIO
    
    if demande.type_demande.libelle == 'Congé':
        template_name = 'autorisation_conge_template.docx'
    else:
        template_name = 'autorisation_absence_template.docx'
    
    template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', template_name)
    
    if not os.path.exists(template_path):
        raise Exception(f"Template {template_name} non trouvé")
    
    doc = Document(template_path)
    
    if hasattr(demande, 'demandeconge') and demande.demandeconge:
        date_debut = demande.demandeconge.date_debut.strftime('%d/%m/%Y')
        date_fin = demande.demandeconge.date_fin.strftime('%d/%m/%Y')
        nombre_jours = demande.demandeconge.nombrejours
        motif = ''
    else:
        date_debut = demande.demandeabsence.date_debut.strftime('%d/%m/%Y') if hasattr(demande, 'demandeabsence') else ''
        date_fin = demande.demandeabsence.date_fin.strftime('%d/%m/%Y') if hasattr(demande, 'demandeabsence') else ''
        nombre_jours = demande.demandeabsence.nombrejours if hasattr(demande, 'demandeabsence') else ''
        motif = demande.demandeabsence.motif if hasattr(demande, 'demandeabsence') else ''
    
    numero_seul = acte.reference.split('/')[0] if '/' in acte.reference else acte.reference
    
    replacements = {
        '{{REFERENCE}}': numero_seul,
        '{{AGENT_NOM}}': demande.agent.nom.upper(),
        '{{AGENT_PRENOM}}': demande.agent.prenom,
        '{{AGENT_POSTE}}': demande.agent.poste or 'Agent',
        '{{DATE_DEBUT}}': date_debut,
        '{{DATE_FIN}}': date_fin,
        '{{NOMBRE_JOURS}}': str(nombre_jours),
        '{{MOTIF}}': motif,
        '{{DATE_AUJOURD_HUI}}': datetime.now().strftime('%d/%m/%Y'),
        '{{ANNEE}}': str(datetime.now().year)
    }
    
    for paragraph in doc.paragraphs:
        for key, value in replacements.items():
            if key in paragraph.text:
                paragraph.text = paragraph.text.replace(key, value)
    
    agent_roles = AgentRole.objects.filter(agent=signataire).select_related('role')
    roles = [ar.role.libelle.lower() for ar in agent_roles]
    
    nom_a_chercher = None
    if 'dapaf' in roles:
        nom_a_chercher = 'Augustine KPOGLO'
    elif 'dpaf' in roles:
        nom_a_chercher = 'Comlan Amour Abel KPOCHEME'
    else:
        nom_a_chercher = f"{signataire.prenom} {signataire.nom}".upper()
    
    signature_ajoutee = False
    for i, paragraph in enumerate(doc.paragraphs):
        if nom_a_chercher and nom_a_chercher.upper() in paragraph.text.upper():
            new_paragraph = doc.paragraphs[i].insert_paragraph_before()
            new_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            
            if signature_base64:
                try:
                    sig_clean = signature_base64.split(',')[1] if ',' in signature_base64 else signature_base64
                    sig_bytes = base64.b64decode(sig_clean)
                    sig_stream = BytesIO(sig_bytes)
                    new_paragraph.add_run().add_picture(sig_stream, width=Pt(130))
                    signature_ajoutee = True
                except Exception as e:
                    print(f"Erreur signature: {e}")
            
            new_paragraph.add_run("   ")
            
            if cachet_base64:
                try:
                    cachet_clean = cachet_base64.split(',')[1] if ',' in cachet_base64 else cachet_base64
                    cachet_bytes = base64.b64decode(cachet_clean)
                    cachet_stream = BytesIO(cachet_bytes)
                    new_paragraph.add_run().add_picture(cachet_stream, width=Pt(90))
                except Exception as e:
                    print(f"Erreur cachet: {e}")
            
            break
    
    if not signature_ajoutee:
        mots_cles = []
        if 'dapaf' in roles:
            mots_cles = ['Augustine', 'KPOGLO']
        elif 'dpaf' in roles:
            mots_cles = ['Comlan', 'KPOCHEME']
        
        for i, paragraph in enumerate(doc.paragraphs):
            texte_para = paragraph.text.upper()
            trouve = False
            for mot in mots_cles:
                if mot.upper() in texte_para:
                    trouve = True
                    break
            
            if trouve:
                new_paragraph = doc.paragraphs[i].insert_paragraph_before()
                new_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                
                if signature_base64:
                    try:
                        sig_clean = signature_base64.split(',')[1] if ',' in signature_base64 else signature_base64
                        sig_bytes = base64.b64decode(sig_clean)
                        sig_stream = BytesIO(sig_bytes)
                        new_paragraph.add_run().add_picture(sig_stream, width=Pt(130))
                        signature_ajoutee = True
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                
                new_paragraph.add_run("   ")
                
                if cachet_base64:
                    try:
                        cachet_clean = cachet_base64.split(',')[1] if ',' in cachet_base64 else cachet_base64
                        cachet_bytes = base64.b64decode(cachet_clean)
                        cachet_stream = BytesIO(cachet_bytes)
                        new_paragraph.add_run().add_picture(cachet_stream, width=Pt(90))
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                break
    
    _set_document_font(doc, font_name='Times New Roman', font_size_pt=12)
    
    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    
    return _docx_bytes_to_pdf_bytes(output.getvalue())


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_historique_dpaf(request, matricule_dpaf):
    try:
        demandes = Demande.objects.select_related('agent', 'type_demande', 'agent_rh').order_by('-date_soumission')
        result = []
        for d in demandes:
            agent_rh_nom = d.agent_rh.nom if d.agent_rh else None
            agent_rh_prenom = d.agent_rh.prenom if d.agent_rh else None
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'statut': d.statut,
                'date_soumission': str(d.date_soumission),
                'date_assignation': str(getattr(d, 'date_assignation', '')) or None,
                'agent_rh_nom': agent_rh_nom,
                'agent_rh_prenom': agent_rh_prenom,
                'numerosuivi': d.numerosuivi,
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== RH ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_assignees_rh(request, matricule_rh):
    try:
        print(f"=== get_demandes_assignees_rh for: {matricule_rh}")
        demandes = Demande.objects.filter(
            agent_rh__matricule=matricule_rh,
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
                'statut': d.statut
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def commencer_traitement_rh(request, demande_id):
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
    try:
        data = json.loads(request.body)
        reference = data.get('reference')
        rh_matricule = data.get('rh_matricule')
        
        demande = Demande.objects.get(id=demande_id)

        demande_type_label = demande.type_demande.libelle if demande.type_demande else ''
        demande_type_lower = demande_type_label.lower()
        is_conge = demande_type_lower == 'congé' or demande_type_lower == 'conge'
        is_absence = 'absence' in demande_type_lower

        annee_conge = None
        if is_conge and hasattr(demande, 'demandeconge') and demande.demandeconge:
            annee_conge = demande.demandeconge.date_debut.year
        else:
            annee_conge = datetime.now().year

        if is_conge:
            template_name = 'autorisation_conge_template.docx'
            type_acte = 'Autorisation de jouissance de congé administratif'
            if hasattr(demande, 'demandeconge') and demande.demandeconge:
                date_debut = demande.demandeconge.date_debut.strftime('%d/%m/%Y')
                date_fin = demande.demandeconge.date_fin.strftime('%d/%m/%Y')
                nombre_jours = demande.demandeconge.nombrejours
            else:
                date_debut = date_fin = nombre_jours = ''
            motif = ''
            filename_prefix = 'Autorisation_Conge'
        elif is_absence:
            template_name = 'autorisation_absence_template.docx'
            type_acte = "Autorisation d'absence exceptionnelle"
            if hasattr(demande, 'demandeabsence') and demande.demandeabsence:
                date_debut = demande.demandeabsence.date_debut.strftime('%d/%m/%Y')
                date_fin = demande.demandeabsence.date_fin.strftime('%d/%m/%Y')
                nombre_jours = demande.demandeabsence.nombrejours
                motif = demande.demandeabsence.motif if demande.demandeabsence.motif else ''
            else:
                date_debut = date_fin = nombre_jours = motif = ''
            filename_prefix = 'Autorisation_Absence'
        else:
            return JsonResponse({'error': 'Type de demande non supporté'}, status=400)

        template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', template_name)
        
        if not os.path.exists(template_path):
            return JsonResponse({'error': f'Template non trouvé: {template_path}'}, status=500)
        
        doc = Document(template_path)

        numero_seul = reference.split('/')[0] if '/' in reference else reference
        
        replacements = {
            '{{REFERENCE}}': numero_seul,
            '{{AGENT_NOM}}': demande.agent.nom.upper(),
            '{{AGENT_PRENOM}}': demande.agent.prenom,
            '{{AGENT_POSTE}}': demande.agent.poste or 'Agent',
            '{{DATE_DEBUT}}': date_debut,
            '{{DATE_FIN}}': date_fin,
            '{{NOMBRE_JOURS}}': str(nombre_jours),
            '{{MOTIF}}': motif,
            '{{DATE_AUJOURD_HUI}}': datetime.now().strftime('%d/%m/%Y'),
            '{{ANNEE}}': str(datetime.now().year),
            '{{ANNE_CONGE}}': str(annee_conge) if annee_conge else str(datetime.now().year)
        }

        _replace_placeholders_in_doc(doc, replacements)
        _set_document_font(doc, font_name='Times New Roman', font_size_pt=12)

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"⚠️ ERREUR conversion PDF: {e}")
            return _create_docx_response(docx_bytes, f'{filename_prefix}_{demande.agent.nom}_{demande.agent.prenom}')

        reference_complete = f"{numero_seul}/MND/DPAF/SRHDS/SA"
        fichier_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

        acte = ActeAdministratif.objects.create(
            reference=reference_complete,
            demande=demande,
            type_acte=type_acte,
            statut='genere',
            date_generation=datetime.now().date(),
            contenu='Acte généré automatiquement',
            fichier_pdf=fichier_base64
        )

        demande.statut = 'acte_genere'
        demande.reference_acte = reference_complete
        demande.date_generation_acte = datetime.now().date()
        demande.save()

        return _create_pdf_response(pdf_bytes, f'{filename_prefix}_{demande.agent.nom}_{demande.agent.prenom}')
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        print(f"❌ ERREUR generer_acte_rh: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def envoyer_acte_secretaire(request, reference):
    try:
        data = json.loads(request.body)
        rh_matricule = data.get('rh_matricule')
        
        acte = ActeAdministratif.objects.get(reference=reference)
        acte.statut = 'envoye_secretaire'
        acte.save()
        
        if acte.demande:
            acte.demande.statut = 'envoye_secretaire'
            acte.demande.save()
            
            direction_agent = acte.demande.agent.direction
            secretaire = Agent.objects.filter(
                agentrole__role__libelle='secretaire',
                direction=direction_agent,
                actif=1
            ).first()
            
            if secretaire:
                Notification.objects.create(
                    agent_id=secretaire.matricule,
                    message=f"📄 Nouvel acte à remettre pour {acte.demande.agent.nom} {acte.demande.agent.prenom} - Réf: {reference}",
                    type_notification='acte_recu',
                    date_envoi=datetime.now().date(),
                    lue=0
                )
        
        return JsonResponse({'success': True, 'message': 'Acte envoyé à la secrétaire'})
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR envoyer_acte_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def download_acte(request, reference):
    try:
        acte = ActeAdministratif.objects.get(reference=reference)
        
        if acte.fichier_pdf_signe:
            fichier_bytes = base64.b64decode(acte.fichier_pdf_signe)
            if fichier_bytes.startswith(b'PK'):
                pdf_bytes = _docx_bytes_to_pdf_bytes(fichier_bytes)
            else:
                pdf_bytes = fichier_bytes
            return _create_pdf_response(pdf_bytes, f'acte_{reference}')
        
        if acte.fichier_pdf:
            fichier_bytes = base64.b64decode(acte.fichier_pdf)
            if fichier_bytes.startswith(b'PK'):
                pdf_bytes = _docx_bytes_to_pdf_bytes(fichier_bytes)
            else:
                pdf_bytes = fichier_bytes
            return _create_pdf_response(pdf_bytes, f'acte_{reference}')
        else:
            doc = Document()
            doc.add_paragraph(acte.contenu if acte.contenu else f"Acte {reference}")
            output = io.BytesIO()
            doc.save(output)
            output.seek(0)
            docx_bytes = output.getvalue()
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
            return _create_pdf_response(pdf_bytes, f'acte_{reference}')
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR download_acte: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_cours_rh(request, matricule_rh):
    try:
        print(f"=== get_demandes_cours_rh for: {matricule_rh}")
        demandes = Demande.objects.filter(
            agent_rh__matricule=matricule_rh,
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
                'statut': d.statut
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_terminees_rh(request, matricule_rh):
    try:
        print(f"=== get_demandes_terminees_rh for: {matricule_rh}")
        demandes = Demande.objects.filter(
            agent_rh__matricule=matricule_rh,
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
                'statut': d.statut
            })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def mes_demandes_conge(request, matricule):
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
                'numerosuivi': d.numerosuivi
            })
        return JsonResponse(result, safe=False)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def update_agent_role_by_matricule(request, matricule):
    try:
        data = json.loads(request.body)
        role_id = data.get('role_id')
        
        agent = Agent.objects.get(matricule=matricule)
        role = Role.objects.get(id=role_id)
        
        existing = AgentRole.objects.filter(agent=agent, role=role).first()
        
        if not existing:
            AgentRole.objects.create(agent=agent, role=role, date_attribution=date.today())
            return JsonResponse({'success': True, 'message': f'Rôle {role.libelle} ajouté'})
        else:
            return JsonResponse({'success': True, 'message': 'L\'agent a déjà ce rôle'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== ATTESTATIONS ====================

def nombre_en_toutes_lettres(n):
    nombres = {
        1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq',
        6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix',
        11: 'onze', 12: 'douze', 13: 'treize', 14: 'quatorze', 15: 'quinze',
        16: 'seize', 17: 'dix-sept', 18: 'dix-huit', 19: 'dix-neuf', 20: 'vingt',
        21: 'vingt-et-un', 22: 'vingt-deux', 23: 'vingt-trois', 24: 'vingt-quatre', 25: 'vingt-cinq',
        26: 'vingt-six', 27: 'vingt-sept', 28: 'vingt-huit', 29: 'vingt-neuf', 30: 'trente'
    }
    return nombres.get(n, str(n))


@csrf_exempt
@require_http_methods(["POST"])
def generer_attestation_presence(request):
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        agent = Agent.objects.get(matricule=matricule)
        
        signataire, role_name = get_signataire_par_type_acte('Attestation de présence au poste')
        
        if not signataire:
            return JsonResponse({'error': 'Aucun signataire DAPAF trouvé'}, status=500)
        
        if not signataire.signature or not signataire.cachet:
            return JsonResponse({'error': 'Signature ou cachet manquant pour le signataire DAPAF'}, status=400)
        
        nom_complet = f"{agent.nom} {agent.prenom}".upper()
        poste = agent.poste or 'Agent'
        
        if agent.date_prise_service:
            date_prise_service = agent.date_prise_service.strftime('%d %B %Y')
            mois_fr = {
                'January': 'janvier', 'February': 'février', 'March': 'mars',
                'April': 'avril', 'May': 'mai', 'June': 'juin',
                'July': 'juillet', 'August': 'août', 'September': 'septembre',
                'October': 'octobre', 'November': 'novembre', 'December': 'décembre'
            }
            for en, fr in mois_fr.items():
                date_prise_service = date_prise_service.replace(en, fr)
        else:
            date_prise_service = 'date non renseignée'
        
        date_aujourdhui = datetime.now().strftime('%d/%m/%Y')
        ref_number = f"{datetime.now().year}{datetime.now().strftime('%m%d%H%M%S')}"
        reference = ref_number
        
        template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', 'attestation_presence_template.docx')
        
        if not os.path.exists(template_path):
            return JsonResponse({'error': 'Template non trouvé'}, status=500)
        
        doc = Document(template_path)

        replacements = {
            '{{REFERENCE}}': reference,
            '{{NOM_COMPLET}}': nom_complet,
            '{{POSTE}}': poste,
            '{{DATE_PRISE_SERVICE}}': date_prise_service,
            '{{DATE_AUJOURD_HUI}}': date_aujourdhui
        }

        _replace_placeholders_in_doc(doc, replacements)
        _set_document_font(doc, font_name='Times New Roman', font_size_pt=12)

        signature_base64 = signataire.signature
        cachet_base64 = signataire.cachet
        
        for i, paragraph in enumerate(doc.paragraphs):
            if 'Augustine' in paragraph.text or 'KPOGLO' in paragraph.text:
                new_paragraph = doc.paragraphs[i].insert_paragraph_before()
                new_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                
                if signature_base64:
                    try:
                        sig_clean = signature_base64.split(',')[1] if ',' in signature_base64 else signature_base64
                        sig_bytes = base64.b64decode(sig_clean)
                        sig_stream = io.BytesIO(sig_bytes)
                        new_paragraph.add_run().add_picture(sig_stream, width=Pt(130))
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                
                new_paragraph.add_run("   ")
                
                if cachet_base64:
                    try:
                        cachet_clean = cachet_base64.split(',')[1] if ',' in cachet_base64 else cachet_base64
                        cachet_bytes = base64.b64decode(cachet_clean)
                        cachet_stream = io.BytesIO(cachet_bytes)
                        new_paragraph.add_run().add_picture(cachet_stream, width=Pt(90))
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                
                break

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"ERREUR conversion PDF: {e}")
            return _create_docx_response(docx_bytes, f'Attestation_Presence_{agent.nom}_{agent.prenom}')

        ActeAdministratif.objects.create(
            reference=reference,
            type_acte='Attestation de présence au poste',
            statut='genere',
            date_generation=datetime.now().date(),
            contenu=reference,
            fichier_pdf=base64.b64encode(pdf_bytes).decode('utf-8')
        )

        return _create_pdf_response(pdf_bytes, f'Attestation_Presence_{agent.nom}_{agent.prenom}')
        
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def generer_attestation_travail(request):
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        agent = Agent.objects.get(matricule=matricule)
        
        signataire, role_name = get_signataire_par_type_acte('Attestation de travail')
        
        if not signataire:
            return JsonResponse({'error': 'Aucun signataire Chef RH trouvé'}, status=500)
        
        if not signataire.signature or not signataire.cachet:
            return JsonResponse({'error': 'Signature ou cachet manquant pour le Chef RH'}, status=400)
        
        nom_complet = f"{agent.nom} {agent.prenom}".upper()
        poste = agent.poste or 'Administrateur'
        
        if agent.date_prise_service:
            date_prise_service = agent.date_prise_service.strftime('%d %B %Y')
            mois_fr = {
                'January': 'janvier', 'February': 'février', 'March': 'mars',
                'April': 'avril', 'May': 'mai', 'June': 'juin',
                'July': 'juillet', 'August': 'août', 'September': 'septembre',
                'October': 'octobre', 'November': 'novembre', 'December': 'décembre'
            }
            for en, fr in mois_fr.items():
                date_prise_service = date_prise_service.replace(en, fr)
        else:
            date_prise_service = 'date non renseignée'
        
        date_aujourdhui = datetime.now().strftime('%d/%m/%Y')
        ref_number = f"{datetime.now().year}{datetime.now().strftime('%m%d%H%M%S')}"
        reference = ref_number
        
        template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', 'attestation_travail_template.docx')
        
        if not os.path.exists(template_path):
            return JsonResponse({'error': f'Template non trouvé: {template_path}'}, status=500)
        
        doc = Document(template_path)

        replacements = {
            '{{REFERENCE}}': reference,
            '{{NOM_COMPLET}}': nom_complet,
            '{{POSTE}}': poste,
            '{{DATE_PRISE_SERVICE}}': date_prise_service,
            '{{DATE_AUJOURD_HUI}}': date_aujourdhui
        }

        _replace_placeholders_in_doc(doc, replacements)
        _set_document_font(doc, font_name='Times New Roman', font_size_pt=12)

        signature_base64 = signataire.signature
        cachet_base64 = signataire.cachet
        
        for i, paragraph in enumerate(doc.paragraphs):
            if 'Comlan' in paragraph.text or 'KPOCHEME' in paragraph.text.upper():
                new_paragraph = doc.paragraphs[i].insert_paragraph_before()
                new_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                
                if signature_base64:
                    try:
                        sig_clean = signature_base64.split(',')[1] if ',' in signature_base64 else signature_base64
                        sig_bytes = base64.b64decode(sig_clean)
                        sig_stream = io.BytesIO(sig_bytes)
                        new_paragraph.add_run().add_picture(sig_stream, width=Pt(130))
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                
                new_paragraph.add_run("   ")
                
                if cachet_base64:
                    try:
                        cachet_clean = cachet_base64.split(',')[1] if ',' in cachet_base64 else cachet_base64
                        cachet_bytes = base64.b64decode(cachet_clean)
                        cachet_stream = io.BytesIO(cachet_bytes)
                        new_paragraph.add_run().add_picture(cachet_stream, width=Pt(90))
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                
                break

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"ERREUR conversion PDF: {e}")
            return _create_docx_response(docx_bytes, f'Attestation_Travail_{agent.nom}_{agent.prenom}')

        ActeAdministratif.objects.create(
            reference=reference,
            type_acte='Attestation de travail',
            statut='genere',
            date_generation=datetime.now().date(),
            contenu=reference,
            fichier_pdf=base64.b64encode(pdf_bytes).decode('utf-8')
        )
        
        TypeDemande.objects.get_or_create(
            libelle='Attestation',
            defaults={'acte_generable': 1}
        )
        
        return _create_pdf_response(pdf_bytes, f'Attestation_Travail_{agent.nom}_{agent.prenom}')
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR generer_attestation_travail: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def generer_attestation_validite_services(request):
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        agent = Agent.objects.get(matricule=matricule)
        
        signataire, role_name = get_signataire_par_type_acte('Attestation de validité de services')
        
        if not signataire:
            return JsonResponse({'error': 'Aucun signataire DAPAF trouvé'}, status=500)
        
        if not signataire.signature or not signataire.cachet:
            return JsonResponse({'error': 'Signature ou cachet manquant pour le signataire DAPAF'}, status=400)
        
        nom_complet = f"{agent.nom} {agent.prenom}".upper()
        poste = agent.poste or 'Agent'
        
        echelon_complet = agent.echelon or 'A1-1'
        categorie = echelon_complet[0].upper()
        
        import re
        match = re.match(r'[A-Z](\d+)-(\d+)', echelon_complet)
        if match:
            echelon_numero = match.group(1)
            echelle_numero = match.group(2)
            echelon_format = f"échelle {echelle_numero}, échelon {echelon_numero}"
        else:
            echelon_format = "échelle 1, échelon 1"
        
        mois_fr = {
            'January': 'janvier', 'February': 'février', 'March': 'mars',
            'April': 'avril', 'May': 'mai', 'June': 'juin',
            'July': 'juillet', 'August': 'août', 'September': 'septembre',
            'October': 'octobre', 'November': 'novembre', 'December': 'décembre'
        }
        
        if agent.date_naissance:
            if categorie == 'A':
                age_retraite = 60
            elif categorie == 'B':
                age_retraite = 58
            elif categorie in ['C', 'D']:
                age_retraite = 55
            else:
                age_retraite = 60
            
            date_retraite = agent.date_naissance.replace(year=agent.date_naissance.year + age_retraite)
            date_retraite_str = date_retraite.strftime('1er %B %Y')
            for en, fr in mois_fr.items():
                date_retraite_str = date_retraite_str.replace(en, fr)
        else:
            date_retraite_str = 'date à déterminer'
        
        if agent.date_prise_service:
            date_prise_service = agent.date_prise_service.strftime('%d %B %Y')
            for en, fr in mois_fr.items():
                date_prise_service = date_prise_service.replace(en, fr)
        else:
            date_prise_service = 'date non renseignée'
        
        date_aujourdhui = datetime.now().strftime('%d/%m/%Y')
        ref_number = f"{datetime.now().year}{datetime.now().strftime('%m%d%H%M%S')}"
        reference = ref_number
        
        template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', 'attestation_validite_services_template.docx')
        
        if not os.path.exists(template_path):
            return JsonResponse({'error': f'Template non trouvé: {template_path}'}, status=500)
        
        doc = Document(template_path)

        replacements = {
            '{{REFERENCE}}': reference,
            '{{NOM_COMPLET}}': nom_complet,
            '{{POSTE}}': poste,
            '{{CATEGORIE}}': categorie,
            '{{ECHELON}}': echelon_format,
            '{{DATE_PRISE_SERVICE}}': date_prise_service,
            '{{DATE_RETRAITE}}': date_retraite_str,
            '{{DATE_AUJOURD_HUI}}': date_aujourdhui
        }

        _replace_placeholders_in_doc(doc, replacements)
        _set_document_font(doc, font_name='Times New Roman', font_size_pt=12)

        signature_base64 = signataire.signature
        cachet_base64 = signataire.cachet
        
        for i, paragraph in enumerate(doc.paragraphs):
            if 'Augustine' in paragraph.text or 'KPOGLO' in paragraph.text.upper():
                new_paragraph = doc.paragraphs[i].insert_paragraph_before()
                new_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                
                if signature_base64:
                    try:
                        sig_clean = signature_base64.split(',')[1] if ',' in signature_base64 else signature_base64
                        sig_bytes = base64.b64decode(sig_clean)
                        sig_stream = io.BytesIO(sig_bytes)
                        new_paragraph.add_run().add_picture(sig_stream, width=Pt(130))
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                
                new_paragraph.add_run("   ")
                
                if cachet_base64:
                    try:
                        cachet_clean = cachet_base64.split(',')[1] if ',' in cachet_base64 else cachet_base64
                        cachet_bytes = base64.b64decode(cachet_clean)
                        cachet_stream = io.BytesIO(cachet_bytes)
                        new_paragraph.add_run().add_picture(cachet_stream, width=Pt(90))
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                
                break

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"ERREUR conversion PDF: {e}")
            return _create_docx_response(docx_bytes, f'Attestation_Validite_Services_{agent.nom}_{agent.prenom}')

        ActeAdministratif.objects.create(
            reference=reference,
            type_acte='Attestation de validité de services',
            statut='genere',
            date_generation=datetime.now().date(),
            contenu=reference,
            fichier_pdf=base64.b64encode(pdf_bytes).decode('utf-8')
        )
        
        return _create_pdf_response(pdf_bytes, f'Attestation_Validite_Services_{agent.nom}_{agent.prenom}')
        
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def generer_certificat_non_jouissance(request):
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        annee = data.get('annee', datetime.now().year)
        agent = Agent.objects.get(matricule=matricule)
        
        conges_valides = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            demandeconge__date_debut__year=annee
        ).exclude(statut__in=['refuse', 'rejete', 'annule'])
        
        if conges_valides.exists():
            jours_pris = 0
            for c in conges_valides:
                if hasattr(c, 'demandeconge') and c.demandeconge:
                    jours_pris += c.demandeconge.nombrejours
            return JsonResponse({'error': f"Impossible de délivrer le certificat. L'agent a bénéficié d'un congé de {jours_pris} jours en {annee}."}, status=400)
        
        signataire, role_name = get_signataire_par_type_acte('Certificat de non-jouissance de congé')
        
        if not signataire:
            return JsonResponse({'error': 'Aucun signataire DAPAF trouvé'}, status=500)
        
        if not signataire.signature or not signataire.cachet:
            return JsonResponse({'error': 'Signature ou cachet manquant pour le signataire DAPAF'}, status=400)
        
        civilite = "Madame" if (agent.prenom.endswith('e') or agent.nom.endswith('e')) else "Monsieur"
        nom_complet = f"{agent.prenom} {agent.nom}"
        poste = agent.poste or 'Agent'
        date_aujourdhui = datetime.now().strftime('%d/%m/%Y')
        ref_number = f"{datetime.now().year}{datetime.now().strftime('%m%d%H%M%S')}"
        reference = ref_number
        
        template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', 'certificat_non_jouissance_template.docx')
        
        if not os.path.exists(template_path):
            return JsonResponse({'error': f'Template non trouvé: {template_path}'}, status=500)
        
        doc = Document(template_path)

        replacements = {
            '{{REFERENCE}}': reference,
            '{{CIVILITE}}': civilite,
            '{{NOM_COMPLET}}': nom_complet,
            '{{POSTE}}': poste,
            '{{ANNEE}}': str(annee),
            '{{DATE_AUJOURD_HUI}}': date_aujourdhui
        }

        _replace_placeholders_in_doc(doc, replacements)
        _set_document_font(doc, font_name='Times New Roman', font_size_pt=12)

        signature_base64 = signataire.signature
        cachet_base64 = signataire.cachet
        
        for i, paragraph in enumerate(doc.paragraphs):
            if 'Augustine' in paragraph.text or 'KPOGLO' in paragraph.text.upper():
                new_paragraph = doc.paragraphs[i].insert_paragraph_before()
                new_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                
                if signature_base64:
                    try:
                        sig_clean = signature_base64.split(',')[1] if ',' in signature_base64 else signature_base64
                        sig_bytes = base64.b64decode(sig_clean)
                        sig_stream = io.BytesIO(sig_bytes)
                        new_paragraph.add_run().add_picture(sig_stream, width=Pt(130))
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                
                new_paragraph.add_run("   ")
                
                if cachet_base64:
                    try:
                        cachet_clean = cachet_base64.split(',')[1] if ',' in cachet_base64 else cachet_base64
                        cachet_bytes = base64.b64decode(cachet_clean)
                        cachet_stream = io.BytesIO(cachet_bytes)
                        new_paragraph.add_run().add_picture(cachet_stream, width=Pt(90))
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                
                break

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"ERREUR conversion PDF: {e}")
            return _create_docx_response(docx_bytes, f'Certificat_Non_Jouissance_{agent.nom}_{agent.prenom}')

        ActeAdministratif.objects.create(
            reference=reference,
            type_acte='Certificat de non-jouissance de congé',
            statut='genere',
            date_generation=datetime.now().date(),
            contenu=reference,
            fichier_pdf=base64.b64encode(pdf_bytes).decode('utf-8')
        )
        
        return _create_pdf_response(pdf_bytes, f'Certificat_Non_Jouissance_{agent.nom}_{agent.prenom}')
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR generer_certificat_non_jouissance: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def verifier_conge_par_annee(request, matricule, annee):
    try:
        agent = Agent.objects.get(matricule=matricule)
        conges_valides = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            demandeconge__date_debut__year=annee
        ).exclude(statut__in=['refuse', 'rejete', 'annule'])
        return JsonResponse({
            'success': True,
            'a_bteneficie': conges_valides.exists(),
            'jours_pris': sum(c.demandeconge.nombrejours for c in conges_valides if hasattr(c, 'demandeconge')),
            'peut_obtenir_certificat': not conges_valides.exists()
        })
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== VÉRIFICATION DOCUMENTS EXPIRÉS ====================

@csrf_exempt
@require_http_methods(["GET"])
def check_expired_documents(request):
    try:
        today = date.today()
        count = 0
        
        pieces_expired = Piece.objects.filter(date_expiration__lte=today, valide=1)
        for piece in pieces_expired:
            agent = piece.dossier_agent.agent
            jours = (today - piece.date_expiration).days
            
            if jours == 0:
                message = f"⚠️ {piece.type_piece.libelle} expire aujourd'hui"
            elif jours == 1:
                message = f"⚠️ {piece.type_piece.libelle} a expiré hier"
            else:
                message = f"⚠️ {piece.type_piece.libelle} est expiré depuis {jours} jours"
            
            if not Notification.objects.filter(agent=agent, message__contains=piece.type_piece.libelle, type_notification='expiration', date_envoi=today).exists():
                Notification.objects.create(agent=agent, message=message, type_notification='expiration', date_envoi=today, lue=0)
                count += 1
        
        in_30_days = today + timedelta(days=30)
        pieces_expiring = Piece.objects.filter(date_expiration__gt=today, date_expiration__lte=in_30_days, valide=1)
        for piece in pieces_expiring:
            agent = piece.dossier_agent.agent
            jours = (piece.date_expiration - today).days
            if not Notification.objects.filter(agent=agent, message__contains=piece.type_piece.libelle, type_notification='expiration', date_envoi=today).exists():
                Notification.objects.create(agent=agent, message=f"⏰ {piece.type_piece.libelle} expire dans {jours} jours", type_notification='expiration', date_envoi=today, lue=0)
                count += 1
        
        return JsonResponse({'success': True, 'notifications_created': count, 'message': f'{count} notification(s) créée(s)'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== GESTION DES DOCUMENTS ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_documents(request):
    try:
        matricule = request.GET.get('matricule') or request.headers.get('X-User-Matricule')
        if not matricule:
            return JsonResponse({'error': 'Matricule requis'}, status=400)
        
        agent = Agent.objects.get(matricule=matricule)
        dossier, created = DossierAgent.objects.get_or_create(agent=agent, defaults={'datecreation': date.today(), 'taux_completude': 0})
        pieces = Piece.objects.filter(dossier_agent=dossier).select_related('type_piece')
        types_pieces = TypePiece.objects.all()
        
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
        
        documents_uploades_ids = [d['type_piece_id'] for d in documents]
        missing_documents = []
        for type_piece in types_pieces:
            if type_piece.obligatoire == 1 and type_piece.id not in documents_uploades_ids:
                missing_documents.append({'id': type_piece.id, 'libelle': type_piece.libelle, 'obligatoire': True})
        
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        documents_obligatoires_uploades = len([d for d in documents if d['type_piece_id'] in [tp.id for tp in types_pieces if tp.obligatoire == 1]])
        
        taux_completude = round((documents_obligatoires_uploades / total_obligatoire) * 100) if total_obligatoire > 0 else 100
        dossier.taux_completude = taux_completude
        dossier.save()
        
        return JsonResponse({
            'success': True,
            'dossier': {'id': dossier.id, 'date_creation': str(dossier.datecreation), 'taux_completude': taux_completude},
            'documents': documents,
            'missing_documents': missing_documents,
            'total_obligatoire': total_obligatoire,
            'total_uploades': len(documents)
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def upload_document(request):
    try:
        import unicodedata
        matricule = request.POST.get('matricule') or request.headers.get('X-User-Matricule')
        type_piece_id = request.POST.get('type_piece_id')
        file_base64 = request.POST.get('file_base64')
        file_name = request.POST.get('file_name')
        
        if file_name:
            try:
                file_name = unicodedata.normalize('NFKD', file_name).encode('ascii', 'ignore').decode('ascii')
            except:
                pass
        
        if not all([matricule, type_piece_id, file_base64, file_name]):
            return JsonResponse({'error': 'Tous les champs sont requis'}, status=400)
        
        agent = Agent.objects.get(matricule=matricule)
        type_piece = TypePiece.objects.get(id=type_piece_id)
        dossier, created = DossierAgent.objects.get_or_create(agent=agent, defaults={'datecreation': date.today(), 'taux_completude': 0})
        
        cleaned_base64 = file_base64.split('base64,')[1] if 'base64,' in file_base64 else file_base64
        
        date_expiration_str = request.POST.get('date_expiration')
        date_expiration = datetime.strptime(date_expiration_str, '%Y-%m-%d').date() if date_expiration_str else None
        
        anciennes_pieces = Piece.objects.filter(dossier_agent=dossier, type_piece=type_piece)
        if anciennes_pieces.exists():
            anciennes_pieces.delete()
        
        piece = Piece.objects.create(
            dossier_agent=dossier, type_piece=type_piece, nom_fichier=file_name,
            date_expiration=date_expiration, date_upload=date.today(), valide=1, cheminfichier=cleaned_base64
        )
        
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        pieces_obligatoires = Piece.objects.filter(dossier_agent=dossier, type_piece__obligatoire=1).count()
        taux = round((pieces_obligatoires / total_obligatoire) * 100) if total_obligatoire > 0 else 100
        dossier.taux_completude = taux
        dossier.save()
        
        return JsonResponse({'success': True, 'message': f'Document importé', 'piece_id': piece.id, 'taux_completude': taux})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def download_document(request, piece_id):
    try:
        matricule = request.GET.get('matricule') or request.headers.get('X-User-Matricule')
        if not matricule:
            return JsonResponse({'error': 'Matricule requis'}, status=400)
        
        piece = Piece.objects.select_related('dossier_agent__agent', 'type_piece').get(id=piece_id)
        agent_demandeur = piece.dossier_agent.agent
        
        if agent_demandeur.matricule != matricule:
            agent = Agent.objects.get(matricule=matricule)
            roles = AgentRole.objects.filter(agent=agent).values_list('role__libelle', flat=True)
            if 'rh' not in roles and 'admin' not in roles:
                return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        if not piece.cheminfichier:
            return JsonResponse({'error': 'Document vide'}, status=404)
        
        mime_type = 'application/pdf'
        if piece.nom_fichier.lower().endswith(('.jpg', '.jpeg')):
            mime_type = 'image/jpeg'
        elif piece.nom_fichier.lower().endswith('.png'):
            mime_type = 'image/png'
        
        return JsonResponse({'success': True, 'file_name': piece.nom_fichier, 'file_base64': piece.cheminfichier, 'mime_type': mime_type, 'type_piece': piece.type_piece.libelle})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_document(request, piece_id):
    try:
        matricule = request.headers.get('X-User-Matricule')
        if not matricule:
            return JsonResponse({'error': 'Non autorisé'}, status=401)
        
        piece = Piece.objects.select_related('dossier_agent__agent').get(id=piece_id)
        agent_demandeur = Agent.objects.get(matricule=matricule)
        roles = AgentRole.objects.filter(agent=agent_demandeur).values_list('role__libelle', flat=True)
        
        est_proprietaire = piece.dossier_agent.agent.matricule == matricule
        est_rh_ou_admin = 'rh' in roles or 'admin' in roles
        
        if not est_proprietaire and not est_rh_ou_admin:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        dossier = piece.dossier_agent
        piece.delete()
        
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        pieces_obligatoires = Piece.objects.filter(dossier_agent=dossier, type_piece__obligatoire=1).count()
        taux = round((pieces_obligatoires / total_obligatoire) * 100) if total_obligatoire > 0 else 100
        dossier.taux_completude = taux
        dossier.save()
        
        return JsonResponse({'success': True, 'message': 'Document supprimé', 'taux_completude': taux})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_documents_by_matricule(request, matricule):
    try:
        demandeur_matricule = request.headers.get('X-User-Matricule')
        if not demandeur_matricule:
            return JsonResponse({'error': 'Non autorisé'}, status=401)
        
        demandeur = Agent.objects.get(matricule=demandeur_matricule)
        roles = AgentRole.objects.filter(agent=demandeur).values_list('role__libelle', flat=True)
        if 'rh' not in roles and 'admin' not in roles:
            return JsonResponse({'error': 'Accès non autorisé'}, status=403)
        
        agent = Agent.objects.get(matricule=matricule)
        dossier, created = DossierAgent.objects.get_or_create(agent=agent, defaults={'datecreation': date.today(), 'taux_completude': 0})
        pieces = Piece.objects.filter(dossier_agent=dossier).select_related('type_piece')
        types_pieces = TypePiece.objects.all()
        
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
        
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        documents_obligatoires_uploades = len([d for d in documents if d['type_piece_id'] in [tp.id for tp in types_pieces if tp.obligatoire == 1]])
        taux = round((documents_obligatoires_uploades / total_obligatoire) * 100) if total_obligatoire > 0 else 100
        dossier.taux_completude = taux
        dossier.save()
        
        return JsonResponse({
            'success': True,
            'agent': {'matricule': agent.matricule, 'nom': agent.nom, 'prenom': agent.prenom},
            'dossier': {'id': dossier.id, 'date_creation': str(dossier.datecreation), 'taux_completude': taux},
            'documents': documents,
            'total_obligatoire': total_obligatoire,
            'total_uploades': len(documents)
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== GESTION DES ANOMALIES ====================

@csrf_exempt
@require_http_methods(["GET"])
def detect_anomalies(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        dossier = DossierAgent.objects.filter(agent=agent).first()
        if not dossier:
            return JsonResponse({'anomalies': [], 'score': 100, 'ai_analysis': 'Aucun dossier trouvé.'})
        
        pieces = Piece.objects.filter(dossier_agent=dossier).select_related('type_piece')
        anomalies = []
        score = 100
        today = date.today()
        
        for piece in pieces:
            if piece.date_expiration and piece.date_upload:
                if piece.date_expiration < piece.date_upload:
                    anomalies.append({'type': 'date_incoherente', 'severite': 'haute', 'message': f"Date d'expiration antérieure à la date d'upload pour {piece.type_piece.libelle}"})
                    score -= 15
        
        type_ids = [p.type_piece.id for p in pieces]
        doublons = [type_id for type_id, count in Counter(type_ids).items() if count > 1]
        for type_id in doublons:
            pieces_doublons = pieces.filter(type_piece_id=type_id)
            noms = [p.nom_fichier for p in pieces_doublons]
            type_libelle = pieces_doublons.first().type_piece.libelle
            anomalies.append({'type': 'doublon', 'severite': 'moyenne', 'message': f'⚠️ Doublon : {len(noms)} versions de "{type_libelle}"'})
            score -= 10
        
        if agent.date_prise_service and agent.echelon:
            anciennete = (today - agent.date_prise_service).days / 365
            try:
                echelon_num = int(agent.echelon.split('-')[0].replace('A', '').replace('B', '')) if agent.echelon else 1
            except:
                echelon_num = 1
            if anciennete > 10 and echelon_num < 3:
                anomalies.append({'type': 'anciennete_grade', 'severite': 'basse', 'message': f'Ancienneté élevée ({anciennete:.0f} ans) mais échelon bas ({agent.echelon})'})
                score -= 5
        
        score = max(0, min(100, score))
        
        resume = f"""Agent: {agent.prenom} {agent.nom}
Matricule: {agent.matricule}
Poste: {agent.poste or 'Non renseigné'}
Direction: {agent.direction or 'Non renseignée'}
Ancienneté: {(today - agent.date_prise_service).days // 365} ans
Taux de complétude: {dossier.taux_completude or 0}%

Documents importés ({pieces.count()}):
"""
        for p in pieces:
            statut = "EXPIRÉ" if (p.date_expiration and p.date_expiration < today) else "Valide"
            expiration = f" - Expire le {p.date_expiration}" if p.date_expiration else ""
            resume += f"- {p.type_piece.libelle}: {statut}{expiration}\n"
        
        types_obligatoires = TypePiece.objects.filter(obligatoire=1)
        manquants = types_obligatoires.exclude(id__in=pieces.values('type_piece_id'))
        if manquants.exists():
            resume += "\nDocuments obligatoires manquants:\n"
            for tp in manquants:
                resume += f"- {tp.libelle}\n"
        
        try:
            ai_response = ollama.chat(
                model='llama3.2:3b',
                messages=[{
                    'role': 'system',
                    'content': "Tu es un expert RH. Analyse ce dossier et donne : un résumé global, les points critiques, des recommandations, une note de conformité sur 10."
                }, {'role': 'user', 'content': f"Analyse ce dossier :\n\n{resume}"}]
            )
            ai_analysis = ai_response['message']['content']
        except Exception as e:
            print(f"Erreur Ollama: {e}")
            ai_analysis = "Analyse IA indisponible."
        
        return JsonResponse({
            'success': True,
            'agent': f"{agent.prenom} {agent.nom}",
            'anomalies': anomalies,
            'score': score,
            'total_anomalies': len(anomalies),
            'niveau_risque': 'faible' if score >= 80 else 'moyen' if score >= 50 else 'élevé',
            'ai_analysis': ai_analysis
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== SIGNATURE ET CACHET ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_signature_cachet(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        return JsonResponse({'signature': agent.signature if hasattr(agent, 'signature') else None, 'cachet': agent.cachet if hasattr(agent, 'cachet') else None})
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def upload_signature(request, matricule):
    try:
        data = json.loads(request.body)
        signature_base64 = data.get('signature')
        if not signature_base64:
            return JsonResponse({'error': 'Signature requise'}, status=400)
        agent = Agent.objects.get(matricule=matricule)
        agent.signature = signature_base64
        agent.save()
        return JsonResponse({'success': True, 'message': 'Signature enregistrée'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def upload_cachet(request, matricule):
    try:
        data = json.loads(request.body)
        cachet_base64 = data.get('cachet')
        if not cachet_base64:
            return JsonResponse({'error': 'Cachet requis'}, status=400)
        agent = Agent.objects.get(matricule=matricule)
        with connection.cursor() as cursor:
            cursor.execute("SELECT r.libelle FROM agent_role ar JOIN role r ON ar.role_id = r.id WHERE ar.agent_id = %s", [agent.matricule])
            roles = [row[0] for row in cursor.fetchall()]
        roles_avec_cachet = ['dpaf', 'dapaf', 'chef', 'admin']
        if not any(role in roles_avec_cachet for role in roles):
            return JsonResponse({'error': 'Vous n\'avez pas le droit d\'avoir un cachet officiel'}, status=403)
        agent.cachet = cachet_base64
        agent.save()
        return JsonResponse({'success': True, 'message': 'Cachet enregistré'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_signature(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        agent.signature = None
        agent.save()
        return JsonResponse({'success': True, 'message': 'Signature supprimée'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_cachet(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        agent.cachet = None
        agent.save()
        return JsonResponse({'success': True, 'message': 'Cachet supprimé'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_all_expired_documents(request):
    try:
        today = date.today()
        count = Piece.objects.filter(date_expiration__lte=today, valide=1).count()
        return JsonResponse({'success': True, 'total_expired': count})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_envoyer_rh(request, matricule_rh):
    try:
        print(f"=== get_actes_a_envoyer_rh for RH: {matricule_rh}")
        actes = ActeAdministratif.objects.filter(statut='genere', demande__agent_rh__matricule=matricule_rh).select_related('demande__agent')
        result = []
        for acte in actes:
            if acte.demande:
                result.append({
                    'id': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'reference': acte.reference,
                    'date_generation': str(acte.date_generation)
                })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== AVANCEMENTS ====================

def ajouter_annees(date_source, nb_annees):
    try:
        return date_source.replace(year=date_source.year + nb_annees)
    except ValueError:
        return date_source.replace(year=date_source.year + nb_annees, day=28)


def get_type_echelon(echelon):
    if echelon and len(echelon) > 0:
        return echelon[0].upper()
    return 'A'


def get_age_retraite(type_echelon):
    ages = {'A': 60, 'B': 58, 'C': 55, 'D': 55}
    return ages.get(type_echelon, 60)


def get_sous_indice(echelon):
    if echelon and '-' in echelon:
        try:
            return int(echelon.split('-')[1])
        except:
            return 1
    return 1


def get_partie_fixe(echelon):
    if echelon and '-' in echelon:
        return echelon.split('-')[0]
    if echelon:
        return echelon
    return 'A1'


def calculer_nouvel_echelon(echelon_actuel):
    if not echelon_actuel or '-' not in echelon_actuel:
        return f"{echelon_actuel or 'A1'}-2"
    partie_fixe = get_partie_fixe(echelon_actuel)
    sous_indice = get_sous_indice(echelon_actuel)
    nouveau = sous_indice + 1
    if nouveau > 11:
        return None
    return f"{partie_fixe}-{nouveau}"


def peut_avancer(agent, date_prevue):
    if not agent.date_naissance:
        return True
    type_echelon = get_type_echelon(agent.echelon or 'A1-1')
    age_retraite = get_age_retraite(type_echelon)
    date_retraite = agent.date_naissance.replace(year=agent.date_naissance.year + age_retraite)
    return date_prevue < date_retraite


def actualiser_avancements():
    today = date.today()
    agents = Agent.objects.filter(date_prise_service__isnull=False)
    with connection.cursor() as cursor:
        cursor.execute("TRUNCATE TABLE avancement")
    
    for agent in agents:
        if agent.typecontrat == 'ACE':
            premier_delai = 4 * 365
        else:
            premier_delai = 2 * 365
        anciennete = (today - agent.date_prise_service).days
        
        if agent.echelon and '-' in agent.echelon:
            partie_fixe = get_partie_fixe(agent.echelon)
        else:
            partie_fixe = get_type_echelon(agent.echelon or 'A1-1') + '1'
        echelon_base = f"{partie_fixe}-1"
        
        if anciennete < premier_delai:
            echelon_courant = echelon_base
            prochaine_date = ajouter_annees(agent.date_prise_service, 2 if agent.typecontrat != 'ACE' else 4)
        else:
            nb_passes = 1 + (anciennete - premier_delai) // (2 * 365)
            echelon_courant = echelon_base
            for _ in range(nb_passes):
                nouvel = calculer_nouvel_echelon(echelon_courant)
                if nouvel:
                    echelon_courant = nouvel
                else:
                    break
            dernier_date = ajouter_annees(agent.date_prise_service, premier_delai//365 + (nb_passes - 1) * 2)
            if dernier_date <= today:
                sous_actuel = get_sous_indice(agent.echelon or echelon_base)
                sous_calcule = get_sous_indice(echelon_courant)
                if sous_actuel < sous_calcule:
                    ancien_echelon = agent.echelon
                    agent.echelon = echelon_courant
                    agent.save()
                    Notification.objects.create(agent_id=agent.matricule, message=f"📈 Échelon mis à jour : {ancien_echelon} → {echelon_courant}", type_notification='avancement', date_envoi=today, lue=0)
                    envoyer_email_avancement_agent(agent=agent, echelon_ancien=ancien_echelon, echelon_nouveau=echelon_courant, date_effective=today)
                    rh_agents = Agent.objects.filter(agentrole__role__libelle='rh', actif=1)
                    for rh in rh_agents:
                        Notification.objects.create(agent_id=rh.matricule, message=f"📈 Avancement : {agent.prenom} {agent.nom} → {echelon_courant}", type_notification='avancement', date_envoi=today, lue=0)
                        envoyer_email_avancement_effectue(rh=rh, agent=agent, echelon_ancien=ancien_echelon, echelon_nouveau=echelon_courant, date_effective=today)
            dernier_date_effective = dernier_date
            prochaine_date = ajouter_annees(dernier_date_effective, 2)
        
        while True:
            if not peut_avancer(agent, prochaine_date):
                break
            nouvel_echelon = calculer_nouvel_echelon(echelon_courant)
            if nouvel_echelon is None:
                Avancement.objects.create(agent=agent, date_prevue=None, date_effective=None, type_avancement='plafonne', echelon_ancien=echelon_courant, echelon_nouveau=echelon_courant)
                break
            Avancement.objects.create(agent=agent, date_prevue=prochaine_date, date_effective=None, type_avancement='normal', echelon_ancien=echelon_courant, echelon_nouveau=nouvel_echelon)
            echelon_courant = nouvel_echelon
            prochaine_date = ajouter_annees(prochaine_date, 2)


def calculer_et_notifier():
    today = date.today()
    actualiser_avancements()
    rh_agents = Agent.objects.filter(agentrole__role__libelle='rh', actif=1)
    demain = today + timedelta(days=1)
    for av in Avancement.objects.filter(date_prevue=demain).select_related('agent'):
        for rh in rh_agents:
            Notification.objects.create(agent_id=rh.matricule, message=f"📈 Avancement de {av.agent.prenom} {av.agent.nom} demain - {av.echelon_ancien} → {av.echelon_nouveau}", type_notification='avancement', date_envoi=today, lue=0)
            envoyer_email_rappel_avancement(rh=rh, agent=av.agent, echelon_ancien=av.echelon_ancien, echelon_nouveau=av.echelon_nouveau, date_prevue=demain)
    for jours, label in [(90, '3 mois'), (30, '1 mois'), (7, '1 semaine')]:
        date_alerte = today + timedelta(days=jours)
        for av in Avancement.objects.filter(date_prevue=date_alerte).select_related('agent'):
            for rh in rh_agents:
                Notification.objects.create(agent_id=rh.matricule, message=f"📈 Avancement de {av.agent.prenom} {av.agent.nom} dans {label} ({av.date_prevue})", type_notification='avancement', date_envoi=today, lue=0)
    print("✅ Actualisation des avancements terminée.")


@csrf_exempt
@require_http_methods(["GET"])
def trigger_avancements(request):
    calculer_et_notifier()
    return JsonResponse({'success': True})


@csrf_exempt
@require_http_methods(["GET"])
def get_avancements_agent(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        avancements = Avancement.objects.filter(agent=agent).order_by('-date_prevue')
        result = [{'id': a.id, 'date_prevue': str(a.date_prevue), 'date_effective': str(a.date_effective) if a.date_effective else None, 'type': a.type_avancement, 'echelon_ancien': a.echelon_ancien, 'echelon_nouveau': a.echelon_nouveau} for a in avancements]
        return JsonResponse(result, safe=False)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)


@csrf_exempt
@require_http_methods(["GET"])
def get_avancements_periode(request):
    mois = request.GET.get('mois')
    annee = request.GET.get('annee')
    avancements = Avancement.objects.select_related('agent').all()
    if annee:
        avancements = avancements.filter(date_prevue__year=annee)
    if mois:
        avancements = avancements.filter(date_prevue__month=mois)
    avancements = avancements.order_by('date_prevue')
    result = [{'id': a.id, 'agent_matricule': a.agent.matricule, 'agent_nom': f"{a.agent.prenom} {a.agent.nom}", 'agent_direction': a.agent.direction, 'date_prevue': str(a.date_prevue), 'type': a.type_avancement, 'echelon_ancien': a.echelon_ancien, 'echelon_nouveau': a.echelon_nouveau} for a in avancements]
    return JsonResponse(result, safe=False)


@csrf_exempt
@require_http_methods(["GET"])
def check_alertes_avancement(request):
    today = date.today()
    date_limite = today + timedelta(days=90)
    avancements = Avancement.objects.filter(date_prevue__gte=today, date_prevue__lte=date_limite, type_avancement='normal').select_related('agent').order_by('date_prevue')
    alertes = [{'id': a.id, 'agent': f"{a.agent.prenom} {a.agent.nom}", 'matricule': a.agent.matricule, 'direction': a.agent.direction, 'date_prevue': str(a.date_prevue), 'delai': f"{(a.date_prevue - today).days} jour(s)", 'jours_restants': (a.date_prevue - today).days} for a in avancements]
    return JsonResponse({'success': True, 'total_alertes': len(alertes), 'alertes': alertes})


@csrf_exempt
@require_http_methods(["GET"])
def generer_bordereau(request):
    mois = request.GET.get('mois')
    annee = request.GET.get('annee', str(date.today().year))
    avancements = Avancement.objects.select_related('agent').all()
    if annee:
        avancements = avancements.filter(date_prevue__year=annee)
    if mois:
        avancements = avancements.filter(date_prevue__month=mois)
    avancements = avancements.order_by('date_prevue')
    result = [{'matricule': a.agent.matricule, 'nom': a.agent.nom, 'prenom': a.agent.prenom, 'direction': a.agent.direction, 'poste': a.agent.poste, 'date_prise_service': str(a.agent.date_prise_service), 'date_avancement': str(a.date_prevue), 'type': a.type_avancement, 'echelon_actuel': a.echelon_ancien, 'echelon_propose': a.echelon_nouveau} for a in avancements]
    totaux = {}
    for r in result:
        direction = r['direction'] or 'Non renseignée'
        totaux[direction] = totaux.get(direction, 0) + 1
    return JsonResponse({'success': True, 'annee': annee, 'mois': mois, 'total': len(result), 'totaux_par_direction': totaux, 'avancements': result})


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_by_agent(request, matricule):
    try:
        actes = ActeAdministratif.objects.filter(demande__agent__matricule=matricule).select_related('demande__agent').order_by('-date_generation')
        result = [{'id': acte.reference, 'reference': acte.reference, 'type_acte': acte.type_acte, 'statut': acte.statut, 'date_generation': acte.date_generation.strftime('%d/%m/%Y'), 'demande_id': acte.demande.id if acte.demande else None} for acte in actes]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


def get_signataire_par_type_acte(type_acte):
    types_dapaf = ['Attestation de présence au poste', 'Attestation de validité de services', 'Certificat de non-jouissance de congé', 'Autorisation de jouissance de congé administratif']
    types_dpaf = ['Absence', 'Reprise de service']
    types_chef_rh = ['Attestation de travail']
    
    if type_acte in types_dapaf:
        signataire = Agent.objects.filter(agentrole__role__libelle='dapaf', actif=1).first()
        if signataire:
            return signataire, 'DAPAF'
    elif type_acte in types_dpaf:
        signataire = Agent.objects.filter(agentrole__role__libelle='dpaf', actif=1).first()
        if signataire:
            return signataire, 'DPAF'
    elif type_acte in types_chef_rh:
        signataire = Agent.objects.filter(nom__icontains='KPOCHEME', actif=1).first()
        if signataire:
            return signataire, 'Chef RH'
    signataire = Agent.objects.filter(agentrole__role__libelle='dpaf', actif=1).first()
    return signataire, 'DPAF'


@csrf_exempt
@require_http_methods(["GET"])
def get_demande_historique(request, demande_id):
    try:
        demande = Demande.objects.select_related('agent', 'type_demande', 'agent_rh').get(id=demande_id)
        historique = []
        historique.append({'date': str(demande.date_soumission), 'action': 'Création', 'statut': 'soumise', 'utilisateur': f"{demande.agent.nom} {demande.agent.prenom}", 'details': 'Demande soumise'})
        if demande.statut != 'en_attente_chef':
            historique.append({'date': str(demande.date_soumission), 'action': 'Validation', 'statut': 'validee', 'utilisateur': 'Chef', 'details': 'Demande validée'})
        if demande.statut in ['transmise_dpaf', 'transmise_dapaf', 'assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine', 'remis']:
            destinataire = 'DPAF' if demande.statut == 'transmise_dpaf' else 'DAPAF' if demande.statut == 'transmise_dapaf' else 'RH'
            historique.append({'date': str(demande.date_soumission), 'action': 'Transmission', 'statut': demande.statut, 'utilisateur': 'Secrétariat', 'details': f'Transmise au {destinataire}'})
        if demande.agent_rh and demande.statut in ['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine', 'remis']:
            historique.append({'date': str(demande.date_assignation) if hasattr(demande, 'date_assignation') and demande.date_assignation else str(demande.date_soumission), 'action': 'Assignation', 'statut': 'assignee_rh', 'utilisateur': f"{demande.agent_rh.nom} {demande.agent_rh.prenom}", 'details': 'Assignée à un agent RH'})
        if demande.statut in ['acte_genere', 'termine', 'remis']:
            historique.append({'date': str(demande.date_generation_acte) if hasattr(demande, 'date_generation_acte') and demande.date_generation_acte else str(demande.date_soumission), 'action': 'Génération acte', 'statut': 'acte_genere', 'utilisateur': f"{demande.agent_rh.nom} {demande.agent_rh.prenom}" if demande.agent_rh else 'Agent RH', 'details': 'Acte généré'})
        if demande.statut in ['signe', 'termine', 'remis']:
            historique.append({'date': str(demande.date_soumission), 'action': 'Signature', 'statut': 'signe', 'utilisateur': 'DPAF/DAPAF', 'details': 'Acte signé'})
        if demande.statut == 'remis':
            historique.append({'date': str(demande.date_soumission), 'action': 'Remise', 'statut': 'remis', 'utilisateur': 'Secrétariat', 'details': 'Acte remis à l\'agent'})
        return JsonResponse({'success': True, 'historique': historique})
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_acte_historique(request, reference):
    try:
        acte = ActeAdministratif.objects.select_related('demande__agent').get(reference=reference)
        historique = []
        historique.append({'date': str(acte.date_generation), 'action': 'Création', 'statut': acte.statut, 'details': f'Acte {acte.type_acte} créé'})
        if acte.statut != 'genere':
            historique.append({'date': str(acte.date_generation), 'action': 'Envoi', 'statut': 'envoye_secretaire', 'details': 'Envoyé à la secrétaire'})
        if acte.statut in ['attente_signature_dpaf', 'attente_signature_dapaf', 'signe', 'remis']:
            destinataire = 'DPAF' if 'dpaf' in acte.statut else 'DAPAF'
            historique.append({'date': str(acte.date_generation), 'action': 'Transmission signature', 'statut': acte.statut, 'details': f'Transmis au {destinataire}'})
        if acte.statut in ['signe', 'remis'] and acte.signe_par:
            historique.append({'date': str(acte.signe_le) if acte.signe_le else str(acte.date_generation), 'action': 'Signature', 'statut': 'signe', 'details': f'Signé par {acte.signe_par}'})
        if acte.statut == 'remis':
            historique.append({'date': str(acte.date_generation), 'action': 'Remise', 'statut': 'remis', 'details': 'Remis à l\'agent'})
        return JsonResponse({'success': True, 'historique': historique})
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== ARCHIVAGE ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_actes_archives(request):
    try:
        actes = ActeAdministratif.objects.filter(statut__in=['termine', 'signe', 'remis', 'archive']).select_related('demande__agent').order_by('-date_generation')
        result = []
        for a in actes:
            if a.demande:
                result.append({'reference': a.reference, 'type_acte': a.type_acte, 'agent_nom': a.demande.agent.nom, 'agent_prenom': a.demande.agent.prenom, 'agent_matricule': a.demande.agent.matricule, 'agent_direction': a.demande.agent.direction or 'Non renseignée', 'date_generation': str(a.date_generation) if a.date_generation else None, 'statut': a.statut})
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def archiver_acte(request, reference):
    try:
        acte = ActeAdministratif.objects.get(reference=reference)
        acte.statut = 'archive'
        acte.save()
        return JsonResponse({'success': True, 'message': f'Acte {reference} archivé'})
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== MODULE 7 - POSTES VACANTS & CANDIDATURES ====================

@csrf_exempt
@require_http_methods(["GET", "POST"])
def postes_vacants(request):
    if request.method == "GET":
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id, intitule, description, profil_recherche, date_publication, date_cloture, statut, directionDemande, diplomeRequis, pieces_requises FROM poste_vacant ORDER BY date_publication DESC")
                postes = cursor.fetchall()
            result = [{'id': p[0], 'intitule': p[1], 'description': p[2], 'profil_recherche': p[3], 'date_publication': str(p[4]) if p[4] else None, 'date_cloture': str(p[5]) if p[5] else None, 'statut': p[6], 'directionDemande': p[7], 'diplomeRequis': p[8], 'pieces_requises': json.loads(p[9]) if p[9] else []} for p in postes]
            return JsonResponse(result, safe=False)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    elif request.method == "POST":
        try:
            data = json.loads(request.body)
            pieces_requises_json = json.dumps(data.get('pieces_requises', []))
            with connection.cursor() as cursor:
                cursor.execute("""INSERT INTO poste_vacant (intitule, description, profil_recherche, date_publication, date_cloture, statut, directionDemande, diplomeRequis, pieces_requises) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    [data.get('intitule'), data.get('description'), data.get('profil_recherche', ''), data.get('date_publication'), data.get('date_cloture'), 'publie', data.get('directionDemande'), data.get('diplomeRequis', ''), pieces_requises_json])
                poste_id = cursor.lastrowid
            with connection.cursor() as cursor:
                cursor.execute("SELECT matricule FROM agent WHERE actif = 1")
                for agent in cursor.fetchall():
                    cursor.execute("INSERT INTO notification (agent_id, message, type_notification, date_envoi, lue) VALUES (%s, %s, %s, %s, %s)", [agent[0], f"📢 Nouvelle annonce : {data.get('intitule')}", 'NOUVELLE_ANNONCE', date.today(), 0])
            return JsonResponse({'success': True, 'id': poste_id, 'message': 'Annonce créée'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT"])
def cloturer_poste_vacant(request, poste_id):
    try:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE poste_vacant SET statut = 'cloture' WHERE id = %s", [poste_id])
        return JsonResponse({'success': True, 'message': 'Annonce clôturée'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def postuler(request):
    """Agent dépose une candidature (sans analyse IA - l'analyse se fait après upload)"""
    print("=" * 60)
    print("🔍 [DEBUG] postuler() a été appelée")
    print("=" * 60)
    
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        poste_id = data.get('poste_id')
        
        print(f"📌 Matricule: {matricule}, Poste ID: {poste_id}")
        
        if not matricule or not poste_id:
            print("❌ Erreur: Matricule ou poste_id manquant")
            return JsonResponse({'error': 'Matricule et poste_id requis'}, status=400)
        
        with connection.cursor() as cursor:
            # Vérifier si l'agent existe
            print("🔍 Vérification de l'agent...")
            cursor.execute("SELECT actif FROM agent WHERE matricule = %s", [matricule])
            agent_exists = cursor.fetchone()
            if not agent_exists:
                print(f"❌ Agent {matricule} non trouvé")
                return JsonResponse({'error': 'Agent non trouvé'}, status=404)
            
            print(f"✅ Agent trouvé, actif: {agent_exists[0]}")
            if agent_exists[0] != 1:
                print(f"❌ Compte agent désactivé")
                return JsonResponse({'error': 'Compte agent désactivé'}, status=400)
            
            # Vérifier si l'agent a déjà postulé
            print("🔍 Vérification des candidatures existantes...")
            cursor.execute("""
                SELECT COUNT(*) FROM candidature 
                WHERE agent_id = %s AND poste_vacant_id = %s
            """, [matricule, poste_id])
            count = cursor.fetchone()[0]
            if count > 0:
                print(f"❌ Agent a déjà postulé {count} fois")
                return JsonResponse({'error': 'Vous avez déjà postulé à cette annonce'}, status=400)
            print(f"✅ Aucune candidature existante")
            
            # Vérifier que l'annonce est encore ouverte
            print("🔍 Vérification de l'annonce...")
            cursor.execute("""
                SELECT statut, date_cloture, intitule FROM poste_vacant WHERE id = %s
            """, [poste_id])
            poste = cursor.fetchone()
            
            if not poste:
                print(f"❌ Annonce {poste_id} non trouvée")
                return JsonResponse({'error': 'Annonce non trouvée'}, status=404)
            
            print(f"✅ Annonce trouvée: {poste[2]}")
            print(f"   Statut: {poste[0]}, Date clôture: {poste[1]}")
            
            if poste[0] != 'publie':
                print(f"❌ Annonce clôturée (statut: {poste[0]})")
                return JsonResponse({'error': 'Cette annonce est clôturée'}, status=400)
            
            if poste[1] and poste[1] < date.today():
                print(f"❌ Date de clôture dépassée: {poste[1]} < {date.today()}")
                return JsonResponse({'error': 'Date de clôture dépassée'}, status=400)
            
            # Créer la candidature
            print("📝 Création de la candidature...")
            cursor.execute("""
                INSERT INTO candidature (agent_id, poste_vacant_id, date_soumission, score_eligibilite, statut, rang, analyse_ia)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, [matricule, poste_id, date.today(), 0, 'deposee', None, None])
            
            candidature_id = cursor.lastrowid
            print(f"✅ Candidature créée avec ID: {candidature_id}")
        
        print("=" * 60)
        print(f"✅ [SUCCÈS] Candidature créée pour {matricule}")
        print("=" * 60)
        
        return JsonResponse({
            'success': True, 
            'message': 'Candidature créée, veuillez uploader vos documents', 
            'candidature_id': candidature_id
        })
        
    except json.JSONDecodeError as e:
        print(f"❌ Erreur JSON: {str(e)}")
        return JsonResponse({'error': 'Données JSON invalides'}, status=400)
    except Exception as e:
        print(f"❌ ERREUR dans postuler: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

def extraire_texte_piece(piece_id):
    """Extrait le texte d'un fichier uploadé (PDF, DOCX, Image) avec EasyOCR - Version OPTIMISÉE"""
    try:
        from docx import Document
        import io
        import PyPDF2
        import easyocr
        from PIL import Image
        
        # Initialiser EasyOCR une seule fois
        if not hasattr(extraire_texte_piece, 'reader'):
            print("📥 Initialisation d'EasyOCR...")
            extraire_texte_piece.reader = easyocr.Reader(['fr', 'en'], gpu=False)
            print("✅ EasyOCR prêt")
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT cheminfichier, nom_fichier FROM piece WHERE id = %s", [piece_id])
            piece = cursor.fetchone()
            if not piece:
                return ""
            
            fichier_path = piece[0]
            nom_fichier = piece[1] or ""
            
            print(f"[DEBUG] Lecture: {os.path.basename(fichier_path)}")
            
            if not os.path.exists(fichier_path):
                print(f"[ERREUR] Fichier non trouvé")
                return ""
            
            # ==================== PDF ====================
            if nom_fichier.lower().endswith('.pdf'):
                try:
                    # Essayer PyPDF2 d'abord (rapide)
                    with open(fichier_path, 'rb') as f:
                        pdf_reader = PyPDF2.PdfReader(io.BytesIO(f.read()))
                        texte = ""
                        for page in pdf_reader.pages:
                            page_text = page.extract_text()
                            if page_text:
                                texte += page_text
                        
                        # Si on a assez de texte, on retourne directement
                        if len(texte) > 200:
                            print(f"📄 PDF texte extrait: {len(texte)} caractères")
                            return texte[:3000]
                        
                        # PDF scanné - utilisation OCR rapide
                        print(f"⚠️ PDF scanné, OCR en cours...")
                        try:
                            import fitz
                            doc = fitz.open(fichier_path)
                            texte_ocr = ""
                            
                            # Limiter à 2 pages max pour la vitesse
                            max_pages = min(len(doc), 2)
                            
                            for page_num in range(max_pages):
                                page = doc.load_page(page_num)
                                # Résolution réduite pour être plus rapide
                                zoom = 1.5  # Réduit de 3.0 à 1.5
                                mat = fitz.Matrix(zoom, zoom)
                                pix = page.get_pixmap(matrix=mat)
                                img_bytes = pix.tobytes("png")
                                
                                result = extraire_texte_piece.reader.readtext(img_bytes)
                                page_text = ' '.join([r[1] for r in result])
                                texte_ocr += page_text + " "
                                print(f"   Page {page_num + 1}: {len(page_text)} caractères")
                            
                            doc.close()
                            print(f"📄 PDF OCR: {len(texte_ocr)} caractères")
                            return texte_ocr[:3000] if texte_ocr else ""
                        except ImportError:
                            print("⚠️ PyMuPDF non installé, impossible d'OCR le PDF")
                            return ""
                        
                except Exception as e:
                    print(f"Erreur PDF: {e}")
                    return ""
            
            # ==================== IMAGES ====================
            elif nom_fichier.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff')):
                try:
                    print("🖼️ OCR image...")
                    
                    # Ouvrir l'image
                    img = Image.open(fichier_path)
                    
                    # Redimensionner agressivement pour la vitesse
                    max_size = 800  # Réduit de 1500 à 800
                    if img.width > max_size or img.height > max_size:
                        ratio = min(max_size / img.width, max_size / img.height)
                        new_size = (int(img.width * ratio), int(img.height * ratio))
                        img = img.resize(new_size, Image.Resampling.LANCZOS)
                        print(f"Image redimensionnée à {new_size}")
                    
                    # Convertir directement en bytes sans fichier temporaire
                    img_bytes = io.BytesIO()
                    img.save(img_bytes, format='PNG')
                    img_bytes = img_bytes.getvalue()
                    
                    # OCR
                    result = extraire_texte_piece.reader.readtext(img_bytes)
                    texte = ' '.join([r[1] for r in result])
                    
                    print(f"🖼️ OCR: {len(texte)} caractères")
                    return texte[:3000] if texte else ""
                    
                except Exception as e:
                    print(f"Erreur image: {e}")
                    return ""
            
            # ==================== DOCX ====================
            elif nom_fichier.lower().endswith('.docx'):
                try:
                    doc = Document(fichier_path)
                    texte = '\n'.join([para.text for para in doc.paragraphs if para.text])
                    print(f"📄 DOCX: {len(texte)} caractères")
                    return texte[:3000]
                except Exception as e:
                    print(f"Erreur DOCX: {e}")
                    return ""
            
            return ""
            
    except Exception as e:
        print(f"Erreur extraction: {e}")
        return ""

def analyser_candidature_avec_ia(candidature_id, cv_text, lettre_text, diplome_text, diplome_requis, profil_recherche):
    prompt = f"""
    Tu es un expert RH. Diplôme requis: {diplome_requis if diplome_requis else 'Non spécifié'}
    Profil recherché: {profil_recherche if profil_recherche else 'Non spécifié'}
    CV: {cv_text[:1500] if cv_text else 'Non fourni'}
    LM: {lettre_text[:1000] if lettre_text else 'Non fournie'}
    Diplôme: {diplome_text[:500] if diplome_text else 'Non fourni'}
    Réponds UNIQUEMENT avec JSON: {{"score": 0-100, "analyse": "texte", "points_forts": ["p1","p2"], "points_faibles": ["p1","p2"], "verification_diplome": "valide"}}
    Échappe les guillemets: \"
    """
    try:
        import ollama
        import json
        import re
        
        response = ollama.chat(
            model='llama3.2:3b',
            format='json',  # ← AJOUTEZ CECI si votre version Ollama le supporte
            messages=[{
                'role': 'system',
                'content': "Tu es un expert RH. Tu réponds uniquement en JSON valide."
            }, {
                'role': 'user',
                'content': prompt
            }]
        )
        
        reponse_brute = response['message']['content']
        
        # Nettoyage : extraire uniquement le JSON
        match = re.search(r'\{.*\}', reponse_brute, re.DOTALL)
        if match:
            reponse_brute = match.group()
        
        # Remplacer les guillemets simples non échappés dans les chaînes
        # (solution de secours)
        reponse_brute = re.sub(r'(?<!\\)"', '\\"', reponse_brute)
        reponse_brute = re.sub(r'\\"([^"]*?)\\"', r'"\1"', reponse_brute)
        
        resultat = json.loads(reponse_brute)
        return resultat.get('score', 0), resultat.get('analyse', 'Analyse non disponible')
        
    except Exception as e:
        print(f"Erreur Ollama: {e}")
        return 0, f"Erreur IA: {str(e)}"


@csrf_exempt
@require_http_methods(["POST"])
def analyser_candidature(request, candidature_id):
    """Analyse une candidature avec IA et met à jour le score_eligibilite et analyse_ia"""
    print("=" * 70)
    print("🔍 [DEBUG] analyser_candidature() a été appelée")
    print(f"📌 ID Candidature: {candidature_id}")
    print("=" * 70)
    
    try:
        with connection.cursor() as cursor:
            # 1. Vérifier que la candidature existe
            cursor.execute("SELECT id FROM candidature WHERE id = %s", [candidature_id])
            if not cursor.fetchone():
                print("❌ Candidature non trouvée")
                return JsonResponse({'error': 'Candidature non trouvée'}, status=404)
            print("✅ Candidature trouvée")
            
            # 2. Récupérer les pièces de la candidature
            cursor.execute("""
                SELECT p.id, tp.libelle
                FROM piece p
                JOIN type_piece tp ON p.type_piece_id = tp.id
                WHERE p.candidature_id = %s
            """, [candidature_id])
            pieces = cursor.fetchall()
            print(f"📄 {len(pieces)} pièce(s) trouvée(s)")
            
            # Afficher chaque pièce
            for piece in pieces:
                print(f"   - ID: {piece[0]}, Type: {piece[1]}")
            
            # 3. Récupérer les infos du poste
            cursor.execute("""
                SELECT p.diplomeRequis, p.profil_recherche, p.intitule
                FROM candidature c
                JOIN poste_vacant p ON c.poste_vacant_id = p.id
                WHERE c.id = %s
            """, [candidature_id])
            poste = cursor.fetchone()
            
            if not poste:
                print("❌ Poste non trouvé")
                return JsonResponse({'error': 'Poste non trouvé'}, status=404)
            
            diplome_requis = poste[0] or ''
            profil_recherche = poste[1] or ''
            poste_intitule = poste[2] or ''
            
            print(f"📌 Poste: {poste_intitule}")
            print(f"📌 Diplôme requis: {diplome_requis if diplome_requis else 'Non spécifié'}")
            print(f"📌 Profil recherché: {profil_recherche[:100] if profil_recherche else 'Non spécifié'}...")
            
            # 4. Extraire les textes des pièces
            cv_text = ""
            lettre_text = ""
            diplome_text = ""
            cni_text = ""
            
            for piece in pieces:
                piece_id = piece[0]
                type_libelle = piece[1]
                print(f"\n🔍 Traitement: {type_libelle} (ID: {piece_id})")
                
                texte = extraire_texte_piece(piece_id)
                print(f"   📝 Texte extrait: {len(texte)} caractères")
                if len(texte) > 0 and len(texte) < 500:
                    print(f"   📝 Contenu: {texte[:200]}...")
                
                if type_libelle == 'CV':
                    cv_text = texte
                    print(f"   ✅ Assigné à CV")
                elif type_libelle == 'LM':
                    lettre_text = texte
                    print(f"   ✅ Assigné à Lettre de motivation")
                elif 'DIPLOME' in type_libelle.upper():
                    diplome_text = texte
                    print(f"   ✅ Assigné à Diplôme")
                elif 'CNI' in type_libelle.upper():
                    cni_text = texte
                    print(f"   ℹ️ CNI ignorée pour l'analyse IA")
                else:
                    print(f"   ⚠️ Type non reconnu: {type_libelle}")
            
            # 5. Résumé des textes extraits
            print("\n" + "-" * 50)
            print("📊 RÉSUMÉ DES TEXTES EXTRAITS:")
            print(f"   CV: {len(cv_text)} caractères")
            print(f"   Lettre de motivation: {len(lettre_text)} caractères")
            print(f"   Diplôme: {len(diplome_text)} caractères")
            print(f"   CNI: {len(cni_text)} caractères (ignorée)")
            print("-" * 50)
            
            # 6. Vérifier si on a assez de données pour l'analyse
            if len(cv_text) == 0 and len(lettre_text) == 0 and len(diplome_text) == 0:
                print("⚠️ ATTENTION: Aucun texte extrait des documents!")
                print("   L'analyse IA risque de ne pas être pertinente")
            
            # 7. Analyser avec IA
            print("\n🤖 Appel de l'IA pour analyse...")
            score_ia, analyse_ia = analyser_candidature_avec_ia(
                candidature_id, cv_text, lettre_text, diplome_text, 
                diplome_requis, profil_recherche
            )
            
            print(f"\n📊 RÉSULTAT DE L'IA:")
            print(f"   ✅ Score: {score_ia}/100")
            print(f"   📝 Analyse: {analyse_ia[:200]}...")
            
            # 8. Mettre à jour la candidature
            cursor.execute("""
                UPDATE candidature 
                SET score_eligibilite = %s, analyse_ia = %s
                WHERE id = %s
            """, [score_ia, analyse_ia, candidature_id])
            print(f"✅ Candidature mise à jour avec score {score_ia}")
            
            # 9. Mettre à jour le rang
            cursor.execute("""
                UPDATE candidature c
                SET c.rang = (
                    SELECT COUNT(*) + 1 FROM candidature c2 
                    WHERE c2.poste_vacant_id = c.poste_vacant_id 
                    AND c2.score_eligibilite > c.score_eligibilite
                )
                WHERE c.id = %s
            """, [candidature_id])
            print("✅ Rang mis à jour")
            
            # 10. Notifier l'agent
            cursor.execute("""
                SELECT a.matricule, a.nom, a.prenom
                FROM candidature c
                JOIN agent a ON c.agent_id = a.matricule
                WHERE c.id = %s
            """, [candidature_id])
            agent_info = cursor.fetchone()
            
            if agent_info:
                cursor.execute("""
                    INSERT INTO notification (agent_id, message, type_notification, date_envoi, lue)
                    VALUES (%s, %s, %s, %s, %s)
                """, [
                    agent_info[0],
                    f"🤖 Analyse IA terminée pour {poste_intitule} - Score: {score_ia}/100",
                    'ANALYSE_IA',
                    date.today(),
                    0
                ])
                print(f"✅ Notification envoyée à {agent_info[1]} {agent_info[2]}")
        
        print("\n" + "=" * 70)
        print(f"✅ [SUCCÈS] Analyse terminée - Score: {score_ia}/100")
        print("=" * 70)
        
        return JsonResponse({
            'success': True,
            'score': score_ia,
            'analyse': analyse_ia,
            'message': f'Analyse terminée - Score: {score_ia}/100'
        })
        
    except Exception as e:
        print(f"\n❌ [ERREUR] dans analyser_candidature: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_candidatures_by_poste(request, poste_id):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT c.id, c.agent_id, c.date_soumission, c.score_eligibilite, c.statut, c.rang, c.analyse_ia, a.nom, a.prenom, a.poste FROM candidature c JOIN agent a ON c.agent_id = a.matricule WHERE c.poste_vacant_id = %s ORDER BY c.score_eligibilite DESC", [poste_id])
            candidatures = cursor.fetchall()
        result = [{'id': c[0], 'agent_matricule': c[1], 'date_soumission': str(c[2]), 'score_eligibilite': c[3] if c[3] is not None else 0, 'statut': c[4], 'rang': c[5] if c[5] is not None else idx + 1, 'analyse_ia': c[6], 'agent_nom': c[7], 'agent_prenom': c[8], 'agent_poste': c[9] or '-'} for idx, c in enumerate(candidatures)]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)



@csrf_exempt
@require_http_methods(["POST"])
def upload_piece_candidature(request, candidature_id):
    try:
        data = json.loads(request.body)
        type_document = data.get('type_document')
        file_base64 = data.get('file_base64')
        file_name = data.get('file_name')
        
        if not all([type_document, file_base64, file_name]):
            return JsonResponse({'error': 'type_document, file_base64 et file_name requis'}, status=400)
        
        # ========== NETTOYAGE ET CORRECTION DU BASE64 ==========
        # 1. Supprimer l'en-tête si présent (ex: "data:application/pdf;base64,")
        if ',' in file_base64:
            file_base64 = file_base64.split(',', 1)[1]
        
        # 2. Supprimer les espaces et sauts de ligne
        file_base64 = file_base64.strip()
        
        # 3. Corriger le padding Base64 (ajouter les = manquants)
        file_base64 = fix_base64_padding(file_base64)
        
        # 4. Décoder le Base64
        try:
            file_data = base64.b64decode(file_base64)
        except Exception as e:
            return JsonResponse({'error': f'Erreur de décodage Base64: {str(e)}'}, status=400)
        
        # ========== VÉRIFICATION DE LA CANDIDATURE ==========
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT c.agent_id, p.intitule 
                FROM candidature c 
                JOIN poste_vacant p ON c.poste_vacant_id = p.id 
                WHERE c.id = %s
            """, [candidature_id])
            result = cursor.fetchone()
            
            if not result:
                return JsonResponse({'error': 'Candidature non trouvée'}, status=404)
            
            # ========== SAUVEGARDE SUR DISQUE ==========
            # Créer le dossier pour les pièces si nécessaire
            upload_dir = f'uploads/pieces/candidature_{candidature_id}'
            os.makedirs(upload_dir, exist_ok=True)
            
            # Générer un nom de fichier unique et sécurisé
            safe_filename = f"{type_document}_{candidature_id}_{date.today()}_{file_name}"
            safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in '._-')
            file_path = os.path.join(upload_dir, safe_filename)
            
            # Sauvegarder le fichier physiquement
            with open(file_path, 'wb') as f:
                f.write(file_data)
            
            # ========== GESTION DU TYPE DE PIÈCE ==========
            cursor.execute("SELECT id FROM type_piece WHERE libelle = %s", [type_document])
            type_piece = cursor.fetchone()
            
            if not type_piece:
                cursor.execute("""
                    INSERT INTO type_piece (libelle, obligatoire, duree_validite) 
                    VALUES (%s, %s, %s)
                """, [type_document, 0, ''])
                type_piece_id = cursor.lastrowid
            else:
                type_piece_id = type_piece[0]
            
            # Supprimer l'ancienne pièce du même type si elle existe
            cursor.execute("""
                DELETE FROM piece 
                WHERE candidature_id = %s AND type_piece_id = %s
            """, [candidature_id, type_piece_id])
            
            # Insérer la nouvelle pièce dans la base de données
            cursor.execute("""
                INSERT INTO piece (candidature_id, type_piece_id, nom_fichier, date_upload, valide, cheminfichier) 
                VALUES (%s, %s, %s, %s, %s, %s)
            """, [candidature_id, type_piece_id, file_name, date.today(), 1, file_path])
        
        return JsonResponse({'success': True, 'message': f'{type_document} ajouté avec succès'})
        
    except Exception as e:
        import traceback
        print(f"ERREUR upload_piece_candidature: {traceback.format_exc()}")
        return JsonResponse({'error': str(e)}, status=500)
    
@csrf_exempt
@require_http_methods(["PUT"])
def update_poste_vacant(request, poste_id):
    try:
        data = json.loads(request.body)
        pieces_requises_json = json.dumps(data.get('pieces_requises', []))
        with connection.cursor() as cursor:
            cursor.execute("""UPDATE poste_vacant SET intitule = %s, description = %s, profil_recherche = %s, date_publication = %s, date_cloture = %s, directionDemande = %s, diplomeRequis = %s, pieces_requises = %s WHERE id = %s""",
                [data.get('intitule'), data.get('description'), data.get('profil_recherche', ''), data.get('date_publication'), data.get('date_cloture'), data.get('directionDemande'), data.get('diplomeRequis', ''), pieces_requises_json, poste_id])
        return JsonResponse({'success': True, 'message': 'Annonce modifiée'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def exporter_candidatures(request, poste_id):
    try:
        with connection.cursor() as cursor:
            cursor.execute("""SELECT ROW_NUMBER() OVER (ORDER BY c.score_eligibilite DESC) as rang, a.matricule, a.nom, a.prenom, a.poste, c.score_eligibilite, c.analyse_ia, c.date_soumission, p.intitule FROM candidature c JOIN agent a ON c.agent_id = a.matricule JOIN poste_vacant p ON c.poste_vacant_id = p.id WHERE c.poste_vacant_id = %s ORDER BY c.score_eligibilite DESC""", [poste_id])
            result = cursor.fetchall()
        data = [{'Rang': r[0], 'Matricule': r[1], 'Nom': r[2], 'Prénom': r[3], 'Poste actuel': r[4] or '-', 'Score IA (%)': r[5] if r[5] is not None else 0, 'Analyse IA': (r[6] or '-')[:500] if r[6] else '-', 'Date dépôt': str(r[7]) if r[7] else '-'} for r in result]
        return JsonResponse({'success': True, 'data': data, 'total': len(data)})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_candidature_pieces(request, candidature_id):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT p.id, tp.libelle, p.nom_fichier, p.date_upload, p.cheminfichier FROM piece p JOIN type_piece tp ON p.type_piece_id = tp.id WHERE p.candidature_id = %s", [candidature_id])
            pieces = cursor.fetchall()
        result = [{'id': p[0], 'type': p[1], 'nom_fichier': p[2], 'date_upload': str(p[3]), 'contenu': p[4]} for p in pieces]
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def notes_service(request):
    if request.method == "GET":
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id, titre, contenu, tag, date_publication, fichier_pdf, statut, created_by, created_at FROM note_service WHERE statut = 'publie' ORDER BY date_publication DESC")
                notes = cursor.fetchall()
            result = [{'id': n[0], 'titre': n[1], 'contenu': n[2], 'tag': n[3], 'date_publication': str(n[4]), 'fichier_pdf': n[5], 'statut': n[6], 'created_by': n[7], 'created_at': str(n[8]) if n[8] else None} for n in notes]
            return JsonResponse(result, safe=False)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    elif request.method == "POST":
        try:
            data = json.loads(request.body)
            with connection.cursor() as cursor:
                cursor.execute("INSERT INTO note_service (titre, contenu, tag, date_publication, fichier_pdf, created_by) VALUES (%s, %s, %s, %s, %s, %s)", [data.get('titre'), data.get('contenu', ''), data.get('tag', 'Note de Service'), data.get('date_publication'), data.get('fichier_pdf'), data.get('created_by')])
                note_id = cursor.lastrowid
            return JsonResponse({'success': True, 'id': note_id})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT", "DELETE"])
def note_service_detail(request, note_id):
    if request.method == "PUT":
        try:
            data = json.loads(request.body)
            with connection.cursor() as cursor:
                cursor.execute("UPDATE note_service SET titre = %s, contenu = %s, tag = %s, date_publication = %s, fichier_pdf = %s WHERE id = %s", [data.get('titre'), data.get('contenu', ''), data.get('tag', 'Note de Service'), data.get('date_publication'), data.get('fichier_pdf'), note_id])
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    elif request.method == "DELETE":
        try:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM note_service WHERE id = %s", [note_id])
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_candidatures_agent(request):
    """Récupérer les candidatures d'un agent"""
    try:
        matricule = request.GET.get('matricule')
        if not matricule:
            return JsonResponse({'error': 'Matricule requis'}, status=400)
        
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Agent non trouvé'}, status=404)
        
        candidatures = Candidature.objects.filter(
            agent=agent
        ).select_related('poste_vacant').order_by('-date_soumission')
        
        result = []
        for c in candidatures:
            result.append({
                'id': c.id,
                'intitule': c.poste_vacant.intitule if c.poste_vacant else 'Poste',
                'direction': c.poste_vacant.directiondemande if c.poste_vacant else '',
                'date_soumission': str(c.date_soumission) if c.date_soumission else None,
                'statut': c.statut or 'En cours',
                'score_eligibilite': c.score_eligibilite,
                'rang': c.rang,
            })
        
        return JsonResponse(result, safe=False)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)