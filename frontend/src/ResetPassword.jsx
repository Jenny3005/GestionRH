import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LayoutDashboard, Settings2, Users, ShieldCheck, FileText, FilePlus2, UserCircle2, LogOut, ChevronDown, ChevronRight, MapPin, Phone, Mail, UserRound } from 'lucide-react';
import './App.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  // Étape 1: Demander le code
  const handleRequestCode = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('/api/forgot-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message });
        setStep(2);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur de connexion au serveur' });
    }

    setIsLoading(false);
  };

  // Étape 2: Vérifier le code
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('/api/verify-reset-code/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message });
        setStep(3);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur de connexion au serveur' });
    }

    setIsLoading(false);
  };

  // Étape 3: Réinitialiser le mot de passe
  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Le mot de passe doit contenir au moins 6 caractères' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas' });
      return;
    }

    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('/api/reset-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code,
          new_password: newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message });
        setTimeout(() => {
          navigate('/auth');
        }, 3000);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur de connexion au serveur' });
    }

    setIsLoading(false);
  };

  return (
    <div className="auth-page-wrapper">
      {/* ===== NAVBAR ===== */}
      <nav className="auth-navbar">
        <div className="auth-navbar-left">
          <a href="/" className="logo-nav-link">
            <img src="/logo2.png" alt="Logo MND" className="oo" />
          </a>
        </div>
      </nav>

      {/* ===== FORMULAIRE ===== */}
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">
              {step === 1 && ' Réinitialisation du mot de passe'}
              {step === 2 && ' Vérification du code'}
              {step === 3 && ' Nouveau mot de passe'}
            </h1>
            <p className="auth-subtitle-reset">
              {step === 1 && 'Entrez votre email pour recevoir un code de réinitialisation'}
              {step === 2 && 'Saisissez le code à 6 chiffres reçu par email'}
              {step === 3 && 'Créez votre nouveau mot de passe (minimum 6 caractères)'}
            </p>
          </div>

          {/* Message */}
          {message.text && (
            <div className={`reset-message ${message.type}`}>
              {message.type === 'success' ? '' : ''} {message.text}
            </div>
          )}

          {/* Étape 1: Demander le code */}
          {step === 1 && (
            <form onSubmit={handleRequestCode} className="auth-form">
              <div className="form-group">
                <label htmlFor="resetEmail">Adresse email <span className="required">*</span></label>
                <input
                  type="email"
                  id="resetEmail"
                  placeholder="Ex: jean.dupont@numerique.gouv.bj"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
                <small className="form-hint">Entrez l'email associé à votre compte agent</small>
              </div>

              <div className="reset-actions">
                <button type="button" className="btn-reset-back" onClick={() => navigate('/auth')} disabled={isLoading}>
                  ← Retour
                </button>
                <button type="submit" className="btn-reset-submit" disabled={isLoading}>
                  {isLoading ? 'Envoi en cours...' : 'Envoyer le code'}
                </button>
              </div>
            </form>
          )}

          {/* Étape 2: Vérifier le code */}
          {step === 2 && (
            <form onSubmit={handleVerifyCode} className="auth-form">
              <div className="form-group">
                <label htmlFor="resetCode">Code de vérification <span className="required">*</span></label>
                <input
                  type="text"
                  id="resetCode"
                  placeholder="Ex: 123456"
                  maxLength="6"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  disabled={isLoading}
                />
                <small className="form-hint">Un code à 6 chiffres a été envoyé à votre email</small>
              </div>

              <div className="reset-actions">
                <button type="button" className="btn-reset-back" onClick={() => setStep(1)} disabled={isLoading}>
                  ← Retour
                </button>
                <button type="submit" className="btn-reset-submit" disabled={isLoading}>
                  {isLoading ? 'Vérification...' : 'Vérifier le code'}
                </button>
              </div>
            </form>
          )}

          {/* Étape 3: Nouveau mot de passe */}
          {step === 3 && (
            <form onSubmit={handleResetPassword} className="auth-form">
              <div className="form-group">
                <label htmlFor="resetNewPassword">Nouveau mot de passe <span className="required">*</span></label>
                <input
                  type="password"
                  id="resetNewPassword"
                  placeholder="•••••••• (minimum 6 caractères)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="resetConfirmPassword">Confirmer le mot de passe <span className="required">*</span></label>
                <input
                  type="password"
                  id="resetConfirmPassword"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="reset-actions">
                <button type="button" className="btn-reset-back" onClick={() => setStep(2)} disabled={isLoading}>
                  ← Retour
                </button>
                <button type="submit" className="btn-reset-submit" disabled={isLoading}>
                  {isLoading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <footer className="mnd-grand-footer">
        <div className="benin-national-tricolor-line"></div>
        <div className="footer-main-content">
          <div className="footer-centered-logo-zone">
            <img src="/logo2.png" alt="Logo MND" className="footer-logo-official-center" />
            <p className="brand-motto-centered">Ministère du Numérique et de la Digitalisation — République du Bénin</p>
          </div>
          <div className="footer-columns-grid">
            <div className="footer-col">
              <h4>Navigation Portail</h4>
              <ul>
                <li><a href="#carriere">Mon Profil & Carrière</a></li>
                <li><a href="#demarches">Démarches en Ligne</a></li>
                <li><a href="#documents">Documents & Notes</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Liens Utiles</h4>
              <ul>
                <li><a href="https://www.numerique.gouv.bj" target="_blank">Portail du Ministère</a></li>
                <li><a href="https://eservices.travail.gouv.bj" target="_blank">E-Services SIGRH</a></li>
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-018/" target="_blank">Statut de l'Agent (SGG)</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Contact & Situation</h4>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><MapPin size={16} style={{ color: '#D4AF37' }} /> Avenue Jean-Paul II, Cotonou, Bénin</p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><Phone size={16} style={{ color: '#D4AF37' }} /> +229 21 30 70 13</p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><Mail size={16} style={{ color: '#D4AF37' }} /> numerique@gouv.bj</p>
            </div>
          </div>
        </div>
        <div className="footer-bottom-bar">
          <p>© 2026 Ministère du Numérique et de la Digitalisation — République du Bénin.</p>
        </div>
      </footer>
    </div>
  );
}