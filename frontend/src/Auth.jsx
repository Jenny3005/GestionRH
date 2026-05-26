import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

export default function Auth({ onLogin }) {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    matricule: '',
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    password: '',
    confirmPassword: '',
    date_prise_service: '',
    adresse: '',
    poste: '',
    direction: '',
    typecontrat: ''
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

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
    if (!formData.nom) newErrors.nom = "Nom requis";
    if (!formData.prenom) newErrors.prenom = "Prénom requis";
    if (!formData.email) newErrors.email = "Email requis";
    if (!formData.telephone) newErrors.telephone = "Téléphone requis";
    if (!formData.password) newErrors.password = "Mot de passe requis";
    if (!formData.date_prise_service) newErrors.date_prise_service = "Date de prise de service requise";
    if (!formData.adresse) newErrors.adresse = "Adresse requise";
    if (!formData.poste) newErrors.poste = "Poste requis";
    if (!formData.direction) newErrors.direction = "Direction requise";
    if (!formData.typecontrat) newErrors.typecontrat = "Type de contrat requis";
    if (formData.password.length < 6) newErrors.password = "6 caractères minimum";
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Les mots de passe ne correspondent pas";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

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
            alert(`Bienvenue ${data.prenom} ${data.nom}`);
            
            // Stocker les informations
            localStorage.setItem('userMatricule', data.matricule);
            localStorage.setItem('userNom', data.nom);
            localStorage.setItem('userPrenom', data.prenom);
            localStorage.setItem('userRole', data.role);
            localStorage.setItem('userRoles', JSON.stringify(data.roles || [data.role]));
            
            if (onLogin) onLogin(data.matricule, data.role);
            
            // Redirection selon le rôle
            switch(data.role) {
              case 'admin':
                navigate('/admin/dashboard');
                break;
              case 'chef':
                navigate('/chef/dashboard');
                break;
              case 'rh':
                navigate('/dashboard');
                break;
              default:
                navigate('/dashboard');
            }
          } else {
            alert(data.error || 'Erreur de connexion');
          }
        } catch (error) {
          console.error('Erreur:', error);
          alert('Impossible de se connecter au serveur. Vérifiez que Django est démarré.');
        }
      }
    } else {
      if (validateRegister()) {
        try {
          const response = await fetch('http://localhost:8000/api/register/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matricule: formData.matricule,
              nom: formData.nom,
              prenom: formData.prenom,
              email: formData.email,
              telephone: formData.telephone,
              password: formData.password,
              date_prise_service: formData.date_prise_service,
              adresse: formData.adresse,
              poste: formData.poste,
              direction: formData.direction,
              typecontrat: formData.typecontrat
            })
          });

          const data = await response.json();

          if (response.ok) {
            alert('Inscription réussie ! Veuillez vous connecter.');
            setIsLogin(true);
            setFormData({ 
              matricule: '', nom: '', prenom: '', email: '', telephone: '',
              password: '', confirmPassword: '', date_prise_service: '',
              adresse: '', poste: '', direction: '', typecontrat: ''
            });
          } else {
            alert(data.error || "Erreur lors de l'inscription");
          }
        } catch (error) {
          console.error('Erreur:', error);
          alert('Impossible de contacter le serveur. Vérifiez que Django est démarré.');
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
            <img 
              src="/logo_MND.png" 
              alt="Logo MND" 
              className="mnd-official-logo" 
            />
          </a>
          <h1>{isLogin ? 'Connexion' : 'Inscription'}</h1>
          <p>{isLogin ? 'Accédez à votre espace agent' : 'Créez votre compte agent'}</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => setIsLogin(true)} disabled={isLoading}>
            Connexion
          </button>
          <button className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => setIsLogin(false)} disabled={isLoading}>
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Matricule Agent <span className="required">*</span></label>
            <input type="text" name="matricule" placeholder="Ex: 875825" value={formData.matricule} onChange={handleChange} className={errors.matricule ? 'error' : ''} disabled={isLoading} />
            {errors.matricule && <span className="error-text">{errors.matricule}</span>}
          </div>

          {!isLogin && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Nom <span className="required">*</span></label>
                  <input type="text" name="nom" placeholder="Votre nom" value={formData.nom} onChange={handleChange} className={errors.nom ? 'error' : ''} disabled={isLoading} />
                  {errors.nom && <span className="error-text">{errors.nom}</span>}
                </div>
                <div className="form-group">
                  <label>Prénom <span className="required">*</span></label>
                  <input type="text" name="prenom" placeholder="Votre prénom" value={formData.prenom} onChange={handleChange} className={errors.prenom ? 'error' : ''} disabled={isLoading} />
                  {errors.prenom && <span className="error-text">{errors.prenom}</span>}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email <span className="required">*</span></label>
                  <input type="email" name="email" placeholder="prenom.nom@numerique.gouv.bj" value={formData.email} onChange={handleChange} className={errors.email ? 'error' : ''} disabled={isLoading} />
                  {errors.email && <span className="error-text">{errors.email}</span>}
                </div>
                <div className="form-group">
                  <label>Téléphone <span className="required">*</span></label>
                  <input type="tel" name="telephone" placeholder="+229 01 23 45 67" value={formData.telephone} onChange={handleChange} className={errors.telephone ? 'error' : ''} disabled={isLoading} />
                  {errors.telephone && <span className="error-text">{errors.telephone}</span>}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Date de prise de service <span className="required">*</span></label>
                  <input type="date" name="date_prise_service" value={formData.date_prise_service} onChange={handleChange} className={errors.date_prise_service ? 'error' : ''} disabled={isLoading} />
                  {errors.date_prise_service && <span className="error-text">{errors.date_prise_service}</span>}
                </div>
                <div className="form-group">
                  <label>Type de contrat <span className="required">*</span></label>
                  <select name="typecontrat" value={formData.typecontrat} onChange={handleChange} className={errors.typecontrat ? 'error' : ''} disabled={isLoading}>
                    <option value="">Sélectionnez</option>
                    <option value="APE">APE - Agent Permanent de l'État</option>
                    <option value="ACDPE">ACDPE - Agent Contractuel de Droit Public de l'État</option>
                  </select>
                  {errors.typecontrat && <span className="error-text">{errors.typecontrat}</span>}
                </div>
              </div>

              <div className="form-group">
                <label>Adresse <span className="required">*</span></label>
                <input type="text" name="adresse" placeholder="Votre adresse complète" value={formData.adresse} onChange={handleChange} className={errors.adresse ? 'error' : ''} disabled={isLoading} />
                {errors.adresse && <span className="error-text">{errors.adresse}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Poste <span className="required">*</span></label>
                  <input type="text" name="poste" placeholder="Ex: Agent RH, Développeur" value={formData.poste} onChange={handleChange} className={errors.poste ? 'error' : ''} disabled={isLoading} />
                  {errors.poste && <span className="error-text">{errors.poste}</span>}
                </div>
                <div className="form-group">
                  <label>Direction <span className="required">*</span></label>
                  <input type="text" name="direction" placeholder="Ex: DRH, DSI, DAF" value={formData.direction} onChange={handleChange} className={errors.direction ? 'error' : ''} disabled={isLoading} />
                  {errors.direction && <span className="error-text">{errors.direction}</span>}
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Mot de passe <span className="required">*</span></label>
            <div className="input-icon">
              <input type={showPassword ? 'text' : 'password'} name="password" placeholder="••••••••" value={formData.password} onChange={handleChange} className={errors.password ? 'error' : ''} disabled={isLoading} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} disabled={isLoading}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {errors.password && <span className="error-text">{errors.password}</span>}
          </div>

          {!isLogin && (
            <div className="form-group">
              <label>Confirmer le mot de passe <span className="required">*</span></label>
              <input type="password" name="confirmPassword" placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange} className={errors.confirmPassword ? 'error' : ''} disabled={isLoading} />
              {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
            </div>
          )}

          <button type="submit" className="btn-auth-submit" disabled={isLoading}>
            {isLoading ? 'Chargement...' : (isLogin ? 'Se connecter' : 'Créer mon compte')}
          </button>
        </form>

        <div className="auth-footer">
          {isLogin ? (
            <p>Pas encore de compte ? <button onClick={() => setIsLogin(false)} className="auth-link-btn" disabled={isLoading}>S'inscrire</button></p>
          ) : (
            <p>Déjà un compte ? <button onClick={() => setIsLogin(true)} className="auth-link-btn" disabled={isLoading}>Se connecter</button></p>
          )}
        </div>
      </div>
    </div>
  );
}
