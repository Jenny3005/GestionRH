# -*- coding: utf-8 -*-
import threading
from django.contrib.auth.hashers import make_password, check_password
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx import Document
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
from django.http import HttpResponse
from collections import Counter
from django.core.cache import cache
from django.utils import timezone
import io
import os
import random
import shutil
import socket
import string
import subprocess
import tempfile
import time
import concurrent.futures
import ollama
import builtins
if not hasattr(builtins, 'last_exc'):
    builtins.last_exc = None
from datetime import datetime, date, timedelta


def normalize_matricule(value):
    if value is None:
        return ''
    if isinstance(value, str):
        value = value.strip()
        if not value or value.lower() in {'null', 'undefined', 'none'}:
            return ''
        return value
    return str(value).strip()
# En haut du fichier, ajoute :
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

# Limite le nombre de threads d'envoi d'emails pour ne pas saturer les workers.
email_executor = concurrent.futures.ThreadPoolExecutor(max_workers=5, thread_name_prefix='email-sender')

from .emails import (
    envoyer_email_activation,
    envoyer_email_rappel_avancement,
    envoyer_email_avancement_effectue,
    envoyer_email_avancement_agent, 
    envoyer_email_activation_async,
)
from .models import (
    Agent, Role, AgentRole, Permission, RolePermission, TypeDemande, Demande, DemandeAbsence,EnfantAgent,Validation,
    DemandeConge, Notification, SoldeConge, TypePiece, Compte, DossierAgent, Piece, ActeAdministratif, Avancement, Candidature
)

import json
import random
import base64
import ollama
import re

try:
    from docx.shared import Pt
except ImportError:
    Pt = None


def est_chef(agent):
    """Vérifie si l'agent possède le rôle 'chef'"""
    return AgentRole.objects.filter(agent=agent, role__libelle__iexact='chef').exists()

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

import subprocess
import tempfile
import os

def _docx_bytes_to_pdf_bytes(docx_bytes):
    """Convertit DOCX → PDF avec LibreOffice en mode headless"""
    
    with tempfile.TemporaryDirectory() as tmpdir:
        docx_path = os.path.join(tmpdir, 'document.docx')
        pdf_path = os.path.join(tmpdir, 'document.pdf')
        libreoffice_output_dir = os.path.join(tmpdir, 'libreoffice_output')
        
        # Créer le dossier de sortie pour LibreOffice
        os.makedirs(libreoffice_output_dir, exist_ok=True)
        
        # Sauvegarder le DOCX
        with open(docx_path, 'wb') as f:
            f.write(docx_bytes)
        
        # Commande LibreOffice en mode headless
        cmd = [
            'soffice',
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', libreoffice_output_dir,
            docx_path
        ]
        
        try:
            # Exécuter la conversion
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60,  # 60 secondes max pour éviter les blocages
                check=True
            )
            
            # Le PDF généré aura le même nom que le DOCX
            generated_pdf = os.path.join(libreoffice_output_dir, 'document.pdf')
            
            # Vérifier que le PDF a bien été généré
            if os.path.exists(generated_pdf) and os.path.getsize(generated_pdf) > 0:
                with open(generated_pdf, 'rb') as f:
                    return f.read()
            else:
                raise RuntimeError("LibreOffice n'a pas généré de PDF valide.")
                
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Erreur LibreOffice: {e.stderr}")
        except subprocess.TimeoutExpired:
            raise RuntimeError("La conversion LibreOffice a expiré (plus de 60 secondes)")
        except Exception as e:
            raise RuntimeError(f"Erreur inattendue lors de la conversion: {str(e)}")

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

        envoyer_email_activation(agent)
        
        return JsonResponse({
            'success': True,
            'message': 'Agent ajouté avec succès',
            'id': agent.matricule,
            'matricule': agent.matricule
        })
        
    except json.JSONDecodeError as e:
        return JsonResponse({'error': 'Données JSON invalides'}, status=400)
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

import base64
import binascii
import json

def fix_base64_padding(base64_string):
    """Ajoute le padding = manquant à une chaîne base64"""
    missing_padding = len(base64_string) % 4
    if missing_padding:
        base64_string += '=' * (4 - missing_padding)
    return base64_string


def build_safe_filename(file_name, prefix=None):
    """Construit un nom de fichier sûr pour le stockage disque."""
    safe_name = os.path.basename(file_name or 'document').strip()
    safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', safe_name) or 'document'
    if prefix:
        safe_name = f"{prefix}_{safe_name}"
    return safe_name


def save_uploaded_file_bytes(file_bytes, file_name, subdir='documents', prefix=None):
    """Sauvegarde un fichier uploadé sur disque et retourne le chemin stocké."""
    base_dir = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(os.getcwd(), 'uploads')
    upload_dir = os.path.join(base_dir, 'pieces', subdir)
    os.makedirs(upload_dir, exist_ok=True)

    safe_name = build_safe_filename(file_name, prefix=prefix)
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    file_path = os.path.join(upload_dir, f"{timestamp}_{safe_name}")

    with open(file_path, 'wb') as handle:
        handle.write(file_bytes)

    return os.path.normpath(file_path)


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
@require_http_methods(["GET"])
def smtp_test(request):
    """Vérifie que les variables d'env pour email sont configurées (sans tester connexion réseau)."""
    try:
        # Vérifie juste la présence des env vars, pas de connexion socket
        sendgrid_key = getattr(settings, 'SENDGRID_API_KEY', '')
        default_from = getattr(settings, 'DEFAULT_FROM_EMAIL', '')
        
        if not sendgrid_key:
            return JsonResponse({
                'success': False,
                'error': 'SENDGRID_API_KEY non configuré dans les variables d\'environnement.'
            }, status=500)
        
        if not default_from:
            return JsonResponse({
                'success': False,
                'error': 'DEFAULT_FROM_EMAIL non configuré.'
            }, status=500)
        
        return JsonResponse({
            'success': True,
            'message': 'Configuration email valide (utilise SendGrid API).',
            'default_from': default_from,
            'sendgrid_configured': bool(sendgrid_key),
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def import_agents(request):
    try:
        data = json.loads(request.body)
        agents_data = data.get('agents', [])

        if not isinstance(agents_data, list):
            return JsonResponse({'error': 'Format invalide'}, status=400)

        success_count = 0
        error_count = 0
        errors = []

        role_agent, _ = Role.objects.get_or_create(libelle='agent')
        batch_size = 20

        # Collecte initiale des doublons pour éviter des requêtes DB répétées pendant l'import.
        existing_matricules = set(
            Agent.objects.values_list('matricule', flat=True).filter(matricule__isnull=False)
        )
        existing_emails = set(
            Agent.objects.values_list('email', flat=True).filter(email__isnull=False)
        )

        for start in range(0, len(agents_data), batch_size):
            batch = agents_data[start:start + batch_size]
            created_agents = []

            for agent_data in batch:
                try:
                    matricule = normalize_matricule(agent_data.get('matricule'))
                    email = (agent_data.get('email') or '').strip().lower()

                    if not matricule or not email:
                        error_count += 1
                        errors.append(f"{matricule or '?'}: Matricule ou email manquant")
                        continue

                    if matricule in existing_matricules:
                        error_count += 1
                        errors.append(f"{matricule}: Matricule existe déjà")
                        continue

                    if email in existing_emails:
                        error_count += 1
                        errors.append(f"{matricule}: Email existe déjà")
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

                    agent = Agent(
                        matricule=matricule,
                        nom=(agent_data.get('nom') or '').strip(),
                        prenom=(agent_data.get('prenom') or '').strip(),
                        email=email,
                        telephone=(agent_data.get('telephone') or '').strip(),
                        adresse=(agent_data.get('adresse') or 'À renseigner').strip() or 'À renseigner',
                        direction=(agent_data.get('direction') or 'À renseigner').strip() or 'À renseigner',
                        typecontrat=(agent_data.get('typecontrat') or 'APE').strip() or 'APE',
                        poste=(agent_data.get('poste') or 'Agent').strip() or 'Agent',
                        date_prise_service=date_prise_service,
                        date_naissance=date_naissance,
                        corps=(agent_data.get('corps') or '').strip(),
                        echelon=(agent_data.get('grade') or agent_data.get('Grade') or agent_data.get('echelon') or '').strip(),
                        actif=0,
                    )
                    created_agents.append(agent)
                    existing_matricules.add(matricule)
                    existing_emails.add(email)
                except Exception as e:
                    error_count += 1
                    errors.append(f"{agent_data.get('matricule', '?')}: {str(e)}")
                    print(f"❌ Erreur import agent {agent_data.get('matricule', '?')}: {str(e)}")

            if created_agents:
                created_agents_db = Agent.objects.bulk_create(created_agents, batch_size=20)

                agent_role_rows = [
                    AgentRole(agent=agent_db, role=role_agent, date_attribution=date.today())
                    for agent_db in created_agents_db
                ]
                AgentRole.objects.bulk_create(agent_role_rows, batch_size=20)

                success_count += len(created_agents_db)

                # Envoi non bloquant des emails d'activation.
                for agent_db in created_agents_db:
                    try:
                        email_executor.submit(envoyer_email_activation, agent_db)
                    except Exception as email_error:
                        print(f"⚠️ Échec planification email activation {agent_db.email}: {email_error}")

            connection.close()

        return JsonResponse({
            'success': True,
            'success_count': success_count,
            'error_count': error_count,
            'errors': errors[:10]
        })

    except Exception as e:
        print(f"❌ Erreur générale dans import_agents: {str(e)}")
        import traceback
        traceback.print_exc()
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
            
            # ⭐ AJOUTE CES LIGNES ⭐
            agent.lieu_naissance = data.get('lieu_naissance', agent.lieu_naissance)
            agent.dialectes = data.get('dialectes', agent.dialectes)
            agent.date_mariage = data.get('date_mariage', agent.date_mariage)

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
            # ⭐ AJOUTE CES LIGNES ⭐
            'lieu_naissance': agent.lieu_naissance or '',
            'dialectes': agent.dialectes or '',
            'date_mariage': str(agent.date_mariage) if agent.date_mariage else '',
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
        nombre_jours = data.get('nombre_jours')  # ✅ NOUVEAU : reçu du frontend
        
        # Validation des champs
        if not date_debut_str or not nombre_jours:
            return JsonResponse({'error': 'Date de début et nombre de jours requis'}, status=400)
        
        # Convertir en entier
        try:
            nombre_jours = int(nombre_jours)
        except ValueError:
            return JsonResponse({'error': 'Le nombre de jours doit être un nombre entier'}, status=400)
        
        # Vérifier l'agent
        agent = Agent.objects.get(matricule=matricule)
        
        # ⛔ Refuser si l'agent est chef
        if est_chef(agent):
            return JsonResponse({
                'error': 'Vous êtes un chef de service. Veuillez adresser votre demande de congé à la hiérarchie (Ministre ou supérieur).'
            }, status=403)
        
        # Valider les dates
        date_debut = datetime.strptime(date_debut_str, '%Y-%m-%d').date()
        
        # ✅ Calculer la date de fin automatiquement
        date_fin = date_debut + timedelta(days=nombre_jours - 1)
        
        # Vérifier que la date de début n'est pas dans le passé
        if date_debut < datetime.now().date():
            return JsonResponse({'error': 'La date de début ne peut pas être dans le passé'}, status=400)
        
        # ✅ Vérifier le nombre maximum de jours
        if nombre_jours > 30:
            return JsonResponse({'error': 'La durée maximale d\'un congé est de 30 jours consécutifs.'}, status=400)
        
        # Vérifier l'année
        annee_demande = date_debut.year
        annee_courante = datetime.now().year
        
        if annee_demande < annee_courante:
            return JsonResponse({'error': f'Impossible de demander un congé pour {annee_demande} (année déjà passée)'}, status=400)
        
        if annee_demande > annee_courante:
            return JsonResponse({'error': f'Impossible de demander un congé pour {annee_demande} (année future)'}, status=400)
        
        # Vérifier l'ancienneté
        if agent.date_prise_service:
            anciennete_jours = (datetime.now().date() - agent.date_prise_service).days
            if anciennete_jours < 365:
                return JsonResponse({'error': 'Ancienneté insuffisante. Vous devez avoir au moins 1 an de service.'}, status=400)
        
        # Vérifier le nombre de demandes dans l'année
        nb_demandes_annee = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            date_soumission__year=annee_courante
        ).count()
        
        if nb_demandes_annee >= 2:
            return JsonResponse({'error': f'Vous avez déjà effectué {nb_demandes_annee} demande(s) de congé cette année. Maximum 2 demandes par an.'}, status=400)
        
        # ✅ Vérifier le solde avec le nombre de jours
        solde, _ = SoldeConge.objects.get_or_create(
            agent=agent,
            annee=annee_courante,
            defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
        )
        
        if nombre_jours > solde.jours_restants:
            return JsonResponse({
                'error': f'Solde insuffisant. Vous avez {solde.jours_restants} jours restants, vous demandez {nombre_jours} jours.'
            }, status=400)
        
        # Vérifier les chevauchements
        chevauchement = DemandeConge.objects.filter(
            demande__agent=agent,
            date_debut__lte=date_fin,
            date_fin__gte=date_debut,
            demande__statut__in=['en_attente_chef', 'valide']
        ).exists()
        
        if chevauchement:
            return JsonResponse({'error': 'Vous avez déjà une demande de congé sur cette période.'}, status=400)
        
        # Créer la demande
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
        
        # ✅ Créer le congé avec date_fin calculée
        conge = DemandeConge.objects.create(
            demande=demande,
            date_debut=date_debut,
            date_fin=date_fin,
            nombrejours=nombre_jours
        )
        
        # Notifier le chef
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
            'jours_restants_apres': solde.jours_restants - nombre_jours,
            'date_debut': str(date_debut),
            'date_fin': str(date_fin),
            'nombre_jours': nombre_jours
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR demande_conge: {str(e)}")
        import traceback
        traceback.print_exc()
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

        # ⛔ Refuser si l'agent est chef
        if est_chef(agent):
            return JsonResponse({
                'error': 'Vous êtes un chef de service. Les absences doivent être autorisées par votre supérieur hiérarchique.'
            }, status=403)
        
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
                nombre_jours = demande.demandeconge.nombrejours  # ✅ Déjà stocké
                
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
        matricule = normalize_matricule(matricule)
        if not matricule:
            return JsonResponse([], safe=False)

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
        return JsonResponse([], safe=False)
    except Exception as e:
        print(f"❌ ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def solde_conge(request, matricule):
    try:
        matricule = normalize_matricule(matricule)
        if not matricule:
            return JsonResponse({
                'annee': datetime.now().year,
                'jours_acquis': 30,
                'jours_pris': 0,
                'jours_restants': 30
            })

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
        return JsonResponse({
            'annee': datetime.now().year,
            'jours_acquis': 30,
            'jours_pris': 0,
            'jours_restants': 30
        })
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
        matricule = normalize_matricule(matricule)
        print(f"=== get_user_permissions for: {matricule}")

        if not matricule:
            return JsonResponse({'matricule': matricule, 'permissions': []})

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
        return JsonResponse({'matricule': normalize_matricule(matricule), 'permissions': []})
    except Exception as e:
        print(f"Erreur: {str(e)}")
        return JsonResponse({'matricule': normalize_matricule(matricule), 'permissions': []})


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
        
        # ✅ EXCLURE les attestations de cette requête
        types_attestation = [
            'Attestation de travail',
            'Attestation de présence au poste',
            'Attestation de validité de services',
            'Certificat de non-jouissance de congé'
        ]
        
        demandes = Demande.objects.filter(
            statut=statut
        ).exclude(
            type_demande__libelle__in=types_attestation  # ← AJOUTE CETTE LIGNE
        ).select_related('agent', 'type_demande')
        
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
                statut__in=['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine', 'remis','envoye_secretaire'],
                type_demande__libelle__in=types_demandes
            ).select_related('agent', 'type_demande', 'agent_rh')
        elif 'dapaf' in roles:
            types_demandes = ['Congé', 'Autorisation de jouissance de congé administratif']
            demandes = Demande.objects.filter(
                statut__in=['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine', 'remis','envoye_secretaire'],
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
                # ✅ Utiliser date_soumission comme fallback
                'date_assignation': str(d.date_soumission),  # ou une autre date
                'date_soumission': str(d.date_soumission)
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
    try:
        user = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        
        if 'dpaf' in roles:
            types_actes = [
                'Attestation de travail', 
                'Absence', 
                'Reprise de service', 
                "Autorisation d'absence exceptionnelle"
            ]
            statut_cible = 'attente_signature_dpaf'
        elif 'dapaf' in roles:
            types_actes = [
                'Autorisation de jouissance de congé administratif',
                'Attestation de présence au poste',
                'Attestation de validité de services',
                'Certificat de non-jouissance de congé'
            ]
            statut_cible = 'attente_signature_dapaf'
        else:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        actes = ActeAdministratif.objects.filter(
            statut=statut_cible,
            type_acte__in=types_actes
        ).select_related('demande__agent', 'demande__type_demande')
        
        result = []
        for acte in actes:
            if acte.demande:
                # ✅ Récupérer la date de soumission de la demande
                date_demande = acte.demande.date_soumission if acte.demande.date_soumission else acte.date_generation
                
                result.append({
                    'reference': acte.reference,
                    'agent_nom': acte.demande.agent.nom,
                    'agent_prenom': acte.demande.agent.prenom,
                    'type_acte': acte.type_acte,
                    'date_generation': str(acte.date_generation),
                    'date_demande': str(date_demande),  # ✅ Date de soumission de la demande
                    'demande_type': acte.demande.type_demande.libelle if acte.demande.type_demande else 'Inconnu'  # ✅ Type de la demande
                })
        
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_actes_a_signer_by_role: {str(e)}")
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


def _type_acte_canonique(type_acte):
    type_normalise = (type_acte or '').strip().lower()
    mappings = {
        'attestation de présence au poste': 'Attestation de présence au poste',
        'attestation de presence au poste': 'Attestation de présence au poste',
        'attestation de travail': 'Attestation de travail',
        'attestation de validité de services': 'Attestation de validité de services',
        'attestation de validite de services': 'Attestation de validité de services',
        'certificat de non-jouissance de congé': 'Certificat de non-jouissance de congé',
        'certificat de non jouissance de congé': 'Certificat de non-jouissance de congé',
        'certificat de non-jouissance de conge': 'Certificat de non-jouissance de congé',
        'autorisation de jouissance de congé administratif': 'Autorisation de jouissance de congé administratif',
        'autorisation de jouissance de conge administratif': 'Autorisation de jouissance de congé administratif',
        'congé': 'Autorisation de jouissance de congé administratif',
        'conge': 'Autorisation de jouissance de congé administratif',
        "autorisation d'absence exceptionnelle": "Autorisation d'absence exceptionnelle",
        'absence': "Autorisation d'absence exceptionnelle",
        'reprise de service': 'Reprise de service',
    }
    
    # ✅ Si le type commence par "certificat de non-jouissance de congé" (avec année)
    if type_normalise.startswith('certificat de non-jouissance de congé'):
        return 'Certificat de non-jouissance de congé'
    
    return mappings.get(type_normalise, type_acte)

def _est_type_attestation(type_acte):
    return _type_acte_canonique(type_acte) in {
        'Attestation de présence au poste',
        'Attestation de travail',
        'Attestation de validité de services',
        'Certificat de non-jouissance de congé',
    }


def generer_acte_avec_signature_et_cachet(acte, demande, signataire, signature_base64=None, cachet_base64=None, commentaire=""):
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from io import BytesIO
    import os
    import re
    import base64
    from django.conf import settings
    from datetime import timedelta  # ✅ AJOUTER CET IMPORT
    
    type_acte = _type_acte_canonique(acte.type_acte)
    
    # ✅ Déterminer le template selon le type d'acte
    if type_acte == 'Attestation de présence au poste':
        template_name = 'attestation_presence_template.docx'
    elif type_acte == 'Attestation de travail':
        template_name = 'attestation_travail_template.docx'
    elif type_acte == 'Attestation de validité de services':
        template_name = 'attestation_validite_services_template.docx'
    elif type_acte == 'Certificat de non-jouissance de congé':
        template_name = 'certificat_non_jouissance_template.docx'
    elif type_acte in ['Congé', 'Autorisation de jouissance de congé administratif']:
        template_name = 'autorisation_conge_template.docx'
    elif type_acte in ["Autorisation d'absence exceptionnelle", 'Absence', 'Reprise de service']:
        template_name = 'autorisation_absence_template.docx'
    else:
        raise ValueError(f"Type d'acte non supporté pour génération: {acte.type_acte}")
    
    template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', template_name)
    
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template introuvable pour {type_acte}: {template_path}")
    
    doc = Document(template_path)
    
    # ✅ Remplacer les placeholders selon le type d'acte
    if type_acte == 'Attestation de présence au poste':
        nom_complet = f"{demande.agent.nom} {demande.agent.prenom}".upper()
        poste = demande.agent.poste or 'Agent'
        date_prise_service = demande.agent.date_prise_service.strftime('%d %B %Y') if demande.agent.date_prise_service else 'date non renseignée'
        
        mois_fr = {
            'January': 'janvier', 'February': 'février', 'March': 'mars',
            'April': 'avril', 'May': 'mai', 'June': 'juin',
            'July': 'juillet', 'August': 'août', 'September': 'septembre',
            'October': 'octobre', 'November': 'novembre', 'December': 'décembre'
        }
        for en, fr in mois_fr.items():
            date_prise_service = date_prise_service.replace(en, fr)
        
        replacements = {
            '{{REFERENCE}}': acte.reference,
            '{{NOM_COMPLET}}': nom_complet,
            '{{POSTE}}': poste,
            '{{DATE_PRISE_SERVICE}}': date_prise_service,
            '{{DATE_AUJOURD_HUI}}': datetime.now().strftime('%d/%m/%Y')
        }
        
    elif type_acte == 'Attestation de travail':
        nom_complet = f"{demande.agent.nom} {demande.agent.prenom}".upper()
        poste = demande.agent.poste or 'Administrateur'
        date_prise_service = demande.agent.date_prise_service.strftime('%d %B %Y') if demande.agent.date_prise_service else 'date non renseignée'
        
        mois_fr = {
            'January': 'janvier', 'February': 'février', 'March': 'mars',
            'April': 'avril', 'May': 'mai', 'June': 'juin',
            'July': 'juillet', 'August': 'août', 'September': 'septembre',
            'October': 'octobre', 'November': 'novembre', 'December': 'décembre'
        }
        for en, fr in mois_fr.items():
            date_prise_service = date_prise_service.replace(en, fr)
        
        replacements = {
            '{{REFERENCE}}': acte.reference,
            '{{NOM_COMPLET}}': nom_complet,
            '{{POSTE}}': poste,
            '{{DATE_PRISE_SERVICE}}': date_prise_service,
            '{{DATE_AUJOURD_HUI}}': datetime.now().strftime('%d/%m/%Y')
        }
        
    elif type_acte == 'Attestation de validité de services':
        nom_complet = f"{demande.agent.nom} {demande.agent.prenom}".upper()
        poste = demande.agent.poste or 'Agent'
        echelon_complet = demande.agent.echelon or 'A1-1'
        categorie = echelon_complet[0].upper()
        
        match = re.match(r'[A-Z](\d+)-(\d+)', echelon_complet)
        if match:
            echelon_format = f"échelle {match.group(2)}, échelon {match.group(1)}"
        else:
            echelon_format = "échelle 1, échelon 1"
        
        date_prise_service = demande.agent.date_prise_service.strftime('%d %B %Y') if demande.agent.date_prise_service else 'date non renseignée'
        
        # Date de retraite
        if demande.agent.date_naissance:
            if categorie == 'A':
                age_retraite = 60
            elif categorie == 'B':
                age_retraite = 58
            elif categorie in ['C', 'D']:
                age_retraite = 55
            else:
                age_retraite = 60
            
            date_retraite = demande.agent.date_naissance.replace(year=demande.agent.date_naissance.year + age_retraite)
            date_retraite_str = date_retraite.strftime('1er %B %Y')
            mois_fr = {
                'January': 'janvier', 'February': 'février', 'March': 'mars',
                'April': 'avril', 'May': 'mai', 'June': 'juin',
                'July': 'juillet', 'August': 'août', 'September': 'septembre',
                'October': 'octobre', 'November': 'novembre', 'December': 'décembre'
            }
            for en, fr in mois_fr.items():
                date_retraite_str = date_retraite_str.replace(en, fr)
        else:
            date_retraite_str = 'date à déterminer'
        
        replacements = {
            '{{REFERENCE}}': acte.reference,
            '{{NOM_COMPLET}}': nom_complet,
            '{{POSTE}}': poste,
            '{{CATEGORIE}}': categorie,
            '{{ECHELON}}': echelon_format,
            '{{DATE_PRISE_SERVICE}}': date_prise_service,
            '{{DATE_RETRAITE}}': date_retraite_str,
            '{{DATE_AUJOURD_HUI}}': datetime.now().strftime('%d/%m/%Y')
        }
        
    elif type_acte == 'Certificat de non-jouissance de congé':
        annee = datetime.now().year
        civilite = "Madame" if (demande.agent.prenom.endswith('e') or demande.agent.nom.endswith('e')) else "Monsieur"
        nom_complet = f"{demande.agent.prenom} {demande.agent.nom}"
        poste = demande.agent.poste or 'Agent'
        
        replacements = {
            '{{REFERENCE}}': acte.reference,
            '{{CIVILITE}}': civilite,
            '{{NOM_COMPLET}}': nom_complet,
            '{{POSTE}}': poste,
            '{{ANNEE}}': str(annee),
            '{{DATE_AUJOURD_HUI}}': datetime.now().strftime('%d/%m/%Y')
        }
        
    else:
        # Cas des congés et absences
        if hasattr(demande, 'demandeconge') and demande.demandeconge:
            date_debut = demande.demandeconge.date_debut.strftime('%d/%m/%Y')
            date_fin = demande.demandeconge.date_fin.strftime('%d/%m/%Y')
            
            # ✅ CORRECTION : La date de reprise est le lendemain de la date de fin
            date_reprise = demande.demandeconge.date_fin + timedelta(days=1)
            date_reprise_str = date_reprise.strftime('%d/%m/%Y')
            
            nombre_jours = demande.demandeconge.nombrejours
            motif = ''
        else:
            date_debut = demande.demandeabsence.date_debut.strftime('%d/%m/%Y') if hasattr(demande, 'demandeabsence') else ''
            date_fin = demande.demandeabsence.date_fin.strftime('%d/%m/%Y') if hasattr(demande, 'demandeabsence') else ''
            
            # ✅ CORRECTION : Date de reprise pour les absences aussi
            if hasattr(demande, 'demandeabsence') and demande.demandeabsence:
                date_reprise = demande.demandeabsence.date_fin + timedelta(days=1)
                date_reprise_str = date_reprise.strftime('%d/%m/%Y')
            else:
                date_reprise_str = ''
            
            nombre_jours = demande.demandeabsence.nombrejours if hasattr(demande, 'demandeabsence') else ''
            motif = demande.demandeabsence.motif if hasattr(demande, 'demandeabsence') else ''
        
        # ✅ AJOUTER date_reprise dans les replacements
        replacements = {
            '{{REFERENCE}}': acte.reference,
            '{{AGENT_NOM}}': demande.agent.nom.upper(),
            '{{AGENT_PRENOM}}': demande.agent.prenom,
            '{{AGENT_POSTE}}': demande.agent.poste or 'Agent',
            '{{DATE_DEBUT}}': date_debut,
            '{{DATE_FIN}}': date_fin,
            '{{DATE_REPRISE}}': date_reprise_str,  # ✅ NOUVEAU
            '{{NOMBRE_JOURS}}': str(nombre_jours),
            '{{MOTIF}}': motif,
            '{{DATE_AUJOURD_HUI}}': datetime.now().strftime('%d/%m/%Y'),
            '{{ANNEE}}': str(datetime.now().year)
        }
    
    # Remplacer les placeholders dans le document
    for paragraph in doc.paragraphs:
        for key, value in replacements.items():
            if key in paragraph.text:
                paragraph.text = paragraph.text.replace(key, value)
    
    # Remplacer dans les tableaux
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    for key, value in replacements.items():
                        if key in paragraph.text:
                            paragraph.text = paragraph.text.replace(key, value)
    
    # ✅ Ajouter la signature et le cachet
    nom_a_chercher = None
    agent_roles = AgentRole.objects.filter(agent=signataire).select_related('role')
    roles = [ar.role.libelle.lower() for ar in agent_roles]
    
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
                'statut': d.statut,
                # ✅ Utiliser date_soumission comme fallback
                'date_assignation': str(d.date_soumission),  # ou str(d.date_soumission) si tu veux la date de soumission
                'date_soumission': str(d.date_soumission)   # Ajoute aussi date_soumission pour le frontend
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
        rh_matricule = data.get('rh_matricule')
        
        demande = Demande.objects.get(id=demande_id)
        demande_type_label = demande.type_demande.libelle if demande.type_demande else ''
        
        # ✅ Vérification flexible avec startswith
        types_attestation = [
            'Attestation de travail',
            'Attestation de présence au poste',
            'Attestation de validité de services',
            'Certificat de non-jouissance de congé'
        ]
        
        est_attestation = False
        for type_autorise in types_attestation:
            if demande_type_label.startswith(type_autorise):
                est_attestation = True
                print(f"✅ Attestation détectée: {demande_type_label} (commence par {type_autorise})")
                break
        
        # ✅ Si c'est une attestation, utiliser la fonction dédiée
        if est_attestation:
            return generer_attestation_rh(request, demande_id)
        
        # ✅ Sinon, vérifier les autres types
        is_conge = demande_type_label.lower() in ['congé', 'conge']
        is_absence = 'absence' in demande_type_label.lower()

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
                
                # ✅ CORRECTION : Date de reprise = lendemain de la date de fin
                date_reprise = demande.demandeconge.date_fin + timedelta(days=1)
                date_reprise_str = date_reprise.strftime('%d/%m/%Y')
                
                nombre_jours = demande.demandeconge.nombrejours
            else:
                date_debut = date_fin = date_reprise_str = nombre_jours = ''
            motif = ''
            filename_prefix = 'Autorisation_Conge'
        elif is_absence:
            template_name = 'autorisation_absence_template.docx'
            type_acte = "Autorisation d'absence exceptionnelle"
            if hasattr(demande, 'demandeabsence') and demande.demandeabsence:
                date_debut = demande.demandeabsence.date_debut.strftime('%d/%m/%Y')
                date_fin = demande.demandeabsence.date_fin.strftime('%d/%m/%Y')
                
                # ✅ CORRECTION : Date de reprise pour absence
                date_reprise = demande.demandeabsence.date_fin + timedelta(days=1)
                date_reprise_str = date_reprise.strftime('%d/%m/%Y')
                
                nombre_jours = demande.demandeabsence.nombrejours
                motif = demande.demandeabsence.motif if demande.demandeabsence.motif else ''
            else:
                date_debut = date_fin = date_reprise_str = nombre_jours = motif = ''
            filename_prefix = 'Autorisation_Absence'
        else:
            return JsonResponse({
                'error': f'Type de demande non supporté: {demande_type_label}',
                'types_supportes': ['Congé', 'Absence', 'Attestation de travail', 'Attestation de présence au poste', 'Attestation de validité de services', 'Certificat de non-jouissance de congé']
            }, status=400)

        template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', template_name)
        
        if not os.path.exists(template_path):
            return JsonResponse({'error': f'Template non trouvé: {template_path}'}, status=500)
        
        doc = Document(template_path)

        # ✅ GÉNÉRER LA RÉFÉRENCE ICI
        numero_seul = generer_reference_acte(type_acte)
        reference_complete = f"{numero_seul}/MND/DPAF/SRHDS/SA"
        
        # ✅ AJOUTER DATE_REPRISE dans les replacements
        replacements = {
            '{{REFERENCE}}': numero_seul,
            '{{AGENT_NOM}}': demande.agent.nom.upper(),
            '{{AGENT_PRENOM}}': demande.agent.prenom,
            '{{AGENT_POSTE}}': demande.agent.poste or 'Agent',
            '{{DATE_DEBUT}}': date_debut,
            '{{DATE_FIN}}': date_fin,
            '{{DATE_REPRISE}}': date_reprise_str,  # ✅ NOUVEAU
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
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': 'Conversion en PDF impossible sur le serveur.'}, status=500)

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
        import traceback
        traceback.print_exc()
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
        
        # 1. Si signé → utiliser fichier_pdf_signe
        if acte.fichier_pdf_signe:
            fichier_bytes = base64.b64decode(acte.fichier_pdf_signe)
            if fichier_bytes.startswith(b'PK'):
                pdf_bytes = _docx_bytes_to_pdf_bytes(fichier_bytes)
            else:
                pdf_bytes = fichier_bytes
            return _create_pdf_response(pdf_bytes, f'acte_{reference}')
        
        # 2. Si fichier_pdf existe → l'utiliser directement (RAPIDE)
        if acte.fichier_pdf:
            fichier_bytes = base64.b64decode(acte.fichier_pdf)
            if fichier_bytes.startswith(b'PK'):
                pdf_bytes = _docx_bytes_to_pdf_bytes(fichier_bytes)
            else:
                pdf_bytes = fichier_bytes
            return _create_pdf_response(pdf_bytes, f'acte_{reference}')
        
        # 3. Fallback : générer seulement si vraiment nécessaire
        if acte.demande:
            signataire, _ = get_signataire_par_type_acte(acte.type_acte)
            pdf_bytes = generer_acte_avec_signature_et_cachet(
                acte=acte,
                demande=acte.demande,
                signataire=signataire or acte.demande.agent,
                signature_base64=None,
                cachet_base64=None,
            )
            return _create_pdf_response(pdf_bytes, f'acte_{reference}')
        
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
        
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
                'statut': d.statut,
                # ✅ Utiliser date_soumission comme fallback pour date_debut_traitement
                'date_debut_traitement': str(d.date_soumission),  # ou une autre date
                'date_soumission': str(d.date_soumission)
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
        demande_id = data.get('demande_id')  # ✅ AJOUTÉ
        
        agent = Agent.objects.get(matricule=matricule)
        
        # ✅ Récupérer la demande si demande_id existe
        demande = None
        if demande_id:
            demande = Demande.objects.get(id=demande_id)
        
        signataire, role_name = get_signataire_par_type_acte('Attestation de présence au poste')
        
        if not signataire:
            return JsonResponse({'error': 'Aucun signataire DAPAF trouvé'}, status=500)
        
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
        reference = generer_reference_acte('Attestation de présence au poste')
        
        template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', 'attestation_presence_template.docx')
        
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

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"ERREUR conversion PDF: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': 'Conversion en PDF impossible sur le serveur.'}, status=500)

        # ✅ Créer l'acte AVEC la demande
        ActeAdministratif.objects.create(
            reference=reference,
            demande=demande,  # ← AJOUTÉ
            type_acte='Attestation de présence au poste',
            statut='genere',
            date_generation=datetime.now().date(),
            contenu=reference,
            fichier_pdf=base64.b64encode(pdf_bytes).decode('utf-8')
        )

        return _create_pdf_response(pdf_bytes, f'Attestation_Presence_{agent.nom}_{agent.prenom}')
        
    except Exception as e:
        print(f"ERREUR generer_attestation_presence: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def generer_attestation_travail(request):
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        demande_id = data.get('demande_id')  # ✅ AJOUTÉ
        
        agent = Agent.objects.get(matricule=matricule)
        
        # ✅ Récupérer la demande si demande_id existe
        demande = None
        if demande_id:
            demande = Demande.objects.get(id=demande_id)
        
        signataire, role_name = get_signataire_par_type_acte('Attestation de travail')
        
        if not signataire:
            return JsonResponse({'error': 'Aucun signataire Chef RH trouvé'}, status=500)
        
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
        reference = generer_reference_acte('Attestation de travail')
        
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

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"ERREUR conversion PDF: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': 'Conversion en PDF impossible sur le serveur.'}, status=500)

        # ✅ Créer l'acte AVEC la demande
        ActeAdministratif.objects.create(
            reference=reference,
            demande=demande,  # ← AJOUTÉ
            type_acte='Attestation de travail',
            statut='genere',
            date_generation=datetime.now().date(),
            contenu=reference,
            fichier_pdf=base64.b64encode(pdf_bytes).decode('utf-8')
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
        demande_id = data.get('demande_id')  # ✅ AJOUTÉ
        
        agent = Agent.objects.get(matricule=matricule)
        
        # ✅ Récupérer la demande si demande_id existe
        demande = None
        if demande_id:
            demande = Demande.objects.get(id=demande_id)
        
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
        reference = generer_reference_acte('Attestation de validité de services')
        
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

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"ERREUR conversion PDF: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': 'Conversion en PDF impossible sur le serveur.'}, status=500)

        # ✅ Créer l'acte AVEC la demande
        ActeAdministratif.objects.create(
            reference=reference,
            demande=demande,  # ← AJOUTÉ
            type_acte='Attestation de validité de services',
            statut='genere',
            date_generation=datetime.now().date(),
            contenu=reference,
            fichier_pdf=base64.b64encode(pdf_bytes).decode('utf-8')
        )
        
        return _create_pdf_response(pdf_bytes, f'Attestation_Validite_Services_{agent.nom}_{agent.prenom}')
        
    except Exception as e:
        print(f"ERREUR generer_attestation_validite_services: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def generer_certificat_non_jouissance(request):
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        demande_id = data.get('demande_id')  # ✅ AJOUTÉ
        annee = data.get('annee', datetime.now().year)
        
        agent = Agent.objects.get(matricule=matricule)
        
        # ✅ Récupérer la demande si demande_id existe
        demande = None
        if demande_id:
            demande = Demande.objects.get(id=demande_id)
        
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
        reference = generer_reference_acte('Certificat de non-jouissance de congé')
        
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

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        docx_bytes = output.getvalue()
        
        try:
            pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
        except RuntimeError as e:
            print(f"ERREUR conversion PDF: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': 'Conversion en PDF impossible sur le serveur.'}, status=500)

        # ✅ Créer l'acte AVEC la demande
        ActeAdministratif.objects.create(
            reference=reference,
            demande=demande,  # ← AJOUTÉ
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
        cleaned_base64 = cleaned_base64.strip()
        cleaned_base64 = fix_base64_padding(cleaned_base64)
        try:
            file_bytes = base64.b64decode(cleaned_base64)
        except (binascii.Error, ValueError) as e:
            return JsonResponse({'error': f'Base64 invalide : {str(e)}'}, status=400)

        stored_path = save_uploaded_file_bytes(
            file_bytes,
            file_name,
            subdir=f"agent_{agent.matricule}",
            prefix=type_piece.libelle
        )
        
        date_expiration_str = request.POST.get('date_expiration')
        date_expiration = datetime.strptime(date_expiration_str, '%Y-%m-%d').date() if date_expiration_str else None
        
        anciennes_pieces = Piece.objects.filter(dossier_agent=dossier, type_piece=type_piece)
        if anciennes_pieces.exists():
            anciennes_pieces.delete()
        
        piece = Piece.objects.create(
            dossier_agent=dossier, type_piece=type_piece, nom_fichier=file_name,
            date_expiration=date_expiration, date_upload=date.today(), valide=1, cheminfichier=stored_path
        )
        
        cache_key = f'anomalies_{matricule}'
        cache.delete(cache_key)
        threading.Thread(target=refresh_cached_analysis, args=(matricule,), daemon=True).start()

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

        stored_value = piece.cheminfichier
        if isinstance(stored_value, str) and os.path.isfile(stored_value):
            with open(stored_value, 'rb') as handle:
                file_bytes = handle.read()
            file_base64 = base64.b64encode(file_bytes).decode('utf-8')
        else:
            file_base64 = stored_value
        
        return JsonResponse({'success': True, 'file_name': piece.nom_fichier, 'file_base64': file_base64, 'mime_type': mime_type, 'type_piece': piece.type_piece.libelle})
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

        cache_key = f'anomalies_{dossier.agent.matricule}'
        cache.delete(cache_key)
        threading.Thread(target=refresh_cached_analysis, args=(dossier.agent.matricule,), daemon=True).start()
        
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

import re
import json
from collections import Counter
from datetime import date

SYSTEM_PROMPT = """Tu es un expert RH. Tu réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après, sans backticks, sans markdown.

Format OBLIGATOIRE (respecte exactement ces clés) :
{"score":85,"statut_global":"conforme","resume":"Résumé court.","points_forts":["Point 1"],"points_faibles":["Point 1"],"risques":["Risque 1"],"recommandations":["Action 1"]}

Règles :
- score : doit être proche du score calculé fourni
- statut_global : "conforme" si score>=80, "attention" si 50-79, "critique" si <50
- Toutes les listes peuvent être vides []
- resume : 2 phrases maximum
- AUCUN texte hors du JSON"""


def safe_parse_ai(raw: str, fallback_score: int) -> dict:
    raw = raw.strip()
    raw = re.sub(r'```(?:json)?', '', raw).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    result = {
        "score": fallback_score,
        "statut_global": "conforme" if fallback_score >= 80 else "attention" if fallback_score >= 50 else "critique",
        "resume": "Analyse partielle disponible.",
        "points_forts": [],
        "points_faibles": [],
        "risques": [],
        "recommandations": []
    }

    for key in ["points_forts", "points_faibles", "risques", "recommandations"]:
        pattern = rf'"{key}"\s*:\s*\[([^\]]*)\]'
        m = re.search(pattern, raw, re.DOTALL)
        if m:
            items = re.findall(r'"([^"]+)"', m.group(1))
            result[key] = items

    m = re.search(r'"resume"\s*:\s*"([^"]+)"', raw)
    if m:
        result["resume"] = m.group(1)

    return result


def fallback_analysis(score):
    return {
        "score": score,
        "statut_global": "conforme" if score >= 80 else "attention" if score >= 50 else "critique",
        "resume": "Analyse IA indisponible.",
        "points_forts": [],
        "points_faibles": [],
        "risques": [],
        "recommandations": []
    }


def pending_analysis(score):
    return {
        "score": score,
        "statut_global": "attention" if score >= 50 else "critique",
        "resume": "Analyse IA en cours...",
        "points_forts": [],
        "points_faibles": [],
        "risques": [],
        "recommandations": []
    }


def build_ai_analysis(parsed_payload, score, points_faibles, points_forts):
    parsed_payload['score'] = score
    parsed_payload['statut_global'] = "conforme" if score >= 80 else "attention" if score >= 50 else "critique"
    parsed_payload['points_faibles'] = points_faibles
    parsed_payload['points_forts'] = points_forts if points_forts else parsed_payload.get('points_forts', [])
    return parsed_payload


def build_anomaly_response(agent, dossier):
    pieces = Piece.objects.filter(dossier_agent=dossier).select_related('type_piece')
    anomalies = []
    score = 100
    today = date.today()

    for piece in pieces:
        if piece.date_expiration and piece.date_upload and piece.date_expiration < piece.date_upload:
            anomalies.append({
                'type': 'date_incoherente',
                'severite': 'haute',
                'message': f"Date d'expiration antérieure à la date d'upload pour {piece.type_piece.libelle}"
            })
            score -= 15

    type_ids = [p.type_piece.id for p in pieces]
    doublons = [type_id for type_id, count in Counter(type_ids).items() if count > 1]
    for type_id in doublons:
        pieces_doublons = [p for p in pieces if p.type_piece.id == type_id]
        type_libelle = pieces_doublons[0].type_piece.libelle if pieces_doublons else 'Document'
        anomalies.append({
            'type': 'doublon',
            'severite': 'moyenne',
            'message': f'Doublon : {len(pieces_doublons)} versions de "{type_libelle}"'
        })
        score -= 10

    if agent.date_prise_service and agent.echelon:
        anciennete = (today - agent.date_prise_service).days / 365
        try:
            echelon_num = int(agent.echelon.split('-')[0].replace('A', '').replace('B', '')) if agent.echelon else 1
        except Exception:
            echelon_num = 1
        if anciennete > 10 and echelon_num < 3:
            anomalies.append({
                'type': 'anciennete_grade',
                'severite': 'basse',
                'message': f'Ancienneté élevée ({anciennete:.0f} ans) mais échelon bas ({agent.echelon})'
            })
            score -= 5

    for piece in pieces:
        if piece.date_expiration and piece.date_expiration < today:
            anomalies.append({
                'type': 'document_expire',
                'severite': 'haute',
                'message': f'Document expiré : {piece.type_piece.libelle} (expiré le {piece.date_expiration})'
            })
            score -= 10

    types_obligatoires = TypePiece.objects.filter(obligatoire=1)
    manquants = types_obligatoires.exclude(id__in=[p.type_piece.id for p in pieces])
    for tp in manquants:
        est_critique = tp.libelle in ["Carte Nationale d'Identité", 'Acte de naissance']
        anomalies.append({
            'type': 'document_manquant',
            'severite': 'haute' if est_critique else 'moyenne',
            'message': f'Document obligatoire manquant : {tp.libelle}'
        })
        score -= 15 if est_critique else 8

    score = max(0, min(100, score))
    points_faibles_forces = []
    for a in anomalies:
        if a['type'] == 'document_manquant':
            points_faibles_forces.append(a['message'].replace('Document obligatoire manquant : ', 'Document manquant : '))
        else:
            points_faibles_forces.append(a['message'])

    points_forts_forces = [
        f"{p.type_piece.libelle} — valide"
        for p in pieces
        if not (p.date_expiration and p.date_expiration < today)
    ]

    docs_list = []
    for p in pieces:
        statut = "EXPIRÉ" if (p.date_expiration and p.date_expiration < today) else "OK"
        docs_list.append(f"{p.type_piece.libelle}: {statut}")

    manquants_list = [tp.libelle for tp in manquants]
    anciennete_val = (today - agent.date_prise_service).days // 365 if agent.date_prise_service else 0

    resume = f"""Agent: {agent.prenom} {agent.nom}
Poste: {agent.poste or 'N/A'}
Ancienneté: {anciennete_val} ans
Complétude: {dossier.taux_completude or 0}%
Documents présents: {', '.join(docs_list[:8])}{'...' if len(docs_list) > 8 else ''}
Documents manquants: {', '.join(manquants_list[:5]) if manquants_list else 'Aucun'}
Score calculé: {score}/100
Anomalies détectées: {len(anomalies)}"""

    response_data = {
        'success': True,
        'agent': f"{agent.prenom} {agent.nom}",
        'anomalies': anomalies,
        'score': score,
        'total_anomalies': len(anomalies),
        'niveau_risque': 'faible' if score >= 80 else 'moyen' if score >= 50 else 'élevé',
    }

    if score == 100:
        parsed = {
            'score': score,
            'statut_global': 'conforme',
            'resume': 'Dossier complet sans anomalies détectées.',
            'points_forts': points_forts_forces,
            'points_faibles': points_faibles_forces,
            'risques': [],
            'recommandations': []
        }
        parsed = build_ai_analysis(parsed, score, points_faibles_forces, points_forts_forces)
        response_data['ai_analysis'] = json.dumps(parsed, ensure_ascii=False)
        response_data['analysis_ready'] = True
        return response_data, None

    response_data['ai_analysis'] = json.dumps(pending_analysis(score), ensure_ascii=False)
    response_data['analysis_ready'] = False
    refresh_payload = {
        'resume': resume,
        'points_faibles_forces': points_faibles_forces,
        'points_forts_forces': points_forts_forces,
        'score': score
    }
    return response_data, refresh_payload


def refresh_cached_analysis(matricule, refresh_payload=None):
    try:
        cache_key = f'anomalies_{matricule}'
        agent = Agent.objects.get(matricule=matricule)
        dossier = DossierAgent.objects.filter(agent=agent).first()
        if not dossier:
            return

        response_data, payload = build_anomaly_response(agent, dossier)
        if refresh_payload is not None:
            payload = refresh_payload

        if payload is not None:
            parsed = call_ollama(
                payload['resume'],
                payload['score'],
                payload['points_faibles_forces'],
                payload['points_forts_forces']
            )
            if not parsed:
                parsed = fallback_analysis(payload['score'])
            parsed = build_ai_analysis(parsed, payload['score'], payload['points_faibles_forces'], payload['points_forts_forces'])
            response_data['ai_analysis'] = json.dumps(parsed, ensure_ascii=False)
            response_data['analysis_ready'] = True

        cache.set(cache_key, response_data, timeout=3600)
    except Exception as e:
        print(f"[Ollama] Erreur de rafraîchissement cache : {e}")
    finally:
        cache.delete(f'anomalies_refresh_{matricule}')


def _ensure_ollama_running():
    host = os.getenv('OLLAMA_URL', 'https://kudos-garbage-path.ngrok-free.dev')
    model_name = os.getenv('OLLAMA_MODEL', 'llama3.2:3b')

    try:
        client = ollama.Client(host=host)
        client.list()
        return client, host, model_name
    except Exception as exc:
        ollama_path = shutil.which('ollama') or shutil.which('ollama.exe')
        if ollama_path:
            try:
                subprocess.Popen(
                    [ollama_path, 'serve'],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
                )
            except Exception:
                pass

            for _ in range(10):
                time.sleep(1)
                try:
                    client = ollama.Client(host=host)
                    client.list()
                    return client, host, model_name
                except Exception:
                    continue

        raise exc


def call_ollama(resume, score, points_faibles_forces, points_forts_forces):
    try:
        print(f"[Ollama] Tentative d'appel...")
        client, host, model_name = _ensure_ollama_running()

        statut = "conforme" if score >= 80 else "attention" if score >= 50 else "critique"
        pf_str = json.dumps(points_faibles_forces, ensure_ascii=False)
        pts_str = json.dumps(points_forts_forces, ensure_ascii=False)

        prompt_user = f"""Dossier à analyser :
{resume}

DONNÉES OBLIGATOIRES à inclure telles quelles :
- points_faibles : {pf_str}
- points_forts : {pts_str}

Complète uniquement risques et recommandations selon le contexte.

Réponds avec ce JSON uniquement :
{{"score":{score},"statut_global":"{statut}","resume":"2 phrases max.","points_forts":{pts_str},"points_faibles":{pf_str},"risques":[...],"recommandations":[...]}}"""

        ai_response = client.chat(
            model=model_name,
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': prompt_user}
            ],
            options={'temperature': 0.1, 'num_predict': 500, 'stop': ['```']}
        )

        raw = ai_response['message']['content']
        print(f"[Ollama] Réponse brute : {repr(raw)}")
        parsed = safe_parse_ai(raw, score)
        print(f"[Ollama] Parsed : {parsed}")
        return parsed

    except Exception as e:
        print(f"[Ollama] Erreur interne : {type(e).__name__} — {e}")
        return fallback_analysis(score)


@csrf_exempt
@require_http_methods(["GET"])
def detect_anomalies(request, matricule):
    try:
        agent = Agent.objects.get(matricule=matricule)
        dossier = DossierAgent.objects.filter(agent=agent).first()
        if not dossier:
            return JsonResponse({
                'anomalies': [],
                'score': 100,
                'ai_analysis': json.dumps(fallback_analysis(100)),
                'analysis_ready': True
            })

        cache_key = f'anomalies_{matricule}'
        cached_response = cache.get(cache_key)
        if cached_response:
            return JsonResponse(cached_response)

        lock_key = f'anomalies_refresh_{matricule}'
        if cache.get(lock_key):
            response_data, payload = build_anomaly_response(agent, dossier)
            cache.set(cache_key, response_data, timeout=120)
            return JsonResponse(response_data)

        acquired = cache.add(lock_key, True, timeout=300)
        response_data, payload = build_anomaly_response(agent, dossier)
        cache.set(cache_key, response_data, timeout=120)
        if acquired:
            threading.Thread(target=refresh_cached_analysis, args=(matricule, payload), daemon=True).start()
        return JsonResponse(response_data)

    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"[detect_anomalies] Erreur : {type(e).__name__} — {e}")
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
        
        # ✅ CORRECTION : Filtrer par l'agent RH assigné à la demande
        actes = ActeAdministratif.objects.filter(
            statut='genere',
            demande__agent_rh__matricule=matricule_rh  # Filtrer via la demande
        ).select_related('demande__agent')
        
        # ✅ OU BIEN : Si l'agent RH est stocké sur l'acte lui-même
        # actes = ActeAdministratif.objects.filter(
        #     statut='genere',
        #     rh_matricule=matricule_rh  # Si vous avez un champ rh_matricule sur ActeAdministratif
        # ).select_related('demande__agent')
        
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
        
        print(f"✅ {len(result)} actes à envoyer pour {matricule_rh}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"❌ ERREUR get_actes_a_envoyer_rh: {str(e)}")
        import traceback
        traceback.print_exc()
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
    try:
        type_echelon = get_type_echelon(agent.echelon or 'A1-1')
        age_retraite = get_age_retraite(type_echelon)
        date_retraite = agent.date_naissance.replace(year=agent.date_naissance.year + age_retraite)
        return date_prevue < date_retraite
    except Exception:
        return True


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


def calculer_et_notifier_async():
    try:
        calculer_et_notifier()
    except Exception as e:
        print(f"ERREUR avancements asynchrone: {e}")
        import traceback
        traceback.print_exc()


@csrf_exempt
@require_http_methods(["GET"])
def trigger_avancements(request):
    try:
        threading.Thread(target=calculer_et_notifier_async, daemon=True).start()
        return JsonResponse({'success': True, 'status': 'processing'})
    except Exception as e:
        print(f"ERREUR trigger_avancements: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_avancements_agent(request, matricule):
    try:
        matricule = normalize_matricule(matricule)
        if not matricule:
            return JsonResponse([], safe=False)

        agent = Agent.objects.get(matricule=matricule)
        avancements = Avancement.objects.filter(agent=agent).order_by('-date_prevue')
        result = [{'id': a.id, 'date_prevue': str(a.date_prevue), 'date_effective': str(a.date_effective) if a.date_effective else None, 'type': a.type_avancement, 'echelon_ancien': a.echelon_ancien, 'echelon_nouveau': a.echelon_nouveau} for a in avancements]
        return JsonResponse(result, safe=False)
    except Agent.DoesNotExist:
        return JsonResponse([], safe=False)
    except Exception as e:
        print(f"ERREUR get_avancements_agent: {str(e)}")
        return JsonResponse([], safe=False)


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
    """Agent dépose une candidature - avec pièces jointes"""
    print("=" * 60)
    print("🔍 [DEBUG] postuler() a été appelée")
    print("=" * 60)
    
    try:
        matricule = None
        poste_id = None
        cv_file = None
        lm_file = None
        diplome_file = None
        
        # Vérifier si c'est du JSON ou du multipart/form-data
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Cas d'un formulaire avec fichiers
            matricule = request.POST.get('matricule')
            poste_id = request.POST.get('poste_id')
            cv_file = request.FILES.get('cv')
            lm_file = request.FILES.get('lm')
            diplome_file = request.FILES.get('diplome')
            
            print(f"📌 Matricule: {matricule}, Poste ID: {poste_id}")
            print(f"📄 CV: {cv_file.name if cv_file else 'Non fourni'}")
            print(f"📄 LM: {lm_file.name if lm_file else 'Non fourni'}")
            print(f"📄 Diplôme: {diplome_file.name if diplome_file else 'Non fourni'}")
        else:
            # Cas JSON
            data = json.loads(request.body)
            matricule = data.get('matricule')
            poste_id = data.get('poste_id')
            print(f"📌 Matricule: {matricule}, Poste ID: {poste_id} (JSON)")
        
        if not matricule or not poste_id:
            return JsonResponse({'error': 'Matricule et poste_id requis'}, status=400)
        
        with connection.cursor() as cursor:
            # Vérifier l'agent
            cursor.execute("SELECT actif FROM agent WHERE matricule = %s", [matricule])
            agent_exists = cursor.fetchone()
            if not agent_exists:
                return JsonResponse({'error': 'Agent non trouvé'}, status=404)
            if agent_exists[0] != 1:
                return JsonResponse({'error': 'Compte agent désactivé'}, status=400)
            
            # Vérifier si déjà postulé
            cursor.execute("""
                SELECT COUNT(*) FROM candidature 
                WHERE agent_id = %s AND poste_vacant_id = %s
            """, [matricule, poste_id])
            if cursor.fetchone()[0] > 0:
                return JsonResponse({'error': 'Vous avez déjà postulé à cette annonce'}, status=400)
            
            # Vérifier que l'annonce est ouverte
            cursor.execute("""
                SELECT statut, date_cloture, intitule, pieces_requises 
                FROM poste_vacant WHERE id = %s
            """, [poste_id])
            poste = cursor.fetchone()
            
            if not poste:
                return JsonResponse({'error': 'Annonce non trouvée'}, status=404)
            
            if poste[0] != 'publie':
                return JsonResponse({'error': 'Cette annonce est clôturée'}, status=400)
            
            if poste[1] and poste[1] < date.today():
                return JsonResponse({'error': 'Date de clôture dépassée'}, status=400)
            
            pieces_requises = json.loads(poste[3]) if poste[3] else ['CV', 'LM', 'DIPLOME']
            
            # Créer la candidature
            cursor.execute("""
                INSERT INTO candidature (agent_id, poste_vacant_id, date_soumission, score_eligibilite, statut, rang, analyse_ia)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, [matricule, poste_id, date.today(), 0, 'deposee', None, None])
            
            candidature_id = cursor.lastrowid
            print(f"✅ Candidature créée avec ID: {candidature_id}")
            
            # ========== TRAITER LES FICHIERS UPLOADÉS ==========
            uploaded_count = 0
            
            if request.content_type and 'multipart/form-data' in request.content_type:
                upload_dir = f'uploads/pieces/candidature_{candidature_id}'
                os.makedirs(upload_dir, exist_ok=True)
                
                # Mapping des fichiers
                fichiers = [
                    ('CV', cv_file),
                    ('LM', lm_file),
                    ('DIPLOME', diplome_file)
                ]
                
                for type_document, fichier in fichiers:
                    if fichier:
                        try:
                            # Sauvegarder le fichier
                            safe_filename = f"{type_document}_{candidature_id}_{date.today()}_{fichier.name}"
                            safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in '._-')
                            file_path = os.path.join(upload_dir, safe_filename)
                            
                            with open(file_path, 'wb+') as f:
                                for chunk in fichier.chunks():
                                    f.write(chunk)
                            
                            # Récupérer ou créer le type_piece
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
                            
                            # Insérer la pièce
                            cursor.execute("""
                                INSERT INTO piece (candidature_id, type_piece_id, nom_fichier, date_upload, valide, cheminfichier) 
                                VALUES (%s, %s, %s, %s, %s, %s)
                            """, [candidature_id, type_piece_id, fichier.name, date.today(), 1, file_path])
                            
                            uploaded_count += 1
                            print(f"✅ {type_document} uploadé")
                        except Exception as e:
                            print(f"❌ Erreur upload {type_document}: {e}")
                
                # Vérifier combien de pièces sont uploadées
                cursor.execute("""
                    SELECT COUNT(DISTINCT tp.libelle)
                    FROM piece p
                    JOIN type_piece tp ON p.type_piece_id = tp.id
                    WHERE p.candidature_id = %s
                """, [candidature_id])
                uploaded_count = cursor.fetchone()[0]
                
                print(f"📊 Pièces uploadées: {uploaded_count}/{len(pieces_requises)}")
                
                # Lancer l'analyse si toutes les pièces sont là
                if uploaded_count >= len(pieces_requises):
                    print(f"🚀 Lancement de l'analyse asynchrone...")
                    thread = threading.Thread(target=lancer_analyse_async, args=(candidature_id,))
                    thread.daemon = True
                    thread.start()
                    print(f"✅ Analyse asynchrone lancée")
            
            return JsonResponse({
                'success': True,
                'message': 'Candidature enregistrée avec succès',
                'candidature_id': candidature_id,
                'pieces_uploaded': uploaded_count,
                'pieces_requises': len(pieces_requises)
            })
        
    except json.JSONDecodeError as e:
        print(f"❌ Erreur JSON: {str(e)}")
        return JsonResponse({'error': 'Données JSON invalides'}, status=400)
    except Exception as e:
        print(f"❌ ERREUR dans postuler: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)
    

def lancer_analyse_async(candidature_id):
    """Lance l'analyse IA en arrière-plan"""
    print("=" * 60)
    print(f"🚀 [ASYNC] LANCEMENT de l'analyse pour candidature {candidature_id}")
    print("=" * 60)
    
    try:
        # Attendre un peu que tous les fichiers soient bien enregistrés
        import time
        time.sleep(2)
        
        from .views import analyser_candidature
        from django.test import RequestFactory
        
        factory = RequestFactory()
        request = factory.post(f'/api/candidatures/{candidature_id}/analyser/')
        
        print(f"📡 Appel de analyser_candidature...")
        result = analyser_candidature(request, candidature_id)
        print(f"✅ [ASYNC] Analyse terminée pour candidature {candidature_id}")
        
    except Exception as e:
        print(f"❌ [ASYNC] Erreur: {e}")
        import traceback
        traceback.print_exc()
        
@csrf_exempt
@require_http_methods(["GET"])
def check_candidature_status(request, candidature_id):
    """Vérifier le statut d'une candidature"""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT c.id, c.statut, c.score_eligibilite, 
                       c.analyse_ia, COUNT(p.id) as nb_pieces
                FROM candidature c
                LEFT JOIN piece p ON p.candidature_id = c.id
                WHERE c.id = %s
                GROUP BY c.id
            """, [candidature_id])
            result = cursor.fetchone()
            
            if not result:
                return JsonResponse({'error': 'Candidature non trouvée'}, status=404)
            
            return JsonResponse({
                'candidature_id': result[0],
                'statut': result[1],
                'score': result[2] or 0,
                'analyse': result[3] or '',
                'nb_pieces': result[4] or 0,
                'analyse_terminee': result[2] is not None and result[2] > 0
            })
    except Exception as e:
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

def _normaliser_type_piece(libelle):
    """Retourne un code stable pour comparer les pieces d'une annonce."""
    if not libelle:
        return ''
    value = str(libelle).strip().upper()
    try:
        value = value.encode('ascii', 'ignore').decode('ascii')
    except Exception:
        pass
    value = re.sub(r'[^A-Z0-9]+', '', value)
    aliases = {
        'LETTREDEMOTIVATION': 'LM',
        'LETTREMOTIVATION': 'LM',
        'LM': 'LM',
        'CV': 'CV',
        'CURRICULUMVITAE': 'CV',
        'DIPLOME': 'DIPLOME',
        'DIPLOMES': 'DIPLOME',
        'DIPLME': 'DIPLOME',
        'ATTESTATION': 'ATTESTATION',
        'ATTESTATIONDETRAVAIL': 'ATTESTATION',
        'CNI': 'CNI',
        'CARTEIDENTITE': 'CNI',
        'CARTEDIDENTITE': 'CNI',
    }
    return aliases.get(value, value)


def _charger_pieces_requises(value):
    """Parse pieces_requises depuis JSONField/texte SQL et normalise les codes."""
    if not value:
        return []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = [value]
    if not isinstance(value, list):
        return []
    pieces = []
    for item in value:
        code = _normaliser_type_piece(item)
        if code and code not in pieces:
            pieces.append(code)
    return pieces


def analyser_candidature_avec_ia(candidature_id, cv_text, lettre_text, diplome_text, 
                                  diplome_requis, profil_recherche, pieces_requises=None, 
                                  pieces_fournies=None, textes_par_piece=None):
    """
    Analyse IA avancée avec détection de fraudes et scoring détaillé
    """
    pieces_requises = pieces_requises or ['CV', 'LM', 'DIPLOME']
    pieces_fournies = pieces_fournies or []
    textes_par_piece = textes_par_piece or {}
    pieces_fournies_set = {_normaliser_type_piece(p) for p in pieces_fournies}
    lettre_requise = 'LM' in pieces_requises
    
    # ============================================================
    # 1. VÉRIFICATION DES PIÈCES OBLIGATOIRES
    # ============================================================
    pieces_manquantes = [p for p in pieces_requises if p not in pieces_fournies_set]
    if pieces_manquantes:
        return 0, f"Dossier incomplet: pieces obligatoires manquantes: {', '.join(pieces_manquantes)}", {}
    
    # ============================================================
    # 2. DÉTECTION DE FRAUDE - VÉRIFICATION DES DOCUMENTS
    # ============================================================
    fraudes_detectees = []
    
    # 2.1 Vérifier si le CV contient des indices de fraude
    if cv_text:
        fraud_patterns = [
            ("cv générique", ["modèle", "template", "exemple", "remplacer"]),
            ("fausse expérience", ["expérience factice", "stage fictif"]),
            ("incohérence dates", ["20XX", "XXXX", "0000"]),
            ("photoshop", ["modifié", "retouché"]),
        ]
        
        for pattern_name, keywords in fraud_patterns:
            for keyword in keywords:
                if keyword.lower() in cv_text.lower():
                    fraudes_detectees.append({
                        'type': 'suspicion_fraude',
                        'description': f'Mot suspect détecté dans le CV: "{keyword}"',
                        'severite': 'moyenne' if pattern_name != "fausse expérience" else 'haute'
                    })
                    break
    
    # 2.2 Vérifier si le diplôme est authentique (recherche de mots clés)
    if diplome_text:
        # Vérifier si c'est vraiment un diplôme
        mots_authentiques = [
            'diplôme', 'diplome', 'université', 'faculté', 'école', 'baccalauréat',
            'licence', 'master', 'doctorat', 'bac', 'bts', 'dut', 'ingénieur',
            'obtention', 'promotion', 'annee', 'année', 'etudes', 'études'
        ]
        
        mots_trouves = 0
        for mot in mots_authentiques:
            if mot.lower() in diplome_text.lower():
                mots_trouves += 1
        
        if mots_trouves < 3:
            fraudes_detectees.append({
                'type': 'document_suspect',
                'description': 'Le document "diplôme" ne semble pas être un diplôme authentique (peu de mots-clés académiques)',
                'severite': 'haute'
            })
        
        # Vérifier si c'est une simple image/photo au hasard
        if len(diplome_text) < 50:
            fraudes_detectees.append({
                'type': 'document_illisible',
                'description': 'Le diplôme semble illisible ou contient très peu de texte (peut être une photo non pertinente)',
                'severite': 'haute'
            })
    
    # 2.3 Vérifier la cohérence CV vs Diplôme
    if cv_text and diplome_text:
        # Extraire les années du CV
        import re
        annees_cv = re.findall(r'\b(19|20)\d{2}\b', cv_text)
        annees_diplome = re.findall(r'\b(19|20)\d{2}\b', diplome_text)
        
        # Vérifier si les années sont cohérentes
        if annees_cv and annees_diplome:
            annee_min_cv = min([int(a) for a in annees_cv])
            annee_min_dip = min([int(a) for a in annees_diplome])
            
            # Si le diplôme est plus récent que le CV, c'est suspect
            if annee_min_dip > annee_min_cv + 5:
                fraudes_detectees.append({
                    'type': 'incoherence_temps',
                    'description': f'Incohérence temporelle: diplôme obtenu ({annee_min_dip}) après les expériences du CV ({annee_min_cv})',
                    'severite': 'moyenne'
                })
    
    # 2.4 Vérifier si le CV contient un nom différent du candidat
    # (On vérifie si le nom du candidat apparaît dans le CV)
    # Cette vérification nécessite que le nom du candidat soit passé en paramètre
    
    # ============================================================
    # 3. ANALYSE DÉTAILLÉE DU CV
    # ============================================================
    score_total = 0
    details_analyse = {
        'diplome': {'points': 0, 'max': 40, 'details': '', 'trouve': ''},
        'experience': {'points': 0, 'max': 30, 'details': '', 'trouve': ''},
        'competences': {'points': 0, 'max': 20, 'details': '', 'trouve': []},
        'anciennete': {'points': 0, 'max': 10, 'details': '', 'trouve': ''},
        'lettre_motivation': {'points': 0, 'max': 20, 'details': '', 'trouve': False},
        'fraudes': fraudes_detectees
    }
    
    # 3.1 Analyse du DIPLÔME (0-40 points)
    if diplome_text:
        diplome_lower = diplome_text.lower()
        diplome_trouve = ""
        
        # Niveaux de diplômes
        diplomes_niveaux = [
            ('doctorat', 40, 'Doctorat'),
            ('master', 35, 'Master'),
            ('master 2', 35, 'Master 2'),
            ('master 1', 30, 'Master 1'),
            ('ingénieur', 35, 'Ingénieur'),
            ('licence', 25, 'Licence'),
            ('bac+3', 25, 'Bac+3'),
            ('bac+2', 20, 'Bac+2'),
            ('bts', 20, 'BTS'),
            ('dut', 20, 'DUT'),
            ('bac', 10, 'Baccalauréat'),
        ]
        
        for diplome_nom, points, libelle in diplomes_niveaux:
            if diplome_nom in diplome_lower:
                if points > details_analyse['diplome']['points']:
                    details_analyse['diplome']['points'] = points
                    diplome_trouve = libelle
        
        # Vérifier la correspondance avec le diplôme requis
        if diplome_requis and diplome_requis.lower() in diplome_lower:
            details_analyse['diplome']['points'] = min(40, details_analyse['diplome']['points'] + 5)
            details_analyse['diplome']['details'] = f"Diplôme correspond au requis: {diplome_requis}"
        else:
            details_analyse['diplome']['details'] = f"Diplôme trouvé: {diplome_trouve or 'Non spécifié'}" + (f" (Requis: {diplome_requis})" if diplome_requis else "")
        
        details_analyse['diplome']['trouve'] = diplome_trouve or 'Non spécifié'
        score_total += details_analyse['diplome']['points']
    
    # 3.2 Analyse de l'EXPÉRIENCE (0-30 points)
    if cv_text:
        cv_lower = cv_text.lower()
        import re
        
        # Extraire les années d'expérience
        annees_experience = 0
        patterns_experience = [
            r'(\d+)\s*(?:ans|années|année)',
            r'(\d+)\s*(?:ans|années|année)\s*(?:d\'expérience|d\'experience)',
            r'expérience\s*(?:de|d\'|)\s*(\d+)',
            r'experience\s*(?:de|d\'|)\s*(\d+)',
        ]
        
        for pattern in patterns_experience:
            matches = re.findall(pattern, cv_lower)
            if matches:
                annees = max([int(m) for m in matches if m.isdigit()])
                annees_experience = max(annees_experience, annees)
        
        # Points selon l'expérience
        if annees_experience >= 10:
            points_exp = 30
            details_analyse['experience']['details'] = f"{annees_experience} ans d'expérience (excellent)"
        elif annees_experience >= 7:
            points_exp = 25
            details_analyse['experience']['details'] = f"{annees_experience} ans d'expérience (très bon)"
        elif annees_experience >= 5:
            points_exp = 20
            details_analyse['experience']['details'] = f"{annees_experience} ans d'expérience (bon)"
        elif annees_experience >= 3:
            points_exp = 15
            details_analyse['experience']['details'] = f"{annees_experience} ans d'expérience (satisfaisant)"
        elif annees_experience >= 1:
            points_exp = 10
            details_analyse['experience']['details'] = f"{annees_experience} an d'expérience (débutant)"
        else:
            points_exp = 5
            details_analyse['experience']['details'] = "Expérience non spécifiée ou inférieure à 1 an"
        
        details_analyse['experience']['points'] = points_exp
        details_analyse['experience']['trouve'] = f"{annees_experience} ans" if annees_experience > 0 else "Non spécifié"
        score_total += points_exp
        
        # 3.3 Analyse des COMPÉTENCES (0-20 points)
        competences_trouvees = []
        competences_techniques = {
            'programmation': ['python', 'java', 'php', 'javascript', 'c++', 'c#', 'ruby', 'golang'],
            'bases_donnees': ['sql', 'mysql', 'postgresql', 'mongodb', 'oracle', 'nosql'],
            'web': ['html', 'css', 'react', 'angular', 'vue', 'laravel', 'symfony', 'django'],
            'devops': ['docker', 'kubernetes', 'aws', 'azure', 'cloud', 'ci/cd'],
            'analyse': ['analyse', 'data', 'excel', 'power bi', 'statistiques', 'machine learning'],
            'gestion': ['gestion', 'management', 'équipe', 'projet', 'agile', 'scrum', 'leadership'],
        }
        
        for categorie, mots in competences_techniques.items():
            for mot in mots:
                if mot in cv_lower:
                    competences_trouvees.append(f"{mot} ({categorie})")
        
        # Compétences uniques
        competences_uniques = list(set(competences_trouvees))
        details_analyse['competences']['trouve'] = competences_uniques[:10]
        points_competences = min(20, len(competences_uniques) * 2)
        details_analyse['competences']['points'] = points_competences
        score_total += points_competences
        
        # 3.4 Analyse ANCIENNETÉ (0-10 points)
        if 'fonction publique' in cv_lower or 'ministère' in cv_lower or 'etat' in cv_lower:
            details_analyse['anciennete']['points'] = 10
            details_analyse['anciennete']['details'] = "Expérience dans la fonction publique mentionnée"
        else:
            details_analyse['anciennete']['points'] = 5
            details_analyse['anciennete']['details'] = "Pas d'expérience spécifique dans la fonction publique mentionnée"
        score_total += details_analyse['anciennete']['points']
    
    # 3.5 Analyse LETTRE DE MOTIVATION (0-20 points si elle est requise)
    if not lettre_requise:
        details_analyse['lettre_motivation']['trouve'] = bool(lettre_text and lettre_text.strip())
        details_analyse['lettre_motivation']['max'] = 0
        details_analyse['lettre_motivation']['points'] = 0
        details_analyse['lettre_motivation']['details'] = "Lettre de motivation non demandee pour ce poste, non prise en compte dans la note"
    elif lettre_text:
        details_analyse['lettre_motivation']['trouve'] = True
        lettre_lower = lettre_text.lower()
        
        points_lettre = 10  # Base pour une lettre présente
        
        # Vérifier les éléments de qualité
        if 'motivation' in lettre_lower:
            points_lettre += 3
        if 'compétence' in lettre_lower or 'competence' in lettre_lower:
            points_lettre += 3
        if 'poste' in lettre_lower and ('intérêt' in lettre_lower or 'interet' in lettre_lower):
            points_lettre += 2
        if len(lettre_text) > 500:
            points_lettre += 2
        
        details_analyse['lettre_motivation']['points'] = min(20, points_lettre)
        details_analyse['lettre_motivation']['details'] = f"Lettre présente, {len(lettre_text)} caractères"
        score_total += details_analyse['lettre_motivation']['points']
    else:
        details_analyse['lettre_motivation']['points'] = 0
        details_analyse['lettre_motivation']['details'] = "Lettre de motivation demandee mais non fournie ou illisible"
    
    # ============================================================
    # 4. SCORE FINAL (limité à 100)
    # ============================================================
    score_final = min(100, score_total)
    
    # PÉNALITÉ pour fraude
    fraudes_graves = [f for f in fraudes_detectees if f.get('severite') == 'haute']
    if fraudes_graves:
        penalite = len(fraudes_graves) * 15
        score_final = max(0, score_final - penalite)
    
    # ============================================================
    # 5. CONSTRUCTION DU RAPPORT D'ANALYSE DÉTAILLÉ
    # ============================================================
    competences_ligne = ', '.join(details_analyse['competences']['trouve'][:5]) if details_analyse['competences']['trouve'] else 'Aucune'
    lettre_points_ligne = (
        f"{details_analyse['lettre_motivation']['points']}/{details_analyse['lettre_motivation']['max']}"
        if details_analyse['lettre_motivation']['max'] > 0
        else "Non prise en compte"
    )
    lettre_statut_ligne = (
        "Non demandee"
        if details_analyse['lettre_motivation']['max'] == 0
        else ("Fournie" if details_analyse['lettre_motivation']['trouve'] else "Non fournie")
    )
    fraude_lignes = "\n".join([
        f"- {fraude['description']} (severite: {fraude.get('severite', 'moyenne')})"
        for fraude in fraudes_detectees
    ]) if fraudes_detectees else "- Aucune suspicion detectee"

    rapport_analyse = f"""
ANALYSE DETAILLEE DE LA CANDIDATURE

Score final: {score_final}/100

1. Diplome
- Diplome trouve: {details_analyse['diplome']['trouve']}
- Note: {details_analyse['diplome']['points']}/{details_analyse['diplome']['max']}
- Observation: {details_analyse['diplome']['details']}

2. Experience professionnelle
- Experience trouvee: {details_analyse['experience']['trouve']}
- Note: {details_analyse['experience']['points']}/{details_analyse['experience']['max']}
- Observation: {details_analyse['experience']['details']}

3. Competences techniques
- Competences identifiees: {competences_ligne}
- Note: {details_analyse['competences']['points']}/{details_analyse['competences']['max']}

4. Anciennete dans la fonction publique
- Note: {details_analyse['anciennete']['points']}/{details_analyse['anciennete']['max']}
- Observation: {details_analyse['anciennete']['details']}

5. Lettre de motivation
- Statut: {lettre_statut_ligne}
- Note: {lettre_points_ligne}
- Observation: {details_analyse['lettre_motivation']['details']}

6. Verification du dossier
- Suspicions detectees: {len(fraudes_detectees)}
{fraude_lignes}
        """.strip()
            
    # ============================================================
    # 6. SAUVEGARDE DANS LA BASE DE DONNÉES
    # ============================================================
    with connection.cursor() as cursor:
        cursor.execute("""
            UPDATE candidature 
            SET score_eligibilite = %s, analyse_ia = %s
            WHERE id = %s
        """, [score_final, rapport_analyse, candidature_id])

    # ✅ AJOUTE AUSSI LES DÉTAILS (stockage en JSON)
    details_json = json.dumps(details_analyse, ensure_ascii=False)

    # ✅ RETOURNE 3 VALEURS
    return score_final, rapport_analyse, details_analyse


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
                SELECT p.diplomeRequis, p.profil_recherche, p.intitule, p.pieces_requises
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
            pieces_requises = _charger_pieces_requises(poste[3]) or ['CV', 'LM', 'DIPLOME']
            pieces_fournies = [_normaliser_type_piece(piece[1]) for piece in pieces]
            textes_par_piece = {}
            
            print(f"📌 Poste: {poste_intitule}")
            print(f"📌 Diplôme requis: {diplome_requis if diplome_requis else 'Non spécifié'}")
            print(f"📌 Profil recherché: {profil_recherche[:100] if profil_recherche else 'Non spécifié'}...")
            print(f"📋 Pièces requises: {pieces_requises}")
            print(f"📄 Pièces fournies: {pieces_fournies}")
            
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
                type_piece_code = _normaliser_type_piece(type_libelle)
                textes_par_piece[type_piece_code] = texte
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
            score_ia, analyse_ia, details_analyse = analyser_candidature_avec_ia(
                candidature_id, cv_text, lettre_text, diplome_text, 
                diplome_requis, profil_recherche,
                pieces_requises=pieces_requises,
                pieces_fournies=pieces_fournies,
                textes_par_piece=textes_par_piece
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
            'details': details_analyse,
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
    """Upload d'une pièce pour une candidature (support JSON + multipart)"""
    print("=" * 60)
    print(f"🔍 [DEBUG] upload_piece_candidature() - ID: {candidature_id}")
    print("=" * 60)
    
    try:
        type_document = None
        fichier = None
        file_base64 = None
        file_name = None
        
        # ========== DÉTECTION DU FORMAT ==========
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Format multipart/form-data (avec fichier)
            type_document = request.POST.get('type_document')
            fichier = request.FILES.get('file')
            print(f"📌 Format: multipart/form-data")
            print(f"📌 Type: {type_document}")
            print(f"📌 Fichier: {fichier.name if fichier else 'Non fourni'}")
            
            if not type_document or not fichier:
                return JsonResponse({'error': 'type_document et file requis'}, status=400)
        else:
            # Format JSON (base64)
            data = json.loads(request.body)
            type_document = data.get('type_document')
            file_base64 = data.get('file_base64')
            file_name = data.get('file_name')
            print(f"📌 Format: JSON")
            print(f"📌 Type: {type_document}")
            print(f"📌 Nom fichier: {file_name}")
            
            if not all([type_document, file_base64, file_name]):
                return JsonResponse({'error': 'type_document, file_base64 et file_name requis'}, status=400)
        
        with connection.cursor() as cursor:
            # ========== VÉRIFIER LA CANDIDATURE ==========
            cursor.execute("""
                SELECT c.agent_id, p.intitule, p.pieces_requises
                FROM candidature c 
                JOIN poste_vacant p ON c.poste_vacant_id = p.id 
                WHERE c.id = %s
            """, [candidature_id])
            result = cursor.fetchone()
            
            if not result:
                return JsonResponse({'error': 'Candidature non trouvée'}, status=404)
            
            pieces_requises = json.loads(result[2]) if result[2] else ['CV', 'LM', 'DIPLOME']
            print(f"📋 Pièces requises: {pieces_requises}")
            
            # ========== SAUVEGARDE DU FICHIER ==========
            upload_dir = f'uploads/pieces/candidature_{candidature_id}'
            os.makedirs(upload_dir, exist_ok=True)
            
            if fichier:
                # Cas multipart : sauvegarde directe
                safe_filename = f"{type_document}_{candidature_id}_{date.today()}_{fichier.name}"
                safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in '._-')
                file_path = os.path.join(upload_dir, safe_filename)
                
                with open(file_path, 'wb+') as f:
                    for chunk in fichier.chunks():
                        f.write(chunk)
                
                original_filename = fichier.name
                print(f"✅ Fichier sauvegardé: {file_path}")
                
            else:
                # Cas JSON : décoder le base64
                if ',' in file_base64:
                    file_base64 = file_base64.split(',', 1)[1]
                file_base64 = file_base64.strip()
                file_base64 = fix_base64_padding(file_base64)
                
                try:
                    file_data = base64.b64decode(file_base64)
                except Exception as e:
                    return JsonResponse({'error': f'Erreur de décodage Base64: {str(e)}'}, status=400)
                
                safe_filename = f"{type_document}_{candidature_id}_{date.today()}_{file_name}"
                safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in '._-')
                file_path = os.path.join(upload_dir, safe_filename)
                
                with open(file_path, 'wb') as f:
                    f.write(file_data)
                
                original_filename = file_name
                print(f"✅ Fichier sauvegardé: {file_path}")
            
            # ========== GESTION DU TYPE DE PIÈCE ==========
            cursor.execute("SELECT id FROM type_piece WHERE libelle = %s", [type_document])
            type_piece = cursor.fetchone()
            
            if not type_piece:
                cursor.execute("""
                    INSERT INTO type_piece (libelle, obligatoire, duree_validite) 
                    VALUES (%s, %s, %s)
                """, [type_document, 0, ''])
                type_piece_id = cursor.lastrowid
                print(f"✅ Nouveau type_piece créé: {type_document}")
            else:
                type_piece_id = type_piece[0]
                print(f"✅ Type_piece existant: {type_document} (ID: {type_piece_id})")
            
            # ========== SUPPRIMER L'ANCIENNE PIÈCE DU MÊME TYPE ==========
            cursor.execute("""
                DELETE FROM piece 
                WHERE candidature_id = %s AND type_piece_id = %s
            """, [candidature_id, type_piece_id])
            
            # ========== INSÉRER LA NOUVELLE PIÈCE ==========
            cursor.execute("""
                INSERT INTO piece (candidature_id, type_piece_id, nom_fichier, date_upload, valide, cheminfichier) 
                VALUES (%s, %s, %s, %s, %s, %s)
            """, [candidature_id, type_piece_id, original_filename, date.today(), 1, file_path])
            
            print(f"✅ Pièce insérée dans la base")
            
            # ========== COMPTER LES PIÈCES UPLOADÉES ==========
            cursor.execute("""
                SELECT COUNT(DISTINCT tp.libelle)
                FROM piece p
                JOIN type_piece tp ON p.type_piece_id = tp.id
                WHERE p.candidature_id = %s
            """, [candidature_id])
            uploaded_count = cursor.fetchone()[0]
            
            required_count = len(pieces_requises)
            print(f"📊 Progression: {uploaded_count}/{required_count} pièces uploadées")
            
            # ========== LANCER L'ANALYSE SI TOUTES LES PIÈCES SONT UPLOADÉES ==========
            if uploaded_count >= required_count:
                print(f"🎯 TOUTES LES PIÈCES SONT UPLOADÉES ({uploaded_count}/{required_count})")
                print(f"🚀 Lancement de l'analyse asynchrone pour candidature {candidature_id}")
                
                # Lancer l'analyse en arrière-plan
                thread = threading.Thread(target=lancer_analyse_async, args=(candidature_id,))
                thread.daemon = True
                thread.start()
                
                print(f"✅ Analyse asynchrone lancée pour candidature {candidature_id}")
            else:
                print(f"⏳ En attente des autres pièces... ({uploaded_count}/{required_count})")
        
        return JsonResponse({
            'success': True,
            'message': f'{type_document} ajouté avec succès',
            'uploaded_count': uploaded_count,
            'required_count': required_count,
            'analyse_lancee': uploaded_count >= required_count
        })
        
    except json.JSONDecodeError as e:
        print(f"❌ Erreur JSON: {str(e)}")
        return JsonResponse({'error': 'Données JSON invalides'}, status=400)
    except Exception as e:
        import traceback
        print(f"❌ ERREUR upload_piece_candidature: {traceback.format_exc()}")
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

# ==================== ANNIVERSAIRES ====================

@csrf_exempt
@require_http_methods(["GET"])
def check_anniversaires(request):
    """
    Vérifie les anniversaires du jour et envoie les emails.
    À appeler une fois par jour (via un cron ou au chargement du dashboard RH).
    """
    from .emails import envoyer_email_anniversaire
    
    today = date.today()
    count = 0
    
    # Récupérer les agents dont c'est l'anniversaire aujourd'hui
    agents = Agent.objects.filter(
        date_naissance__isnull=False,
        date_naissance__month=today.month,
        date_naissance__day=today.day
    )
    
    for agent in agents:
        # Vérifier qu'on n'a pas déjà envoyé l'email aujourd'hui
        deja_envoye = Notification.objects.filter(
            agent=agent,
            type_notification='anniversaire',
            date_envoi=today
        ).exists()
        
        if not deja_envoye:
            succes, _ = envoyer_email_anniversaire(agent)
            if succes:
                # Créer une notification pour tracer l'envoi
                Notification.objects.create(
                    agent=agent,
                    message=f"🎂 Joyeux anniversaire {agent.prenom} ! Toute l'équipe RH vous souhaite une excellente journée.",
                    type_notification='anniversaire',
                    date_envoi=today,
                    lue=0
                )
                count += 1
    
    return JsonResponse({
        'success': True,
        'date': str(today),
        'anniversaires_du_jour': agents.count(),
        'emails_envoyes': count
    })


# ── Critères par catégorie ──────────────────────────────────────
CRITERES = {
    'A': [
        'Connaissance professionnelle',
        "Culture générale",
        "Efficacité et capacité d'encadrement et de direction",
        'Disponibilité et sens du service public',
    ],
    'B': [
        'Connaissance professionnelle',
        "Sens de l'organisation et méthode dans le travail",
        'Assiduité et efficacité',
        'Sens du service public',
    ],
    'C': [
        'Connaissance professionnelle',
        'Ponctualité et assiduité',
        "Soin et rapidité dans l'exécution des tâches",
        'Conscience professionnelle',
    ],
    'D': [
        'Connaissance professionnelle',
        'Ponctualité et assiduité',
        "Soin et rapidité dans l'exécution des tâches",
        'Conscience professionnelle',
    ],
}
 
 
def _get_categorie(echelon):
    """Extrait la catégorie (A/B/C/D) depuis l'échelon."""
    if not echelon:
        return 'B'
    lettre = echelon[0].upper()
    if lettre in ['A', 'B', 'C', 'D']:
        return lettre
    return 'B'
 
 
def _calculer_duree_service(date_prise_service, annee_ref):
    """Calcule la durée de service jusqu'au 31 décembre de annee_ref."""
    if not date_prise_service:
        return 0, 0, 0
    debut = date_prise_service if isinstance(date_prise_service, date) else datetime.strptime(str(date_prise_service), '%Y-%m-%d').date()
    fin = date(annee_ref, 12, 31)
    ans = fin.year - debut.year
    mois = fin.month - debut.month
    jours = fin.day - debut.day
    if jours < 0:
        mois -= 1
        jours += 30
    if mois < 0:
        ans -= 1
        mois += 12
    return ans, mois, jours
 
 
def _fmt_date(d):
    """Formate une date en français."""
    if not d:
        return '-'
    mois_fr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
               'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    if isinstance(d, str):
        d = datetime.strptime(d, '%Y-%m-%d').date()
    return f"{d.day} {mois_fr[d.month - 1]} {d.year}"
 
 
# ──────────────────────────────────────────────────────────────
# ENDPOINT 1 : GET/PATCH  /api/agent/<matricule>/bulletin/
# ──────────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(['GET', 'PATCH'])
def bulletin_agent(request, matricule):
    from .models import Agent, BulletinInfo
 
    try:
        agent = Agent.objects.get(matricule=matricule)
        bulletin_info, created = BulletinInfo.objects.get_or_create(agent=agent)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent introuvable'}, status=404)
 
    if request.method == 'GET':
        data = {
            'matricule': agent.matricule,
            'nom': agent.nom,
            'prenom': agent.prenom,
            'date_naissance': str(agent.date_naissance) if agent.date_naissance else None,
            'lieu_naissance': getattr(agent, 'lieu_naissance', None) or '',
            'echelon': agent.echelon or '',
            'corps': agent.corps or '',
            'poste': agent.poste or '',
            'direction': agent.direction or '',
            'date_prise_service': str(agent.date_prise_service) if agent.date_prise_service else None,
            'typecontrat': agent.typecontrat or '',
            'dialectes': getattr(agent, 'dialectes', None) or '',
            'date_mariage': str(agent.date_mariage) if getattr(agent, 'date_mariage', None) else None,
            'adresse': agent.adresse or '',
            # Champs de BulletinInfo
            'diplomes': bulletin_info.diplomes or '',
            'profession_avant_service': bulletin_info.profession_avant_service or '',
            'situation_militaire': bulletin_info.situation_militaire or 'Néant',
            'distinctions_honorifiques': bulletin_info.distinctions_honorifiques or 'Néant',
            'interruption_duree': bulletin_info.interruption_duree or '',
            'interruption_cause': bulletin_info.interruption_cause or 'Néant',
            'proposable_avancement': bulletin_info.proposable_avancement or 'Oui',
        }
        return JsonResponse(data)
 
    # PATCH
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON invalide'}, status=400)
 
    # Champs de l'agent
    champs_agent = [
        'lieu_naissance', 'dialectes', 'date_mariage', 'adresse'
    ]
    for champ in champs_agent:
        if champ in body:
            valeur = body[champ] if body[champ] != '' else None
            setattr(agent, champ, valeur)
    agent.save()
 
    # Champs de BulletinInfo
    champs_bulletin = [
        'diplomes', 'profession_avant_service', 'situation_militaire',
        'distinctions_honorifiques', 'interruption_duree', 'interruption_cause',
        'proposable_avancement'
    ]
    for champ in champs_bulletin:
        if champ in body:
            valeur = body[champ] if body[champ] != '' else None
            setattr(bulletin_info, champ, valeur)
    bulletin_info.save()
 
    return JsonResponse({'success': True, 'message': 'Informations mises à jour'})
 
 
# ──────────────────────────────────────────────────────────────
# ENDPOINT 2 : GET/POST  /api/agent/<matricule>/enfants/
# ──────────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(["GET", "POST"])
def enfants_agent(request, matricule):
    from .models import Agent, EnfantAgent
    
    try:
        agent = Agent.objects.get(matricule=matricule)
        
        if request.method == "GET":
            enfants = EnfantAgent.objects.filter(agent=agent)
            result = []
            for e in enfants:
                result.append({
                    'id': e.id,
                    'nom': e.nom,
                    'prenom': e.prenom,
                    'date_naissance': str(e.date_naissance) if e.date_naissance else None
                })
            return JsonResponse(result, safe=False)
        
        elif request.method == "POST":
            data = json.loads(request.body)
            enfant = EnfantAgent.objects.create(
                agent=agent,
                nom=data.get('nom'),
                prenom=data.get('prenom'),
                date_naissance=data.get('date_naissance')
            )
            return JsonResponse({
                'success': True,
                'id': enfant.id,
                'nom': enfant.nom,
                'prenom': enfant.prenom,
                'date_naissance': str(enfant.date_naissance)
            })
            
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur enfants_agent: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)
 
 
# ──────────────────────────────────────────────────────────────
# ENDPOINT 3 : DELETE  /api/agent/<matricule>/enfants/<id>/
# ──────────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(['DELETE'])
def supprimer_enfant(request, matricule, enfant_id):
    from .models import EnfantAgent
 
    try:
        enfant = EnfantAgent.objects.get(id=enfant_id, agent__matricule=matricule)
        enfant.delete()
        return JsonResponse({'success': True})
    except EnfantAgent.DoesNotExist:
        return JsonResponse({'error': 'Enfant introuvable'}, status=404)
    except Exception as e:
        print(f"Erreur supprimer_enfant: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)
 
 
# ──────────────────────────────────────────────────────────────
# ENDPOINT 4 : POST  /api/agent/<matricule>/bulletin/generer/
# ──────────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(['POST'])
def generer_bulletin_pdf(request, matricule):
    """Génère le Bulletin Individuel de Notes en PDF"""
    from .models import Agent, EnfantAgent, Avancement, BulletinInfo
    from docx import Document
    import io
    import os
    from django.conf import settings
 
    try:
        agent = Agent.objects.get(matricule=matricule)
        bulletin_info, _ = BulletinInfo.objects.get_or_create(agent=agent)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent introuvable'}, status=404)
 
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        body = {}
 
    annee = body.get('annee', date.today().year)
    
    # Récupérer les données depuis le body ou depuis BulletinInfo
    profession_avant = body.get('profession_avant_service') or bulletin_info.profession_avant_service or '-'
    situation_militaire = body.get('situation_militaire') or bulletin_info.situation_militaire or 'Néant'
    distinctions = body.get('distinctions_honorifiques') or bulletin_info.distinctions_honorifiques or 'Néant'
    interruption_cause = body.get('interruption_cause') or bulletin_info.interruption_cause or 'Néant'
    interruption_duree = body.get('interruption_duree') or bulletin_info.interruption_duree or '-'
    proposable = body.get('proposable_avancement') or bulletin_info.proposable_avancement or 'Oui'
    diplomes = bulletin_info.diplomes or '-'
 
    enfants = EnfantAgent.objects.filter(agent=agent).order_by('date_naissance')
    
    # Déterminer la catégorie
    categorie = _get_categorie(agent.echelon)
    criteres = CRITERES.get(categorie, CRITERES['B'])
    ans, mois, jours = _calculer_duree_service(agent.date_prise_service, annee)
    
    # Libellé du cadre
    libelles_cadre = {
        'A': 'CADRES SUPÉRIEURS ET INGÉNIEURS',
        'B': 'PERSONNEL DES SERVICES ADMINISTRATIFS',
        'C': "AGENTS D'EXÉCUTION",
        'D': 'AGENTS DE SERVICE',
    }
    libelle_cadre = libelles_cadre.get(categorie, 'PERSONNEL DES SERVICES ADMINISTRATIFS')
    texte_cadre = f"CADRE {categorie} : {libelle_cadre}"
    
    # Date de la dernière promotion
    # Récupérer le DERNIER avancement EFFECTIF (date_effective non null)
    dernier_avancement = Avancement.objects.filter(
        agent=agent,
        type_avancement='normal',
        date_effective__isnull=False  # ← Important : seulement ceux déjà effectués
    ).order_by('-date_effective').first()

    if dernier_avancement:
        date_promotion_str = _fmt_date(dernier_avancement.date_effective)
    else:
        # Si jamais d'avancement, utiliser la date de nomination
        date_promotion_str = _fmt_date(agent.date_prise_service)
    
    # Construction de la liste des enfants
    enfants_texte = ""
    if enfants.exists():
        liste_enfants = []
        for e in enfants:
            liste_enfants.append(f"- {e.nom} {e.prenom}, né(e) le {_fmt_date(e.date_naissance)}")
        enfants_texte = "\n".join(liste_enfants)
    else:
        enfants_texte = "-"
    
    # Dates
    date_prise_service_str = _fmt_date(agent.date_prise_service)
    date_mariage_str = _fmt_date(agent.date_mariage) if agent.date_mariage else '-'
    
    # Classe de recrutement
    classe_recrutement = agent.echelon.split('-')[0] if agent.echelon and '-' in agent.echelon else agent.echelon or 'B3'
    
    # Charger le template Word
    template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', 'bulletin_template.docx')
    
    if not os.path.exists(template_path):
        return JsonResponse({'error': f'Template non trouvé: {template_path}'}, status=500)
    
    # Charger template et remplacer placeholders
    from docxtpl import DocxTemplate
    
    doc = DocxTemplate(template_path)
    
    # Préparer les données - EXACTEMENT les noms des {{ PLACEHOLDERS }} du template
    context = {
        'ANNEE': str(annee),
        'CADRE': texte_cadre,
        'NOM_PRENOMS': f"{agent.nom} {agent.prenom}".upper(),
        'LIEU_DATE_NAISSANCE': f"{agent.lieu_naissance or '-'}, {_fmt_date(agent.date_naissance)}",
        'PROFESSION_AVANT': profession_avant,
        'SITUATION_MILITAIRE': situation_militaire,
        'CLASSE_RECRUTEMENT': classe_recrutement,
        'MATRICULE': agent.matricule,
        'DIPLOMES': diplomes,
        'DATE_NOMINATION': date_prise_service_str,
        'DATE_NOMINATION_CADRE': date_prise_service_str,
        'GRADE_CLASSE': agent.echelon or '-',
        'DATE_PROMOTION': date_promotion_str,
        'DUREE_INTERRUPTION': interruption_duree,
        'CAUSE_INTERRUPTION': interruption_cause,
        'DIALECTES': agent.dialectes or '-',
        'DISTINCTIONS': distinctions,
        'DATE_MARIAGE': date_mariage_str,
        'ENFANTS': enfants_texte,
        'ADRESSE_FAMILLE': agent.adresse or '-',
        'DEGRE_PARENTE': 'Epoux(se)',
        'ANS_SERVICE': str(ans),
        'MOIS_SERVICE': str(mois),
        'JOURS_SERVICE': str(jours),
        'TOTAL_ANS': str(ans),
        'TOTAL_MOIS': str(mois),
        'TOTAL_JOURS': str(jours),
        'PROPOSABLE': proposable,
        'DATE_AUJOURD_HUI': datetime.now().strftime('%d/%m/%Y'),
        'VILLE': 'Cotonou',
        'CRITERE_1': criteres[0] if len(criteres) > 0 else '',
        'CRITERE_2': criteres[1] if len(criteres) > 1 else '',
        'CRITERE_3': criteres[2] if len(criteres) > 2 else '',
        'CRITERE_4': criteres[3] if len(criteres) > 3 else '',
    }
    
    # Remplacer les placeholders dans le template
    doc.render(context)
    
    # Sauvegarder le DOCX rempli en mémoire
    docx_bytes = io.BytesIO()
    doc.save(docx_bytes)
    docx_bytes.seek(0)
    
    # Convertir DOCX→PDF
    try:
        pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes.getvalue())
    except Exception as e:
        print(f"Erreur conversion PDF: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': 'Conversion en PDF impossible sur le serveur.'}, status=500)
    
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="bulletin_notes_{matricule}_{annee}.pdf"'
    return response

@csrf_exempt
@require_http_methods(["POST"])
def demande_attestation(request):
    """Demande d'attestation par un agent - Pas de validation chef"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        type_attestation = data.get('type_attestation')  # Ex: "Attestation de travail"
        commentaire = data.get('commentaire', '')
        
        if not matricule or not type_attestation:
            return JsonResponse({'error': 'Matricule et type d\'attestation requis'}, status=400)
        
        agent = Agent.objects.get(matricule=matricule)
        
        # ✅ Utiliser le type d'attestation comme libellé du TypeDemande
        type_demande_obj, created = TypeDemande.objects.get_or_create(
            libelle=type_attestation,  # ← Utilise le nom exact de l'attestation
            defaults={'acte_generable': 1}
        )
        
        if created:
            print(f"✅ Nouveau type de demande créé: {type_attestation}")
        
        numerosuivi = f"ATT-{datetime.now().strftime('%Y%m%d%H%M%S')}-{agent.matricule}"
        
        demande = Demande.objects.create(
            agent=agent,
            type_demande=type_demande_obj,
            statut='soumise',
            date_soumission=datetime.now().date(),
            numerosuivi=numerosuivi,
        )
        
        # Stocker le type d'attestation dans Validation (gardé pour compatibilité)
        Validation.objects.create(
            demande=demande,
            datevalidation=datetime.now().date(),
            commentaire=f"TYPE_ATTESTATION:{type_attestation}||COMMENTAIRE:{commentaire}"
        )
        
        # Notifier la secrétaire
        secretaire = Agent.objects.filter(
            agentrole__role__libelle='secretaire',
            actif=1
        ).first()
        
        if secretaire:
            Notification.objects.create(
                agent_id=secretaire.matricule,
                message=f"📄 Nouvelle demande d'attestation de {agent.prenom} {agent.nom} - {type_attestation}",
                type_notification='demande_attestation',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        Notification.objects.create(
            agent_id=agent.matricule,
            message=f"✅ Votre demande d'attestation \"{type_attestation}\" a été transmise au secrétariat.",
            type_notification='demande_attestation_envoyee',
            date_envoi=datetime.now().date(),
            lue=0
        )
        
        return JsonResponse({
            'success': True,
            'numerosuivi': demande.numerosuivi,
            'message': f'Demande d\'attestation "{type_attestation}" envoyée au secrétariat.',
            'statut': 'soumise',
            'type_attestation': type_attestation
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR demande_attestation: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)
    


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_attestations_secretaire(request, matricule_secretaire):
    """Récupérer les demandes d'attestation soumises pour la secrétaire"""
    try:
        print(f"=== get_demandes_attestations_secretaire for: {matricule_secretaire}")
        
        secretaire = Agent.objects.get(matricule=matricule_secretaire)
        
        # ✅ Utiliser icontains pour capturer toutes les variantes
        attestations = Demande.objects.filter(
            statut='soumise'
        ).filter(
            models.Q(type_demande__libelle='Attestation de travail') |
            models.Q(type_demande__libelle='Attestation de présence au poste') |
            models.Q(type_demande__libelle='Attestation de validité de services') |
            models.Q(type_demande__libelle='Certificat de non-jouissance de congé') |
            models.Q(type_demande__libelle__icontains='Certificat de non-jouissance')  # ✅ Pour les variantes avec année
        ).select_related('agent', 'type_demande').order_by('-date_soumission')
        
        print(f"📋 Total attestations soumises trouvées: {attestations.count()}")
        
        result = []
        for att in attestations:
            type_attestation = att.type_demande.libelle
            
            validation = Validation.objects.filter(demande=att).first()
            commentaire = ''
            if validation and validation.commentaire:
                for part in validation.commentaire.split('||'):
                    if part.startswith('COMMENTAIRE:'):
                        commentaire = part.replace('COMMENTAIRE:', '')
                        break
            
            result.append({
                'id': att.id,
                'agent_nom': att.agent.nom,
                'agent_prenom': att.agent.prenom,
                'agent_matricule': att.agent.matricule,
                'type_attestation': type_attestation,
                'date_soumission': str(att.date_soumission),
                'numerosuivi': att.numerosuivi,
                'commentaire': commentaire,
                'statut': att.statut
            })
            print(f"   ✅ Attestation ajoutée: {att.agent.nom} {att.agent.prenom} - {type_attestation}")
        
        print(f"✅ {len(result)} attestations trouvées")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Secrétaire non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_demandes_attestations_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def transmettre_attestation_destinataire(request, demande_id):
    """La Secrétaire transmet l'attestation au DPAF ou DAPAF selon le type"""
    try:
        data = json.loads(request.body)
        secretaire_matricule = data.get('secretaire_matricule')
        destinataire = data.get('destinataire')
        commentaire = data.get('commentaire', '')
        
        print(f"=== transmettre_attestation_destinataire - Demande ID: {demande_id}, Destinataire: {destinataire}")
        
        demande = Demande.objects.get(id=demande_id)
        type_libelle = demande.type_demande.libelle if demande.type_demande else ''
        
        # ✅ Vérifier si c'est une attestation (avec ou sans année)
        types_attestation_autorises = [
            'Attestation de travail',
            'Attestation de présence au poste',
            'Attestation de validité de services',
        ]
        
        est_certificat = type_libelle.startswith('Certificat de non-jouissance')
        est_attestation_valide = type_libelle in types_attestation_autorises or est_certificat
        
        if not est_attestation_valide:
            return JsonResponse({
                'error': f'Cette demande n\'est pas une attestation valide. Type: {type_libelle}'
            }, status=400)
        
        if demande.statut != 'soumise':
            return JsonResponse({'error': 'Cette attestation n\'est pas en attente de transmission'}, status=400)
        
        if destinataire == 'DPAF':
            demande.statut = 'transmise_dpaf'
        elif destinataire == 'DAPAF':
            demande.statut = 'transmise_dapaf'
        else:
            return JsonResponse({'error': 'Destinataire invalide. Utilisez DPAF ou DAPAF'}, status=400)
        
        demande.save()
        
        validation = Validation.objects.filter(demande=demande).first()
        if validation:
            old_comment = validation.commentaire or ''
            if old_comment:
                validation.commentaire = f"{old_comment}||SECRETAIRE:{commentaire}"
            else:
                validation.commentaire = f"SECRETAIRE:{commentaire}"
            validation.save()
        
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
                message=f"📄 Attestation à assigner pour {demande.agent.prenom} {demande.agent.nom} - {type_libelle}",
                type_notification='attestation_a_assigner',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        return JsonResponse({
            'success': True,
            'message': f'Attestation transmise au {destinataire}',
            'statut': demande.statut
        })
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        print(f"ERREUR transmettre_attestation_destinataire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_attestations_transmises_secretaire(request, matricule_secretaire):
    """Récupérer les attestations déjà transmises par la secrétaire"""
    try:
        print(f"=== get_attestations_transmises_secretaire for: {matricule_secretaire}")
        
        secretaire = Agent.objects.get(matricule=matricule_secretaire)
        
        attestations = Demande.objects.filter(
            statut__in=['transmise_dpaf', 'transmise_dapaf']
        ).filter(
            models.Q(type_demande__libelle='Attestation de travail') |
            models.Q(type_demande__libelle='Attestation de présence au poste') |
            models.Q(type_demande__libelle='Attestation de validité de services') |
            models.Q(type_demande__libelle='Certificat de non-jouissance de congé') |
            models.Q(type_demande__libelle__icontains='Certificat de non-jouissance')  # ✅ Pour les variantes avec année
        ).select_related('agent', 'type_demande').order_by('-date_soumission')
        
        result = []
        for att in attestations:
            result.append({
                'id': att.id,
                'agent_nom': att.agent.nom,
                'agent_prenom': att.agent.prenom,
                'agent_matricule': att.agent.matricule,
                'type_attestation': att.type_demande.libelle,
                'date_soumission': str(att.date_soumission),
                'numerosuivi': att.numerosuivi,
                'statut': att.statut
            })
        
        print(f"✅ {len(result)} attestations transmises trouvées")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Secrétaire non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_attestations_transmises_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def generer_attestation_rh(request, demande_id):
    try:
        data = json.loads(request.body)
        rh_matricule = data.get('rh_matricule')
        
        demande = Demande.objects.get(id=demande_id)
        type_libelle = demande.type_demande.libelle if demande.type_demande else ''
        
        # ✅ Vérification avec startswith pour les certificats
        types_attestation_autorises = [
            'Attestation de travail',
            'Attestation de présence au poste',
            'Attestation de validité de services',
            'Certificat de non-jouissance de congé'
        ]
        
        # ✅ Vérification flexible
        est_attestation = False
        
        # 1. Vérifier si le type est exactement dans la liste
        if type_libelle in types_attestation_autorises:
            est_attestation = True
        
        # 2. Vérifier si le type commence par un des types (pour "Certificat de non-jouissance de congé- 2026")
        if not est_attestation:
            for type_autorise in types_attestation_autorises:
                if type_libelle.startswith(type_autorise):
                    est_attestation = True
                    print(f"✅ Type reconnu: {type_libelle} (commence par {type_autorise})")
                    break
        
        if not est_attestation:
            return JsonResponse({
                'error': f'Cette demande n\'est pas une attestation. Type: {type_libelle}',
                'types_acceptes': types_attestation_autorises
            }, status=400)
        
        # ✅ Déterminer le type d'attestation pour la génération
        # Si c'est un certificat avec année, on prend le type de base
        if type_libelle.startswith('Certificat de non-jouissance de congé'):
            type_attestation = 'Certificat de non-jouissance de congé'
        else:
            type_attestation = type_libelle
        
        # ✅ Accepter les statuts
        statuts_acceptes = ['en_cours_traitement', 'assignee_rh']
        if demande.statut not in statuts_acceptes:
            return JsonResponse({
                'error': f'Cette attestation n\'est pas prête à être générée. Statut actuel: {demande.statut}',
                'statut_actuel': demande.statut,
                'statuts_acceptes': statuts_acceptes
            }, status=400)
        
        # ✅ Assigner le RH si ce n'est pas fait
        if not demande.agent_rh:
            rh = Agent.objects.get(matricule=rh_matricule)
            demande.agent_rh = rh
            demande.save()
            print(f"✅ Agent RH {rh_matricule} assigné à la demande {demande_id}")
        
        from django.test import RequestFactory
        factory = RequestFactory()
        
        new_data = {
            'matricule': demande.agent.matricule,
            'rh_matricule': rh_matricule,
            'demande_id': demande.id
        }
        new_request = factory.post(
            request.path,
            data=json.dumps(new_data),
            content_type='application/json'
        )
        new_request.user = request.user
        new_request.META = request.META
        
        response = None
        if type_attestation == "Attestation de présence au poste":
            response = generer_attestation_presence(new_request)
        elif type_attestation == "Attestation de travail":
            response = generer_attestation_travail(new_request)
        elif type_attestation == "Attestation de validité de services":
            response = generer_attestation_validite_services(new_request)
        elif type_attestation == "Certificat de non-jouissance de congé":
            response = generer_certificat_non_jouissance(new_request)
        else:
            return JsonResponse({'error': f'Type d\'attestation "{type_attestation}" non pris en charge'}, status=400)
        
        demande.statut = 'acte_genere'
        demande.date_generation_acte = datetime.now().date()
        demande.save()
        
        secretaire = Agent.objects.filter(
            agentrole__role__libelle='secretaire',
            actif=1
        ).first()
        
        if secretaire:
            Notification.objects.create(
                agent_id=secretaire.matricule,
                message=f"📄 Nouvelle attestation générée pour {demande.agent.prenom} {demande.agent.nom} - {type_attestation}",
                type_notification='attestation_generee',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        return response
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Demande non trouvée'}, status=404)
    except Exception as e:
        print(f"ERREUR generer_attestation_rh: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def envoyer_acte_signature_rh(request, reference):
    """Le RH envoie l'acte au DPAF/DAPAF pour signature"""
    try:
        data = json.loads(request.body)
        rh_matricule = data.get('rh_matricule')
        destinataire = data.get('destinataire')  # 'DPAF' ou 'DAPAF'
        
        print(f"=== envoyer_acte_signature_rh - Réf: {reference}, Destinataire: {destinataire}")
        
        acte = ActeAdministratif.objects.get(reference=reference)
        
        if destinataire == 'DPAF':
            acte.statut = 'attente_signature_dpaf'
            responsable = Agent.objects.filter(
                agentrole__role__libelle='dpaf',
                actif=1
            ).first()
        elif destinataire == 'DAPAF':
            acte.statut = 'attente_signature_dapaf'
            responsable = Agent.objects.filter(
                agentrole__role__libelle='dapaf',
                actif=1
            ).first()
        else:
            return JsonResponse({'error': 'Destinataire invalide. Utilisez DPAF ou DAPAF'}, status=400)
        
        acte.save()
        
        if acte.demande:
            acte.demande.statut = f'acte_en_signature_{destinataire.lower()}'
            acte.demande.save()
        
        if responsable:
            Notification.objects.create(
                agent_id=responsable.matricule,
                message=f"📄 Acte à signer pour {acte.demande.agent.prenom} {acte.demande.agent.nom} - Réf: {reference}",
                type_notification='acte_a_signer',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        return JsonResponse({
            'success': True,
            'message': f'Acte envoyé au {destinataire} pour signature'
        })
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR envoyer_acte_signature_rh: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def envoyer_acte_secretaire_apres_signature(request, reference):
    """Après signature, le DPAF/DAPAF envoie l'acte signé à la secrétaire"""
    try:
        data = json.loads(request.body)
        signataire_matricule = data.get('signataire_matricule')
        
        print(f"=== envoyer_acte_secretaire_apres_signature - Réf: {reference}")
        
        acte = ActeAdministratif.objects.get(reference=reference)
        
        if acte.statut != 'signe':
            return JsonResponse({'error': 'L\'acte n\'est pas encore signé'}, status=400)
        
        acte.statut = 'envoye_secretaire'
        acte.save()
        
        if acte.demande:
            secretaire = Agent.objects.filter(
                agentrole__role__libelle='secretaire',
                direction=acte.demande.agent.direction,
                actif=1
            ).first()
            
            if secretaire:
                Notification.objects.create(
                    agent_id=secretaire.matricule,
                    message=f"📄 Acte signé à remettre pour {acte.demande.agent.prenom} {acte.demande.agent.nom} - Réf: {reference}",
                    type_notification='acte_signe_a_remettre',
                    date_envoi=datetime.now().date(),
                    lue=0
                )
        
        return JsonResponse({
            'success': True,
            'message': 'Acte signé envoyé à la secrétaire'
        })
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR envoyer_acte_secretaire_apres_signature: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

def generer_reference_acte(type_acte):
    """
    Génère une référence séquentielle GLOBALE à 3 chiffres
    Format: 001, 002, 003, ..., 999
    """
    with connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM acte_administratif")
        count = cursor.fetchone()[0]
    
    numero = str(count + 1).zfill(3)
    return numero

    # ==================== ATTESTATIONS DPAF/DAPAF ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_attestations_recues(request, matricule):
    """
    Récupère les attestations reçues par le DPAF/DAPAF (à traiter)
    """
    try:
        user = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        
        if 'dpaf' in roles:
            statut = 'transmise_dpaf'
        elif 'dapaf' in roles:
            statut = 'transmise_dapaf'
        else:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        # ✅ Utiliser icontains pour capturer toutes les variantes (avec ou sans année)
        attestations = Demande.objects.filter(
            statut=statut
        ).filter(
            models.Q(type_demande__libelle='Attestation de travail') |
            models.Q(type_demande__libelle='Attestation de présence au poste') |
            models.Q(type_demande__libelle='Attestation de validité de services') |
            models.Q(type_demande__libelle='Certificat de non-jouissance de congé') |
            models.Q(type_demande__libelle__icontains='Certificat de non-jouissance')  # ✅ Pour les variantes avec année
        ).select_related('agent', 'type_demande').order_by('-date_soumission')
        
        result = []
        for att in attestations:
            type_attestation = att.type_demande.libelle
            
            validation = Validation.objects.filter(demande=att).first()
            commentaire = ''
            if validation and validation.commentaire:
                for part in validation.commentaire.split('||'):
                    if part.startswith('COMMENTAIRE:'):
                        commentaire = part.replace('COMMENTAIRE:', '')
                        break
            
            result.append({
                'id': att.id,
                'agent_nom': att.agent.nom,
                'agent_prenom': att.agent.prenom,
                'agent_matricule': att.agent.matricule,
                'type_attestation': type_attestation,
                'date_soumission': str(att.date_soumission),
                'numerosuivi': att.numerosuivi,
                'commentaire': commentaire,
                'statut': att.statut
            })
        
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_attestations_recues: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_attestations_transmises(request, matricule):
    """
    Récupère les attestations déjà transmises par le DPAF/DAPAF
    """
    try:
        user = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        
        if 'dpaf' in roles or 'dapaf' in roles:
            # ✅ Utiliser icontains pour capturer toutes les variantes
            attestations = Demande.objects.filter(
                statut='assignee_rh'
            ).filter(
                models.Q(type_demande__libelle='Attestation de travail') |
                models.Q(type_demande__libelle='Attestation de présence au poste') |
                models.Q(type_demande__libelle='Attestation de validité de services') |
                models.Q(type_demande__libelle='Certificat de non-jouissance de congé') |
                models.Q(type_demande__libelle__icontains='Certificat de non-jouissance')  # ✅ Pour les variantes avec année
            ).select_related('agent', 'type_demande').order_by('-date_soumission')
        else:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        result = []
        for att in attestations:
            type_attestation = att.type_demande.libelle
            result.append({
                'id': att.id,
                'agent_nom': att.agent.nom,
                'agent_prenom': att.agent.prenom,
                'agent_matricule': att.agent.matricule,
                'type_attestation': type_attestation,
                'date_soumission': str(att.date_soumission),
                'numerosuivi': att.numerosuivi,
                'statut': att.statut,
                'agent_rh_nom': att.agent_rh.nom if att.agent_rh else None,
                'agent_rh_prenom': att.agent_rh.prenom if att.agent_rh else None,
            })
        
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_attestations_transmises: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def assigner_attestation_rh(request, attestation_id):
    """
    Le DPAF/DAPAF assigne une attestation à un agent RH
    """
    try:
        data = json.loads(request.body)
        agent_rh_matricule = data.get('agent_rh_matricule')
        commentaire = data.get('commentaire', '')
        dpaf_matricule = data.get('dpaf_matricule')
        
        demande = Demande.objects.get(id=attestation_id)
        agent_rh = Agent.objects.get(matricule=agent_rh_matricule)
        
        # ✅ Vérifier avec les types exacts
        types_attestation_autorises = [
            'Attestation de travail',
            'Attestation de présence au poste',
            'Attestation de validité de services',
            'Certificat de non-jouissance de congé'
        ]
        
        if not demande.type_demande or demande.type_demande.libelle not in types_attestation_autorises:
            return JsonResponse({
                'error': f'Cette demande n\'est pas une attestation valide. Type: {demande.type_demande.libelle if demande.type_demande else "Inconnu"}'
            }, status=400)
        
        demande.statut = 'assignee_rh'
        demande.agent_rh = agent_rh
        demande.date_assignation = datetime.now().date()
        demande.commentaire_responsable = commentaire
        demande.save()
        
        # Notifier l'agent RH
        type_attestation = demande.type_demande.libelle
        Notification.objects.create(
            agent_id=agent_rh.matricule,
            message=f"📄 Nouvelle attestation à générer pour {demande.agent.prenom} {demande.agent.nom} - {type_attestation}",
            type_notification='attestation_a_generer',
            date_envoi=datetime.now().date(),
            lue=0
        )
        
        return JsonResponse({
            'success': True, 
            'message': 'Attestation assignée avec succès',
            'agent_rh': f"{agent_rh.prenom} {agent_rh.nom}",
            'type_attestation': type_attestation
        })
        
    except Demande.DoesNotExist:
        return JsonResponse({'error': 'Attestation non trouvée'}, status=404)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent RH non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR assigner_attestation_rh: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_attestations_historique(request, matricule):
    """
    Récupère l'historique des attestations pour le DPAF/DAPAF
    """
    try:
        user = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        
        if 'dpaf' in roles or 'dapaf' in roles:
            # ✅ Utiliser icontains pour capturer toutes les variantes
            attestations = Demande.objects.filter(
                statut__in=['termine', 'remis', 'signe']
            ).filter(
                models.Q(type_demande__libelle='Attestation de travail') |
                models.Q(type_demande__libelle='Attestation de présence au poste') |
                models.Q(type_demande__libelle='Attestation de validité de services') |
                models.Q(type_demande__libelle='Certificat de non-jouissance de congé') |
                models.Q(type_demande__libelle__icontains='Certificat de non-jouissance')  # ✅ Pour les variantes avec année
            ).select_related('agent', 'type_demande', 'agent_rh').order_by('-date_soumission')
        else:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        result = []
        for att in attestations:
            type_attestation = att.type_demande.libelle
            result.append({
                'id': att.id,
                'agent_nom': att.agent.nom,
                'agent_prenom': att.agent.prenom,
                'agent_matricule': att.agent.matricule,
                'type_attestation': type_attestation,
                'statut': att.statut,
                'agent_rh_nom': att.agent_rh.nom if att.agent_rh else None,
                'agent_rh_prenom': att.agent_rh.prenom if att.agent_rh else None,
                'date_soumission': str(att.date_soumission)
            })
        
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_attestations_historique: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_attestations_assignees(request, matricule):
    """
    Récupère les attestations assignées pour le DPAF/DAPAF
    """
    try:
        user = Agent.objects.get(matricule=matricule)
        agent_roles = AgentRole.objects.filter(agent=user).select_related('role')
        roles = [ar.role.libelle.lower() for ar in agent_roles]
        
        if 'dpaf' in roles or 'dapaf' in roles:
            # ✅ Utiliser icontains pour capturer toutes les variantes
            attestations = Demande.objects.filter(
                statut__in=['assignee_rh', 'en_cours_traitement', 'acte_genere', 'termine', 'envoye_secretaire']
            ).filter(
                models.Q(type_demande__libelle='Attestation de travail') |
                models.Q(type_demande__libelle='Attestation de présence au poste') |
                models.Q(type_demande__libelle='Attestation de validité de services') |
                models.Q(type_demande__libelle='Certificat de non-jouissance de congé') |
                models.Q(type_demande__libelle__icontains='Certificat de non-jouissance')  # ✅ Pour les variantes avec année
            ).select_related('agent', 'type_demande', 'agent_rh').order_by('-date_soumission')
        else:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        result = []
        for att in attestations:
            type_attestation = att.type_demande.libelle
            result.append({
                'id': att.id,
                'agent_nom': att.agent.nom,
                'agent_prenom': att.agent.prenom,
                'agent_matricule': att.agent.matricule,
                'type_attestation': type_attestation,
                'statut': att.statut,
                'agent_rh_nom': att.agent_rh.nom if att.agent_rh else None,
                'agent_rh_prenom': att.agent_rh.prenom if att.agent_rh else None,
                'date_assignation': str(getattr(att, 'date_assignation', att.date_soumission))
            })
        
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR get_attestations_assignees: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def signer_attestation(request, reference):
    """
    Le DPAF/DAPAF signe l'attestation
    """
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        commentaire = data.get('commentaire', '')
        
        acte = ActeAdministratif.objects.get(reference=reference)
        
        # Vérifier que c'est bien une attestation
        types_attestation = [
            'Attestation de présence au poste',
            'Attestation de travail',
            'Attestation de validité de services',
            'Certificat de non-jouissance de congé'
        ]
        
        if acte.type_acte not in types_attestation:
            return JsonResponse({'error': 'Ce n\'est pas une attestation'}, status=400)
        
        # Récupérer le signataire (DPAF ou DAPAF selon le type)
        signataire = Agent.objects.get(matricule=matricule)
        
        # Vérifier que le signataire a bien une signature et un cachet
        if not signataire.signature or not signataire.cachet:
            return JsonResponse({
                'error': 'Signature ou cachet manquant. Veuillez uploader votre signature et votre cachet dans votre profil.'
            }, status=400)
        
        pdf_bytes = generer_acte_avec_signature_et_cachet(
            acte=acte,
            demande=acte.demande,
            signataire=signataire,
            signature_base64=signataire.signature,
            cachet_base64=signataire.cachet,
            commentaire=commentaire
        )
        
        # Mettre à jour l'acte
        acte.statut = 'signe'
        acte.signe_par = f"{signataire.prenom} {signataire.nom}"
        acte.signe_le = datetime.now()
        acte.fichier_pdf_signe = base64.b64encode(pdf_bytes).decode('utf-8')
        acte.save()
        
        # Notifier la secrétaire
        secretaire = Agent.objects.filter(
            agentrole__role__libelle='secretaire',
            actif=1
        ).first()
        
        if secretaire:
            Notification.objects.create(
                agent_id=secretaire.matricule,
                message=f"✅ Attestation signée par {signataire.prenom} {signataire.nom} - Réf: {reference}",
                type_notification='attestation_signe',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        # Notifier l'agent
        if acte.demande:
            Notification.objects.create(
                agent_id=acte.demande.agent.matricule,
                message=f"📄 Votre attestation {reference} a été signée et est disponible au secrétariat",
                type_notification='attestation_signe',
                date_envoi=datetime.now().date(),
                lue=0
            )
        
        return _create_pdf_response(pdf_bytes, f'Attestation_Signe_{reference}')
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Signataire non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR signer_attestation: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


def ajouter_signature_cachet_attestation(fichier_pdf_base64, signataire, type_attestation):
    """
    Ajoute la signature et le cachet sur un PDF d'attestation
    """
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from io import BytesIO
    import base64
    
    # Convertir le PDF en DOCX (ou utiliser un template)
    # Ici on va régénérer le document avec signature
    
    # Récupérer l'agent depuis l'acte
    acte = ActeAdministratif.objects.get(reference=reference)
    demande = acte.demande
    agent = demande.agent
    
    # Choisir le template selon le type
    if type_attestation == 'Attestation de présence au poste':
        template_name = 'attestation_presence_template.docx'
    elif type_attestation == 'Attestation de travail':
        template_name = 'attestation_travail_template.docx'
    elif type_attestation == 'Attestation de validité de services':
        template_name = 'attestation_validite_services_template.docx'
    elif type_attestation == 'Certificat de non-jouissance de congé':
        template_name = 'certificat_non_jouissance_template.docx'
    else:
        raise Exception(f"Type d'attestation non supporté: {type_attestation}")
    
    template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', template_name)
    
    if not os.path.exists(template_path):
        raise Exception(f"Template {template_name} non trouvé")
    
    doc = Document(template_path)
    
    # Remplir les placeholders
    replacements = {
        '{{REFERENCE}}': acte.reference,
        '{{NOM_COMPLET}}': f"{agent.nom} {agent.prenom}".upper(),
        '{{POSTE}}': agent.poste or 'Agent',
        # ... autres placeholders
    }
    
    for paragraph in doc.paragraphs:
        for key, value in replacements.items():
            if key in paragraph.text:
                paragraph.text = paragraph.text.replace(key, value)
    
    # Ajouter signature et cachet du signataire
    for i, paragraph in enumerate(doc.paragraphs):
        if signataire.nom.upper() in paragraph.text.upper():
            new_paragraph = doc.paragraphs[i].insert_paragraph_before()
            new_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            
            if signataire.signature:
                sig_clean = signataire.signature.split(',')[1] if ',' in signataire.signature else signataire.signature
                sig_bytes = base64.b64decode(sig_clean)
                sig_stream = BytesIO(sig_bytes)
                new_paragraph.add_run().add_picture(sig_stream, width=Pt(130))
            
            new_paragraph.add_run("   ")
            
            if signataire.cachet:
                cachet_clean = signataire.cachet.split(',')[1] if ',' in signataire.cachet else signataire.cachet
                cachet_bytes = base64.b64decode(cachet_clean)
                cachet_stream = BytesIO(cachet_bytes)
                new_paragraph.add_run().add_picture(cachet_stream, width=Pt(90))
            
            break
    
    _set_document_font(doc, font_name='Times New Roman', font_size_pt=12)
    
    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    
    return _docx_bytes_to_pdf_bytes(output.getvalue())


@csrf_exempt
def forgot_password(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)
    
    try:
        data = json.loads(request.body)
        email = data.get('email')  # ✅ CHANGÉ : email au lieu de matricule
        
        if not email:
            return JsonResponse({'error': 'Email requis'}, status=400)
        
        # ✅ Vérifier si l'email existe dans Agent
        try:
            agent = Agent.objects.get(email=email)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Email non trouvé'}, status=404)
        
        # Vérifier si l'agent a un compte
        try:
            compte = Compte.objects.get(agent=agent)
        except Compte.DoesNotExist:
            return JsonResponse({'error': 'Aucun compte associé à cet email'}, status=404)
        
        # Générer un code à 6 chiffres
        code = ''.join(random.choices(string.digits, k=6))
        
        # Stocker le code dans le cache avec l'email
        cache_key = f'reset_code_{email}'  # ✅ CHANGÉ : email au lieu de matricule
        cache.set(cache_key, {
            'code': code,
            'email': email,
            'matricule': agent.matricule,  # Garder matricule pour la mise à jour
            'created_at': datetime.now().isoformat()
        }, timeout=900)
        
        # Préparer l'email
        subject = "🔐 Réinitialisation de votre mot de passe"
        
        html_message = render_to_string('emails/reset_password_email.html', {
            'nom': agent.nom,
            'prenom': agent.prenom,
            'code': code,
            'email': email
        })
        
        plain_message = strip_tags(html_message)
        
        # Envoyer l'email
        try:
            send_mail(
                subject,
                plain_message,
                settings.DEFAULT_FROM_EMAIL,
                [agent.email],  # Envoyer à l'email de l'agent
                html_message=html_message,
                fail_silently=False,
            )
            
            return JsonResponse({
                'success': True,
                'message': 'Un code de réinitialisation a été envoyé à votre adresse email',
                'email': email
            })
            
        except Exception as e:
            print(f"Erreur d'envoi email: {e}")
            return JsonResponse({'error': "Erreur lors de l'envoi de l'email"}, status=500)
            
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Données invalides'}, status=400)


@csrf_exempt
def verify_reset_code(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)
    
    try:
        data = json.loads(request.body)
        email = data.get('email')  # ✅ CHANGÉ : email au lieu de matricule
        code = data.get('code')
        
        if not email or not code:
            return JsonResponse({'error': 'Email et code requis'}, status=400)
        
        # Récupérer le code du cache
        cache_key = f'reset_code_{email}'  # ✅ CHANGÉ : email au lieu de matricule
        cached_data = cache.get(cache_key)
        
        if not cached_data:
            return JsonResponse({'error': 'Aucun code demandé. Veuillez en demander un nouveau.'}, status=400)
        
        stored_code = cached_data.get('code')
        
        if stored_code != code:
            return JsonResponse({'error': 'Code invalide'}, status=400)
        
        created_at = datetime.fromisoformat(cached_data.get('created_at'))
        if datetime.now() - created_at > timedelta(minutes=15):
            cache.delete(cache_key)
            return JsonResponse({'error': 'Code expiré. Veuillez en demander un nouveau.'}, status=400)
        
        return JsonResponse({
            'success': True,
            'message': 'Code valide',
            'email': email
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Données invalides'}, status=400)

@csrf_exempt
def reset_password(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)
    
    try:
        data = json.loads(request.body)
        email = data.get('email')  # ✅ CHANGÉ : email au lieu de matricule
        code = data.get('code')
        new_password = data.get('new_password')
        
        if not email or not code or not new_password:
            return JsonResponse({'error': 'Tous les champs sont requis'}, status=400)
        
        if len(new_password) < 6:
            return JsonResponse({'error': 'Le mot de passe doit contenir au moins 6 caractères'}, status=400)
        
        # Vérifier le code dans le cache
        cache_key = f'reset_code_{email}'  # ✅ CHANGÉ : email au lieu de matricule
        cached_data = cache.get(cache_key)
        
        if not cached_data:
            return JsonResponse({'error': 'Aucun code demandé. Veuillez en demander un nouveau.'}, status=400)
        
        stored_code = cached_data.get('code')
        
        if stored_code != code:
            return JsonResponse({'error': 'Code invalide'}, status=400)
        
        created_at = datetime.fromisoformat(cached_data.get('created_at'))
        if datetime.now() - created_at > timedelta(minutes=15):
            cache.delete(cache_key)
            return JsonResponse({'error': 'Code expiré. Veuillez en demander un nouveau.'}, status=400)
        
        # ✅ Récupérer le matricule depuis le cache
        matricule = cached_data.get('matricule')
        
        # Mettre à jour le mot de passe
        try:
            agent = Agent.objects.get(matricule=matricule)
            compte = Compte.objects.get(agent=agent)
            
            compte.mot_de_passe = make_password(new_password)
            compte.save()
            
            # Supprimer le code du cache
            cache.delete(cache_key)
            
            return JsonResponse({
                'success': True,
                'message': 'Votre mot de passe a été réinitialisé avec succès'
            })
            
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Agent non trouvé'}, status=404)
        except Compte.DoesNotExist:
            return JsonResponse({'error': 'Compte non trouvé'}, status=404)
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Données invalides'}, status=400)