import React, { useState } from 'react';
import './App.css';

export default function Demarches() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  // Données des attestations
  const attestations = [
    {
      id: 1,
      titre: "Attestation de travail",
      description: "Certifie que vous êtes en activité au Ministère du Numérique.",
      delai: "~3 jours"
    },
    {
      id: 2,
      titre: "Attestation de présence au poste",
      description: "Confirme votre présence effective à votre poste de travail.",
      delai: "~3 jours"
    },
    {
      id: 3,
      titre: "Attestation de validité de services",
      description: "Valide vos années de service accomplies au sein du MND.",
      delai: "~5 jours"
    },
    {
      id: 4,
      titre: "Certificat de non-jouissance de congé",
      description: "Atteste que vous n'avez pas bénéficié de votre congé annuel.",
      delai: "~3 jours"
    }
  ];

  // Données des congés
  const conges = [
    {
      id: 1,
      titre: "📅 Demande de congé administratif",
      description: "Soumettez votre demande de congé annuel en ligne.",
      info: "Validation chef →",
      limite: "Max 10 jours/an"
    },
    {
      id: 2,
      titre: "⏰ Autorisation d'absence",
      description: "Demandez une autorisation pour une absence exceptionnelle.",
      info: "Traitement en temps réel →",
      limite: "Max 10 jours/an"
    },
    {
      id: 3,
      titre: "📊 Consulter mon solde de congés",
      description: "Vérifiez vos jours acquis, pris et restants pour l'année.",
      info: "Auto-généré →"
    }
  ];

  // Données carrière
  const carrieres = [
    {
      id: 1,
      titre: "📈 Consulter mon avancement",
      description: "Visualisez votre échelon actuel et la date de votre prochain avancement.",
      info: "Tous les 2 ans"
    },
    {
      id: 2,
      titre: "💼 Postuler à un poste interne",
      description: "Consultez les postes vacants et soumettez votre candidature en ligne.",
      info: "Postes ouverts"
    },
    {
      id: 3,
      titre: "📜 Historique de carrière",
      description: "Consultez l'ensemble de vos nominations, avancements et positions.",
      info: "Depuis prise de service"
    }
  ];

  // Gestion de la connexion
  const handleLogin = () => {
    setIsLoggedIn(true);
    setUserName('Jenny-Mary A.');
  };

  // Gestion de la déconnexion
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
              alt="Logo Ministère du Numérique et de la Digitalisation" 
              className="mnd-official-logo" 
            />
          </a>
        </div>

        <nav className="nav-central-links">
          <a href="/" className="nav-tab-item">Accueil</a>
          <a href="/demarches" className="nav-tab-item">Démarches RH</a>
          <a href="/documents" className="nav-tab-item">Documents</a>
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
        
        {/* BANDEAU DÉMARCHES */}
        <section className="demarches-hero">
          <div className="demarches-hero-content">
            <h1>Vos démarches RH, sans vous déplacer</h1>
            <p>
              Toutes les requêtes de votre carrière au Ministère, disponibles en ligne.
              Soumettez, suivez et recevez vos documents directement depuis votre espace personnel.
            </p>
            <div className="hero-stats-demarches">
              <div className="stat-item">
                <span className="stat-number">12</span>
                <span>Types de démarches</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">100%</span>
                <span>En ligne</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">0</span>
                <span>Déplacements</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION ATTESTATIONS */}
        <section className="attestations-section">
          <div className="section-header-center">
            <h2>Attestations & Actes administratifs</h2>
            <p>Documents officiels délivrés par le service RH</p>
          </div>
          
          <div className="attestations-grid">
            {attestations.map((item) => (
              <div key={item.id} className="attestation-card">
                <h3>{item.titre}</h3>
                <p>{item.description}</p>
                <div className="delai">{item.delai}</div>
                <button className="btn-demande">Faire la demande →</button>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION CONGÉS */}
        <section className="conges-section">
          <div className="section-header-center">
            <h2>Congés & Absences</h2>
            <p>Demandes liées à vos droits à l'absence</p>
          </div>
          
          <div className="conges-grid">
            {conges.map((item) => (
              <div key={item.id} className="conges-card">
                <h3>{item.titre}</h3>
                <p>{item.description}</p>
                <div className="info">{item.info}</div>
                {item.limite && <div className="limite">{item.limite}</div>}
                <button className="btn-demande">
                  {item.titre.includes("Consulter") ? "Consulter →" : "Faire la demande →"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION CARRIÈRE */}
        <section className="carriere-section">
          <div className="section-header-center">
            <h2>Carrière & Avancements</h2>
            <p>Suivi de votre progression au sein du MND</p>
          </div>
          
          <div className="carriere-grid">
            {carrieres.map((item) => (
              <div key={item.id} className="carriere-card">
                <h3>{item.titre}</h3>
                <p>{item.description}</p>
                <div className="frequence">{item.info}</div>
                <button className="btn-demande">
                  {item.titre.includes("Postuler") ? "Voir les offres →" : "Consulter →"}
                </button>
              </div>
            ))}
          </div>
        </section>

       {/* SECTION MON DOSSIER INDIVIDUEL */}
        <section className="dossier-complet-section">
        <div className="dossier-header">
            <h2>Mon dossier individuel</h2>
            <p>Gestion de vos pièces administratives</p>
        </div>
        
        <div className="dossier-cards-grid">
            <div className="dossier-card">
            <div className="dossier-card-icon">📂</div>
            <h3>Consulter mon dossier</h3>
            <p>Accédez à toutes vos pièces administratives enregistrées.</p>
            <div className="dossier-badge">Accès immédiat</div>
            <button className="btn-dossier-card">Consulter →</button>
            </div>
            
            <div className="dossier-card">
            <div className="dossier-card-icon">📤</div>
            <h3>Déposer une pièce</h3>
            <p>Ajoutez un document manquant à votre dossier administratif.</p>
            <div className="dossier-badge">PDF, JPG acceptés</div>
            <button className="btn-dossier-card">Déposer →</button>
            </div>
            
            <div className="dossier-card alert">
            <div className="dossier-card-icon">⚠️</div>
            <h3>Alertes de mon dossier</h3>
            <p>Consultez les pièces manquantes ou arrivant à expiration.</p>
            <div className="dossier-badge">Notifications auto</div>
            <button className="btn-dossier-card">Voir les alertes →</button>
            </div>
        </div>
        </section>
      </main>

            {/* ==========================================================================
      FOOTER INSTITUTIONNEL CONFORME NUMERIQUE.GOUV.BJ (LOGO CENTRÉ & TRICOLORE)
      ========================================================================== */}
      <footer className="mnd-grand-footer">
        
        {/* LIGNE DE DÉMARCATION TRICOLORE NATIONALE (VERT, JAUNE, ROUGE) */}
        <div className="benin-national-tricolor-line"></div>

        <div className="footer-main-content">
          
          {/* ZONE DU LOGO CENTRÉ EN AMONT */}
          <div className="footer-centered-logo-zone">
            <img 
              src="/logo2.png" 
              alt="Logo Officiel Ministère du Numérique et de la Digitalisation" 
              className="footer-logo-official-center"
            />
            <p className="brand-motto-centered">
              Ministère du Numérique et de la Digitalisation — République du Bénin
            </p>
          </div>

          {/* GRILLE DES LIENS ET CONTACTS EN DESSOUS */}
          <div className="footer-columns-grid">
            
            {/* Colonne 1 : Navigation Portail */}
            <div className="footer-col">
              <h4>Navigation Portail</h4>
              <ul>
                <li><a href="#accueil">Accueil Portail</a></li>
                <li><a href="#carriere">Mon Profil & Carrière</a></li>
                <li><a href="#demarches">Démarches en Ligne</a></li>
                <li><a href="#documents">Documents & Notes</a></li>
              </ul>
            </div>

            {/* Colonne 2 : Liens officiels */}
            <div className="footer-col">
              <h4>Liens Utiles</h4>
              <ul>
                <li><a href="https://www.numerique.gouv.bj" target="_blank" rel="noreferrer">Portail du Ministère</a></li>
                <li><a href="https://eservices.travail.gouv.bj" target="_blank" rel="noreferrer">E-Services SIGRH</a></li>
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-18/" target="_blank" rel="noreferrer">Statut de l'Agent (SGG)</a></li>
                <li><a href="https://www.service-public.bj" target="_blank" rel="noreferrer">Service-Public.bj</a></li>
              </ul>
            </div>

            {/* Colonne 3 : Contacts officiels */}
            <div className="footer-col">
              <h4>Contact & Situation</h4>
              <p>📍 <strong>Adresse :</strong> Avenue Jean-Paul II, Face Cour Suprême, Cotonou, Bénin</p>
              <p>📞 <strong>Téléphone :</strong> +229 21 30 70 13 / 21 30 70 14</p>
              <p>✉️ <strong>Email :</strong> numerique@gouv.bj</p>
            </div>

          </div>
        </div>

        {/* Ligne finale de copyright */}
        <div className="footer-bottom-bar">
          <div className="footer-bottom-content">
            <p>© 2026 Ministère du Numérique et de la Digitalisation — République du Bénin. Tous droits réservés.</p>
            <p className="security-mention">Portail Intra-RH sécurisé — Usage professionnel.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}