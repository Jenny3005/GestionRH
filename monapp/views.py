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
    DemandeConge, Notification, SoldeConge, TypePiece, Compte, DossierAgent, Piece, ActeAdministratif, Avancement
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
        
        # ==================== CALCUL DES AVANCEMENTS ====================
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
        # ================================================================

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

                # ✅ NOUVEAU : Calcul immédiat des avancements pour cet agent importé
                try:
                    if agent.typecontrat == 'ACE':
                        premier_delai = 4 * 365
                    else:
                        premier_delai = 2 * 365

                    if agent.echelon and '-' in agent.echelon:
                        partie_fixe = get_partie_fixe(agent.echelon)
                    else:
                        partie_fixe = get_type_echelon(agent.echelon or 'A1-1') + '1'

                    echelon_base = f"{partie_fixe}-1"
                    echelon_courant = echelon_base
                    anciennete = (date.today() - agent.date_prise_service).days

                    if anciennete >= premier_delai:
                        # Agent déjà ancien : calculer les avancements passés d'abord
                        nb_passes = 1 + (anciennete - premier_delai) // (2 * 365)
                        for _ in range(nb_passes):
                            nouvel = calculer_nouvel_echelon(echelon_courant)
                            if nouvel:
                                echelon_courant = nouvel
                            else:
                                break
                        dernier_date = ajouter_annees(agent.date_prise_service, premier_delai//365 + (nb_passes - 1) * 2)
                        prochaine_date = ajouter_annees(dernier_date, 2)
                    else:
                        # Nouvel agent : premier avancement à venir
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
                except Exception as av_error:
                    print(f"⚠️ Erreur calcul avancements pour {agent.matricule}: {av_error}")
                
                activation_link = f"http://localhost:5173/activate?matricule={agent.matricule}"
                succes, erreur = envoyer_email_activation(agent)
                if not succes:
                    errors.append(f"{agent.matricule}: Email non envoyé - {erreur}")
                
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


# ==================== GESTION DES RÔLES DES AGENTS (AJOUT/SUPPRESSION) ====================

@csrf_exempt
@require_http_methods(["POST"])
def add_role_to_agent(request, agent_id):
    """Ajouter un rôle à un agent"""
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
    """Supprimer un rôle d'un agent"""
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


# ==================== GESTION DES CONGÉS ====================

@csrf_exempt
@require_http_methods(["POST"])
def demande_conge(request):
    """Agent soumet une demande de congé avec vérification complète d'éligibilité"""
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
        
        # ✅ VÉRIFICATION : La demande ne peut être que pour l'année courante
        annee_demande = date_debut.year
        annee_courante = datetime.now().year
        
        if annee_demande < annee_courante:
            return JsonResponse({
                'error': f'❌ Impossible de demander un congé pour {annee_demande} (année déjà passée)'
            }, status=400)
        
        if annee_demande > annee_courante:
            return JsonResponse({
                'error': f'❌ Impossible de demander un congé pour {annee_demande} (année future)'
            }, status=400)
        
        nombre_jours = (date_fin - date_debut).days + 1
        
        # Vérification ancienneté
        if agent.date_prise_service:
            anciennete_jours = (datetime.now().date() - agent.date_prise_service).days
            if anciennete_jours < 365:
                return JsonResponse({
                    'error': f'Ancienneté insuffisante. Vous devez avoir au moins 1 an de service.'
                }, status=400)
        
        # Vérification nombre de demandes par an
        nb_demandes_annee = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            date_soumission__year=annee_courante
        ).count()
        
        if nb_demandes_annee >= 2:
            return JsonResponse({
                'error': f'Vous avez déjà effectué {nb_demandes_annee} demande(s) de congé cette année. Maximum 2 demandes par an.'
            }, status=400)
        
        # Vérification solde
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
        
        # Vérification chevauchement
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
            numerosuivi=f"CONGE-{datetime.now().strftime('%Y%m%d%H%M%S')}-{agent.matricule}"
        )
        
        conge = DemandeConge.objects.create(
            demande=demande,
            date_debut=date_debut,
            date_fin=date_fin,
            nombrejours=nombre_jours
        )
        
        # Notification au chef
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
    """Chef valide ou rejette une demande de congé"""
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
            
            # ✅ Vérifier si c'est un congé et mettre à jour le solde
            if hasattr(demande, 'demandeconge') and demande.demandeconge:
                # ✅ Utiliser l'année de début du congé (pas l'année courante)
                annee_conge = demande.demandeconge.date_debut.year
                nombre_jours = demande.demandeconge.nombrejours
                
                print(f"📅 Année du congé: {annee_conge}, Jours: {nombre_jours}")
                
                solde, _ = SoldeConge.objects.get_or_create(
                    agent=demande.agent,
                    annee=annee_conge,
                    defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
                )
                
                print(f"💰 Solde avant - jours_pris: {solde.jours_pris}, jours_restants: {solde.jours_restants}")
                
                solde.jours_pris = (solde.jours_pris or 0) + nombre_jours
                solde.jours_restants = (solde.jours_acquis or 30) - solde.jours_pris
                solde.save()
                
                print(f"💰 Solde après - jours_pris: {solde.jours_pris}, jours_restants: {solde.jours_restants}")
            else:
                print(f"⚠️ Ce n'est pas un congé ou demandeconge n'existe pas")
        else:
            demande.statut = 'refuse'
            print("❌ Demande rejetée")
        
        demande.commentaire_chef = commentaire
        demande.save()
        
        # Notification à l'agent
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
            print(f"✅ Notification créée avec succès - ID: {notification.id}")
            
        except Exception as notif_error:
            print(f"⚠️ ERREUR lors de la création de la notification: {notif_error}")
        
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
        
        agent = Agent.objects.get(matricule=matricule)
        print(f"✅ Agent trouvé: {agent.nom} {agent.prenom}")
        
        demandes = Demande.objects.filter(
            agent=agent
        ).select_related('type_demande', 'demandeconge', 'demandeabsence').order_by('-date_soumission')
        
        print(f"📋 Nombre total de demandes trouvées: {demandes.count()}")
        
        result = []
        for d in demandes:
            print(f"  - Demande ID: {d.id}, Type: {d.type_demande.libelle if d.type_demande else 'None'}, Statut: {d.statut}")
            
            date_debut = None
            date_fin = None
            nombre_jours = None
            
            if hasattr(d, 'demandeconge') and d.demandeconge:
                date_debut = str(d.demandeconge.date_debut) if d.demandeconge.date_debut else None
                date_fin = str(d.demandeconge.date_fin) if d.demandeconge.date_fin else None
                nombre_jours = d.demandeconge.nombrejours
                print(f"  - Demande Congé #{d.id}: du {date_debut} au {date_fin}")
            elif hasattr(d, 'demandeabsence') and d.demandeabsence:
                date_debut = str(d.demandeabsence.date_debut) if d.demandeabsence.date_debut else None
                date_fin = str(d.demandeabsence.date_fin) if d.demandeabsence.date_fin else None
                nombre_jours = d.demandeabsence.nombrejours
                print(f"  - Demande Absence #{d.id}: du {date_debut} au {date_fin}")
            
            # ✅ Ajouter les informations de l'agent RH
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
                'agent_rh_nom': agent_rh_nom,      # ✅ Ajouté
                'agent_rh_prenom': agent_rh_prenom  # ✅ Ajouté
            })
        
        print(f"✅ FINAL - {len(result)} demandes retournées")
        return JsonResponse(result, safe=False)
        
    except Agent.DoesNotExist:
        print(f"❌ Agent non trouvé pour matricule: '{matricule}'")
        return JsonResponse({'error': f'Agent {matricule} non trouvé'}, status=404)
    except Exception as e:
        print(f"❌ ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

# ==================== SOLDE CONGÉ ====================

@csrf_exempt
@require_http_methods(["GET"])
def solde_conge(request, matricule):
    """Agent consulte son solde de congés pour l'année en cours"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        annee_courante = datetime.now().year
        
        print(f"=== solde_conge pour {matricule}, année: {annee_courante}")
        
        # ✅ Compter les jours pris pour l'année courante SEULEMENT
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
        
        print(f"📊 Jours pris trouvés: {jours_pris}")
        
        solde, created = SoldeConge.objects.get_or_create(
            agent=agent,
            annee=annee_courante,
            defaults={'jours_acquis': 30, 'jours_pris': 0, 'jours_restants': 30}
        )
        
        # ✅ Mettre à jour avec les calculs réels
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
    """Récupérer les notifications d'un agent"""
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


@csrf_exempt
@require_http_methods(["DELETE"])
def supprimer_notification(request, notification_id):
    """Supprimer définitivement une notification"""
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
    """Supprimer toutes les notifications d'un agent"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        deleted, _ = Notification.objects.filter(agent_id=agent.matricule).delete()
        return JsonResponse({'success': True, 'message': f'{deleted} notification(s) supprimée(s)'})
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
                'numerosuivi': d.numerosuivi
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


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_transmises_secretaire(request, matricule_secretaire):
    """Récupérer les demandes déjà transmises au DPAF par la secrétaire"""
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
def get_actes_recus_secretaire(request, matricule_secretaire):
    """Récupérer tous les actes envoyés à la secrétaire (toutes directions)"""
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
                print(f"✅ Acte ajouté: {acte.reference} pour {acte.demande.agent.nom}")
        
        print(f"✅ Total actes reçus: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_recus_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_remettre_secretaire(request, matricule_secretaire):
    """Récupérer les actes signés par DPAF à remettre aux agents"""
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
                print(f"✅ Acte ajouté: {acte.reference} pour {acte.demande.agent.nom}")
        
        print(f"✅ Total actes à remettre: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_a_remettre_secretaire: {str(e)}")
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
    """Secrétaire remet un acte à l'agent"""
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


# ==================== DPAF ====================
def generer_acte_avec_signature_et_cachet(acte, demande, dpaf, signature_base64=None, cachet_base64=None, commentaire=""):
    """Génère le PDF de l'acte avec signature et cachet du DPAF"""
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    import io, base64
    from io import BytesIO
    
    # Déterminer le template
    if demande.type_demande.libelle == 'Congé':
        template_name = 'autorisation_conge_template.docx'
    else:
        template_name = 'autorisation_absence_template.docx'
    
    template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', template_name)
    
    if not os.path.exists(template_path):
        raise Exception(f"Template {template_name} non trouvé")
    
    doc = Document(template_path)
    
    # Préparer les remplacements
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
    
    # Remplacer les placeholders
    for paragraph in doc.paragraphs:
        for key, value in replacements.items():
            if key in paragraph.text:
                paragraph.text = paragraph.text.replace(key, value)
    
    # ✅ Ajouter signature et cachet AVANT "Comlan Amour Abel KPOCHEME"
    for paragraph in doc.paragraphs:
        if 'Comlan' in paragraph.text or 'KPOCHEME' in paragraph.text:
            nom_texte = paragraph.text
            paragraph.clear()
            
            # Signature (taille 130)
            run_sig = paragraph.add_run()
            if signature_base64:
                try:
                    if ',' in signature_base64:
                        signature_base64 = signature_base64.split(',')[1]
                    sig_bytes = base64.b64decode(signature_base64)
                    sig_stream = BytesIO(sig_bytes)
                    run_sig.add_picture(sig_stream, width=Pt(130))
                except:
                    run_sig.text = ""
            
            # UN SEUL espace entre signature et cachet
            paragraph.add_run(" ")
            
            # Cachet (taille 90)
            run_cachet = paragraph.add_run()
            if cachet_base64:
                try:
                    if ',' in cachet_base64:
                        cachet_base64 = cachet_base64.split(',')[1]
                    cachet_bytes = base64.b64decode(cachet_base64)
                    cachet_stream = BytesIO(cachet_bytes)
                    run_cachet.add_picture(cachet_stream, width=Pt(90))
                except:
                    run_cachet.text = ""
            
            # Saut de ligne
            paragraph.add_run().add_break()
            
            # Nom en dessous
            paragraph.add_run(nom_texte).bold = True
            
            break
    
    _set_document_font(doc, font_name='Times New Roman', font_size_pt=12)
    
    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    
    return _docx_bytes_to_pdf_bytes(output.getvalue())
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
        ).select_related('agent', 'type_demande', 'agent_rh')
        
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
            
            if d.agent_rh:
                agent_rh_nom = d.agent_rh.nom
                agent_rh_prenom = d.agent_rh.prenom
            else:
                agent_rh_nom = 'Non assigné'
                agent_rh_prenom = ''
            
            result.append({
                'id': d.id,
                'agent_nom': d.agent.nom,
                'agent_prenom': d.agent.prenom,
                'agent_matricule': d.agent.matricule,
                'type_demande': d.type_demande.libelle if d.type_demande else 'Inconnu',
                'date_debut': date_debut,
                'date_fin': date_fin,
                'agent_rh_nom': agent_rh_nom,
                'agent_rh_prenom': agent_rh_prenom,
                'statut': d.statut,
                'date_assignation': str(getattr(d, 'date_assignation', d.date_soumission))
            })
        
        print(f"✅ {len(result)} demandes assignées trouvées")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_agents_rh(request):
    """Récupérer tous les agents ayant un rôle RH uniquement"""
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
            'role': getattr(getattr(a, 'agentrole', None), 'role', None).libelle if getattr(a, 'agentrole', None) else None,
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
        demande.agent_rh = agent_rh
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
        
        signature_base64 = dpaf.signature if hasattr(dpaf, 'signature') else None
        cachet_base64 = dpaf.cachet if hasattr(dpaf, 'cachet') else None
        
        pdf_bytes = generer_acte_avec_signature_et_cachet(
            acte=acte,
            demande=demande,
            dpaf=dpaf,
            signature_base64=signature_base64,
            cachet_base64=cachet_base64,
            commentaire=commentaire
        )
        
        acte.statut = 'signe'
        acte.signe_par = f"{dpaf.prenom} {dpaf.nom}"
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
                message=f"✅ Acte signé par {dpaf.prenom} {dpaf.nom} (DPAF) - Réf: {reference}",
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
@require_http_methods(["GET"])
def get_actes_a_signer_dpaf(request, matricule_dpaf):
    """Récupérer les actes à signer par le DPAF"""
    try:
        print(f"=== get_actes_a_signer_dpaf for: {matricule_dpaf}")
        
        actes = ActeAdministratif.objects.filter(
            statut='attente_signature_dpaf'
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
        
        print(f"✅ {len(result)} actes à signer trouvés")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_a_signer_dpaf: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== RH ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_assignees_rh(request, matricule_rh):
    """Récupérer les demandes assignées à un agent RH"""
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
        
        print(f"✅ {len(result)} demandes assignées trouvées")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_demandes_assignees_rh: {str(e)}")
        import traceback
        traceback.print_exc()
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
        rh_matricule = data.get('rh_matricule')
        
        demande = Demande.objects.get(id=demande_id)

        demande_type_label = demande.type_demande.libelle if demande.type_demande else ''
        demande_type_lower = demande_type_label.lower()
        is_conge = demande_type_lower == 'congé' or demande_type_lower == 'conge'
        is_absence = 'absence' in demande_type_lower

        # 🔍 DEBUG
        print("=" * 70)
        print(f"🔍 DEBUG generer_acte_rh - Demande ID: {demande_id}")
        print(f"🔍 Type de demande: '{demande_type_label}'")
        print(f"🔍 is_conge: {is_conge}, is_absence: {is_absence}")
        print("=" * 70)

        if is_conge:
            template_name = 'autorisation_conge_template.docx'
            type_acte = 'Autorisation de jouissance de congé administratif'
            if hasattr(demande, 'demandeconge') and demande.demandeconge:
                date_debut = demande.demandeconge.date_debut.strftime('%d/%m/%Y')
                date_fin = demande.demandeconge.date_fin.strftime('%d/%m/%Y')
                nombre_jours = demande.demandeconge.nombrejours
            else:
                date_debut = ''
                date_fin = ''
                nombre_jours = ''
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
                date_debut = ''
                date_fin = ''
                nombre_jours = ''
                motif = ''
            filename_prefix = 'Autorisation_Absence'
        else:
            return JsonResponse({'error': 'Type de demande non supporté'}, status=400)

        template_path = os.path.join(settings.BASE_DIR, 'backend', 'templates', 'word', template_name)
        
        if not os.path.exists(template_path):
            return JsonResponse({'error': f'Template non trouvé: {template_path}'}, status=500)
        
        doc = Document(template_path)

        # Extraire le numéro
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
            '{{ANNE_CONGE}}': str(annee_conge)  
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

        final_filename = f'{filename_prefix}_{demande.agent.nom}_{demande.agent.prenom}'

        demande.statut = 'acte_genere'
        demande.reference_acte = reference_complete
        demande.date_generation_acte = datetime.now().date()
        demande.save()

        return _create_pdf_response(pdf_bytes, final_filename)
        
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
    """Envoyer un acte à la secrétaire"""
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
                print(f"✅ Notification envoyée à la secrétaire {secretaire.matricule}")
        
        return JsonResponse({'success': True, 'message': 'Acte envoyé à la secrétaire'})
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR envoyer_acte_secretaire: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def download_acte(request, reference):
    """Télécharger un acte administratif - priorité au fichier signé"""
    try:
        acte = ActeAdministratif.objects.get(reference=reference)
        
        # ✅ PRIORITÉ au fichier signé s'il existe
        if acte.fichier_pdf_signe:
            fichier_bytes = base64.b64decode(acte.fichier_pdf_signe)
            if fichier_bytes.startswith(b'PK'):
                try:
                    pdf_bytes = _docx_bytes_to_pdf_bytes(fichier_bytes)
                except RuntimeError as e:
                    print(f"ERREUR conversion PDF download_acte: {e}")
                    return JsonResponse({'error': str(e)}, status=500)
            else:
                pdf_bytes = fichier_bytes
            return _create_pdf_response(pdf_bytes, f'acte_{reference}')
        
        # Sinon, utiliser le fichier original
        if acte.fichier_pdf:
            fichier_bytes = base64.b64decode(acte.fichier_pdf)
            if fichier_bytes.startswith(b'PK'):
                try:
                    pdf_bytes = _docx_bytes_to_pdf_bytes(fichier_bytes)
                except RuntimeError as e:
                    print(f"ERREUR conversion PDF download_acte: {e}")
                    return JsonResponse({'error': str(e)}, status=500)
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
            try:
                pdf_bytes = _docx_bytes_to_pdf_bytes(docx_bytes)
            except RuntimeError as e:
                print(f"ERREUR conversion PDF download_acte fallback: {e}")
                return JsonResponse({'error': str(e)}, status=500)
            return _create_pdf_response(pdf_bytes, f'acte_{reference}')
        
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR download_acte: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)
    

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_cours_rh(request, matricule_rh):
    """Récupérer les demandes en cours de traitement pour un agent RH"""
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
        
        print(f"✅ {len(result)} demandes en cours trouvées")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_demandes_cours_rh: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_terminees_rh(request, matricule_rh):
    """Récupérer les demandes terminées pour un agent RH"""
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
        
        print(f"✅ {len(result)} demandes terminées trouvées")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_demandes_terminees_rh: {str(e)}")
        import traceback
        traceback.print_exc()
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
    """Ajouter un rôle à un agent (sans supprimer les existants)"""
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
    """Convertit un nombre en toutes lettres (1-30)"""
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
    """Générer une attestation de présence au poste avec signature et cachet DPAF"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        
        agent = Agent.objects.get(matricule=matricule)
        
        # Récupérer le DPAF (Augustine Tognissè CAKPO SOGLO)
        dpaf = Agent.objects.filter(
            agentrole__role__libelle='dpaf',
            actif=1
        ).first()
        
        if not dpaf:
            return JsonResponse({'error': 'Aucun DPAF trouvé pour signer'}, status=500)
        
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
        
        # ✅ Numéro seul pour la référence
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

        # ✅ Ajouter signature et cachet du DPAF
        signature_base64 = dpaf.signature if hasattr(dpaf, 'signature') and dpaf.signature else None
        cachet_base64 = dpaf.cachet if hasattr(dpaf, 'cachet') and dpaf.cachet else None
        
        # Chercher le nom du signataire
        signataire_nom = 'Augustine Tognissè CAKPO SOGLO'
        
        for paragraph in doc.paragraphs:
            if signataire_nom in paragraph.text:
                nom_texte = paragraph.text
                paragraph.clear()
                
                # Signature
                run_sig = paragraph.add_run()
                if signature_base64:
                    try:
                        if ',' in signature_base64:
                            signature_base64 = signature_base64.split(',')[1]
                        sig_bytes = base64.b64decode(signature_base64)
                        sig_stream = io.BytesIO(sig_bytes)
                        run_sig.add_picture(sig_stream, width=Pt(130))
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                        run_sig.text = ""
                
                paragraph.add_run(" ")
                
                # Cachet
                run_cachet = paragraph.add_run()
                if cachet_base64:
                    try:
                        if ',' in cachet_base64:
                            cachet_base64 = cachet_base64.split(',')[1]
                        cachet_bytes = base64.b64decode(cachet_base64)
                        cachet_stream = io.BytesIO(cachet_bytes)
                        run_cachet.add_picture(cachet_stream, width=Pt(90))
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                        run_cachet.text = ""
                
                paragraph.add_run().add_break()
                paragraph.add_run(nom_texte).bold = True
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
    """Générer une attestation de travail avec signature et cachet"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        
        agent = Agent.objects.get(matricule=matricule)
        
        # Récupérer le signataire (Chef ou DPAF selon ton besoin)
        # Pour l'attestation de travail, c'est Comlan Amour Abel KPOCHEME
        signataire = Agent.objects.filter(
            nom__icontains='KPOCHEME',
            actif=1
        ).first()
        
        # Fallback: prendre le DPAF si non trouvé
        if not signataire:
            signataire = Agent.objects.filter(
                agentrole__role__libelle='dpaf',
                actif=1
            ).first()
        
        if not signataire:
            return JsonResponse({'error': 'Aucun signataire trouvé'}, status=500)
        
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
        
        # ✅ Numéro seul pour la référence
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

        # ✅ Ajouter signature et cachet du signataire
        signature_base64 = signataire.signature if hasattr(signataire, 'signature') else None
        cachet_base64 = signataire.cachet if hasattr(signataire, 'cachet') else None
        
        # ✅ Chercher le nom du signataire dans le template (Comlan Amour Abel KPOCHEME)
        signataire_nom = 'Comlan Amour Abel KPOCHEME'
        signature_ajoutee = False
        
        for paragraph in doc.paragraphs:
            if signataire_nom in paragraph.text:
                print(f"✅ Signataire trouvé dans le template: {signataire_nom}")
                nom_texte = paragraph.text
                paragraph.clear()
                
                # Signature
                run_sig = paragraph.add_run()
                if signature_base64:
                    try:
                        if ',' in signature_base64:
                            signature_base64 = signature_base64.split(',')[1]
                        sig_bytes = base64.b64decode(signature_base64)
                        sig_stream = io.BytesIO(sig_bytes)
                        run_sig.add_picture(sig_stream, width=Pt(130))
                        print("✅ Signature ajoutée")
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                        run_sig.text = ""
                
                paragraph.add_run(" ")
                
                # Cachet
                run_cachet = paragraph.add_run()
                if cachet_base64:
                    try:
                        if ',' in cachet_base64:
                            cachet_base64 = cachet_base64.split(',')[1]
                        cachet_bytes = base64.b64decode(cachet_base64)
                        cachet_stream = io.BytesIO(cachet_bytes)
                        run_cachet.add_picture(cachet_stream, width=Pt(90))
                        print("✅ Cachet ajouté")
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                        run_cachet.text = ""
                
                paragraph.add_run().add_break()
                paragraph.add_run(nom_texte).bold = True
                signature_ajoutee = True
                break
        
        if not signature_ajoutee:
            print(f"⚠️ Attention: '{signataire_nom}' non trouvé dans le template")

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
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)
    
# ==================== VÉRIFICATION DOCUMENTS EXPIRÉS ====================

@csrf_exempt
@require_http_methods(["GET"])
def check_expired_documents(request):
    """Vérifie les documents expirés et crée des notifications dans la table notification"""
    try:
        today = date.today()
        count = 0
        
        pieces_expired = Piece.objects.filter(
            date_expiration__lte=today,
            valide=1
        ).select_related('dossier_agent__agent', 'type_piece')

        for piece in pieces_expired:
            agent = piece.dossier_agent.agent
            jours = (today - piece.date_expiration).days
            
            if jours == 0:
                message = f"⚠️ {piece.type_piece.libelle} expire aujourd'hui"
            elif jours == 1:
                message = f"⚠️ {piece.type_piece.libelle} a expiré hier"
            else:
                message = f"⚠️ {piece.type_piece.libelle} est expiré depuis {jours} jours"
            
            existe = Notification.objects.filter(
                agent=agent,
                message__contains=piece.type_piece.libelle,
                type_notification='expiration',
                date_envoi=today
            ).exists()
            
            if not existe:
                Notification.objects.create(
                    agent=agent,
                    message=message,
                    type_notification='expiration',
                    date_envoi=today,
                    lue=0
                )
                count += 1
        
        in_30_days = today + timedelta(days=30)
        pieces_expiring = Piece.objects.filter(
            date_expiration__gt=today,
            date_expiration__lte=in_30_days,
            valide=1
        ).select_related('dossier_agent__agent', 'type_piece')
        
        for piece in pieces_expiring:
            agent = piece.dossier_agent.agent
            jours = (piece.date_expiration - today).days
            
            existe = Notification.objects.filter(
                agent=agent,
                message__contains=piece.type_piece.libelle,
                type_notification='expiration',
                date_envoi=today
            ).exists()
            
            if not existe:
                Notification.objects.create(
                    agent=agent,
                    message=f"⏰ {piece.type_piece.libelle} expire dans {jours} jours",
                    type_notification='expiration',
                    date_envoi=today,
                    lue=0
                )
                count += 1
        
        return JsonResponse({
            'success': True,
            'notifications_created': count,
            'message': f'{count} notification(s) créée(s)'
        })
        
    except Exception as e:
        print(f"Erreur check_expired_documents: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== GESTION DES DOCUMENTS (PIÈCES) ====================

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
        
        dossier, created = DossierAgent.objects.get_or_create(
            agent=agent,
            defaults={
                'datecreation': date.today(),
                'taux_completude': 0
            }
        )
        
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
                missing_documents.append({
                    'id': type_piece.id,
                    'libelle': type_piece.libelle,
                    'obligatoire': True
                })
        
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        documents_obligatoires_uploades = len([d for d in documents if d['type_piece_id'] in 
            [tp.id for tp in types_pieces if tp.obligatoire == 1]])
        
        if total_obligatoire > 0:
            taux_completude = round((documents_obligatoires_uploades / total_obligatoire) * 100)
        else:
            taux_completude = 100
        
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
        
        print(f"Upload demandé - matricule: {matricule}, type_piece: {type_piece_id}, fichier: {file_name}")
        
        if not all([matricule, type_piece_id, file_base64, file_name]):
            return JsonResponse({
                'error': 'Tous les champs sont requis (matricule, type_piece_id, file_base64, file_name)'
            }, status=400)
        
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': f'Agent {matricule} non trouvé'}, status=404)
        
        try:
            type_piece = TypePiece.objects.get(id=type_piece_id)
        except TypePiece.DoesNotExist:
            return JsonResponse({'error': f'Type de pièce {type_piece_id} non trouvé'}, status=404)
        
        dossier, created = DossierAgent.objects.get_or_create(
            agent=agent,
            defaults={
                'datecreation': date.today(),
                'taux_completude': 0
            }
        )
        
        if created:
            print(f"Nouveau dossier créé pour l'agent {matricule}")
        
        cleaned_base64 = file_base64
        if 'base64,' in file_base64:
            cleaned_base64 = file_base64.split('base64,')[1]
        
        date_expiration_str = request.POST.get('date_expiration')
        date_expiration = None
        if date_expiration_str:
            try:
                date_expiration = datetime.strptime(date_expiration_str, '%Y-%m-%d').date()
                print(f"Date d'expiration fournie par l'utilisateur: {date_expiration}")
            except:
                print(f"Format de date invalide: {date_expiration_str}")
        
        anciennes_pieces = Piece.objects.filter(
            dossier_agent=dossier,
            type_piece=type_piece
        )
        if anciennes_pieces.exists():
            anciennes_pieces.delete()
            print(f"Ancienne pièce de type {type_piece.libelle} supprimée")
        
        piece = Piece.objects.create(
            dossier_agent=dossier,
            type_piece=type_piece,
            nom_fichier=file_name,
            date_expiration=date_expiration,
            date_upload=date.today(),
            valide=1,
            cheminfichier=cleaned_base64
        )
        
        print(f"Pièce créée - ID: {piece.id}, Type: {type_piece.libelle}")
        
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
        
        try:
            piece = Piece.objects.select_related('dossier_agent__agent', 'type_piece').get(id=piece_id)
        except Piece.DoesNotExist:
            return JsonResponse({'error': 'Document non trouvé'}, status=404)
        
        agent_demandeur = piece.dossier_agent.agent
        
        if agent_demandeur.matricule != matricule:
            try:
                agent = Agent.objects.get(matricule=matricule)
                roles = AgentRole.objects.filter(agent=agent).values_list('role__libelle', flat=True)
                if 'rh' not in roles and 'admin' not in roles:
                    return JsonResponse({'error': 'Non autorisé'}, status=403)
            except:
                return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        if not piece.cheminfichier:
            return JsonResponse({'error': 'Document vide ou corrompu'}, status=404)
        
        print(f"Téléchargement du document {piece.id} - {piece.nom_fichier}")
        
        mime_type = 'application/pdf'
        if piece.nom_fichier.lower().endswith(('.jpg', '.jpeg')):
            mime_type = 'image/jpeg'
        elif piece.nom_fichier.lower().endswith('.png'):
            mime_type = 'image/png'
        
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
    """Supprimer un document (agent propriétaire ou RH/admin)"""
    try:
        matricule = request.headers.get('X-User-Matricule')
        
        if not matricule:
            return JsonResponse({'error': 'Non autorisé'}, status=401)
        
        try:
            piece = Piece.objects.select_related('dossier_agent__agent').get(id=piece_id)
        except Piece.DoesNotExist:
            return JsonResponse({'error': 'Document non trouvé'}, status=404)
        
        agent_demandeur = Agent.objects.get(matricule=matricule)
        roles = AgentRole.objects.filter(agent=agent_demandeur).values_list('role__libelle', flat=True)
        
        est_proprietaire = piece.dossier_agent.agent.matricule == matricule
        est_rh_ou_admin = 'rh' in roles or 'admin' in roles
        
        if not est_proprietaire and not est_rh_ou_admin:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        dossier = piece.dossier_agent
        
        piece.delete()
        
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
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur delete_document: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== RH : ACCÈS AUX DOCUMENTS DES AGENTS ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_documents_by_matricule(request, matricule):
    """RH : Récupérer les documents de n'importe quel agent par matricule"""
    try:
        demandeur_matricule = request.headers.get('X-User-Matricule')
        if not demandeur_matricule:
            return JsonResponse({'error': 'Non autorisé'}, status=401)
        
        try:
            demandeur = Agent.objects.get(matricule=demandeur_matricule)
            roles = AgentRole.objects.filter(agent=demandeur).values_list('role__libelle', flat=True)
            if 'rh' not in roles and 'admin' not in roles:
                return JsonResponse({'error': 'Accès non autorisé'}, status=403)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Non autorisé'}, status=403)
        
        try:
            agent = Agent.objects.get(matricule=matricule)
        except Agent.DoesNotExist:
            return JsonResponse({'error': 'Agent non trouvé'}, status=404)
        
        dossier, created = DossierAgent.objects.get_or_create(
            agent=agent,
            defaults={'datecreation': date.today(), 'taux_completude': 0}
        )
        
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
                missing_documents.append({
                    'id': type_piece.id,
                    'libelle': type_piece.libelle,
                    'obligatoire': True
                })
        
        total_obligatoire = TypePiece.objects.filter(obligatoire=1).count()
        documents_obligatoires_uploades = len([d for d in documents if d['type_piece_id'] in 
            [tp.id for tp in types_pieces if tp.obligatoire == 1]])
        
        taux = round((documents_obligatoires_uploades / total_obligatoire) * 100) if total_obligatoire > 0 else 100
        dossier.taux_completude = taux
        dossier.save()
        
        return JsonResponse({
            'success': True,
            'agent': {
                'matricule': agent.matricule,
                'nom': agent.nom,
                'prenom': agent.prenom
            },
            'dossier': {
                'id': dossier.id,
                'date_creation': str(dossier.datecreation),
                'taux_completude': taux
            },
            'documents': documents,
            'missing_documents': missing_documents,
            'total_obligatoire': total_obligatoire,
            'total_uploades': len(documents)
        })
        
    except Exception as e:
        print(f"Erreur get_documents_by_matricule: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


# ==================== GESTION DES ANOMALIES ====================

@csrf_exempt
@require_http_methods(["GET"])
def detect_anomalies(request, matricule):
    """Détecte les anomalies dans le dossier d'un agent avec IA (Ollama)"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        dossier = DossierAgent.objects.filter(agent=agent).first()
        
        if not dossier:
            return JsonResponse({'anomalies': [], 'score': 100, 'ai_analysis': 'Aucun dossier trouvé.'})
        
        pieces = Piece.objects.filter(dossier_agent=dossier).select_related('type_piece')
        anomalies = []
        score = 100
        today = date.today()
        
        # 1. Dates incohérentes
        for piece in pieces:
            if piece.date_expiration and piece.date_upload:
                if piece.date_expiration < piece.date_upload:
                    anomalies.append({
                        'type': 'date_incoherente',
                        'severite': 'haute',
                        'message': f"Date d'expiration antérieure à la date d'upload pour {piece.type_piece.libelle}"
                    })
                    score -= 15
        
        # 3. Doublons
        type_ids = [p.type_piece.id for p in pieces]
        doublons = [type_id for type_id, count in Counter(type_ids).items() if count > 1]
        for type_id in doublons:
            pieces_doublons = pieces.filter(type_piece_id=type_id)
            noms = [p.nom_fichier for p in pieces_doublons]
            type_libelle = pieces_doublons.first().type_piece.libelle
            anomalies.append({
                'type': 'doublon',
                'severite': 'moyenne',
                'message': f'⚠️ Doublon : {len(noms)} versions de "{type_libelle}" - Fichiers : {", ".join(noms)}'
            })
            score -= 10
        
        # 4. Ancienneté vs grade
        if agent.date_prise_service and agent.echelon:
            anciennete = (today - agent.date_prise_service).days / 365
            try:
                echelon_num = int(agent.echelon.split('-')[0].replace('A', '').replace('B', '')) if agent.echelon else 1
            except:
                echelon_num = 1
            if anciennete > 10 and echelon_num < 3:
                anomalies.append({
                    'type': 'anciennete_grade',
                    'severite': 'basse',
                    'message': f'Ancienneté élevée ({anciennete:.0f} ans) mais échelon bas ({agent.echelon})'
                })
                score -= 5
        
        score = max(0, min(100, score))
        
        # 5. Analyse IA avec Ollama
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
                    'content': """Tu es un expert en ressources humaines. Analyse ce dossier et donne :
                        - Un résumé global (2-3 phrases)
                        - Les points critiques
                        - Des recommandations concrètes
                        - Une note de conformité sur 10
                        Réponds en français, avec des tirets."""
                }, {
                    'role': 'user',
                    'content': f"Analyse ce dossier administratif :\n\n{resume}"
                }]
            )
            ai_analysis = ai_response['message']['content']
        except Exception as e:
            print(f"Erreur Ollama: {e}")
            ai_analysis = "Analyse IA indisponible (Ollama non lancé)."
        
        return JsonResponse({
            'success': True,
            'agent': f"{agent.prenom} {agent.nom}",
            'anomalies': anomalies,
            'score': score,
            'total_anomalies': len(anomalies),
            'niveau_risque': 'faible' if score >= 80 else 'moyen' if score >= 50 else 'élevé',
            'ai_analysis': ai_analysis
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ==================== SIGNATURE ET CACHET ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_signature_cachet(request, matricule):
    """Récupérer la signature et le cachet d'un agent"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        
        return JsonResponse({
            'signature': agent.signature if hasattr(agent, 'signature') else None,
            'cachet': agent.cachet if hasattr(agent, 'cachet') else None
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def upload_signature(request, matricule):
    """Upload de la signature d'un agent"""
    try:
        data = json.loads(request.body)
        signature_base64 = data.get('signature')
        
        if not signature_base64:
            return JsonResponse({'error': 'Signature requise'}, status=400)
        
        agent = Agent.objects.get(matricule=matricule)
        agent.signature = signature_base64
        agent.save()
        
        return JsonResponse({'success': True, 'message': 'Signature enregistrée avec succès'})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur upload_signature: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def upload_cachet(request, matricule):
    """Upload du cachet d'un agent (DPAF, Chef, Admin uniquement)"""
    try:
        data = json.loads(request.body)
        cachet_base64 = data.get('cachet')
        
        if not cachet_base64:
            return JsonResponse({'error': 'Cachet requis'}, status=400)
        
        agent = Agent.objects.get(matricule=matricule)
        
        # Vérifier si l'agent a le droit d'avoir un cachet
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT r.libelle 
                FROM agent_role ar
                JOIN role r ON ar.role_id = r.id
                WHERE ar.agent_id = %s
            """, [agent.matricule])
            roles = [row[0] for row in cursor.fetchall()]
        
        roles_avec_cachet = ['dpaf', 'chef', 'admin']
        a_droit_cachet = any(role in roles_avec_cachet for role in roles)
        
        if not a_droit_cachet:
            return JsonResponse({'error': 'Vous n\'avez pas le droit d\'avoir un cachet officiel'}, status=403)
        
        agent.cachet = cachet_base64
        agent.save()
        
        return JsonResponse({'success': True, 'message': 'Cachet enregistré avec succès'})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"Erreur upload_cachet: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_signature(request, matricule):
    """Supprimer la signature d'un agent"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        agent.signature = None
        agent.save()
        
        return JsonResponse({'success': True, 'message': 'Signature supprimée'})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_cachet(request, matricule):
    """Supprimer le cachet d'un agent"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        agent.cachet = None
        agent.save()
        
        return JsonResponse({'success': True, 'message': 'Cachet supprimé'})
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_all_expired_documents(request):
    """Compter tous les documents expirés de tous les agents"""
    try:
        today = date.today()
        count = Piece.objects.filter(
            date_expiration__lte=today,
            valide=1
        ).count()
        
        return JsonResponse({
            'success': True,
            'total_expired': count
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def supprimer_notification(request, notification_id):
    """Supprimer définitivement une notification"""
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
    """Supprimer toutes les notifications d'un agent"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        deleted, _ = Notification.objects.filter(agent_id=agent.matricule).delete()
        return JsonResponse({'success': True, 'message': f'{deleted} notification(s) supprimée(s)'})
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_actes_a_envoyer_rh(request, matricule_rh):
    """Récupérer les actes générés non encore envoyés pour un RH spécifique"""
    try:
        print(f"=== get_actes_a_envoyer_rh for RH: {matricule_rh}")
        
        actes = ActeAdministratif.objects.filter(
            statut='genere',
            demande__agent_rh__matricule=matricule_rh
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
                    'date_generation': str(acte.date_generation)
                })
        
        print(f"✅ Total actes à envoyer pour RH {matricule_rh}: {len(result)}")
        return JsonResponse(result, safe=False)
        
    except Exception as e:
        print(f"ERREUR get_actes_a_envoyer_rh: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

# ---------- UTILITAIRES AVANCEMENT (inchangés) ----------
def ajouter_annees(date_source, nb_annees):
    """Ajoute nb_annees années à une date en conservant le jour/mois.
    Gère le 29 février → 28 février si l'année cible n'est pas bissextile."""
    try:
        return date_source.replace(year=date_source.year + nb_annees)
    except ValueError:
        return date_source.replace(year=date_source.year + nb_annees, day=28)

def get_type_echelon(echelon):
    """Extrait la lettre de catégorie (A, B, C, D)"""
    if echelon and len(echelon) > 0:
        return echelon[0].upper()
    return 'A'

def get_age_retraite(type_echelon):
    """Retourne l'âge légal de départ à la retraite selon la catégorie"""
    ages = {'A': 60, 'B': 58, 'C': 55, 'D': 55}
    return ages.get(type_echelon, 60)

def get_sous_indice(echelon):
    """Extrait le sous-indice (chiffre après le tiret) depuis un échelon comme A3-5 -> 5"""
    if echelon and '-' in echelon:
        try:
            return int(echelon.split('-')[1])
        except:
            return 1
    return 1

def get_partie_fixe(echelon):
    """Extrait la partie fixe avant le tiret (ex: A3-5 -> A3)"""
    if echelon and '-' in echelon:
        return echelon.split('-')[0]
    if echelon:
        return echelon
    return 'A1'

def calculer_nouvel_echelon(echelon_actuel):
    """Calcule le prochain échelon en incrémentant uniquement le sous-indice.
    Ex: A3-5 -> A3-6. Retourne None si >= 11"""
    if not echelon_actuel or '-' not in echelon_actuel:
        return f"{echelon_actuel or 'A1'}-2"
    
    partie_fixe = get_partie_fixe(echelon_actuel)
    sous_indice = get_sous_indice(echelon_actuel)
    nouveau = sous_indice + 1
    
    if nouveau > 11:
        return None  # plafonné
    
    return f"{partie_fixe}-{nouveau}"

def peut_avancer(agent, date_prevue):
    """Vérifie qu'à la date prévue l'agent n'a pas atteint l'âge de la retraite"""
    if not agent.date_naissance:
        return True
    type_echelon = get_type_echelon(agent.echelon or 'A1-1')
    age_retraite = get_age_retraite(type_echelon)
    date_retraite = agent.date_naissance.replace(
        year=agent.date_naissance.year + age_retraite
    )
    return date_prevue < date_retraite


# ---------- NOUVELLES FONCTIONS CORRIGÉES ----------

def actualiser_avancements():
    today = date.today()
    agents = Agent.objects.filter(date_prise_service__isnull=False)

    # ✅ Vider toute la table + reset auto_increment
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

            # ✅ NOUVEAU : mettre à jour l'échelon de l'agent si la date est arrivée
            dernier_date = ajouter_annees(agent.date_prise_service, premier_delai//365 + (nb_passes - 1) * 2)

            if dernier_date <= today:
                sous_actuel = get_sous_indice(agent.echelon or echelon_base)
                sous_calcule = get_sous_indice(echelon_courant)

                if sous_actuel < sous_calcule:
                    ancien_echelon = agent.echelon        # ← indenté sous le if
                    agent.echelon = echelon_courant
                    agent.save()

                    # Notifier l'agent en base
                    Notification.objects.create(
                        agent_id=agent.matricule,
                        message=f"📈 Votre échelon a été mis à jour : {ancien_echelon} → {echelon_courant}",
                        type_notification='avancement',
                        date_envoi=today,
                        lue=0
                    )

                    # Email à l'agent
                    envoyer_email_avancement_agent(
                        agent=agent,
                        echelon_ancien=ancien_echelon,
                        echelon_nouveau=echelon_courant,
                        date_effective=today,
                    )

                    # Notifier les RH + email RH
                    rh_agents = Agent.objects.filter(agentrole__role__libelle='rh', actif=1)
                    for rh in rh_agents:
                        Notification.objects.create(
                            agent_id=rh.matricule,
                            message=f"📈 Avancement effectué : {agent.prenom} {agent.nom} → {echelon_courant}",
                            type_notification='avancement',
                            date_envoi=today,
                            lue=0
                        )
                        envoyer_email_avancement_effectue(
                            rh=rh,
                            agent=agent,
                            echelon_ancien=ancien_echelon,
                            echelon_nouveau=echelon_courant,
                            date_effective=today,
                        )

            dernier_date_effective = dernier_date           # ← même niveau que le if dernier_date
            prochaine_date = ajouter_annees(dernier_date_effective, 2)

        # Générer les avancements futurs
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

def calculer_et_notifier():
    """Point d'entrée principal : actualise les avancements puis envoie les notifications."""
    today = date.today()
    actualiser_avancements()

    rh_agents = Agent.objects.filter(agentrole__role__libelle='rh', actif=1)

    # Notifications pour demain
    demain = today + timedelta(days=1)
    for av in Avancement.objects.filter(date_prevue=demain).select_related('agent'):
        for rh in rh_agents:
            Notification.objects.create(
                agent_id=rh.matricule,
                message=f"📈 Avancement de {av.agent.prenom} {av.agent.nom} demain - {av.echelon_ancien} → {av.echelon_nouveau}",
                type_notification='avancement',
                date_envoi=today, lue=0
            )
            envoyer_email_rappel_avancement(
                rh=rh,
                agent=av.agent,
                echelon_ancien=av.echelon_ancien,
                echelon_nouveau=av.echelon_nouveau,
                date_prevue=demain,
            )
    # Alertes à 3 mois, 1 mois, 1 semaine
    for jours, label in [(90, '3 mois'), (30, '1 mois'), (7, '1 semaine')]:
        date_alerte = today + timedelta(days=jours)
        for av in Avancement.objects.filter(date_prevue=date_alerte).select_related('agent'):
            for rh in rh_agents:
                Notification.objects.create(
                    agent_id=rh.matricule,
                    message=f"📈 Avancement de {av.agent.prenom} {av.agent.nom} dans {label} ({av.date_prevue})",
                    type_notification='avancement',
                    date_envoi=today, lue=0
                )

    print("✅ Actualisation des avancements terminée.")


@csrf_exempt
@require_http_methods(["GET"])
def trigger_avancements(request):
    """Appelée silencieusement par les dashboards RH et Agent pour vérifier/créer les avancements."""
    calculer_et_notifier()
    return JsonResponse({'success': True})

@csrf_exempt
@require_http_methods(["GET"])
def get_avancements_agent(request, matricule):
    """Historique des avancements d'un agent"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        avancements = Avancement.objects.filter(agent=agent).order_by('-date_prevue')
        result = []
        for a in avancements:
            result.append({
                'id': a.id,
                'date_prevue': str(a.date_prevue),
                'date_effective': str(a.date_effective) if a.date_effective else None,
                'type': a.type_avancement,
                'echelon_ancien': a.echelon_ancien,
                'echelon_nouveau': a.echelon_nouveau,
            })
        return JsonResponse(result, safe=False)
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)


@csrf_exempt
@require_http_methods(["GET"])
def get_avancements_periode(request):
    """Agenda des avancements par mois/année"""
    mois = request.GET.get('mois')
    annee = request.GET.get('annee')
    avancements = Avancement.objects.select_related('agent').all()
    if annee:
        avancements = avancements.filter(date_prevue__year=annee)
    if mois:
        avancements = avancements.filter(date_prevue__month=mois)
    avancements = avancements.order_by('date_prevue')
    result = []
    for a in avancements:
        result.append({
            'id': a.id,
            'agent_matricule': a.agent.matricule,
            'agent_nom': f"{a.agent.prenom} {a.agent.nom}",
            'agent_direction': a.agent.direction,
            'date_prevue': str(a.date_prevue),
            'type': a.type_avancement,
            'echelon_ancien': a.echelon_ancien,
            'echelon_nouveau': a.echelon_nouveau,
        })
    return JsonResponse(result, safe=False)


@csrf_exempt
@require_http_methods(["GET"])
def check_alertes_avancement(request):
    today = date.today()
    date_limite = today + timedelta(days=90)
    avancements = Avancement.objects.filter(
        date_prevue__gte=today,
        date_prevue__lte=date_limite,
        type_avancement='normal'
    ).select_related('agent').order_by('date_prevue')

    alertes = []
    for a in avancements:
        jours_restants = (a.date_prevue - today).days
        alertes.append({
            'id': a.id,
            'agent': f"{a.agent.prenom} {a.agent.nom}",
            'matricule': a.agent.matricule,
            'direction': a.agent.direction,
            'date_prevue': str(a.date_prevue),
            'delai': f"{jours_restants} jour(s)" if jours_restants > 0 else "Aujourd'hui",
            'jours_restants': jours_restants,
        })
    return JsonResponse({'success': True, 'total_alertes': len(alertes), 'alertes': alertes})


@csrf_exempt
@require_http_methods(["GET"])
def generer_bordereau(request):
    """Bordereau avec filtres mois/année"""
    mois = request.GET.get('mois')
    annee = request.GET.get('annee', str(date.today().year))
    avancements = Avancement.objects.select_related('agent').all()
    if annee:
        avancements = avancements.filter(date_prevue__year=annee)
    if mois:
        avancements = avancements.filter(date_prevue__month=mois)
    avancements = avancements.order_by('date_prevue')
    result = []
    for a in avancements:
        result.append({
            'matricule': a.agent.matricule,
            'nom': a.agent.nom,
            'prenom': a.agent.prenom,
            'direction': a.agent.direction,
            'poste': a.agent.poste,
            'date_prise_service': str(a.agent.date_prise_service),
            'date_avancement': str(a.date_prevue),
            'type': a.type_avancement,
            'echelon_actuel': a.echelon_ancien,
            'echelon_propose': a.echelon_nouveau,
        })
    totaux = {}
    for r in result:
        direction = r['direction'] or 'Non renseignée'
        totaux[direction] = totaux.get(direction, 0) + 1
    return JsonResponse({
        'success': True,
        'annee': annee,
        'mois': mois,
        'total': len(result),
        'totaux_par_direction': totaux,
        'avancements': result
    })

@csrf_exempt
@require_http_methods(["GET"])
def get_actes_by_agent(request, matricule):
    """Récupérer tous les actes d'un agent"""
    try:
        actes = ActeAdministratif.objects.filter(
            demande__agent__matricule=matricule
        ).select_related('demande__agent').order_by('-date_generation')
        
        result = []
        for acte in actes:
            result.append({
                'id': acte.reference,
                'reference': acte.reference,
                'type_acte': acte.type_acte,
                'statut': acte.statut,
                'date_generation': acte.date_generation.strftime('%d/%m/%Y'),
                'demande_id': acte.demande.id if acte.demande else None
            })
        
        print(f"✅ {len(result)} actes trouvés pour l'agent {matricule}")
        return JsonResponse(result, safe=False)
    except Exception as e:
        print(f"ERREUR get_actes_by_agent: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def generer_attestation_validite_services(request):
    """Générer une attestation de validité de services avec signature et cachet DPAF"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        
        agent = Agent.objects.get(matricule=matricule)
        
        # Récupérer le DPAF pour signature et cachet
        dpaf = Agent.objects.filter(
            agentrole__role__libelle='dpaf',
            actif=1
        ).first()
        
        if not dpaf:
            return JsonResponse({'error': 'Aucun DPAF trouvé pour signer'}, status=500)
        
        nom_complet = f"{agent.nom} {agent.prenom}".upper()
        poste = agent.poste or 'Agent'
        
        # ✅ Extraire la catégorie, l'échelon et l'échelle à partir du champ echelon (ex: A2-5)
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
        
        # ✅ Calcul de la date de retraite selon la catégorie
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
        
        # Date de prise de service
        if agent.date_prise_service:
            date_prise_service = agent.date_prise_service.strftime('%d %B %Y')
            for en, fr in mois_fr.items():
                date_prise_service = date_prise_service.replace(en, fr)
        else:
            date_prise_service = 'date non renseignée'
        
        date_aujourdhui = datetime.now().strftime('%d/%m/%Y')
        
        # Numéro seul pour la référence
        ref_number = f"{datetime.now().year}{datetime.now().strftime('%m%d%H%M%S')}"
        reference = ref_number
        
        # Template Word
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

        # ✅ Ajouter signature et cachet du DPAF (alignés à droite)
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        
        signature_base64 = dpaf.signature if hasattr(dpaf, 'signature') and dpaf.signature else None
        cachet_base64 = dpaf.cachet if hasattr(dpaf, 'cachet') and dpaf.cachet else None
        
        # Chercher le nom du signataire
        signataire_nom = 'Augustine Tognissè CAKPO SOGLO'
        
        for paragraph in doc.paragraphs:
            if signataire_nom in paragraph.text:
                nom_texte = paragraph.text
                paragraph.clear()
                
                # ✅ Aligner le paragraphe à droite
                paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                
                # Signature (taille 130)
                run_sig = paragraph.add_run()
                if signature_base64:
                    try:
                        if ',' in signature_base64:
                            signature_base64 = signature_base64.split(',')[1]
                        sig_bytes = base64.b64decode(signature_base64)
                        sig_stream = io.BytesIO(sig_bytes)
                        run_sig.add_picture(sig_stream, width=Pt(130))
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                        run_sig.text = ""
                
                # Cachet (taille 90) - collé à la signature
                run_cachet = paragraph.add_run()
                if cachet_base64:
                    try:
                        if ',' in cachet_base64:
                            cachet_base64 = cachet_base64.split(',')[1]
                        cachet_bytes = base64.b64decode(cachet_base64)
                        cachet_stream = io.BytesIO(cachet_bytes)
                        run_cachet.add_picture(cachet_stream, width=Pt(90))
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                        run_cachet.text = ""
                
                # Saut de ligne
                paragraph.add_run().add_break()
                
                # Nom en dessous (aussi aligné à droite)
                run_nom = paragraph.add_run(nom_texte)
                run_nom.bold = True
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
        
        TypeDemande.objects.get_or_create(
            libelle='Attestation',
            defaults={'acte_generable': 1}
        )
        
        return _create_pdf_response(pdf_bytes, f'Attestation_Validite_Services_{agent.nom}_{agent.prenom}')
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR generer_attestation_validite_services: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def generer_certificat_non_jouissance(request):
    """Générer un certificat de non-jouissance de congé pour une année donnée"""
    try:
        data = json.loads(request.body)
        matricule = data.get('matricule')
        annee = data.get('annee', datetime.now().year)
        
        agent = Agent.objects.get(matricule=matricule)
        
        # ✅ Vérifier si l'agent a bénéficié d'un congé pour l'année demandée
        # Inclure tous les statuts sauf 'refuse', 'rejete', 'annule'
        conges_valides = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            demandeconge__date_debut__year=annee
        ).exclude(statut__in=['refuse', 'rejete', 'annule'])
        
        a_bteneficie_conge = conges_valides.exists()
        
        # Ajout de logs pour déboguer
        print(f"=== GENERATION CERTIFICAT - {agent.nom} {agent.prenom} ===")
        print(f"Année demandée: {annee}")
        print(f"Nombre de congés trouvés: {conges_valides.count()}")
        for c in conges_valides:
            print(f"  - Congé ID: {c.id}, Statut: {c.statut}, Début: {c.demandeconge.date_debut if hasattr(c, 'demandeconge') else '?'}")
        
        # Si l'agent a bénéficié d'un congé, on ne peut pas délivrer le certificat
        if a_bteneficie_conge:
            jours_pris = 0
            for c in conges_valides:
                if hasattr(c, 'demandeconge') and c.demandeconge:
                    jours_pris += c.demandeconge.nombrejours
            return JsonResponse({
                'error': f"Impossible de délivrer le certificat. L'agent a bénéficié d'un congé de {jours_pris} jours en {annee}."
            }, status=400)
        
        # Récupérer le DPAF pour signature et cachet
        dpaf = Agent.objects.filter(
            agentrole__role__libelle='dpaf',
            actif=1
        ).first()
        
        if not dpaf:
            return JsonResponse({'error': 'Aucun DPAF trouvé pour signer'}, status=500)
        
        # Déterminer le titre (Madame/Monsieur)
        civilite = "Madame" if agent.prenom.endswith('e') or agent.nom.endswith('e') else "Monsieur"
        
        nom_complet = f"{agent.prenom} {agent.nom}"
        poste = agent.poste or 'Agent'
        
        date_aujourdhui = datetime.now().strftime('%d/%m/%Y')
        
        # ✅ Numéro seul pour la référence
        ref_number = f"{datetime.now().year}{datetime.now().strftime('%m%d%H%M%S')}"
        reference = ref_number
        
        # Template Word
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

        # ✅ Ajouter signature et cachet du DPAF (alignés à droite)
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        
        signature_base64 = dpaf.signature if hasattr(dpaf, 'signature') and dpaf.signature else None
        cachet_base64 = dpaf.cachet if hasattr(dpaf, 'cachet') and dpaf.cachet else None
        
        # Chercher le nom du signataire
        signataire_nom = 'Augustine Tognissè CAKPO SOGLO'
        
        for paragraph in doc.paragraphs:
            if signataire_nom in paragraph.text:
                nom_texte = paragraph.text
                paragraph.clear()
                
                # Aligner à droite
                paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                
                # Signature (taille 130)
                run_sig = paragraph.add_run()
                if signature_base64:
                    try:
                        if ',' in signature_base64:
                            signature_base64 = signature_base64.split(',')[1]
                        sig_bytes = base64.b64decode(signature_base64)
                        sig_stream = io.BytesIO(sig_bytes)
                        run_sig.add_picture(sig_stream, width=Pt(130))
                        print("✅ Signature ajoutée")
                    except Exception as e:
                        print(f"Erreur signature: {e}")
                        run_sig.text = ""
                
                # Petit espace entre signature et cachet
                paragraph.add_run(" ")
                
                # Cachet (taille 90)
                run_cachet = paragraph.add_run()
                if cachet_base64:
                    try:
                        if ',' in cachet_base64:
                            cachet_base64 = cachet_base64.split(',')[1]
                        cachet_bytes = base64.b64decode(cachet_base64)
                        cachet_stream = io.BytesIO(cachet_bytes)
                        run_cachet.add_picture(cachet_stream, width=Pt(90))
                        print("✅ Cachet ajouté")
                    except Exception as e:
                        print(f"Erreur cachet: {e}")
                        run_cachet.text = ""
                
                # Saut de ligne
                paragraph.add_run().add_break()
                
                # Nom en dessous (aligné à droite)
                run_nom = paragraph.add_run(nom_texte)
                run_nom.bold = True
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
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def verifier_conge_par_annee(request, matricule, annee):
    """Vérifier si l'agent a bénéficié d'un congé pour une année donnée"""
    try:
        agent = Agent.objects.get(matricule=matricule)
        
        print(f"=== Vérification pour {matricule}, année {annee} ===")
        
        # Afficher TOUS les congés de l'agent pour déboguer
        tous_les_conges = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé'
        )
        print("TOUS LES CONGÉS DE L'AGENT:")
        for c in tous_les_conges:
            print(f"  ID: {c.id}, Statut: {c.statut}, Début: {c.demandeconge.date_debut if hasattr(c, 'demandeconge') else '?'}")
        
        # Filtre pour l'année demandée
        conges_valides = Demande.objects.filter(
            agent=agent,
            type_demande__libelle='Congé',
            demandeconge__date_debut__year=annee
        ).exclude(statut__in=['refuse', 'rejete', 'annule'])
        
        a_bteneficie = conges_valides.exists()
        jours_pris = 0
        
        print(f"Congés trouvés pour {annee}: {conges_valides.count()}")
        for c in conges_valides:
            jours = c.demandeconge.nombrejours if hasattr(c, 'demandeconge') else 0
            print(f"  - Demande ID: {c.id}, Statut: {c.statut}, Jours: {jours}")
            jours_pris += jours
        
        return JsonResponse({
            'success': True,
            'a_bteneficie': a_bteneficie,
            'jours_pris': jours_pris,
            'peut_obtenir_certificat': not a_bteneficie
        })
        
    except Agent.DoesNotExist:
        return JsonResponse({'error': 'Agent non trouvé'}, status=404)
    except Exception as e:
        print(f"ERREUR verifier_conge_par_annee: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_demandes_historique_dpaf(request, matricule_dpaf):
    """Récupérer toutes les demandes (historique complet)"""
    try:
        # ❌ AVANT : filtré par statuts finaux
        # demandes = Demande.objects.filter(statut__in=['termine', 'signe', 'remis', 'refuse'])
        
        # ✅ APRÈS : toutes les demandes, sans filtre
        demandes = Demande.objects.select_related(
            'agent', 'type_demande', 'agent_rh'
        ).order_by('-date_soumission')
        
        result = []
        for d in demandes:
            # Récupérer l'agent RH s'il existe
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

# ==================== ARCHIVAGE ====================

@csrf_exempt
@require_http_methods(["GET"])
def get_actes_archives(request):
    """Récupérer les actes à archiver ET déjà archivés"""
    try:
        # ✅ MAINTENANT : inclut aussi les actes déjà archivés
        actes = ActeAdministratif.objects.filter(
            statut__in=['termine', 'signe', 'remis', 'archive']
        ).select_related('demande__agent').order_by('-date_generation')
        
        result = []
        for a in actes:
            if a.demande:
                result.append({
                    'reference': a.reference,
                    'type_acte': a.type_acte,
                    'agent_nom': a.demande.agent.nom,
                    'agent_prenom': a.demande.agent.prenom,
                    'agent_matricule': a.demande.agent.matricule,
                    'agent_direction': a.demande.agent.direction or 'Non renseignée',
                    'date_generation': str(a.date_generation) if a.date_generation else None,
                    'statut': a.statut,
                })
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def archiver_acte(request, reference):
    """Archiver un acte (changer son statut à 'archive')"""
    try:
        acte = ActeAdministratif.objects.get(reference=reference)
        acte.statut = 'archive'
        acte.save()
        return JsonResponse({'success': True, 'message': f'Acte {reference} archivé avec succès'})
    except ActeAdministratif.DoesNotExist:
        return JsonResponse({'error': 'Acte non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)