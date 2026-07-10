import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import './App.css';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [postesVacants, setPostesVacants] = useState([]);
  const [loadingPostes, setLoadingPostes] = useState(true);
  const [notesService, setNotesService] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedPoste, setSelectedPoste] = useState(null);
  const [showPosteModal, setShowPosteModal] = useState(false);
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
    }
    
    if (savedMatricule) {
      setIsLoggedIn(true);
      setUserName(`${savedPrenom} ${savedNom}`);
      setUserEmail(savedEmail);
    }

    // Charger les données
    fetchPostesVacants();
    fetchNotesService();
  }, []);

  const handleVoirPlus = (poste) => {
    setSelectedPoste(poste);
    setShowPosteModal(true);
  };

  const handlePostulerDepuisModal = () => {
    setShowPosteModal(false);
    if (selectedPoste) {
      localStorage.setItem('selectedPosteId', selectedPoste.id);
      localStorage.setItem('selectedPosteIntitule', selectedPoste.intitule);
      navigate('/postuler');
    }
  };

  const fetchPostesVacants = async () => {
    setLoadingPostes(true);
    try {
      const response = await fetch('/api/postes-vacants/');
      if (response.ok) {
        const data = await response.json();
        // Filtrer uniquement les annonces publiées
        const annoncesPubliees = data.filter(poste => poste.statut === 'publie');
        setPostesVacants(annoncesPubliees);
      } else {
        console.error('Erreur chargement postes vacants');
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoadingPostes(false);
    }
  };

  const fetchNotesService = async () => {
    setLoadingNotes(true);
    try {
      const response = await fetch('/api/notes-service/');
      if (response.ok) {
        const data = await response.json();
        setNotesService(data);
      } else {
        console.error('Erreur chargement notes de service');
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoadingNotes(false);
    }
  };

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
      // Stocker l'ID du poste pour la candidature
      localStorage.setItem('selectedPosteId', poste.id);
      localStorage.setItem('selectedPosteIntitule', poste.intitule);
      navigate('/postuler');
    });
  };

  const handleAppRH = (appName) => {
    requireLogin(() => {
      const routes = {
        "Dossier Numérique": '/documents',
        "Demandes d'Actes": '/demarches',
        "Espace Congés": '/demarches',
        "Suivi Avancement": '/dashboard',
      };
      navigate(routes[appName] || '/dashboard');
    });
  };

  const handleViewFullNote = (note) => {
    setSelectedNote(note);
    setShowNoteModal(true);
  };

  // Formater la date
  const formatDate = (dateString) => {
    if (!dateString) return 'Date non définie';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
  };

  // Obtenir l'icône du tag
  const getTagIcon = (tag) => {
    const icons = {
      'Note de Service': '',
      'Communiqué': '📢',
      'Actualité': '',
      'Information': 'ℹ️'
    };
    return icons[tag] || '📌';
  };

  // Fonction pour afficher le contenu HTML depuis la BDD
  const renderContenuHTML = (contenu) => {
    if (!contenu) return <p>Aucun contenu disponible</p>;
    return <div dangerouslySetInnerHTML={{ __html: contenu }} />;
  };

  return (
    <div className="intranet-home">
      
      {/* BARRE DE NAVIGATION - PLUS D'ONGLET ACCUEIL */}
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img 
              src="/static/logo_MND.png" 
              alt="Logo Ministère du Numérique et de la Digitalisation" 
              className="mnd-official-logo" 
            />
          </a>
        </div>

        {/* Navigation sans l'onglet Accueil */}
        <PortalNav />

        <div className="nav-right">
          {isLoggedIn ? (
            <UserMenu />
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
            <h2>Bienvenue sur le Portail de gestion des Ressources Humaines</h2>
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
                <p>Congé, acte ou candidature  tout se fait en ligne en quelques clics.</p>
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
            
            {/* Opportunités de Carrière */}
            <section className="info-card-section" id="opportunites">
              <div className="section-header-premium">
                <span className="icon">💼</span>
                <h3>Opportunités de Carrière</h3>
              </div>
              <p className="section-desc">Appels à candidatures ouverts aux agents du MND.</p>
              
              {loadingPostes ? (
                <div className="loading-postes" style={{ textAlign: 'center', padding: '40px' }}>
                  <p>Chargement des opportunités...</p>
                </div>
              ) : postesVacants.length === 0 ? (
                <div className="no-postes" style={{ textAlign: 'center', padding: '40px', background: '#F8FAFC', borderRadius: '12px' }}>
                  <p> Aucune opportunité de carrière pour le moment.</p>
                  <small>Revenez plus tard pour découvrir les nouvelles annonces.</small>
                </div>
              ) : (
                <div className="postes-list">
                  {postesVacants.map((poste) => (
                    <div key={poste.id} className="poste-item-card">
                      <div className="poste-main-info">
                        <span className="poste-badge-type">
                          {poste.directionDemande ? poste.directionDemande : 'Appel à candidature interne'}
                        </span>
                        <h4>{poste.intitule}</h4>
                        <p className="poste-direction">📍 {poste.directionDemande || 'Ministère du Numérique'}</p>
                        {poste.description && (
                          <>
                            <p className="poste-description" style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem' }}>
                              {poste.description.substring(0, 150)}...
                            </p>
                            <button 
                              className="btn-lire-plus" 
                              onClick={() => handleVoirPlus(poste)}
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                color: '#D4AF37', 
                                fontWeight: 'bold', 
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                padding: '0',
                                marginTop: '0.3rem'
                              }}
                            >
                              Lire la description complète →
                            </button>
                          </>
                        )}
                      </div>
                      <div className="poste-action-zone">
                        <span className="limit-date">
                          Limite : <strong>{formatDate(poste.date_cloture)}</strong>
                        </span>
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
              )}
            </section>

            {/* Notes de Service - DYNAMIQUE AVEC MODAL */}
            <section className="info-card-section mt-2">
              <div className="section-header-premium">
                <span className="icon">📢</span>
                <h3>Notes de Service</h3>
              </div>
              
              {loadingNotes ? (
                <div className="loading-notes" style={{ textAlign: 'center', padding: '40px' }}>
                  <p>Chargement des actualités...</p>
                </div>
              ) : notesService.length === 0 ? (
                <div className="no-notes" style={{ textAlign: 'center', padding: '40px', background: '#F8FAFC', borderRadius: '12px' }}>
                  <p> Aucune note de service pour le moment.</p>
                </div>
              ) : (
                <div className="news-list">
                  {notesService.map((note) => (
                    <div key={note.id} className="news-item">
                      <div className="news-meta">
                        <span className="news-tag-style">
                          {getTagIcon(note.tag)} {note.tag || 'Note de Service'}
                        </span>
                        <span className="news-date-style">
                          {formatDate(note.date_publication)}
                        </span>
                      </div>
                      <h4>{note.titre}</h4>
                      <p style={{ color: '#475569', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '0.5rem' }}>
                        {note.contenu?.replace(/<[^>]*>/g, '').substring(0, 150)}...
                      </p>
                      <div className="news-actions">
                        {note.fichier_pdf && (
                          <a 
                            href={note.fichier_pdf} 
                            className="news-link-btn" 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                             Télécharger le PDF →
                          </a>
                        )}
                        {note.contenu && (
                          <a 
                            href="#lire" 
                            className="news-link-btn"
                            onClick={(e) => {
                              e.preventDefault();
                              handleViewFullNote(note);
                            }}
                          >
                             Lire la note complète →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>

          <div className="right-column">
            
            {/* Vos Applications RH */}
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

            {/* Liens Utiles */}
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

      {/* MODAL NOTE DE SERVICE COMPLÈTE */}
      {showNoteModal && selectedNote && (
        <div className="note-modal-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="note-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="note-modal-close" onClick={() => setShowNoteModal(false)}>✕</button>
            
            <div className="note-modal-header">
              <div className="note-modal-tag">
                {getTagIcon(selectedNote.tag)} {selectedNote.tag || 'Note de Service'}
              </div>
              <h2>{selectedNote.titre}</h2>
              <div className="note-modal-meta">
                <span> Publiée le : {formatDate(selectedNote.date_publication)}</span>
                {selectedNote.created_by && <span>👤 Publié par : {selectedNote.created_by}</span>}
                {selectedNote.statut && <span> Statut : {selectedNote.statut}</span>}
              </div>
            </div>
            
            <div className="note-modal-body">
              {renderContenuHTML(selectedNote.contenu)}
            </div>
            
            {selectedNote.fichier_pdf && (
              <div className="note-modal-footer">
                <a 
                  href={selectedNote.fichier_pdf} 
                  className="btn-pdf-download"
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                   Télécharger la version PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DESCRIPTION POSTE */}
      {showPosteModal && selectedPoste && (
        <div className="modal-overlay" onClick={() => setShowPosteModal(false)}>
          <div className="modal-content note-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="note-modal-close" onClick={() => setShowPosteModal(false)}>✕</button>
            
            <div className="note-modal-header">
              <div className="note-modal-tag">
                💼 Appel à candidature interne
              </div>
              <h2>{selectedPoste.intitule}</h2>
              <div className="note-modal-meta">
                <span>📍 {selectedPoste.directionDemande || 'Ministère du Numérique'}</span>
                <span>📅 Clôture : {formatDate(selectedPoste.date_cloture)}</span>
              </div>
            </div>
            
            <div className="note-modal-body">
              <div dangerouslySetInnerHTML={{ __html: selectedPoste.description || 'Aucune description disponible' }} />
            </div>
            
            <div className="note-modal-footer" style={{ display: 'flex', gap: '15px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button 
                className="btn-cancel" 
                onClick={() => setShowPosteModal(false)}
                style={{ padding: '10px 25px' }}
              >
                Fermer
              </button>
              <button 
                className="btn-apply-small" 
                onClick={handlePostulerDepuisModal}
                style={{ padding: '10px 30px', fontSize: '1rem' }}
              >
                📝 Postuler maintenant
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
            <img src="/static/logo2.png" alt="Logo MND" className="footer-logo-official-center" />
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