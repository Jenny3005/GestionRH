import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import './App.css';

export default function DashboardAgent() {
  const navigate = useNavigate();
  const storedNom = localStorage.getItem('userNom') || '';
  const storedPrenom = localStorage.getItem('userPrenom') || '';
  const storedEmail = localStorage.getItem('userEmail') || '';
  const storedMatricule = localStorage.getItem('userMatricule') || '';
  const [userInfo, setUserInfo] = useState({
    nom: storedNom,
    prenom: storedPrenom,
    matricule: storedMatricule,
    email: storedEmail,
    telephone: '',
    poste: '',
    direction: '',
    typecontrat: ''
  });
  const [demandesRecentes, setDemandesRecentes] = useState([]);
  const [soldeConge, setSoldeConge] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSoldeModal, setShowSoldeModal] = useState(false);
  const [tauxCompletude, setTauxCompletude] = useState(0);
  const [expiryChecked, setExpiryChecked] = useState(false);
  
  // États pour le modal de suivi
  const [showSuiviModal, setShowSuiviModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);

  const matricule = localStorage.getItem('userMatricule');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchUserInfo();
    fetchDemandesRecentes();
    fetchSoldeConge();
    checkExpiryOnce();
    fetchAllNotifications();
    fetchTauxCompletude();
  }, []);

  const fetchTauxCompletude = async () => {
    try {
      const response = await fetch(`/api/documents/?matricule=${matricule}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Matricule': matricule
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.dossier) {
          setTauxCompletude(data.dossier.taux_completude);
        }
      }
    } catch (error) {
      console.error('Erreur taux complétude:', error);
    }
  };

  const checkExpiryOnce = async () => {
    if (expiryChecked) return;
    try {
      await fetch(`http://localhost:8000/api/check-expiry/`);
      setExpiryChecked(true);
    } catch (error) {
      console.error('Erreur check-expiry:', error);
    }
  };

  const fetchAllNotifications = async () => {
    setLoading(true);
    try {
      fetch('http://localhost:8000/api/avancements/calculer/').catch(() => {});
      const notifResponse = await fetch(`http://localhost:8000/api/notifications/${matricule}/`);
      let notifs = [];
      if (notifResponse.ok) {
        notifs = await notifResponse.json();
      }
      setNotifications(notifs.slice(0, 20));
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    } finally {
      setLoading(false);
    }
  };

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
          typecontrat: data.typecontrat || 'APE'
        });
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const fetchDemandesRecentes = async () => {
    const matricule = localStorage.getItem('userMatricule');
    const url = `/api/conges/mes-demandes/${matricule}/`;

    try {
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
      
        if (Array.isArray(data) && data.length > 0) {
          const formatted = data.slice(0, 5).map(d => {
            let statutAffichage = d.statut;
            if (d.statut === 'valide') statutAffichage = 'Approuvée';
            else if (d.statut === 'refuse') statutAffichage = 'Rejetée';
            else if (d.statut === 'en_attente_chef') statutAffichage = 'En attente';
            else if (d.statut === 'transmise_dpaf') statutAffichage = 'Transmise au DPAF';
            else if (d.statut === 'assignee_rh') statutAffichage = 'Assignée au RH';
            else if (d.statut === 'en_cours_traitement') statutAffichage = 'En traitement';
            else if (d.statut === 'acte_genere') statutAffichage = 'Acte généré';
            else if (d.statut === 'remis') statutAffichage = 'Acte remis';
            else if (d.statut === 'signe') statutAffichage = 'Signé';
            else if (d.statut === 'termine') statutAffichage = 'Terminé';
          
            let periode = '-';
            if (d.date_debut && d.date_fin) {
              periode = `${d.date_debut} → ${d.date_fin}`;
            }
          
            return {
              id: d.id,
              type: d.type_demande || 'Demande',
              periode: periode,
              date: d.date_soumission ? new Date(d.date_soumission).toLocaleDateString('fr-FR') : '-',
              statut: statutAffichage,
              statutBrut: d.statut,
              date_soumission: d.date_soumission,
              agent_rh_nom: d.agent_rh_nom,
              agent_rh_prenom: d.agent_rh_prenom
            };
          });
          setDemandesRecentes(formatted);
        } else {
          setDemandesRecentes([]);
        }
      } else {
        setDemandesRecentes([]);
      }
    } catch (error) {
      console.error('❌ Erreur fetch demandes:', error);
      setDemandesRecentes([]);
    }
  };

  const fetchSoldeConge = async () => {
    try {
      const response = await fetch(`/api/conges/solde/${matricule}/`);
      
      if (response.ok) {
        const data = await response.json();
        setSoldeConge(data);
      }
    } catch (error) {
      console.error('Erreur solde:', error);
    }
  };

  const marquerNotificationLue = async (notificationId) => {
    if (notificationId === 'all') {
      try {
        await fetch(`http://localhost:8000/api/notifications/${encodeURIComponent(matricule)}/lues/`, { 
          method: 'PUT' 
        });
        fetchAllNotifications();
      } catch (error) {
        console.error('Erreur:', error);
      }
    } else if (typeof notificationId === 'number') {
      try {
        await fetch(`http://localhost:8000/api/notifications/${notificationId}/lue/`, { 
          method: 'PUT' 
        });
        fetchAllNotifications();
      } catch (error) {
        console.error('Erreur:', error);
      }
    }
  };

  const supprimerNotification = async (notificationId, e) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    
    try {
      await fetch(`http://localhost:8000/api/notifications/${notificationId}/supprimer/`, { 
        method: 'DELETE' 
      });
    } catch (error) {
      console.error('Erreur:', error);
      fetchAllNotifications();
    }
  };

  const handleSupprimerToutesNotifications = async () => {
    if (!window.confirm('Supprimer définitivement toutes les notifications ?')) return;
    setNotifications([]);
    
    try {
      await fetch(`http://localhost:8000/api/notifications/${encodeURIComponent(matricule)}/supprimer-toutes/`, { 
        method: 'DELETE' 
      });
    } catch (error) {
      console.error('Erreur:', error);
      fetchAllNotifications();
    }
  };

  const openSoldeModal = () => {
    fetchSoldeConge();
    setShowSoldeModal(true);
  };

  const handleVoirSuivi = (demande) => {
    setSelectedDemande(demande);
    setShowSuiviModal(true);
  };

  const userName = `${userInfo.prenom} ${userInfo.nom}`;
  const unreadCount = notifications.filter(n => !n.lue).length;

  const stats = [
    { label: "Demandes en cours", value: demandesRecentes.filter(d => d.statut === 'En attente').length.toString(), icon: "📋", color: "#3B82F6" },
    { label: "Solde congés", value: soldeConge?.jours_restants || "0", icon: "🌴", color: "#10B981", unit: "jours" },
    { label: "Notifications", value: unreadCount.toString(), icon: "🔔", color: "#F59E0B" },
    { label: "Complétude dossier", value: `${tauxCompletude}%`, icon: "📊", color: "#8B5CF6" }
  ];

  // ✅ FONCTIONS POUR LA TIMELINE - CORRIGÉES
  const getNiveauStatut = (statut) => {
    const niveaux = {
      'En attente': 1, 'en_attente_chef': 1,
      'Approuvée': 2, 'valide': 2,
      'Transmise au DPAF': 3, 'transmise_dpaf': 3,
      'Assignée au RH': 4, 'assignee_rh': 4,
      'En traitement': 5, 'en_cours_traitement': 5,
      'Acte généré': 6, 'acte_genere': 6,
      'Acte remis': 7, 'remis': 7,
      'Signé': 7, 'signe': 7,
      'Terminé': 7, 'termine': 7
    };
    return niveaux[statut] || 1;
  };

  const statutReel = selectedDemande?.statutBrut || selectedDemande?.statut;
  const niveauActuel = getNiveauStatut(statutReel);
  
  const estComplete = (niveauRequis) => niveauActuel >= niveauRequis;
  const estActive = (niveauRequis) => niveauActuel === niveauRequis - 1;

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
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Bienvenue sur votre Espace Agent</h2>
            <p>Bonjour {userInfo.prenom} {userInfo.nom} ! Gérez vos demandes, consultez vos congés et suivez votre carrière.</p>
          </div>
        </section>

        {/* STATISTIQUES */}
        <div className="agent-stats-grid">
          {stats.map((stat, index) => (
            <div key={index} className="agent-stat-card" style={{ borderLeftColor: stat.color }}>
              <div className="agent-stat-icon">{stat.icon}</div>
              <div className="agent-stat-info">
                <span className="agent-stat-value">{stat.value}</span>
                <span className="agent-stat-label">{stat.label}</span>
                {stat.unit && <span className="agent-stat-unit">{stat.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* GRILLE PRINCIPALE */}
        <div className="agent-dashboard-grid">
          {/* Demandes récentes */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>📋 Demandes récentes</h3>
              <button className="agent-card-btn" onClick={() => navigate('/demarches')}>Voir tout →</button>
            </div>
            <div className="agent-table-container">
              <table className="agent-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Période</th>
                    <th>Date demande</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {demandesRecentes.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                        📭 Aucune demande récente
                      </td>
                    </tr>
                  ) : (
                    demandesRecentes.map((d) => {
                      let badgeClass = 'rejected';
                      if (d.statut === 'Approuvée' || d.statut === 'Acte généré' || d.statut === 'Acte remis' || d.statut === 'Signé' || d.statut === 'Terminé') {
                        badgeClass = 'approved';
                      } else if (d.statut === 'En attente') {
                        badgeClass = 'pending';
                      } else if (d.statut === 'En traitement') {
                        badgeClass = 'progress';
                      }
                      
                      return (
                        <tr key={d.id}>
                          <td>{d.type}</td>
                          <td>{d.periode}</td>
                          <td>{d.date}</td>
                          <td>
                            <span className={`status-badge ${badgeClass}`}>
                              {d.statut}
                            </span>
                          </td>
                          <td className="rh-actions-cell">
                            <button className="btn-view" onClick={() => handleVoirSuivi(d)}>
                              👁️ Voir suivi
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Solde congés */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>🌴 Solde congés {soldeConge?.annee || new Date().getFullYear()}</h3>
              <button className="agent-card-btn" onClick={() => navigate('/demarches')}>Demander →</button>
            </div>
            <div className="soldes-conges">
              <div className="solde-item">
                <span className="solde-label">Jours acquis</span>
                <span className="solde-value">{soldeConge?.jours_acquis || 0} jours</span>
              </div>
              <div className="solde-item">
                <span className="solde-label">Jours pris</span>
                <span className="solde-value">{soldeConge?.jours_pris || 0} jours</span>
              </div>
              <div className="solde-item">
                <span className="solde-label">Jours restants</span>
                <span className="solde-value highlight">{soldeConge?.jours_restants || 0} jours</span>
              </div>
              <div className="progress-bar-conges">
                <div className="progress-fill-conges" style={{ 
                  width: `${((soldeConge?.jours_pris || 0) / (soldeConge?.jours_acquis || 30)) * 100}%` 
                }}></div>
              </div>
              <div className="progress-labels">
                <span>Pris {soldeConge?.jours_pris || 0}j</span>
                <span>Restant {soldeConge?.jours_restants || 0}j</span>
              </div>
              <button className="btn-detail-solde" onClick={openSoldeModal}>
                📊 Voir détails
              </button>
            </div>
          </div>
        </div>

        {/* DEUXIÈME LIGNE */}
        <div className="agent-dashboard-grid">
          {/* Notifications */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>🔔 Notifications</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="agent-card-btn" onClick={() => marquerNotificationLue('all')}>Marquer tout lu</button>
                <button className="agent-card-btn" onClick={handleSupprimerToutesNotifications} style={{ color: '#dc3545' }}>🗑️ Tout supprimer</button>
              </div>
            </div>
            <div className="notifications-list">
              {notifications.length === 0 ? (
                <p className="no-notifications">Aucune notification</p>
              ) : (
                notifications.map((notif) => (
                  <div 
                    key={notif.id} 
                    className={`notification-item ${!notif.lue ? 'unread' : ''}`}
                    onClick={() => {
                      if (!notif.lue) {
                        marquerNotificationLue(notif.id);
                      }
                      if (notif.message.includes('acte') || notif.message.includes('Acte') || notif.type === 'acte_disponible') {
                        navigate('/documents');
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="notification-icon">
                      {notif.type === 'success' && '✅'}
                      {notif.type === 'info' && 'ℹ️'}
                      {notif.type === 'warning' && '⏰'}
                      {notif.type === 'danger' && '⚠️'}
                      {notif.type === 'document' && '📄'}
                      {notif.type === 'expiration' && '⚠️'}
                      {notif.type === 'validation_conge' && '✅'}
                      {notif.type === 'demande_conge' && '📋'}
                      {notif.type === 'assignation' && '📌'}
                      {notif.type === 'acte_disponible' && '📄'}
                      {notif.type === 'acte_signe' && '✅'}
                      {notif.type === 'acte_recu' && '📄'}
                    </div>
                    <div className="notification-content">
                      <div className="notification-message">{notif.message}</div>
                      <div className="notification-date">{notif.date_envoi}</div>
                    </div>
                    {!notif.lue && <div className="notification-badge"></div>}
                    <div 
                      className="notification-delete" 
                      onClick={(e) => {
                        e.stopPropagation();
                        supprimerNotification(notif.id, e);
                      }}
                      title="Supprimer"
                      style={{ cursor: 'pointer', marginLeft: '10px', opacity: 0.6, fontSize: '14px' }}
                    >
                      🗑️
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Prochain avancement */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>📈 Prochain avancement</h3>
              <button className="agent-card-btn" onClick={() => navigate('/carriere')}>Détails →</button>
            </div>
            <div className="avancement-info">
              <div className="avancement-item">
                <span className="avancement-label">Échelon actuel</span>
                <span className="avancement-value">À renseigner</span>
              </div>
              <div className="avancement-item">
                <span className="avancement-label">Prochain échelon</span>
                <span className="avancement-value highlight">En attente</span>
              </div>
              <div className="avancement-status">
                <span className="status-info">ℹ️ Les avancements sont gérés par l'administration</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL SOLDE CONGÉS */}
      {showSoldeModal && (
        <div className="modal-overlay" onClick={() => setShowSoldeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🌴 Détail du solde de congés</h3>
              <button className="modal-close" onClick={() => setShowSoldeModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="solde-info-annee">
                <span className="label">Année</span>
                <span className="value">{soldeConge?.annee || new Date().getFullYear()}</span>
              </div>
              
              <div className="solde-detail-card">
                <div className="solde-detail-item">
                  <div className="solde-detail-icon">📅</div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours acquis</span>
                    <span className="solde-detail-value">{soldeConge?.jours_acquis || 30} jours</span>
                    <span className="solde-detail-sub">Base légale</span>
                  </div>
                </div>
                
                <div className="solde-detail-item">
                  <div className="solde-detail-icon">✅</div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours pris</span>
                    <span className="solde-detail-value">{soldeConge?.jours_pris || 0} jours</span>
                    <span className="solde-detail-sub">Congés déjà consommés</span>
                  </div>
                </div>
                
                <div className="solde-detail-item highlight">
                  <div className="solde-detail-icon">🌟</div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours restants</span>
                    <span className="solde-detail-value large">{soldeConge?.jours_restants || 30} jours</span>
                    <span className="solde-detail-sub">Encore disponible</span>
                  </div>
                </div>
              </div>
              
              <div className="solde-progress-detail">
                <div className="progress-label-detail">
                  <span>Taux d'utilisation</span>
                  <span>{Math.round(((soldeConge?.jours_pris || 0) / (soldeConge?.jours_acquis || 30)) * 100)}%</span>
                </div>
                <div className="progress-bar-detail">
                  <div className="progress-fill-detail" style={{ 
                    width: `${((soldeConge?.jours_pris || 0) / (soldeConge?.jours_acquis || 30)) * 100}%` 
                  }}></div>
                </div>
              </div>
              
              <div className="solde-historique">
                <h4>📋 Informations</h4>
                <ul>
                  <li>✓ 30 jours de congés par an</li>
                  <li>✓ Les congés non pris sont perdus en fin d'année</li>
                  <li>✓ Maximum 2 demandes de congé par an</li>
                  <li>✓ Maximum 30 jours consécutifs</li>
                </ul>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-demander-conge" onClick={() => {
                setShowSoldeModal(false);
                navigate('/demandes/conge');
              }}>
                📝 Demander un congé
              </button>
              <button className="btn-close-modal" onClick={() => setShowSoldeModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUIVI DE LA DEMANDE - CORRIGÉ */}
      {showSuiviModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowSuiviModal(false)}>
          <div className="modal-content suivi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header suivi-modal-header">
              <div className="header-icon-wrapper">
                <span className="header-icon">📋</span>
                <h3>Suivi de votre demande</h3>
              </div>
              <button className="modal-close" onClick={() => setShowSuiviModal(false)}>✕</button>
            </div>
            
            <div className="modal-body suivi-modal-body">
              {/* Carte Agent */}
              <div className="suivi-agent-card">
                <div className="agent-avatar">
                  <span>{userInfo.prenom?.charAt(0)}{userInfo.nom?.charAt(0)}</span>
                </div>
                <div className="agent-info-card">
                  <h4>{userInfo.nom} {userInfo.prenom}</h4>
                  <p className="agent-matricule">Matricule: {userInfo.matricule}</p>
                </div>
              </div>

              {/* Carte Détails Demande */}
              <div className="suivi-details-card">
                <div className="detail-item">
                  <span className="detail-icon">📌</span>
                  <div className="detail-content">
                    <span className="detail-label">Type de demande</span>
                    <strong className="detail-value">{selectedDemande.type}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">📅</span>
                  <div className="detail-content">
                    <span className="detail-label">Période</span>
                    <strong className="detail-value">{selectedDemande.periode}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">📅</span>
                  <div className="detail-content">
                    <span className="detail-label">Date de soumission</span>
                    <strong className="detail-value">
                      {selectedDemande.date_soumission 
                        ? new Date(selectedDemande.date_soumission).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                        : '-'}
                    </strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">👥</span>
                  <div className="detail-content">
                    <span className="detail-label">Assigné à</span>
                    <strong className="detail-value">{selectedDemande.agent_rh_nom || 'Non assigné'} {selectedDemande.agent_rh_prenom || ''}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">📄</span>
                  <div className="detail-content">
                    <span className="detail-label">Statut actuel</span>
                    <strong className="detail-value">{selectedDemande.statut}</strong>
                  </div>
                </div>
              </div>

              {/* Timeline moderne - AVEC SYSTÈME DE NIVEAU */}
              <div className="suivi-timeline-modern">
                <h4 className="timeline-title">📅 Chronologie du traitement</h4>
                
                <div className="timeline-modern">
                  {/* Étape 1 - Demande soumise - Niveau 1 */}
                  <div className={`timeline-modern-step ${estComplete(1) ? 'completed' : 'active'}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">📝</span>
                        <span className="step-title">Demande soumise</span>
                        <span className="step-status">Par vous</span>
                      </div>
                      <p className="step-description">Votre demande a été soumise le {selectedDemande.date_soumission ? new Date(selectedDemande.date_soumission).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                  </div>

                  {/* Étape 2 - Validation du chef - Niveau 2 */}
                  <div className={`timeline-modern-step ${estComplete(2) ? 'completed' : estActive(2) ? 'active' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">👔</span>
                        <span className="step-title">Validation du chef</span>
                        <span className="step-status">Par votre supérieur</span>
                      </div>
                      <p className="step-description">Votre chef de service valide la demande</p>
                    </div>
                  </div>

                  {/* Étape 3 - Transmission au DPAF - Niveau 3 */}
                  <div className={`timeline-modern-step ${estComplete(3) ? 'completed' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">📤</span>
                        <span className="step-title">Transmission au DPAF</span>
                        <span className="step-status">Par la secrétaire</span>
                      </div>
                      <p className="step-description">Votre demande est transmise pour assignment</p>
                    </div>
                  </div>

                  {/* Étape 4 - Assignation à un agent RH - Niveau 4 */}
                  <div className={`timeline-modern-step ${estComplete(4) ? 'completed' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">👥</span>
                        <span className="step-title">Assignation à un agent RH</span>
                        <span className="step-status">Agent: {selectedDemande.agent_rh_nom || 'En attente'}</span>
                      </div>
                      <p className="step-description">Un agent RH est assigné à votre dossier</p>
                    </div>
                  </div>

                  {/* Étape 5 - Traitement par l'agent RH - Niveau 5 */}
                  <div className={`timeline-modern-step ${estComplete(5) ? 'completed' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">⚙️</span>
                        <span className="step-title">Traitement par l'agent RH</span>
                        <span className="step-status">En cours</span>
                      </div>
                      <p className="step-description">L'agent RH vérifie et traite votre demande</p>
                    </div>
                  </div>

                  {/* Étape 6 - Génération de l'acte - Niveau 6 */}
                  <div className={`timeline-modern-step ${estComplete(6) ? 'completed' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">📄</span>
                        <span className="step-title">Génération de l'acte</span>
                        <span className="step-status">Par l'agent RH</span>
                      </div>
                      <p className="step-description">Votre acte est généré</p>
                    </div>
                  </div>

                  {/* Étape 7 - Signature par le DPAF - Niveau 7 */}
                  <div className={`timeline-modern-step ${estComplete(7) ? 'completed' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">✍️</span>
                        <span className="step-title">Signature par le DPAF</span>
                        <span className="step-status">Signature officielle</span>
                      </div>
                      <p className="step-description">Votre acte est signé électroniquement</p>
                    </div>
                  </div>

                  {/* Étape 8 - Remise à l'agent - Niveau 7 (final) */}
                  <div className={`timeline-modern-step ${estComplete(7) ? 'completed' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">✅</span>
                        <span className="step-title">Acte remis</span>
                        <span className="step-status">Par la secrétaire</span>
                      </div>
                      <p className="step-description">Votre acte vous a été remis</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer suivi-modal-footer">
              <button className="btn-fermer" onClick={() => setShowSuiviModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

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
                <li><a href="#carriere">Mon Profil & Carrière</a></li>
                <li><a href="#demarches">Démarches en Ligne</a></li>
                <li><a href="#documents">Documents & Notes</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Liens Utiles</h4>
              <ul>
                <li><a href="https://www.numerique.gouv.bj" target="_blank" rel="noopener noreferrer">Portail du Ministère</a></li>
                <li><a href="https://eservices.travail.gouv.bj" target="_blank" rel="noopener noreferrer">E-Services SIGRH</a></li>
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-18/" target="_blank" rel="noopener noreferrer">Statut de l'Agent (SGG)</a></li>
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