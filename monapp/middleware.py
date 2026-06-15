# monapp/middleware.py
from django.http import HttpResponse
import logging

logger = logging.getLogger(__name__)

class IgnoreBadRequestsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Vérifier si la requête est malformée
        try:
            # Essayer de lire la méthode HTTP
            if request.method not in ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'):
                # Requête malformée, ignorer
                logger.warning(f"Ignored bad request: {request.method}")
                return HttpResponse(status=200)  # ← Répondre 200 au lieu de planter
            
            # Vérifier le protocole
            if hasattr(request, 'scheme') and request.scheme == 'https':
                # Convertir en HTTP
                request._scheme = 'http'
                
        except Exception as e:
            logger.error(f"Error processing request: {e}")
            return HttpResponse(status=200)  # ← Répondre 200 pour les requêtes invalides
            
        return self.get_response(request)