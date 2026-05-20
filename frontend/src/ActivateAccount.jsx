import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './App.css';

export default function ActivateAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const [matricule, setMatricule] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mat = params.get('matricule');
    if (mat) {
      setMatricule(mat);
    } else {
      setError('Lien d\'activation invalide');
    }
  }, [location]);

  const activateAccount = async () => {
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/activate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: matricule,
          password: password
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert('✅ Compte activé avec succès ! Connectez-vous.');
        navigate('/auth');
      } else {
        setError(data.error || 'Erreur lors de l\'activation');
      }
    } catch (error) {
      setError('Erreur de connexion au serveur');
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    activateAccount();
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
          <h1>🔐 Activation de compte</h1>
          <p>Matricule : <strong>{matricule}</strong></p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>🔒 Nouveau mot de passe</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <small>Minimum 6 caractères</small>
          </div>

          <div className="form-group">
            <label>🔒 Confirmer le mot de passe</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="error-text">❌ {error}</div>}

          <button type="submit" className="btn-auth-submit" disabled={loading}>
            {loading ? '⏳ Activation...' : '✅ Activer mon compte'}
          </button>
        </form>

        <div className="auth-footer">
          <a href="/auth">← Retour à la connexion</a>
        </div>
      </div>
    </div>
  );
}