import React, { useState } from 'react';
import './App.css';

export default function Documents() {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [userName, setUserName] = useState('Jenny-Mary A.');

  const handleLogin = () => {
    setIsLoggedIn(true);
    setUserName('Jenny-Mary A.');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserName('');
  };

  return (
    <div className="intranet-home">
      
      {/* BARRE DE NAVIGATION */}
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img 
              src="/logo_MND.png" 
              alt="Logo MND" 
              className="mnd-official-logo" 
            />
          </a>
        </div>

        <nav className="nav-central-links">
          <a href="/" className="nav-tab-item">Accueil</a>
          <a href="/demarches" className="nav-tab-item">Démarches RH</a>
          <a href="/documents" className="nav-tab-item active">Documents</a>
          {isLoggedIn && (
            <a href="#profil" className="nav-tab-item">Mon Profil</a>
          )}
        </nav>

        <div className="nav-right">
          {!isLoggedIn ? (
            <button className="btn-login-main" onClick={handleLogin}>Se connecter / S'inscrire</button>
          ) : (
            <div className="user-badge">
              <div className="avatar-circle">JM</div>
              <div className="user-meta">
                <span className="user-name">{userName}</span>
                <button className="btn-logout" onClick={handleLogout}>Déconnexion</button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="intranet-main">
        
        {/* BANDEAU */}
        <section className="documents-hero">
          <div className="documents-hero-content">
            <h1>Mes Documents administratifs</h1>
            <p>
              Toutes vos pièces officielles, sécurisées et accessibles en ligne.
              Fini les chemises cartonnées à la DPAF — votre dossier complet en un clic.
            </p>
            <div className="documents-stats">
              <div className="stat-card">
                <div className="stat-icon">📄</div>
                <span className="stat-number">1</span>
                <span className="stat-label">Documents validés</span>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⚠️</div>
                <span className="stat-number">3</span>
                <span className="stat-label">Manquants ou expirés</span>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <span className="stat-number">76%</span>
                <span className="stat-label">Dossier complété</span>
              </div>
            </div>
          </div>
        </section>

        {/* ALERTES */}
        <section className="alertes-section">
          <div className="alertes-header">
            <span className="alertes-icon">🔔</span>
            <h3>Alertes</h3>
          </div>
          <div className="alertes-list">
            <div className="alerte-card urgent">
              <div className="alerte-icon">⚠️</div>
              <div className="alerte-content">
                <div className="alerte-title">Carte Nationale d'Identité expirée depuis le 15/04/2026</div>
                <div className="alerte-description">Ce document est obligatoire. Veuillez le renouveler et déposer la nouvelle version dès que possible.</div>
              </div>
            </div>
            <div className="alerte-card warning">
              <div className="alerte-icon">⏰</div>
              <div className="alerte-content">
                <div className="alerte-title">Certificat médical expire dans 23 jours — 10/06/2026</div>
                <div className="alerte-description">Anticipez le renouvellement pour éviter une alerte rouge dans votre dossier.</div>
              </div>
            </div>
          </div>
        </section>

        {/* PIÈCES D'IDENTITÉ */}
        <section className="docs-section">
          <div className="section-header-with-icon">
            <div className="header-icon">🆔</div>
            <div>
              <h2>Pièces d'identité & État civil</h2>
              <p>Documents officiels prouvant votre identité et votre situation familiale</p>
            </div>
          </div>
          
          <div className="docs-grid">
            <div className="doc-card expired">
              <div className="doc-card-header">
                <span className="doc-icon">📄</span>
                <span className="doc-status-badge">Expiré</span>
              </div>
              <div className="doc-card-title">Carte Nationale d'Identité</div>
              <div className="doc-card-date">Expirée le 15/04/2026</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
            
            <div className="doc-card">
              <div className="doc-card-header">
                <span className="doc-icon">📄</span>
                <span className="doc-status-badge valid">Validé</span>
              </div>
              <div className="doc-card-title">Acte de naissance sécurisé ANIP</div>
              <div className="doc-card-date">Déposé le 12/03/2019</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
            
            <div className="doc-card">
              <div className="doc-card-header">
                <span className="doc-icon">📄</span>
                <span className="doc-status-badge valid">Validé</span>
              </div>
              <div className="doc-card-title">Certificat de nationalité</div>
              <div className="doc-card-date">Déposé le 12/03/2019</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
          </div>
        </section>

        {/* DOSSIER ACADÉMIQUE & CARRIÈRE */}
        <section className="docs-section alt-bg">
          <div className="section-header-with-icon">
            <div className="header-icon">🎓</div>
            <div>
              <h2>Dossier académique & Carrière</h2>
              <p>Diplômes, nominations et suivi de l'évolution professionnelle</p>
            </div>
          </div>
          
          <div className="docs-grid">
            <div className="doc-card">
              <div className="doc-card-header">
                <span className="doc-icon">🎓</span>
                <span className="doc-status-badge valid">Validé</span>
              </div>
              <div className="doc-card-title">Master Informatique — UAC</div>
              <div className="doc-card-date">Déposé le 12/03/2019</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
            
            <div className="doc-card">
              <div className="doc-card-header">
                <span className="doc-icon">📜</span>
                <span className="doc-status-badge valid">Validé</span>
              </div>
              <div className="doc-card-title">Décision de nomination au MND</div>
              <div className="doc-card-date">Déposé le 12/03/2019</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
            
            <div className="doc-card">
              <div className="doc-card-header">
                <span className="doc-icon">📋</span>
                <span className="doc-status-badge valid">Validé</span>
              </div>
              <div className="doc-card-title">Certificat de prise de service</div>
              <div className="doc-card-date">Déposé le 12/03/2019</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
          </div>
        </section>

        {/* ATTESTATIONS GÉNÉRÉES */}
        <section className="docs-section">
          <div className="section-header-with-icon">
            <div className="header-icon">📑</div>
            <div>
              <h2>Attestations générées</h2>
              <p>Documents officiels délivrés par le système RH</p>
            </div>
          </div>
          
          <div className="docs-grid">
            <div className="doc-card">
              <div className="doc-card-header">
                <span className="doc-icon">📄</span>
              </div>
              <div className="doc-card-title">Attestation de travail</div>
              <div className="doc-card-date">Généré le 06/05/2025</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
            
            <div className="doc-card">
              <div className="doc-card-header">
                <span className="doc-icon">📄</span>
              </div>
              <div className="doc-card-title">Attestation de présence au poste</div>
              <div className="doc-card-date">Généré le 10/03/2025</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
            
            <div className="doc-card">
              <div className="doc-card-header">
                <span className="doc-icon">📄</span>
              </div>
              <div className="doc-card-title">Titre de congé validé 2024</div>
              <div className="doc-card-date">Généré le 01/07/2024</div>
              <button className="doc-card-btn">📄 Télécharger PDF</button>
            </div>
          </div>
        </section>

      </main>

      {/* FOOTER */}
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
                <li><a href="#accueil">Accueil Portail</a></li>
                <li><a href="#carriere">Mon Profil & Carrière</a></li>
                <li><a href="#demarches">Démarches en Ligne</a></li>
                <li><a href="#documents">Documents & Notes</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Liens Utiles</h4>
              <ul>
                <li><a href="https://www.numerique.gouv.bj" target="_blank">🌐 Site Officiel du MND</a></li>
                <li><a href="#">🖥️ Accès SIGRH National</a></li>
                <li><a href="#">📜 Statut de l'Agent de l'État</a></li>
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