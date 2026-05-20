import React, { useState } from 'react';
import './App.css';

export default function Dashboard({ userMatricule, onLogout }) {
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

  return (
    <div className="intranet-home">
      
      {/* BARRE DE NAVIGATION */}
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/dashboard" className="logo-nav-link">
            <img 
              src="/logo_MND.png" 
              alt="Logo Ministère du Numérique et de la Digitalisation" 
              className="mnd-official-logo" 
            />
          </a>
        </div>

        <nav className="nav-central-links">
          <a href="/dashboard" className="nav-tab-item">Accueil</a>
          <a href="/demarches" className="nav-tab-item">Démarches RH</a>
          <a href="/documents" className="nav-tab-item">Documents</a>
          <a href="/profil" className="nav-tab-item">Mon Profil</a>
        </nav>

        <div className="nav-right">
          <div className="user-badge">
            <div className="avatar-circle">JM</div>
            <div className="user-meta">
              <span className="user-name">Jenny-Mary A.</span>
              <button className="btn-logout" onClick={onLogout}>Déconnexion</button>
            </div>
          </div>
        </div>
      </header>

      <main className="intranet-main">
        
        {/* BANDEAU HERO */}
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Bienvenue sur votre Espace Agent</h2>
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
                      <button className="btn-apply-small">Postuler</button>
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
                <button className="menu-item-link">
                  <span className="m-icon">📂</span>
                  <div className="m-text">
                    <strong>Dossier Numérique</strong>
                    <p>Consultez vos pièces et situation administrative</p>
                  </div>
                </button>

                <button className="menu-item-link">
                  <span className="m-icon">📄</span>
                  <div className="m-text">
                    <strong>Demandes d'Actes</strong>
                    <p>Attestations, certificats, fiches de poste</p>
                  </div>
                </button>

                <button className="menu-item-link">
                  <span className="m-icon">🌴</span>
                  <div className="m-text">
                    <strong>Espace Congés</strong>
                    <p>Demande de congé et solde annuel</p>
                  </div>
                </button>

                <button className="menu-item-link">
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
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-18/" target="_blank" rel="noreferrer">📜 Statut de l'Agent de l'État</a></li>
              </ul>
            </section>

          </div>

        </div>
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
              <h4>Navigation</h4>
              <ul>
                <li><a href="/dashboard">Accueil</a></li>
                <li><a href="/demarches">Démarches RH</a></li>
                <li><a href="/documents">Documents</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Liens Utiles</h4>
              <ul>
                <li><a href="https://www.numerique.gouv.bj" target="_blank">Site Officiel MND</a></li>
                <li><a href="#">Accès SIGRH</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Contact</h4>
              <p>📞 +229 21 30 70 13</p>
              <p>✉️ numerique@gouv.bj</p>
            </div>
          </div>
        </div>
        <div className="footer-bottom-bar">
          <p>© 2026 Ministère du Numérique et de la Digitalisation</p>
        </div>
      </footer>
    </div>
  );
}