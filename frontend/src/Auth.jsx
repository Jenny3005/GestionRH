import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getDashboardPath, normalizeRole } from './PortalNav';
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
          const response = await fetch('http://localhost:8000/api/login/', {
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
            
            if (errorMessage.toLowerCase().includes('matricule') || errorMessage.toLowerCase().includes('incorrect')) {
              setFormData(prev => ({ ...prev, matricule: '' }));
              setErrors({ matricule: errorMessage });
            } else if (errorMessage.toLowerCase().includes('mot de passe') || errorMessage.toLowerCase().includes('password')) {
              setFormData(prev => ({ ...prev, password: '' }));
              setErrors({ password: errorMessage });
            } else {
              setErrors({ general: errorMessage });
            }
          }
        } catch (error) {
          console.error("❌ Erreur:", error);
          setErrors({ general: 'Impossible de se connecter au serveur.' });
        }
      }
    } else {
      if (validateRegister()) {
        try {
          const response = await fetch('http://localhost:8000/api/activate-account/', {
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
              {isLogin ? 'Veuillez vous identifier' : 'Activer votre compte'}
            </h1>
          </div>

          {/* ✅ Message de succès */}
          {errors.success && (
            <div className="auth-success-message">
              ✅ {errors.success}
            </div>
          )}

          {/* ✅ Message d'erreur général */}
          {errors.general && (
            <div className="auth-error-message">
              ❌ {errors.general}
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

            <div className="form-group">
              <label htmlFor="password">Mot de passe <span className="required">*</span></label>
              <div className="input-icon">
                <input 
                  id="password"
                  type={showPassword ? 'text' : 'password'} 
                  name="password" 
                  placeholder="••••••••" 
                  value={formData.password} 
                  onChange={handleChange} 
                  className={errors.password ? 'error' : ''} 
                  disabled={isLoading} 
                />
                <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} disabled={isLoading}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {errors.password && <span className="error-text">{errors.password}</span>}
            </div>

            {/* ✅ MOT DE PASSE OUBLIÉ - UNIQUEMENT EN MODE CONNEXION */}
            {isLogin && (
              <div className="forgot-password-link">
                <Link to="/reset-password" className="forgot-password-btn">
                  Mot de passe oublié ?
                </Link>
              </div>
            )}

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirmer le mot de passe <span className="required">*</span></label>
                <input 
                  id="confirmPassword"
                  type="password" 
                  name="confirmPassword" 
                  placeholder="••••••••" 
                  value={formData.confirmPassword} 
                  onChange={handleChange} 
                  className={errors.confirmPassword ? 'error' : ''} 
                  disabled={isLoading} 
                />
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
              <div className="info-icon">ℹ️</div>
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
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-18/" target="_blank">Statut de l'Agent (SGG)</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Contact & Situation</h4>
              <p>📍 Avenue Jean-Paul II, Cotonou, Bénin</p>
              <p>📞 +229 21 30 70 13</p>
              <p>✉️ numerique@gouv.bj</p>
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