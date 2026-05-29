import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import './App.css';

export default function DashboardRH() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // États
  const [demandesAssignee, setDemandesAssignee] = useState([]);
  const [demandesEnCours, setDemandesEnCours] = useState([]);
  const [demandesTerminees, setDemandesTerminees] = useState([]);
  const [actesGeneres, setActesGeneres] = useState([]);
  
  // Modals
  const [showTraiterModal, setShowTraiterModal] = useState(false);
  const [showGenererActeModal, setShowGenererActeModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [acteData, setActeData] = useState({
    reference: '',
    contenu: '',
    observations: ''
  });
  
  // Stats
  const [stats, setStats] = useState({
    a_traiter: 0,
    en_cours: 0,
    terminees: 0,
    actes_a_remettre: 0
  });

  const matricule = localStorage.getItem('userMatricule');
  const userName = `${localStorage.getItem('userPrenom') || ''} ${localStorage.getItem('userNom') || ''}`.trim();
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Demandes assignées par le DPAF (statut = 'assignee_rh')
      const assigneesRes = await fetch(`http://localhost:8000/api/rh/demandes-assignees/${matricule}/`);
      if (assigneesRes.ok) {
        const data = await assigneesRes.json();
        console.log('📋 Demandes assignées:', data);
        setDemandesAssignee(data);
      }

      // 2. Demandes en cours de traitement
      const enCoursRes = await fetch(`http://localhost:8000/api/rh/demandes-cours/${matricule}/`);
      if (enCoursRes.ok) {
        const data = await enCoursRes.json();
        setDemandesEnCours(data);
      }

      // 3. Demandes terminées
      const termineesRes = await fetch(`http://localhost:8000/api/rh/demandes-terminees/${matricule}/`);
      if (termineesRes.ok) {
        const data = await termineesRes.json();
        setDemandesTerminees(data);
      }

      // 4. Actes générés à envoyer à la secrétaire
      const actesRes = await fetch(`http://localhost:8000/api/rh/actes-a-envoyer/${matricule}/`);
      if (actesRes.ok) {
        const data = await actesRes.json();
        setActesGeneres(data);
      }

      // Mettre à jour les stats
      setStats({
        a_traiter: demandesAssignee.length,
        en_cours: demandesEnCours.length,
        terminees: demandesTerminees.length,
        actes_a_remettre: actesGeneres.length
      });

    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCommencerTraitement = async (demandeId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/rh/commencer-traitement/${demandeId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rh_matricule: matricule
        })
      });
      
      if (response.ok) {
        alert('✅ Traitement commencé');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleGenererActe = async (demandeId) => {
    if (!acteData.reference) {
      alert('Veuillez saisir une référence');
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/rh/generer-acte/${demandeId}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rh_matricule: matricule,
          reference: acteData.reference,
          contenu: acteData.contenu,
          observations: acteData.observations
        })
      });
      
      if (response.ok) {
        alert('✅ Acte généré et envoyé à la secrétaire');
        setShowGenererActeModal(false);
        setActeData({ reference: '', contenu: '', observations: '' });
        setSelectedDemande(null);
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleEnvoyerCorrection = async (acteId) => {
    if (!commentaire.trim()) {
      alert('Veuillez indiquer la correction à apporter');
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/rh/corriger-acte/${acteId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rh_matricule: matricule,
          commentaire: commentaire
        })
      });
      
      if (response.ok) {
        alert('✅ Acte renvoyé pour correction');
        setShowDetailsModal(false);
        setCommentaire('');
        setSelectedDemande(null);
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleVoirActe = (acteId) => {
    window.open(`http://localhost:8000/api/actes/${acteId}/download/`, '_blank');
  };

  const getStatusBadge = (statut) => {
    const badges = {
      'assignee_rh': <span className="badge-warning">📋 Nouvelle assignation</span>,
      'en_cours_traitement': <span className="badge-info">⚙️ En cours</span>,
      'acte_genere': <span className="badge-success">📄 Acte généré</span>,
      'envoye_secretaire': <span className="badge-success">📤 Envoyé secrétaire</span>,
      'termine': <span className="badge-success">✅ Terminé</span>
    };
    return badges[statut] || <span className="badge-secondary">{statut}</span>;
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  if (permissionsLoading) {
    return <div className="loading-screen">Chargement des permissions...</div>;
  }

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
        </div>
        <PortalNav />
        <div className="nav-right">
          <div className="user-menu-container">
            <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="avatar-circle">{userName.charAt(0) || 'R'}</div>
              <div className="user-meta">
                <span className="user-name">{userName}</span>
                <span className="user-role">Ressources Humaines</span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => navigate('/rh/dashboard')}>📊 Tableau de bord</button>
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
            <h2>📊 Tableau de bord - Ressources Humaines</h2>
            <p>Traitement des demandes assignées et génération des actes</p>
          </div>
        </section>

        {/* STATISTIQUES */}
        <div className="stats-container">
          <div className="stat-card" style={{ borderLeftColor: '#F59E0B' }}>
            <div className="stat-number">{stats.a_traiter}</div>
            <div className="stat-label">📋 À traiter</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#3B82F6' }}>
            <div className="stat-number">{stats.en_cours}</div>
            <div className="stat-label">⚙️ En cours</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#10B981' }}>
            <div className="stat-number">{stats.terminees}</div>
            <div className="stat-label">✅ Terminées</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#8B5CF6' }}>
            <div className="stat-number">{stats.actes_a_remettre}</div>
            <div className="stat-label">📄 Actes à envoyer</div>
          </div>
        </div>

        {/* SECTION 1: Demandes à traiter */}
        <div className="admin-section">
          <h3>📋 Nouvelles demandes assignées</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Matricule</th>
                  <th>Type</th>
                  <th>Période</th>
                  <th>Date assignation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center">⏳ Chargement...</td></tr>
                ) : demandesAssignee.length === 0 ? (
                  <tr><td colSpan="6" className="text-center">📭 Aucune demande à traiter</td></tr>
                ) : (
                  demandesAssignee.map((d) => (
                    <tr key={d.id}>
                      <td>{d.agent_nom} {d.agent_prenom}</td>
                      <td>{d.agent_matricule}</td>
                      <td>{d.type_demande}</td>
                      <td>{d.date_debut ? `${d.date_debut} - ${d.date_fin}` : '-'}</td>
                      <td>{d.date_assignation ? new Date(d.date_assignation).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <button 
                          className="btn-traiter"
                          onClick={() => handleCommencerTraitement(d.id)}
                        >
                          ▶️ Commencer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: Demandes en cours */}
        <div className="admin-section">
          <h3>⚙️ Demandes en cours de traitement</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type</th>
                  <th>Période</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="text-center">⏳ Chargement...</td></tr>
                ) : demandesEnCours.length === 0 ? (
                  <tr><td colSpan="5" className="text-center">📭 Aucune demande en cours</td></tr>
                ) : (
                  demandesEnCours.map((d) => (
                    <tr key={d.id}>
                      <td>{d.agent_nom} {d.agent_prenom}</td>
                      <td>{d.type_demande}</td>
                      <td>{d.date_debut ? `${d.date_debut} - ${d.date_fin}` : '-'}</td>
                      <td>{getStatusBadge(d.statut)}</td>
                      <td>
                        <button 
                          className="btn-generer"
                          onClick={() => {
                            setSelectedDemande(d);
                            setShowGenererActeModal(true);
                          }}
                        >
                          📄 Générer l'acte
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 3: Actes générés à envoyer */}
        <div className="admin-section">
          <h3>📄 Actes générés - En attente d'envoi</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type d'acte</th>
                  <th>Référence</th>
                  <th>Date génération</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="text-center">⏳ Chargement...</td></tr>
                ) : actesGeneres.length === 0 ? (
                  <tr><td colSpan="5" className="text-center">📭 Aucun acte en attente</td></tr>
                ) : (
                  actesGeneres.map((acte) => (
                    <tr key={acte.id}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{new Date(acte.date_generation).toLocaleDateString('fr-FR')}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.id)}>
                            👁️ Voir
                          </button>
                          <button 
                            className="btn-envoyer"
                            onClick={() => handleEnvoyerSecretaire(acte.id)}
                          >
                            📤 Envoyer à la secrétaire
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL GÉNÉRER ACTE */}
      {showGenererActeModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowGenererActeModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h3>📄 Générer l'acte administratif</h3>
            <p>Demande de <strong>{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</strong></p>
            
            <div className="form-group">
              <label>Référence de l'acte *</label>
              <input
                type="text"
                placeholder="Ex: 2026-001/MND/RH"
                value={acteData.reference}
                onChange={(e) => setActeData({...acteData, reference: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Contenu de l'acte</label>
              <textarea
                rows="6"
                placeholder="Décrivez le contenu de l'acte..."
                value={acteData.contenu}
                onChange={(e) => setActeData({...acteData, contenu: e.target.value})}
              />
            </div>
            
            <div className="form-group">
              <label>Observations (optionnel)</label>
              <textarea
                rows="3"
                placeholder="Observations supplémentaires..."
                value={acteData.observations}
                onChange={(e) => setActeData({...acteData, observations: e.target.value})}
              />
            </div>
            
            <div className="modal-buttons">
              <button onClick={() => setShowGenererActeModal(false)}>Annuler</button>
              <button onClick={() => handleGenererActe(selectedDemande.id)}>Générer l'acte</button>
            </div>
          </div>
        </div>
      )}

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