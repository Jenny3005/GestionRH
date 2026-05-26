import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav, { getDashboardPath, getRoleLabel } from './PortalNav';
import './App.css';

export default function Profil() {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [userInfo, setUserInfo] = useState({
    nom: localStorage.getItem('userNom') || '',
    prenom: localStorage.getItem('userPrenom') || '',
    matricule: localStorage.getItem('userMatricule') || '',
    email: localStorage.getItem('userEmail') || '',
    telephone: '',
    poste: '',
    direction: '',
    typecontrat: '',
    date_prise_service: ''
  });

  const matricule = localStorage.getItem('userMatricule');
  const userRole = localStorage.getItem('userRole');
  const userName = `${userInfo.prenom} ${userInfo.nom}`.trim();

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchUserInfo();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.user-menu-container')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  const fetchUserInfo = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/agent/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setUserInfo({
          nom: data.nom || '',
          prenom: data.prenom || '',
          matricule: data.matricule || '',
          email: data.email || '',
          telephone: data.telephone || '',
          poste: data.poste || 'Agent',
          direction: data.direction || 'À renseigner',
          typecontrat: data.typecontrat || 'APE',
          date_prise_service: data.date_prise_service || ''
        });
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserInfo(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');
    
    try {
      const response = await fetch(`http://localhost:8000/api/agent/${matricule}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userInfo)
      });
      
      if (response.ok) {
        setSuccessMessage('Informations mises à jour avec succès !');
        setIsEditing(false);
        setTimeout(() => setSuccessMessage(''), 3000);
        fetchUserInfo();
      } else {
        setErrorMessage('Erreur lors de la mise à jour');
      }
    } catch (error) {
      setErrorMessage('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
        </div>
        <PortalNav />
        <div className="nav-right">
          <div className="user-menu-container">
            <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="avatar-circle">{userInfo.prenom?.charAt(0) || 'U'}</div>
              <div className="user-meta">
                <span className="user-name">{userName || 'Utilisateur'}</span>
                <span className="user-role">{getRoleLabel(userRole)}</span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <strong>{userName}</strong>
                  <small>{userInfo.email}</small>
                </div>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item" onClick={() => navigate(getDashboardPath(userRole))}>📊 Tableau de bord</button>
                <button className="dropdown-item" onClick={() => navigate('/profil')}>👤 Mon profil</button>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item logout" onClick={handleLogout}>🔓 Se déconnecter</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Mon profil</h2>
            <p>Consultez et modifiez vos informations personnelles et administratives.</p>
          </div>
        </section>

        {/* Bouton Modifier en haut à droite */}
        <div className="profil-actions-top">
          {!isEditing ? (
            <button className="btn-edit-profil-top" onClick={() => setIsEditing(true)}>
              ✏️ Modifier mon profil
            </button>
          ) : (
            <div className="edit-actions-top">
              <button className="btn-save-top" onClick={handleSave} disabled={loading}>
                {loading ? 'Enregistrement...' : '💾 Enregistrer'}
              </button>
              <button className="btn-cancel-top" onClick={() => {
                setIsEditing(false);
                fetchUserInfo();
              }}>
                ❌ Annuler
              </button>
            </div>
          )}
        </div>

        {/* Messages de notification */}
        {successMessage && (
          <div className="alert-success">
            <span className="alert-icon">✅</span>
            <span>{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="alert-error">
            <span className="alert-icon">❌</span>
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="agent-profile-section">
          {/* Grille d'informations */}
          <div className="agent-info-grid">
            {/* Informations personnelles */}
            <div className="agent-card">
              <div className="agent-card-header">
                <h3>📋 Informations personnelles</h3>
              </div>
              <div className="agent-card-content">
                <div className="info-row">
                  <label>Matricule</label>
                  <span>{userInfo.matricule}</span>
                </div>
                <div className="info-row">
                  <label>Nom</label>
                  {isEditing ? (
                    <input type="text" name="nom" value={userInfo.nom} onChange={handleInputChange} />
                  ) : (
                    <span>{userInfo.nom}</span>
                  )}
                </div>
                <div className="info-row">
                  <label>Prénom</label>
                  {isEditing ? (
                    <input type="text" name="prenom" value={userInfo.prenom} onChange={handleInputChange} />
                  ) : (
                    <span>{userInfo.prenom}</span>
                  )}
                </div>
                <div className="info-row">
                  <label>Téléphone</label>
                  {isEditing ? (
                    <input type="tel" name="telephone" value={userInfo.telephone} onChange={handleInputChange} />
                  ) : (
                    <span>{userInfo.telephone || 'Non renseigné'}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Informations professionnelles */}
            <div className="agent-card">
              <div className="agent-card-header">
                <h3>💼 Informations professionnelles</h3>
              </div>
              <div className="agent-card-content">
                <div className="info-row">
                  <label>Poste occupé</label>
                  {isEditing ? (
                    <input type="text" name="poste" value={userInfo.poste} onChange={handleInputChange} />
                  ) : (
                    <span>{userInfo.poste}</span>
                  )}
                </div>
                <div className="info-row">
                  <label>Direction</label>
                  {isEditing ? (
                    <input type="text" name="direction" value={userInfo.direction} onChange={handleInputChange} />
                  ) : (
                    <span>{userInfo.direction}</span>
                  )}
                </div>
                <div className="info-row">
                  <label>Date de prise de service</label>
                  {isEditing ? (
                    <input type="date" name="date_prise_service" value={userInfo.date_prise_service} onChange={handleInputChange} />
                  ) : (
                    <span>{formatDate(userInfo.date_prise_service)}</span>
                  )}
                </div>
                <div className="info-row">
                  <label>Type de contrat</label>
                  {isEditing ? (
                    <select name="typecontrat" value={userInfo.typecontrat} onChange={handleInputChange}>
                      <option value="APE">APE</option>
                      <option value="ACDPE">ACDPE</option>
                    </select>
                  ) : (
                    <span>{userInfo.typecontrat}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Coordonnées */}
            <div className="agent-card">
              <div className="agent-card-header">
                <h3>📞 Coordonnées</h3>
              </div>
              <div className="agent-card-content">
                <div className="info-row">
                  <label>Email professionnel</label>
                  {isEditing ? (
                    <input type="email" name="email" value={userInfo.email} onChange={handleInputChange} />
                  ) : (
                    <span>{userInfo.email}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

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
