# backend/emails.py
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from datetime import date


def _envoyer_email(sujet, template, context, destinataire):
    """
    Fonction centrale d'envoi d'email.
    Retourne (True, None) si succès, (False, message_erreur) si échec.
    """
    if not destinataire or '@' not in destinataire:
        return False, f"Email invalide ou manquant : '{destinataire}'"

    try:
        html_message = render_to_string(template, context)
        plain_message = strip_tags(html_message)

        send_mail(
            subject=sujet,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[destinataire],
            html_message=html_message,
            fail_silently=False,
        )
        return True, None

    except Exception as e:
        return False, str(e)


def envoyer_email_activation(agent):
    """
    Email envoyé à un nouvel agent pour activer son compte.
    Utilisé par register() et import_agents().
    """
    activation_link = f"{settings.FRONTEND_URL}/activate?matricule={agent.matricule}"

    context = {
        'prenom': agent.prenom,
        'nom': agent.nom,
        'matricule': agent.matricule,
        'email': agent.email,
        'activation_link': activation_link,
    }

    succes, erreur = _envoyer_email(
        sujet='Activation de votre compte MND',
        template='emails/activation_email.html',
        context=context,
        destinataire=agent.email,
    )

    if succes:
        print(f"✅ Email activation envoyé à {agent.email}")
    else:
        print(f"❌ Erreur email activation pour {agent.email} : {erreur}")

    return succes, erreur


def envoyer_email_rappel_avancement(rh, agent, echelon_ancien, echelon_nouveau, date_prevue):
    """
    Email envoyé aux RH pour rappeler un avancement prévu demain.
    """
    context = {
        'rh_prenom': rh.prenom,
        'agent_nom': f"{agent.prenom} {agent.nom}",
        'agent_matricule': agent.matricule,
        'echelon_ancien': echelon_ancien,
        'echelon_nouveau': echelon_nouveau,
        'date_prevue': date_prevue.strftime('%d/%m/%Y'),
    }

    succes, erreur = _envoyer_email(
        sujet=f'Rappel avancement - {agent.prenom} {agent.nom}',
        template='emails/rappel_avancement.html',
        context=context,
        destinataire=rh.email,
    )

    if not succes:
        print(f"⚠️ Erreur email rappel avancement pour {rh.email} : {erreur}")

    return succes, erreur


def envoyer_email_avancement_effectue(rh, agent, echelon_ancien, echelon_nouveau, date_effective):
    """
    Email envoyé aux RH quand un échelon est automatiquement mis à jour.
    """
    context = {
        'rh_prenom': rh.prenom,
        'agent_nom': f"{agent.prenom} {agent.nom}",
        'agent_matricule': agent.matricule,
        'echelon_ancien': echelon_ancien,
        'echelon_nouveau': echelon_nouveau,
        'date_effective': date_effective.strftime('%d/%m/%Y'),
    }

    succes, erreur = _envoyer_email(
        sujet=f'Avancement effectué - {agent.prenom} {agent.nom}',
        template='emails/avancement_effectue.html',
        context=context,
        destinataire=rh.email,
    )

    if not succes:
        print(f"⚠️ Erreur email avancement effectué pour {rh.email} : {erreur}")

    return succes, erreur

def envoyer_email_avancement_agent(agent, echelon_ancien, echelon_nouveau, date_effective):
    """
    Email envoyé à l'agent quand son échelon est mis à jour.
    """
    context = {
        'prenom': agent.prenom,
        'nom': agent.nom,
        'matricule': agent.matricule,
        'echelon_ancien': echelon_ancien,
        'echelon_nouveau': echelon_nouveau,
        'date_effective': date_effective.strftime('%d/%m/%Y'),
    }

    succes, erreur = _envoyer_email(
        sujet='Votre échelon a été mis à jour - MND',
        template='emails/avancement_agent.html',
        context=context,
        destinataire=agent.email,
    )

    if succes:
        print(f"✅ Email avancement envoyé à l'agent {agent.email}")
    else:
        print(f"⚠️ Erreur email avancement agent {agent.email} : {erreur}")

    return succes, erreur

def envoyer_email_anniversaire(agent):
    """
    Envoie un email de joyeux anniversaire à un agent.
    """
    context = {
        'prenom': agent.prenom,
        'nom': agent.nom,
        'matricule': agent.matricule,
        'age': (date.today().year - agent.date_naissance.year) if agent.date_naissance else '?',
    }

    succes, erreur = _envoyer_email(
        sujet='🎂 Joyeux anniversaire !',
        template='emails/anniversaire.html',
        context=context,
        destinataire=agent.email,
    )

    if succes:
        print(f"✅ Email anniversaire envoyé à {agent.email}")
    else:
        print(f"❌ Erreur email anniversaire pour {agent.email} : {erreur}")

    return succes, erreur