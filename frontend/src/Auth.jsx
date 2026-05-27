import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

    if (isLogin) {
      // Connexion
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
            alert(`Bienvenue ${data.prenom} ${data.nom}`);
            
            localStorage.setItem('userMatricule', data.matricule);
            localStorage.setItem('userNom', data.nom);
            localStorage.setItem('userPrenom', data.prenom);
            localStorage.setItem('userEmail', data.email || '');
            localStorage.setItem('userRole', data.role);
            localStorage.setItem('userRoles', JSON.stringify(data.roles || [data.role]));
            localStorage.setItem('lastLogin', Date.now().toString());
            
            if (onLogin) onLogin(data.matricule, data.role);
            
            switch(data.role) {
              case 'admin':
                navigate('/admin/dashboard');
                break;
              case 'chef':
                navigate('/chef/dashboard');
                break;
              case 'rh':
                navigate('/dashboard-rh');
                break;
              default:
                navigate('/dashboard');
            }
          } else {
            alert(data.error || 'Erreur de connexion');
          }
        } catch (error) {
          console.error('Erreur:', error);
          alert('Impossible de se connecter au serveur.');
        }
      }
    } else {
      // Inscription - Vérifier si le matricule existe dans la base
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
            alert('Compte activé avec succès ! Veuillez vous connecter.');
            setIsLogin(true);
            setFormData({ matricule: '', password: '', confirmPassword: '' });
            setShowRegistrationInfo(false);
          } else {
            // Si le matricule n'existe pas dans la base
            if (data.error && data.error.includes('matricule')) {
              setShowRegistrationInfo(true);
            } else {
              alert(data.error || "Erreur lors de l'activation");
            }
          }
        } catch (error) {
          console.error('Erreur:', error);
          alert('Impossible de contacter le serveur.');
        }
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
          <h1>{isLogin ? 'Connexion' : 'Activation de compte'}</h1>
          <p>{isLogin ? 'Accédez à votre espace agent' : 'Activez votre compte avec votre matricule'}</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => {
            setIsLogin(true);
            setShowRegistrationInfo(false);
            setFormData({ matricule: '', password: '', confirmPassword: '' });
            setErrors({});
          }} disabled={isLoading}>
            Connexion
          </button>
          <button className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => {
            setIsLogin(false);
            setShowRegistrationInfo(false);
            setFormData({ matricule: '', password: '', confirmPassword: '' });
            setErrors({});
          }} disabled={isLoading}>
            Activation
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Matricule Agent <span className="required">*</span></label>
            <input 
              type="text" 
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
            <label>Mot de passe <span className="required">*</span></label>
            <div className="input-icon">
              <input 
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

          {!isLogin && (
            <div className="form-group">
              <label>Confirmer le mot de passe <span className="required">*</span></label>
              <input 
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

        {/* Message d'information pour l'inscription */}
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

        <div className="auth-footer">
          {isLogin ? (
            <p>Pas encore de compte ? <button onClick={() => setIsLogin(false)} className="auth-link-btn" disabled={isLoading}>Activer mon compte</button></p>
          ) : (
            <p>Déjà un compte ? <button onClick={() => setIsLogin(true)} className="auth-link-btn" disabled={isLoading}>Se connecter</button></p>
          )}
        </div>
      </div>
    </div>
  );
}