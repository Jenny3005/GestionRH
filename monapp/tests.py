import os
import shutil
import tempfile

from django.test import SimpleTestCase, override_settings

from django.db import connection
from monapp.emails import resolve_email_backend
from monapp.views import normalize_matricule, save_uploaded_file_bytes, _verifier_completude_dossier, _synchroniser_champs_demande


class EmailBackendTests(SimpleTestCase):
    @override_settings(EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='', EMAIL_BACKEND='django.core.mail.backends.console.EmailBackend')
    def test_uses_console_backend_when_smtp_credentials_missing(self):
        self.assertEqual(resolve_email_backend(), 'django.core.mail.backends.console.EmailBackend')

    @override_settings(EMAIL_BACKEND='monapp.email_backend.SendGridEmailBackend', SENDGRID_API_KEY='SG.fakekey')
    def test_uses_sendgrid_backend_when_configured(self):
        self.assertEqual(resolve_email_backend(), 'monapp.email_backend.SendGridEmailBackend')

    @override_settings(EMAIL_HOST_USER='demo@example.com', EMAIL_HOST_PASSWORD='secret', EMAIL_BACKEND='')
    def test_defaults_to_console_backend_when_no_backend_is_explicit(self):
        self.assertEqual(resolve_email_backend(), 'django.core.mail.backends.console.EmailBackend')

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', SENDGRID_API_KEY='SG.fakekey')
    def test_prefers_sendgrid_backend_when_sendgrid_key_present(self):
        self.assertEqual(resolve_email_backend(), 'monapp.email_backend.SendGridEmailBackend')


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


class PieceFieldTests(SimpleTestCase):
    def test_piece_cheminfichier_column_is_text(self):
        with connection.cursor() as cursor:
            cursor.execute("SHOW COLUMNS FROM piece LIKE 'cheminfichier'")
            column = cursor.fetchone()

        self.assertIsNotNone(column)
        self.assertIn('text', column[1].lower())


class DocumentUploadStorageTests(SimpleTestCase):
    def test_save_uploaded_file_bytes_persists_file_to_disk(self):
        temp_dir = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=temp_dir):
                file_bytes = b'%PDF-1.4\n%test'
                file_path = save_uploaded_file_bytes(file_bytes, 'test.pdf', subdir='documents', prefix='doc')

                self.assertTrue(os.path.exists(file_path))
                with open(file_path, 'rb') as handle:
                    self.assertEqual(handle.read(), file_bytes)
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


class DossierCompletudeTests(SimpleTestCase):
    def test_verifier_completude_accepts_zero_percent_dossier(self):
        with self.settings(DATABASES={'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}):
            from monapp.models import Agent, DossierAgent

            agent = Agent.objects.create(matricule='TEST001', prenom='Test', nom='Agent')
            DossierAgent.objects.create(agent=agent, taux_completude=0)

            ok, message = _verifier_completude_dossier(agent.matricule, seuil=0.6)

            self.assertTrue(ok)
            self.assertEqual(message, 'Dossier suffisamment complet')


class DemandeFieldSyncTests(SimpleTestCase):
    def test_synchroniser_champs_demande_populates_request_fields(self):
        class DummyDemande:
            def __init__(self):
                self.annee = None
                self.jours_consommes = None
                self.jours_restants = None
                self.saved_fields = None

            def save(self, update_fields=None):
                self.saved_fields = update_fields

        class DummySolde:
            jours_acquis = 30
            jours_pris = 5

        demande = DummyDemande()
        solde = DummySolde()

        _synchroniser_champs_demande(demande, 4, 2026, solde)

        self.assertEqual(demande.annee, 2026)
        self.assertEqual(demande.jours_consommes, 4)
        self.assertEqual(demande.jours_restants, 25)
        self.assertEqual(demande.saved_fields, ['annee', 'jours_consommes', 'jours_restants'])
