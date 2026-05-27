import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav, { getDashboardPath, getRoleLabel } from './PortalNav';
import './App.css';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  // Vérifier si l'utilisateur est connecté au chargement
  useEffect(() => {
    const savedMatricule = localStorage.getItem('userMatricule');
    const savedNom = localStorage.getItem('userNom');
    const savedPrenom = localStorage.getItem('userPrenom');
    const savedEmail = localStorage.getItem('userEmail');
    const lastLogin = localStorage.getItem('lastLogin');
    const sessionDuration = 8 * 60 * 60 * 1000; // 8 heures
  
    if (!lastLogin || (Date.now() - parseInt(lastLogin, 10)) > sessionDuration) {
      localStorage.clear();
      return;
    }
    
    if (savedMatricule) {
      setIsLoggedIn(true);
      setUserName(`${savedPrenom} ${savedNom}`);
      setUserEmail(savedEmail);
    }
  }, []);

  // Fermer le dropdown en cliquant ailleurs
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.user-menu-container')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  const [postesVacants] = useState([
    {
      id: "MND-PV-2026-01",
      titre: "Chef Service Infrastructures et Réseaux",
      direction: "Direction Générale du Numérique (DGN)",
      dateLimite: "05/06/2026",
      type: "Appel à candidature interne"
    },
    {
      id: "MND-PV-2026-02",
      titre: "Analyste Senior en Cybersécurité",
      direction: "Agence Nationale de la Sécurité des Systèmes d'Information (ANSSI / MND)",
      dateLimite: "12/06/2026",
      type: "Mutation interne"
    },
    {
      id: "MND-PV-2026-03",
      titre: "Chargé d'Études en Transformation Digitale",
      direction: "DPAF - Service Modernisation",
      dateLimite: "30/05/2026",
      type: "Appel à candidature interne"
    }
  ]);

  const [actualites] = useState([
    {
      id: 1,
      tag: "Note de Service",
      titre: "Campagne d'évaluation annuelle des performances des agents au titre de l'année 2026",
      date: "18 Mai 2026"
    },
    {
      id: 2,
      tag: "Communiqué",
      titre: "Lancement du nouveau processus de dématérialisation des demandes de congés via le SGRH",
      date: "15 Mai 2026"
    }
  ]);

  // Fonction pour vérifier si l'utilisateur est connecté avant action
  const requireLogin = (action) => {
    if (!isLoggedIn) {
      alert('Veuillez vous connecter pour accéder à cette fonctionnalité');
      navigate('/auth');
      return false;
    }
    action();
    return true;
  };

  const handlePostuler = (poste) => {
    requireLogin(() => {
      alert(`Vous allez postuler pour le poste : ${poste.titre}`);
      // Rediriger vers le formulaire de candidature
      navigate('/demarches');
    });
  };

  const handleAppRH = (appName) => {
    requireLogin(() => {
      alert(`Accès à ${appName}`);
      navigate('/dashboard');
    });
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    setUserName('');
    setUserEmail('');
    navigate('/'); 
  };

  return (
    <div className="intranet-home">
      
      {/* BARRE DE NAVIGATION - PLUS D'ONGLET ACCUEIL */}
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img 
              src="/logo_MND.png" 
              alt="Logo Ministère du Numérique et de la Digitalisation" 
              className="mnd-official-logo" 
            />
          </a>
        </div>

        {/* Navigation sans l'onglet Accueil */}
        <PortalNav />

        <div className="nav-right">
          {isLoggedIn ? (
            <div className="user-menu-container">
              <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="avatar-circle">{userName.charAt(0) || 'U'}</div>
              <div className="user-meta">
                <span className="user-name">{userName}</span>
                <span className="user-role">
                  {getRoleLabel()}
                </span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
              
              {dropdownOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <strong>{userName}</strong>
                    <small>{userEmail}</small>
                  </div>
                  <div className="dropdown-divider"></div>
                  <button 
                    className="dropdown-item" 
                    onClick={() => {
                      navigate(getDashboardPath());
                    }}
                  >
                    📊 Tableau de bord
                  </button>
                  <button className="dropdown-item" onClick={() => navigate('/profil')}>
                    👤 Mon profil
                  </button>
                  <div className="dropdown-divider"></div>
                  <button className="dropdown-item logout" onClick={handleLogout}>
                    🔓 Se déconnecter
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn-login-main" onClick={() => navigate('/auth')}>
              Se connecter / S'inscrire
            </button>
          )}
        </div>
      </header>

      <main className="intranet-main">
        
        {/* BANDEAU HERO */}
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Bienvenue sur votre Portail Intra-RH</h2>
            <p>
              Retrouvez toutes les actualités administratives du Ministère, consultez les appels à candidatures internes 
              et accédez directement à vos outils de gestion de carrière.
            </p>
          </div>
        </section>

        {/* SECTION COMMENT ÇA MARCHE */}
        <section className="how-it-works-section">
          <div className="how-it-works-container">
            <h2>Comment ça marche ?</h2>
            <p className="how-it-works-sub">Un accès simple et sécurisé pour tous les agents du MND.</p>
            
            <div className="steps-row-layout">
              <div className="step-block">
                <div className="step-badge-number">1</div>
                <h3>Connexion sécurisée</h3>
                <p>L'agent se connecte avec son matricule et son mot de passe personnel.</p>
              </div>

              <div className="step-block">
                <div className="step-badge-number">2</div>
                <h3>Accès personnalisé</h3>
                <p>Chaque utilisateur voit uniquement les fonctionnalités liées à son rôle.</p>
              </div>

              <div className="step-block">
                <div className="step-badge-number">3</div>
                <h3>Soumettre une demande</h3>
                <p>Congé, acte ou candidature — tout se fait en ligne en quelques clics.</p>
              </div>

              <div className="step-block">
                <div className="step-badge-number">4</div>
                <h3>Suivi en temps réel</h3>
                <p>L'agent reçoit des notifications à chaque étape du traitement.</p>
              </div>
            </div>
          </div>
        </section>

        {/* GRILLE PRINCIPALE */}
        <div className="intranet-grid-layout">
          
          <div className="left-column">
            
            <section className="info-card-section">
              <div className="section-header-premium">
                <span className="icon">💼</span>
                <h3>Opportunités de Carrière</h3>
              </div>
              <p className="section-desc">Appels à candidatures ouverts aux agents permanents du MND.</p>
              
              <div className="postes-list">
                {postesVacants.map((poste) => (
                  <div key={poste.id} className="poste-item-card">
                    <div className="poste-main-info">
                      <span className="poste-badge-type">{poste.type}</span>
                      <h4>{poste.titre}</h4>
                      <p className="poste-direction">📍 {poste.direction}</p>
                    </div>
                    <div className="poste-action-zone">
                      <span className="limit-date">Limite : <strong>{poste.dateLimite}</strong></span>
                      <button 
                        className="btn-apply-small" 
                        onClick={() => handlePostuler(poste)}
                      >
                        Postuler
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="info-card-section mt-2">
              <div className="section-header-premium">
                <span className="icon">📢</span>
                <h3>Notes de Service</h3>
              </div>
              <div className="news-list">
                {actualites.map((actu) => (
                  <div key={actu.id} className="news-item">
                    <div className="news-meta">
                      <span className="news-tag-style">{actu.tag}</span>
                      <span className="news-date-style">{actu.date}</span>
                    </div>
                    <h4>{actu.titre}</h4>
                    <a href="#lire" className="news-link-btn">Lire le document →</a>
                  </div>
                ))}
              </div>
            </section>

          </div>

          <div className="right-column">
            
            <section className="sidebar-links-card">
              <h3>Vos Applications RH</h3>
              <div className="title-divider-gold"></div>
              
              <div className="apps-vertical-menu">
                <button 
                  className="menu-item-link"
                  onClick={() => handleAppRH("Dossier Numérique")}
                >
                  <span className="m-icon">📂</span>
                  <div className="m-text">
                    <strong>Dossier Numérique</strong>
                    <p>Consultez vos pièces et situation administrative</p>
                  </div>
                </button>

                <button 
                  className="menu-item-link"
                  onClick={() => handleAppRH("Demandes d'Actes")}
                >
                  <span className="m-icon">📄</span>
                  <div className="m-text">
                    <strong>Demandes d'Actes</strong>
                    <p>Attestations, certificats, fiches de poste</p>
                  </div>
                </button>

                <button 
                  className="menu-item-link"
                  onClick={() => handleAppRH("Espace Congés")}
                >
                  <span className="m-icon">🌴</span>
                  <div className="m-text">
                    <strong>Espace Congés</strong>
                    <p>Demande de congé et solde annuel</p>
                  </div>
                </button>

                <button 
                  className="menu-item-link"
                  onClick={() => handleAppRH("Suivi Avancement")}
                >
                  <span className="m-icon">📈</span>
                  <div className="m-text">
                    <strong>Suivi Avancement</strong>
                    <p>Échelons et passages de grade</p>
                  </div>
                </button>
              </div>
            </section>

            <section className="sidebar-links-card mt-2">
              <h3>Liens Utiles</h3>
              <div className="title-divider-gold"></div>
              <ul className="useful-links-list">
                <li><a href="https://www.numerique.gouv.bj" target="_blank" rel="noreferrer">🌐 Site Officiel du MND</a></li>
                <li><a href="https://sigrh.gouv.bj/SIGRHWEB" target="_blank" rel="noreferrer">🖥️ Accès SIGRH National</a></li>
                <li>
                  <a href="https://sgg.gouv.bj/doc/loi-2015-18/" target="_blank" rel="noreferrer">
                    📜 Statut de l'Agent de l'État (Loi 2015-18)
                  </a>
                </li>
              </ul>
            </section>

          </div>

        </div>
      </main>

      {/* FOOTER INSTITUTIONNEL */}
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
