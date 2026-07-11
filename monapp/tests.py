from django.test import SimpleTestCase, override_settings

from monapp.emails import resolve_email_backend


class EmailBackendTests(SimpleTestCase):
    @override_settings(EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='')
    def test_uses_console_backend_when_smtp_credentials_missing(self):
        self.assertEqual(resolve_email_backend(), 'django.core.mail.backends.console.EmailBackend')

    @override_settings(EMAIL_HOST_USER='demo@example.com', EMAIL_HOST_PASSWORD='secret')
    def test_uses_smtp_backend_when_credentials_present(self):
        self.assertEqual(resolve_email_backend(), 'django.core.mail.backends.smtp.EmailBackend')
