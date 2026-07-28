"""
Backend email personnalisé pour SendGrid API (au lieu du SMTP bloqué par Render).
"""
from django.core.mail.backends.base import BaseEmailBackend
from django.conf import settings
import requests
import json
from typing import List
import logging

logger = logging.getLogger(__name__)


class SendGridEmailBackend(BaseEmailBackend):
    """Backend email utilisant l'API REST SendGrid (HTTPS port 443)."""
    
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently)
        self.api_key = getattr(settings, 'SENDGRID_API_KEY', '')
        self.api_url = 'https://api.sendgrid.com/v3/mail/send'
        
        if not self.api_key:
            logger.warning("SENDGRID_API_KEY non configurée")
    
    def send_messages(self, email_messages):
        """Envoie une liste de messages via l'API SendGrid."""
        if not self.api_key:
            logger.error('SENDGRID_API_KEY non configurée, impossible d\'envoyer les emails via SendGrid')
            if not self.fail_silently:
                raise ValueError("SENDGRID_API_KEY non configurée")
            return 0
        
        num_sent = 0
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }
        
        for message in email_messages:
            try:
                payload = self._build_payload(message)
                response = requests.post(
                    self.api_url,
                    headers=headers,
                    json=payload,
                    timeout=20
                )
                
                if response.status_code in [200, 201, 202]:
                    num_sent += 1
                    logger.info(f"✅ Email envoyé via SendGrid: {message.to}")
                else:
                    error_msg = f"SendGrid API error {response.status_code}: {response.text}"
                    logger.error(error_msg)
                    if not self.fail_silently:
                        raise Exception(error_msg)
                        
            except Exception as e:
                logger.error(f"❌ Erreur SendGrid pour {message.to}: {str(e)}")
                if not self.fail_silently:
                    raise
        
        return num_sent
    
    def _build_payload(self, message):
        """Construit le payload JSON pour l'API SendGrid."""
        return {
            'personalizations': [
                {
                    'to': [{'email': recipient} for recipient in message.to],
                    'subject': message.subject,
                }
            ],
            'from': {
                'email': message.from_email,
            },
            'content': [
                {
                    'type': 'text/plain',
                    'value': message.body,
                },
            ] + (
                [{'type': 'text/html', 'value': message.alternatives[0][0]}]
                if message.alternatives and message.alternatives[0][1] == 'text/html'
                else []
            ),
        }
