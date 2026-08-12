import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import { Clipboard, Leaf, Bell, BarChart3, CheckCircle2, UserCheck, Share2, Zap, FileCheck, Signature, Package, MapPin, Phone, Mail, Trash2, X, User, CalendarDays, CheckCircle } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [soldeConge, setSoldeConge] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSoldeModal, setShowSoldeModal] = useState(false);
  const [tauxCompletude, setTauxCompletude] = useState(0);
  const [expiryChecked, setExpiryChecked] = useState(false);
  const [avancement, setAvancement] = useState(null);
  const [showSuiviModal, setShowSuiviModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);

  const matricule = localStorage.getItem('userMatricule');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }

    const loadAll = async () => {
      await fetch('/api/avancements/calculer/').catch(() => {});
      await fetchUserInfo();
      await fetchDemandesRecentes();
      await fetchSoldeConge();
      await checkExpiryOnce();
      await fetchAllNotifications();
      await fetchTauxCompletude();
      await fetchAvancement();
    };

    loadAll();
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

  const fetchAvancement = async () => {
    try {
      const response = await fetch(`/api/avancements/agent/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        // Prendre le premier avancement avec une date prévue (normal ou non)
        const prochain = data.find(a => a.date_prevue) || data[0] || null;
        setAvancement(prochain);
      }
    } catch (error) {
      console.error('Erreur chargement avancement:', error);
    }
};

  const checkExpiryOnce = async () => {
    if (expiryChecked) return;
    try {
      await fetch(`/api/check-expiry/`);
      setExpiryChecked(true);
    } catch (error) {
      console.error('Erreur check-expiry:', error);
    }
  };

  const fetchAllNotifications = async () => {
    setLoading(true);
    try {
      const notifResponse = await fetch(`/api/notifications/${matricule}/`);
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
      const response = await fetch(`/api/agent/${matricule}/`);
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
          const formatted = data.map(d => {
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
      console.error('Erreur fetch demandes:', error);
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
        await fetch(`/api/notifications/${encodeURIComponent(matricule)}/lues/`, { method: 'PUT' });
        fetchAllNotifications();
      } catch (error) {
        console.error('Erreur:', error);
      }
    } else if (typeof notificationId === 'number') {
      try {
        await fetch(`/api/notifications/${notificationId}/lue/`, { method: 'PUT' });
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
      await fetch(`/api/notifications/${notificationId}/supprimer/`, { method: 'DELETE' });
    } catch (error) {
      console.error('Erreur:', error);
      fetchAllNotifications();
    }
  };

  const handleSupprimerToutesNotifications = async () => {
    if (!window.confirm('Supprimer définitivement toutes les notifications ?')) return;
    setNotifications([]);
    try {
      await fetch(`/api/notifications/${encodeURIComponent(matricule)}/supprimer-toutes/`, { method: 'DELETE' });
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
    { label: "Demandes en cours", value: demandesRecentes.filter(d => d.statut === 'En attente').length.toString(), icon: <Clipboard size={20} />, color: "#3B82F6" },
    { label: "Solde congés", value: soldeConge?.jours_restants || "0", icon: <Leaf size={20} />, color: "#10B981", unit: "jours" },
    { label: "Notifications", value: unreadCount.toString(), icon: <Bell size={20} />, color: "#F59E0B" },
    { label: "Complétude dossier", value: `${tauxCompletude}%`, icon: <BarChart3 size={20} />, color: "#8B5CF6" }
  ];

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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredDemandes = demandesRecentes.filter((d) => {
    if (!normalizedSearchQuery) return true;
    return [d.type, d.periode, d.date, d.statut]
      .filter(Boolean)
      .some(field => field.toLowerCase().includes(normalizedSearchQuery));
  });

  const pageCount = Math.max(1, Math.ceil(filteredDemandes.length / rowsPerPage));
  const currentPageClamped = Math.min(Math.max(currentPage, 1), pageCount);
  const startIndex = (currentPageClamped - 1) * rowsPerPage;
  const currentRows = filteredDemandes.slice(startIndex, startIndex + rowsPerPage);

  const goToPrevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, pageCount));

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/static/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
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

        {/* GRILLE PRINCIPALE — Ligne 1 */}
        <div className="agent-dashboard-grid">
          {/* Demandes récentes */}
          <div className="agent-card">
            <div className="agent-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Demandes récentes</h3>
                <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    placeholder="Recherche..."
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
                  />
                </div>
              </div>
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
                  {filteredDemandes.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                        Aucune demande trouvée
                      </td>
                    </tr>
                  ) : (
                    currentRows.map((d) => {
                      let badgeClass = 'rejected';
                      if (['Approuvée', 'Acte généré', 'Acte remis', 'Signé', 'Terminé'].includes(d.statut)) {
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
                            <span className={`status-badge ${badgeClass}`}>{d.statut}</span>
                          </td>
                          <td className="rh-actions-cell">
                            <button className="btn-view" onClick={() => handleVoirSuivi(d)}>
                              Voir suivi
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0 0 0' }}>
              <div style={{ fontSize: '0.95rem', color: '#4b5563' }}>
                {filteredDemandes.length === 0
                  ? 'Aucun résultat'
                  : `Affichage ${startIndex + 1} à ${Math.min(startIndex + rowsPerPage, filteredDemandes.length)} sur ${filteredDemandes.length}`}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="agent-card-btn"
                  style={{ padding: '0.5rem 0.75rem', minWidth: '120px' }}
                  onClick={goToPrevPage}
                  disabled={currentPageClamped === 1}
                >
                  ← Précédent
                </button>
                <button
                  className="agent-card-btn"
                  style={{ padding: '0.5rem 0.75rem', minWidth: '120px' }}
                  onClick={goToNextPage}
                  disabled={currentPageClamped === pageCount || filteredDemandes.length === 0}
                >
                  Suivant 
                </button>
              </div>
            </div>
          </div>

          {/* Solde congés */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3><Leaf size={18} style={{ marginRight: '8px', color: '#10B981' }} />Solde congés {soldeConge?.annee || new Date().getFullYear()}</h3>
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
                Voir détails
              </button>
            </div>
          </div>
        </div>

        {/* GRILLE — Ligne 2 */}
        <div className="agent-dashboard-grid">
          {/* Notifications */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3><Bell size={18} style={{ marginRight: '8px', color: '#D4AF37' }} />Notifications</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="agent-card-btn" onClick={() => marquerNotificationLue('all')}>Marquer tout lu</button>
                <button className="agent-card-btn" onClick={handleSupprimerToutesNotifications} style={{ color: '#dc3545' }}><Trash2 size={16} style={{ marginRight: '6px' }} />Tout supprimer</button>
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
                      if (!notif.lue) marquerNotificationLue(notif.id);
                      if (notif.message.includes('acte') || notif.message.includes('Acte') || notif.type === 'acte_disponible') {
                        navigate('/documents');
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="notification-icon">
                      {notif.type === 'success' && ''}
                      {notif.type === 'info' && 'ℹ'}
                      {notif.type === 'warning' && ''}
                      {notif.type === 'danger' && ''}
                      {notif.type === 'document' && ''}
                      {notif.type === 'expiration' && ''}
                      {notif.type === 'validation_conge' && ''}
                      {notif.type === 'demande_conge' && ''}
                      {notif.type === 'assignation' && ''}
                      {notif.type === 'acte_disponible' && ''}
                      {notif.type === 'acte_signe' && ''}
                      {notif.type === 'acte_recu' && ''}
                    </div>
                    <div className="notification-content">
                      <div className="notification-message">{notif.message}</div>
                      <div className="notification-date">{notif.date_envoi}</div>
                    </div>
                    {!notif.lue && <div className="notification-badge"></div>}
                    <div
                      onClick={(e) => supprimerNotification(notif.id, e)}
                      title="Supprimer"
                      style={{ cursor: 'pointer', marginLeft: '10px', opacity: 0.6, fontSize: '14px' }}
                    >
                      
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Prochain avancement */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3> Prochain avancement</h3>
            </div>
            <div className="avancement-info">
              {avancement ? (
                <>
                  <div className="avancement-item">
                    <span className="avancement-label">Échelon actuel</span>
                    <span className="avancement-value">{avancement.echelon_ancien || 'Non défini'}</span>
                  </div>
                  <div className="avancement-item">
                    <span className="avancement-label">Prochain échelon</span>
                    <span className="avancement-value highlight">
                      {avancement.echelon_nouveau || avancement.echelon_ancien || 'Non défini'}
                    </span>
                  </div>
                  <div className="avancement-item">
                    <span className="avancement-label">Date prévue</span>
                    <span className="avancement-value">
                      {avancement.date_prevue
                        ? new Date(avancement.date_prevue).toLocaleDateString('fr-FR')
                        : avancement.type === 'plafonne' ? 'Plafonné' : 'Non définie'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="avancement-item">
                    <span className="avancement-label">Échelon actuel</span>
                    <span className="avancement-value">{userInfo.echelon || 'Non défini'}</span>
                  </div>
                  <div className="avancement-item">
                    <span className="avancement-label">Prochain échelon</span>
                    <span className="avancement-value highlight">En attente</span>
                  </div>
                </>
              )}
              <div className="avancement-status">
                <span className="status-info"> Les avancements sont gérés par l'administration</span>
              </div>
            </div>
          </div>
        </div>

        {/* GRILLE — Ligne 3 : Bulletin de notes */}
        <div className="agent-dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="agent-card">
            <div className="agent-card-header">
              <h3> Bulletin individuel de notes</h3>
            </div>
            <div style={{ padding: '16px 20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#6b7280', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                  Chaque année, les Ressources Humaines vous demande de compléter votre bulletin de notes.
                  Vos informations administratives sont <strong>préremplies automatiquement</strong> — vous n'avez qu'à vérifier,
                  compléter ce qui manque (enfants, situation familiale...) et télécharger le PDF prêt à remettre.
                </p>
                <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CheckCircle2 size={14} style={{ color: '#10B981' }} /> Infos administratives préremplies
                  </span>
                  <span style={{ fontSize: '13px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CheckCircle2 size={14} style={{ color: '#10B981' }} /> Critères selon votre catégorie
                  </span>
                  <span style={{ fontSize: '13px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CheckCircle2 size={14} style={{ color: '#10B981' }} /> Relevé de services calculé automatiquement
                  </span>
                </div>
              </div>
              <button
                className="btn-demander-conge"
                onClick={() => navigate('/bulletin-notes')}
                style={{ whiteSpace: 'nowrap', padding: '12px 28px', fontSize: '14px', fontWeight: '600' }}
              >
                 Générer mon bulletin
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL SOLDE CONGÉS */}
      {showSoldeModal && (
        <div className="modal-overlay" onClick={() => setShowSoldeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Détail du solde de congés</h3>
              <button className="modal-close" onClick={() => setShowSoldeModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="solde-info-annee">
                <span className="label">Année</span>
                <span className="value">{soldeConge?.annee || new Date().getFullYear()}</span>
              </div>
              <div className="solde-detail-card">
                <div className="solde-detail-item">
                  <div className="solde-detail-icon"></div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours acquis</span>
                    <span className="solde-detail-value">{soldeConge?.jours_acquis || 30} jours</span>
                    <span className="solde-detail-sub">Base légale</span>
                  </div>
                </div>
                <div className="solde-detail-item">
                  <div className="solde-detail-icon"></div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours pris</span>
                    <span className="solde-detail-value">{soldeConge?.jours_pris || 0} jours</span>
                    <span className="solde-detail-sub">Congés déjà consommés</span>
                  </div>
                </div>
                <div className="solde-detail-item highlight">
                  <div className="solde-detail-icon"></div>
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
                <h4>Informations</h4>
                <ul>
                  <li><CheckCircle2 size={14} style={{ marginRight: '6px', color: '#10B981' }} />30 jours de congés par an</li>
                  <li><CheckCircle2 size={14} style={{ marginRight: '6px', color: '#10B981' }} />Les congés non pris sont perdus en fin d'année</li>
                  <li><CheckCircle2 size={14} style={{ marginRight: '6px', color: '#10B981' }} />Maximum 2 demandes de congé par an</li>
                  <li><CheckCircle2 size={14} style={{ marginRight: '6px', color: '#10B981' }} />Maximum 30 jours consécutifs</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-demander-conge" onClick={() => { setShowSoldeModal(false); navigate('/demandes/conge'); }}>
                Demander un congé
              </button>
              <button className="btn-close-modal" onClick={() => setShowSoldeModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUIVI DEMANDE */}
      {showSuiviModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowSuiviModal(false)}>
          <div className="modal-content suivi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header suivi-modal-header">
              <div className="header-icon-wrapper">
                <span className="header-icon"><Clipboard size={18} /></span>
                <h3>Suivi de votre demande</h3>
              </div>
              <button className="modal-close" onClick={() => setShowSuiviModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body suivi-modal-body">
              <div className="suivi-agent-card">
                <div className="agent-avatar">
                  <span>{userInfo.prenom?.charAt(0)}{userInfo.nom?.charAt(0)}</span>
                </div>
                <div className="agent-info-card">
                  <h4>{userInfo.nom} {userInfo.prenom}</h4>
                  <p className="agent-matricule">Matricule: {userInfo.matricule}</p>
                </div>
              </div>

              <div className="suivi-details-card">
                <div className="detail-item">
                  <span className="detail-icon"><Clipboard size={16} /></span>
                  <div className="detail-content">
                    <span className="detail-label">Type de demande</span>
                    <strong className="detail-value">{selectedDemande.type}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon"><CalendarDays size={16} /></span>
                  <div className="detail-content">
                    <span className="detail-label">Période</span>
                    <strong className="detail-value">{selectedDemande.periode}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon"><CalendarDays size={16} /></span>
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
                  <span className="detail-icon"><User size={16} /></span>
                  <div className="detail-content">
                    <span className="detail-label">Assigné à</span>
                    <strong className="detail-value">{selectedDemande.agent_rh_nom || 'Non assigné'} {selectedDemande.agent_rh_prenom || ''}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon"><CheckCircle2 size={16} /></span>
                  <div className="detail-content">
                    <span className="detail-label">Statut actuel</span>
                    <strong className="detail-value">{selectedDemande.statut}</strong>
                  </div>
                </div>
              </div>

              <div className="suivi-timeline-modern">
                <h4 className="timeline-title">Chronologie du traitement</h4>
                <div className="timeline-modern">
                  {[
                    { icon: <CheckCircle2 size={24} />, titre: 'Demande soumise', sous: 'Par vous', desc: `Soumise le ${selectedDemande.date_soumission ? new Date(selectedDemande.date_soumission).toLocaleDateString('fr-FR') : '-'}`, niveau: 1 },
                    { icon: <UserCheck size={24} />, titre: 'Validation du chef', sous: 'Par votre supérieur', desc: 'Votre chef de service valide la demande', niveau: 2 },
                    { icon: <Share2 size={24} />, titre: 'Transmission au DPAF', sous: 'Par la secrétaire', desc: 'Votre demande est transmise pour assignation', niveau: 3 },
                    { icon: <UserCheck size={24} />, titre: 'Assignation à un agent RH', sous: `Agent: ${selectedDemande.agent_rh_nom || 'En attente'}`, desc: 'Un agent RH est assigné à votre dossier', niveau: 4 },
                    { icon: <Zap size={24} />, titre: 'Traitement par l\'agent RH', sous: 'En cours', desc: "L'agent RH vérifie et traite votre demande", niveau: 5 },
                    { icon: <FileCheck size={24} />, titre: 'Génération de l\'acte', sous: 'Par l\'agent RH', desc: 'Votre acte est généré', niveau: 6 },
                    { icon: <Signature size={24} />, titre: 'Signature par le DPAF', sous: 'Signature officielle', desc: 'Votre acte est signé électroniquement', niveau: 7 },
                    { icon: <Package size={24} />, titre: 'Acte remis', sous: 'Par la secrétaire', desc: 'Votre acte vous a été remis', niveau: 7 },
                  ].map((etape, i, arr) => (
                    <div key={i} className={`timeline-modern-step ${estComplete(etape.niveau) ? 'completed' : estActive(etape.niveau) ? 'active' : ''}`}>
                      <div className="timeline-modern-marker">
                        <div className="marker-dot"></div>
                        {i < arr.length - 1 && <div className="marker-line"></div>}
                      </div>
                      <div className="timeline-modern-content">
                        <div className="step-header">
                          <span className="step-icon">{etape.icon}</span>
                          <span className="step-title">{etape.titre}</span>
                          <span className="step-status">{etape.sous}</span>
                        </div>
                        <p className="step-description">{etape.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer suivi-modal-footer">
              <button className="btn-fermer" onClick={() => setShowSuiviModal(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
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
                <li><a href="https://www.numerique.gouv.bj" target="_blank" rel="noopener noreferrer">Portail du Ministère</a></li>
                <li><a href="https://eservices.travail.gouv.bj" target="_blank" rel="noopener noreferrer">E-Services SIGRH</a></li>
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-018/" target="_blank" rel="noopener noreferrer">Statut de l'Agent (SGG)</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Contact & Situation</h4>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><MapPin size={16} style={{ color: '#D4AF37' }} /> Avenue Jean-Paul II, Cotonou, Bénin</p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><Phone size={16} style={{ color: '#D4AF37' }} /> +229 21 30 70 13</p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><Mail size={16} style={{ color: '#D4AF37' }} /> numerique@gouv.bj</p>
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