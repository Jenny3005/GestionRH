# monapp/middleware.py
from django.http import HttpResponse
import logging

logger = logging.getLogger(__name__)


class IgnoreBadRequestsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            if request.method not in ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'):
                logger.warning(f"Ignored bad request: {request.method}")
                return HttpResponse(status=200)
        except Exception as e:
            logger.error(f"Error processing request: {e}")
            return HttpResponse(status=200)

        return self.get_response(request)


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = (
            'accelerometer=(), autoplay=(), camera=(), display-capture=(), '
            'fullscreen=(), geolocation=(), gyroscope=(), microphone=(), '
            'payment=(), usb=()'
        )
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; base-uri 'self'; object-src 'none'; "
            "frame-ancestors 'self'; form-action 'self'; "
            "img-src 'self' data: https:; script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; font-src 'self' data:; "
            "connect-src 'self' https://gestionrh-gnxw.onrender.com http://localhost:8000 http://localhost:5173"
        )

        return response