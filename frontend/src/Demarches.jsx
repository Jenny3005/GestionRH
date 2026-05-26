import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav, { getDashboardPath, getRoleLabel } from './PortalNav';
import './App.css';

export default function Demarches() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // État pour le formulaire de congé
  const [showCongeForm, setShowCongeForm] = useState(false);
  const [congeForm, setCongeForm] = useState({
    date_debut: '',
    date_fin: ''
  });
  const [loading, setLoading] = useState(false);
  const [soldeConge, setSoldeConge] = useState(null);
  const [mesDemandes, setMesDemandes] = useState([]);

  // Vérifier si l'utilisateur est connecté au chargement
  useEffect(() => {
    const savedMatricule = localStorage.getItem('userMatricule');
    const savedNom = localStorage.getItem('userNom');
    const savedPrenom = localStorage.getItem('userPrenom');
    const savedEmail = localStorage.getItem('userEmail');
    
    if (savedMatricule) {
      setIsLoggedIn(true);
      setUserName(`${savedPrenom} ${savedNom}`);
      setUserEmail(savedEmail);
      fetchSoldeConge(savedMatricule);
      fetchMesDemandes(savedMatricule);
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

  const handleLogout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    setUserName('');
    setUserEmail('');
    navigate('/'); 
  };

  // Récupérer le solde de congés
  const fetchSoldeConge = async (matricule) => {
    try {
      const response = await fetch(`http://localhost:8000/api/conges/solde/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setSoldeConge(data);
      }
    } catch (error) {
      console.error('Erreur solde:', error);
    }
  };

  // Récupérer les demandes de l'agent
  const fetchMesDemandes = async (matricule) => {
    try {
      const response = await fetch(`http://localhost:8000/api/conges/mes-demandes/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setMesDemandes(data);
      }
    } catch (error) {
      console.error('Erreur demandes:', error);
    }
  };

  // Gestionnaires d'actions protégés
  const requireLogin = (actionName, action) => {
    if (!isLoggedIn) {
      alert(`Veuillez vous connecter pour ${actionName}`);
      navigate('/auth');
      return false;
    }
    if (action) action();
    return true;
  };

  const handleCongeChange = (e) => {
    setCongeForm({ ...congeForm, [e.target.name]: e.target.value });
  };

  const soumettreDemandeConge = async () => {
    const matricule = localStorage.getItem('userMatricule');
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    if (!congeForm.date_debut || !congeForm.date_fin) {
      alert('Veuillez remplir toutes les dates');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/conges/demander/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: matricule,
          date_debut: congeForm.date_debut,
          date_fin: congeForm.date_fin
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ Demande envoyée ! Numéro de suivi: ${data.numero_suivi}`);
        setShowCongeForm(false);
        setCongeForm({ date_debut: '', date_fin: '' });
        fetchSoldeConge(matricule);
        fetchMesDemandes(matricule);
      } else {
        alert(data.error || 'Erreur lors de la demande');
      }
    } catch (error) {
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleFaireDemande = (titre) => {
    requireLogin(`faire une ${titre}`, () => {
      if (titre.includes("Demande de congé")) {
        setShowCongeForm(true);
      } else {
        alert(`Demande de ${titre} en cours de traitement...`);
      }
    });
  };

  const handleConsulterSolde = () => {
    requireLogin("consulter votre solde de congés", () => {
      alert(`Solde de congés ${soldeConge?.annee}: ${soldeConge?.jours_restants || 0} jours restants`);
    });
  };

  const handlePostulerOffre = (titre) => {
    requireLogin(`postuler à l'offre ${titre}`, () => {
      alert(`Candidature à l'offre "${titre}" enregistrée !`);
    });
  };

  const handleVoirOffres = () => {
    requireLogin("consulter les offres de postes internes", () => {
      alert("Voici la liste complète des offres...");
    });
  };

  const handleConsulterDossier = () => {
    requireLogin("consulter votre dossier", () => {
      navigate('/documents');
    });
  };

  const handleDeposerPiece = () => {
    requireLogin("déposer une pièce", () => {
      navigate('/documents');
    });
  };

  const handleVoirAlertes = () => {
    requireLogin("voir les alertes de votre dossier", () => {
      alert("Affichage des alertes...");
    });
  };

  const handleConsulterAvancement = () => {
    requireLogin("consulter votre avancement", () => {
      navigate('/dashboard');
    });
  };

  const handleHistoriqueCarriere = () => {
    requireLogin("consulter votre historique de carrière", () => {
      alert("Affichage de l'historique...");
    });
  };

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
      limite: "Max 30 jours/an"
    },
    {
      id: 2,
      titre: "⏰ Autorisation d'absence",
      description: "Demandez une autorisation pour une absence exceptionnelle.",
      info: "Validation chef →",
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

  const userRole = localStorage.getItem('userRole');

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

        <PortalNav />

        <div className="nav-right">
          {isLoggedIn ? (
            <div className="user-menu-container">
              <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
                <div className="avatar-circle">{userName.charAt(0) || 'U'}</div>
                <div className="user-meta">
                  <span className="user-name">{userName}</span>
                  <span className="user-role">
                    {getRoleLabel(userRole)}
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
                <button 
                  className="btn-demande" 
                  onClick={() => handleFaireDemande(item.titre)}
                >
                  Faire la demande →
                </button>
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
                <button 
                  className="btn-demande"
                  onClick={() => {
                    if (item.titre.includes("Consulter")) {
                      handleConsulterSolde();
                    } else {
                      handleFaireDemande(item.titre);
                    }
                  }}
                >
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
                <button 
                  className="btn-demande"
                  onClick={() => {
                    if (item.titre.includes("Postuler")) {
                      handleVoirOffres();
                    } else if (item.titre.includes("Consulter mon avancement")) {
                      handleConsulterAvancement();
                    } else if (item.titre.includes("Historique")) {
                      handleHistoriqueCarriere();
                    } else {
                      handleFaireDemande(item.titre);
                    }
                  }}
                >
                  {item.titre.includes("Postuler") ? "Voir les offres →" : 
                   item.titre.includes("Consulter") ? "Consulter →" : "Faire la demande →"}
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
              <button className="btn-dossier-card" onClick={handleConsulterDossier}>Consulter →</button>
            </div>
            
            <div className="dossier-card">
              <div className="dossier-card-icon">📤</div>
              <h3>Déposer une pièce</h3>
              <p>Ajoutez un document manquant à votre dossier administratif.</p>
              <div className="dossier-badge">PDF, JPG acceptés</div>
              <button className="btn-dossier-card" onClick={handleDeposerPiece}>Déposer →</button>
            </div>
            
            <div className="dossier-card alert">
              <div className="dossier-card-icon">⚠️</div>
              <h3>Alertes de mon dossier</h3>
              <p>Consultez les pièces manquantes ou arrivant à expiration.</p>
              <div className="dossier-badge">Notifications auto</div>
              <button className="btn-dossier-card" onClick={handleVoirAlertes}>Voir les alertes →</button>
            </div>
          </div>
        </section>
      </main>

      {/* MODAL FORMULAIRE CONGÉ - SANS MOTIF */}
      {showCongeForm && (
        <div className="modal-overlay" onClick={() => setShowCongeForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>📅 Demande de congé</h3>
            
            {soldeConge && (
              <div className="solde-info">
                <p>Solde disponible : <strong>{soldeConge.jours_restants} jours</strong></p>
              </div>
            )}
            
            <div className="form-group">
              <label>Date de début *</label>
              <input 
                type="date" 
                name="date_debut" 
                value={congeForm.date_debut} 
                onChange={handleCongeChange} 
                required
              />
            </div>
            
            <div className="form-group">
              <label>Date de fin *</label>
              <input 
                type="date" 
                name="date_fin" 
                value={congeForm.date_fin} 
                onChange={handleCongeChange} 
                required
              />
            </div>
            
            <div className="modal-buttons">
              <button onClick={() => setShowCongeForm(false)}>Annuler</button>
              <button onClick={soumettreDemandeConge} disabled={loading}>
                {loading ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

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
