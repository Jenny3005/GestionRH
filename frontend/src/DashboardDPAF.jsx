// DashboardDPAF.jsx - Version avec modal de suivi

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import usePermissions from './hooks/usePermissions';
import './App.css';

export default function DashboardDPAF() {
  const navigate = useNavigate();
  const { loading: permissionsLoading } = usePermissions();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // États
  const [demandesTransmises, setDemandesTransmises] = useState([]);
  const [demandesAssignees, setDemandesAssignees] = useState([]);
  const [agentsRH, setAgentsRH] = useState([]);
  
  // Modals
  const [showAssignerModal, setShowAssignerModal] = useState(false);
  const [showSuiviModal, setShowSuiviModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [selectedAgentRH, setSelectedAgentRH] = useState('');
  const [commentaire, setCommentaire] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    a_assigner: 0,
    assignees: 0,
    en_cours: 0,
    terminees: 0
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
    fetchAgentsRH();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Demandes transmises par la secrétaire (statut = 'transmise_dpaf')
      const transmisesRes = await fetch(`http://localhost:8000/api/dpaf/demandes-transmises/${matricule}/`);
      if (transmisesRes.ok) {
        const data = await transmisesRes.json();
        console.log('📋 Demandes transmises:', data);
        setDemandesTransmises(data);
      }

      // 2. Demandes déjà assignées
      const assigneesRes = await fetch(`http://localhost:8000/api/dpaf/demandes-assignees/${matricule}/`);
      if (assigneesRes.ok) {
        const data = await assigneesRes.json();
        setDemandesAssignees(data);
      }

      setStats({
        a_assigner: demandesTransmises.length,
        assignees: demandesAssignees.length,
        en_cours: demandesAssignees.filter(d => d.statut === 'en_cours_traitement').length,
        terminees: demandesAssignees.filter(d => d.statut === 'termine' || d.statut === 'acte_genere').length
      });

    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentsRH = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/agents/rh/');
      if (response.ok) {
        const data = await response.json();
        setAgentsRH(data);
      }
    } catch (error) {
      console.error('Erreur chargement agents RH:', error);
    }
  };

  const handleAssignerRH = async (demandeId) => {
    if (!selectedAgentRH) {
      alert('Veuillez sélectionner un agent RH');
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/dpaf/assigner-rh/${demandeId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_rh_matricule: selectedAgentRH,
          commentaire: commentaire,
          dpaf_matricule: matricule
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ Demande assignée à l'agent RH avec succès`);
        setShowAssignerModal(false);
        setSelectedDemande(null);
        setSelectedAgentRH('');
        setCommentaire('');
        fetchData();
      } else {
        alert(data.error || 'Erreur lors de l\'assignation');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleVoirDetails = (demande) => {
    setSelectedDemande(demande);
    setShowAssignerModal(true);
  };

  const handleVoirSuivi = (demande) => {
    setSelectedDemande(demande);
    setShowSuiviModal(true);
  };

  const getStatusBadge = (statut) => {
    const badges = {
      'transmise_dpaf': <span className="badge-warning">📤 Transmise</span>,
      'assignee_rh': <span className="badge-info">👥 Assignée RH</span>,
      'en_cours_traitement': <span className="badge-info">⚙️ En cours</span>,
      'acte_genere': <span className="badge-success">📄 Acte généré</span>,
      'termine': <span className="badge-success">✅ Terminé</span>
    };
    return badges[statut] || <span className="badge-secondary">{statut}</span>;
  };

  const getEtapeIcon = (statut) => {
    switch(statut) {
      case 'transmise_dpaf': return '📤';
      case 'assignee_rh': return '👥';
      case 'en_cours_traitement': return '⚙️';
      case 'acte_genere': return '📄';
      case 'termine': return '✅';
      default: return '⏳';
    }
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
              <div className="avatar-circle">{userName.charAt(0) || 'D'}</div>
              <div className="user-meta">
                <span className="user-name">{userName}</span>
                <span className="user-role">DPAF</span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => navigate('/dpaf/dashboard')}>📊 Tableau de bord</button>
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
            <h2>📊 Tableau de bord - DPAF</h2>
            <p>Gestion et assignment des demandes aux agents RH</p>
          </div>
        </section>

        {/* STATISTIQUES */}
        <div className="stats-container">
          <div className="stat-card" style={{ borderLeftColor: '#F59E0B' }}>
            <div className="stat-number">{stats.a_assigner}</div>
            <div className="stat-label">📋 À assigner</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#3B82F6' }}>
            <div className="stat-number">{stats.assignees}</div>
            <div className="stat-label">👥 Demandes assignées</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#8B5CF6' }}>
            <div className="stat-number">{stats.en_cours}</div>
            <div className="stat-label">⚙️ En cours</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#10B981' }}>
            <div className="stat-number">{stats.terminees}</div>
            <div className="stat-label">✅ Terminées</div>
          </div>
        </div>

        {/* SECTION 1: Demandes à assigner */}
        <div className="admin-section">
          <h3>📋 Demandes transmises par le secrétariat</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Matricule</th>
                  <th>Type</th>
                  <th>Période</th>
                  <th>Date transmission</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="text-center">⏳ Chargement...</td>
                  </tr>
                ) : demandesTransmises.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center">📭 Aucune demande à assigner</td>
                  </tr>
                ) : (
                  demandesTransmises.map((d) => (
                    <tr key={d.id}>
                      <td>{d.agent_nom} {d.agent_prenom}</td>
                      <td>{d.agent_matricule}</td>
                      <td>{d.type_demande}</td>
                      <td>{d.date_debut ? `${d.date_debut} - ${d.date_fin}` : '-'}</td>
                      <td>{d.date_transmission ? new Date(d.date_transmission).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <button 
                          className="btn-assigner"
                          onClick={() => handleVoirDetails(d)}
                        >
                          👥 Assigner à un RH
                        </button>
                       </td>
                     </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: Demandes assignées et suivi */}
        <div className="admin-section">
          <h3>📋 Demandes assignées - Suivi</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type</th>
                  <th>Agent RH</th>
                  <th>Statut</th>
                  <th>Date assignation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="text-center">⏳ Chargement...</td>
                  </tr>
                ) : demandesAssignees.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center">📭 Aucune demande assignée</td>
                  </tr>
                ) : (
                  demandesAssignees.map((d) => (
                    <tr key={d.id}>
                      <td>{d.agent_nom} {d.agent_prenom}</td>
                      <td>{d.type_demande}</td>
                      <td>{d.agent_rh_nom} {d.agent_rh_prenom}</td>
                      <td>{getStatusBadge(d.statut)}</td>
                      <td>{d.date_assignation ? new Date(d.date_assignation).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <button 
                          className="btn-view"
                          onClick={() => handleVoirSuivi(d)}
                        >
                          👁️ Voir suivi
                        </button>
                       </td>
                     </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL ASSIGNER À UN AGENT RH */}
      {showAssignerModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowAssignerModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>👥 Assigner à un agent RH</h3>
            <p>Demande de <strong>{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</strong></p>
            <p><strong>Type:</strong> {selectedDemande.type_demande}</p>
            <p><strong>Période:</strong> {selectedDemande.date_debut} - {selectedDemande.date_fin}</p>
            
            <div className="form-group">
              <label>Sélectionner un agent RH *</label>
              <select 
                value={selectedAgentRH} 
                onChange={(e) => setSelectedAgentRH(e.target.value)}
                required
              >
                <option value="">-- Choisir un agent RH --</option>
                {agentsRH.map(agent => (
                  <option key={agent.matricule} value={agent.matricule}>
                    {agent.nom} {agent.prenom} - {agent.poste || 'Agent RH'}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Instructions (optionnel)</label>
              <textarea
                rows="3"
                placeholder="Ajoutez des instructions pour l'agent RH..."
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
              />
            </div>
            
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowAssignerModal(false)}>Annuler</button>
              <button className="btn-assigner" onClick={() => handleAssignerRH(selectedDemande.id)}>Assigner</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUIVI DE LA DEMANDE */}
      {showSuiviModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowSuiviModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Suivi de la demande</h3>
              <button className="modal-close" onClick={() => setShowSuiviModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="suivi-info-agent">
                <h4>Agent concerné</h4>
                <p><strong>{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</strong></p>
                <p>Matricule: {selectedDemande.agent_matricule}</p>
              </div>
              
              <div className="suivi-info-demande">
                <h4>Détails de la demande</h4>
                <p><strong>Type:</strong> {selectedDemande.type_demande}</p>
                <p><strong>Période:</strong> {selectedDemande.date_debut} - {selectedDemande.date_fin}</p>
                <p><strong>Date d'assignation:</strong> {selectedDemande.date_assignation ? new Date(selectedDemande.date_assignation).toLocaleDateString('fr-FR') : '-'}</p>
              </div>
              
              <div className="suivi-timeline">
                <h4>📅 Chronologie</h4>
                
                <div className="timeline-step">
                  <div className={`timeline-icon ${selectedDemande.statut !== 'transmise_dpaf' ? 'completed' : 'current'}`}>
                    {selectedDemande.statut !== 'transmise_dpaf' ? '✓' : '📤'}
                  </div>
                  <div className="timeline-content">
                    <strong>Transmission au DPAF</strong>
                    <span className="timeline-date">Par la secrétaire</span>
                    <p>Demande transmise pour assignment</p>
                  </div>
                </div>
                
                <div className="timeline-step">
                  <div className={`timeline-icon ${selectedDemande.statut === 'assignee_rh' || selectedDemande.statut === 'en_cours_traitement' || selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'termine' ? 'completed' : selectedDemande.statut === 'transmise_dpaf' ? 'pending' : ''}`}>
                    {selectedDemande.statut === 'assignee_rh' || selectedDemande.statut === 'en_cours_traitement' || selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'termine' ? '✓' : '👥'}
                  </div>
                  <div className="timeline-content">
                    <strong>Assignation à un agent RH</strong>
                    <span className="timeline-date">Agent: {selectedDemande.agent_rh_nom} {selectedDemande.agent_rh_prenom}</span>
                    <p>Demande assignée pour traitement</p>
                  </div>
                </div>
                
                <div className="timeline-step">
                  <div className={`timeline-icon ${selectedDemande.statut === 'en_cours_traitement' || selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'termine' ? 'completed' : selectedDemande.statut === 'assignee_rh' ? 'current' : 'pending'}`}>
                    {selectedDemande.statut === 'en_cours_traitement' || selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'termine' ? '✓' : '⚙️'}
                  </div>
                  <div className="timeline-content">
                    <strong>Traitement par l'agent RH</strong>
                    <span className="timeline-date">En cours</span>
                    <p>L'agent RH traite la demande</p>
                  </div>
                </div>
                
                <div className="timeline-step">
                  <div className={`timeline-icon ${selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'termine' ? 'completed' : 'pending'}`}>
                    {selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'termine' ? '✓' : '📄'}
                  </div>
                  <div className="timeline-content">
                    <strong>Génération de l'acte</strong>
                    <span className="timeline-date">Par l'agent RH</span>
                    <p>Acte généré et envoyé à la secrétaire</p>
                  </div>
                </div>
                
                <div className="timeline-step">
                  <div className={`timeline-icon ${selectedDemande.statut === 'termine' ? 'completed' : 'pending'}`}>
                    {selectedDemande.statut === 'termine' ? '✓' : '✅'}
                  </div>
                  <div className="timeline-content">
                    <strong>Remise à l'agent</strong>
                    <span className="timeline-date">Par la secrétaire</span>
                    <p>Acte remis à l'agent concerné</p>
                  </div>
                </div>
              </div>
              
              {selectedDemande.commentaire_dpaf && (
                <div className="suivi-commentaire">
                  <h4>📝 Instructions du DPAF</h4>
                  <p>{selectedDemande.commentaire_dpaf}</p>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button className="btn-close-modal" onClick={() => setShowSuiviModal(false)}>Fermer</button>
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