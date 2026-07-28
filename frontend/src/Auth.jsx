import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getDashboardPath, normalizeRole } from './PortalNav';
import { LayoutDashboard, Settings2, Users, ShieldCheck, FileText, FilePlus2, UserCircle2, LogOut, ChevronDown, ChevronRight, MapPin, Phone, Mail, UserRound } from 'lucide-react';
import './App.css';

export default function Auth({ onLogin }) {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    matricule: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRegistrationInfo, setShowRegistrationInfo] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: '' });
  };

  const validateLogin = () => {
    const newErrors = {};
    if (!formData.matricule) newErrors.matricule = "Matricule requis";
    if (!formData.password) newErrors.password = "Mot de passe requis";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRegister = () => {
    const newErrors = {};
    if (!formData.matricule) newErrors.matricule = "Matricule requis";
    if (!formData.password) newErrors.password = "Mot de passe requis";
    if (formData.password.length < 6) newErrors.password = "6 caractères minimum";
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Les mots de passe ne correspondent pas";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    if (isLogin) {
      if (validateLogin()) {
        try {
          const response = await fetch('/api/login/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matricule: formData.matricule,
              password: formData.password
            })
          });

          const data = await response.json();

          if (response.ok) {
            const normalizedRole = normalizeRole(data.role || 'agent');
            const rawRoles = Array.isArray(data.roles) ? data.roles : [data.role || normalizedRole];
            const normalizedRoles = rawRoles.map(normalizeRole).filter(Boolean);
            const rolesToStore = normalizedRoles.length > 0 ? normalizedRoles : [normalizedRole];
            const selectedRole = normalizedRole || rolesToStore[0] || 'agent';

            localStorage.setItem('userMatricule', data.matricule);
            localStorage.setItem('userNom', data.nom);
            localStorage.setItem('userPrenom', data.prenom);
            localStorage.setItem('userEmail', data.email || '');
            localStorage.setItem('userRole', selectedRole);
            localStorage.setItem('userRoles', JSON.stringify(rolesToStore));
            localStorage.setItem('lastLogin', Date.now().toString());
            
            if (onLogin) onLogin(data.matricule, selectedRole);

            if (rolesToStore.length > 1) {
              navigate('/dashboard');
            } else {
              navigate(getDashboardPath(selectedRole));
            }
          } else {
            const errorMessage = data.error || 'Erreur de connexion';
            
            if (errorMessage.toLowerCase().includes('matricule')) {
              setFormData(prev => ({ ...prev, matricule: '' }));
              setErrors({ matricule: errorMessage });
            } else if (errorMessage.toLowerCase().includes('mot de passe') || 
                errorMessage.toLowerCase().includes('password') ||
                errorMessage.toLowerCase().includes('incorrect')) {
                setFormData(prev => ({ ...prev, password: '' }));
                setErrors({ password: errorMessage });
            } else {
              setErrors({ general: errorMessage });
            }
          }
        } catch (error) {
          console.error(" Erreur:", error);
          setErrors({ general: 'Impossible de se connecter au serveur.' });
        }
      }
    } else {
      if (validateRegister()) {
        try {
          const response = await fetch('/api/activate-account/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matricule: formData.matricule,
              password: formData.password
            })
          });

          const data = await response.json();

          if (response.ok) {
            setIsLogin(true);
            setFormData({ matricule: '', password: '', confirmPassword: '' });
            setShowRegistrationInfo(false);
            setErrors({ success: 'Compte activé avec succès ! Veuillez vous connecter.' });
          } else {
            if (data.error && data.error.includes('matricule')) {
              setShowRegistrationInfo(true);
              setFormData(prev => ({ ...prev, matricule: '' }));
            } else {
              setErrors({ general: data.error || "Erreur lors de l'activation" });
            }
          }
        } catch (error) {
          console.error('Erreur:', error);
          setErrors({ general: 'Impossible de contacter le serveur.' });
        }
      }
    }
    setIsLoading(false);
  };

  // Icône œil (œil ouvert)
  const EyeIcon = () => (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );

  // Icône œil barré (œil fermé)
  const EyeOffIcon = () => (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );

  return (
    <div className="auth-page-wrapper">
      {/* ===== NAVBAR ===== */}
      <nav className="auth-navbar">
        <div className="auth-navbar-left">
          <a href="/" className="logo-nav-link">
            <img src="/static/logo2.png" alt="Logo MND" className="oo" />
          </a>
        </div>
      </nav>

      {/* ===== FORMULAIRE ===== */}
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">
              {isLogin ? 'Veuillez vous identifier' : 'Activer votre compte'}
            </h1>
          </div>

          {/*  Message de succès */}
          {errors.success && (
            <div className="auth-success-message">
               {errors.success}
            </div>
          )}

          {/*  Message d'erreur général */}
          {errors.general && (
            <div className="auth-error-message">
               {errors.general}
            </div>
          )}

          {/* Onglets */}
          <div className="auth-tabs">
            <button 
              className={`auth-tab ${isLogin ? 'active' : ''}`} 
              onClick={() => {
                setIsLogin(true);
                setShowRegistrationInfo(false);
                setFormData({ matricule: '', password: '', confirmPassword: '' });
                setErrors({});
              }} 
              disabled={isLoading}
            >
              Connexion
            </button>
            <button 
              className={`auth-tab ${!isLogin ? 'active' : ''}`} 
              onClick={() => {
                setIsLogin(false);
                setShowRegistrationInfo(false);
                setFormData({ matricule: '', password: '', confirmPassword: '' });
                setErrors({});
              }} 
              disabled={isLoading}
            >
              Activation
            </button>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="matricule">Matricule Agent <span className="required">*</span></label>
              <input 
                type="text" 
                id="matricule"
                name="matricule" 
                placeholder="Ex: 875825" 
                value={formData.matricule} 
                onChange={handleChange} 
                className={errors.matricule ? 'error' : ''} 
                disabled={isLoading} 
              />
              {errors.matricule && <span className="error-text">{errors.matricule}</span>}
            </div>

            {/* Champ Mot de passe */}
            <div className="form-group">
              <label htmlFor="password">Mot de passe <span className="required">*</span></label>
              <div className="password-wrapper">
                <input 
                  id="password"
                  type={showPassword ? 'text' : 'password'} 
                  name="password" 
                  placeholder="●●●●●●●" 
                  value={formData.password} 
                  onChange={handleChange} 
                  className={errors.password ? 'error' : ''} 
                  disabled={isLoading} 
                />
                <button 
                  type="button" 
                  className="password-toggle-btn" 
                  onClick={() => setShowPassword(!showPassword)} 
                  disabled={isLoading}
                  aria-label={showPassword ? "Cacher le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {errors.password && <span className="error-text">{errors.password}</span>}
            </div>

            {/*  MOT DE PASSE OUBLIÉ - UNIQUEMENT EN MODE CONNEXION */}
            {isLogin && (
              <div className="forgot-password-link">
                <Link to="/reset-password" className="forgot-password-btn">
                  Mot de passe oublié ?
                </Link>
              </div>
            )}

            {/* Champ Confirmer le mot de passe */}
            {!isLogin && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirmer le mot de passe <span className="required">*</span></label>
                <div className="password-wrapper">
                  <input 
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'} 
                    name="confirmPassword" 
                    placeholder="●●●●●●●" 
                    value={formData.confirmPassword} 
                    onChange={handleChange} 
                    className={errors.confirmPassword ? 'error' : ''} 
                    disabled={isLoading} 
                  />
                  <button 
                    type="button" 
                    className="password-toggle-btn" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                    disabled={isLoading}
                    aria-label={showConfirmPassword ? "Cacher le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
              </div>
            )}

            <button type="submit" className="btn-auth-submit" disabled={isLoading}>
              {isLoading ? 'Chargement...' : (isLogin ? 'Se connecter' : 'Activer mon compte')}
            </button>
          </form>

          {/* Message info */}
          {showRegistrationInfo && (
            <div className="auth-info-message">
              <div className="info-icon">ℹ</div>
              <div className="info-content">
                <h4>Matricule non trouvé</h4>
                <p>Votre matricule n'existe pas dans notre base de données.</p>
                <p>Veuillez vous rapprocher de la <strong>Direction des Affaires Financières (DPAF)</strong> ou du <strong>Service des Ressources Humaines</strong> pour que votre compte soit créé.</p>
                <button 
                  className="btn-close-info" 
                  onClick={() => setShowRegistrationInfo(false)}
                >
                  Fermer
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="auth-footer-link">
            {isLogin ? (
              <p>Vous n'avez pas activé votre compte ? <button type="button" onClick={() => setIsLogin(false)} className="auth-link-btn" disabled={isLoading}>Activer mon compte</button></p>
            ) : (
              <p>Déjà un compte ? <button type="button" onClick={() => setIsLogin(true)} className="auth-link-btn" disabled={isLoading}>Se connecter</button></p>
            )}
          </div>
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <footer className="mnd-grand-footer">
        <div className="benin-national-tricolor-line"></div>
        <div className="footer-main-content">
          <div className="footer-centered-logo-zone">
            <img src="/static/logo2.png" alt="Logo MND" className="footer-logo-official-center" />
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