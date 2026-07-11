from django.test import SimpleTestCase, override_settings

from monapp.emails import resolve_email_backend
from monapp.views import normalize_matricule


class EmailBackendTests(SimpleTestCase):
    @override_settings(EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='')
    def test_uses_console_backend_when_smtp_credentials_missing(self):
        self.assertEqual(resolve_email_backend(), 'django.core.mail.backends.console.EmailBackend')

    @override_settings(EMAIL_HOST_USER='demo@example.com', EMAIL_HOST_PASSWORD='secret')
    def test_uses_smtp_backend_when_credentials_present(self):
        self.assertEqual(resolve_email_backend(), 'django.core.mail.backends.smtp.EmailBackend')


class MatriculeNormalizationTests(SimpleTestCase):
    def test_normalize_matricule_returns_empty_for_nullish_values(self):
        self.assertEqual(normalize_matricule(None), '')
        self.assertEqual(normalize_matricule(''), '')
        self.assertEqual(normalize_matricule('null'), '')
        self.assertEqual(normalize_matricule('undefined'), '')
        self.assertEqual(normalize_matricule('  '), '')

    def test_normalize_matricule_preserves_valid_values(self):
        self.assertEqual(normalize_matricule('A123'), 'A123')
        self.assertEqual(normalize_matricule('  A123  '), 'A123')
