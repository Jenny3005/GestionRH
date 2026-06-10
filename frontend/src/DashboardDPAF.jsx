// DashboardDPAF.jsx - Version avec modale d'assignation améliorée et historique

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import usePermissions from './hooks/usePermissions';
import './App.css';

export default function DashboardDPAF() {
  const navigate = useNavigate();
  const { loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  
  // États
  const [demandesTransmises, setDemandesTransmises] = useState([]);
  const [demandesAssignees, setDemandesAssignees] = useState([]);
  const [demandesHistorique, setDemandesHistorique] = useState([]);
  const [actesASigner, setActesASigner] = useState([]);
  const [agentsRH, setAgentsRH] = useState([]);
  const [activeTab, setActiveTab] = useState('encours'); // 'encours' ou 'historique'
  const [hasSignature, setHasSignature] = useState(false);
  const [hasCachet, setHasCachet] = useState(false);
  
  // Modals
  const [showAssignerModal, setShowAssignerModal] = useState(false);
  const [showSuiviModal, setShowSuiviModal] = useState(false);
  const [showSignerModal, setShowSignerModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [selectedActe, setSelectedActe] = useState(null);
  const [selectedAgentRH, setSelectedAgentRH] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [signatureCommentaire, setSignatureCommentaire] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    a_assigner: 0,
    assignees: 0,
    en_cours: 0,
    terminees: 0,
    actes_a_signer: 0,
    historique_count: 0
  });

  const matricule = localStorage.getItem('userMatricule');
  const userName = `${localStorage.getItem('userPrenom') || ''} ${localStorage.getItem('userNom') || ''}`.trim();
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchAllData();
    fetchAgentsRH();
    fetchHistorique();
    checkSignatureCachet();
  }, []);

  // Charger UNIQUEMENT les agents avec rôle 'rh'
  const fetchAgentsRH = async () => {
    try {
      let response = await fetch('/api/agents/rh/');
      
      if (!response.ok) {
        response = await fetch('/api/agents/');
        if (response.ok) {
          const allAgents = await response.json();
          const agentsRHFiltered = allAgents.filter(agent => {
            if (agent.role !== 'rh') return false;
            if (agent.matricule === matricule) return false;
            return true;
          });
          setAgentsRH(agentsRHFiltered);
          return;
        }
      } else {
        const agentsRHData = await response.json();
        const agentsRHFiltered = agentsRHData.filter(agent => {
          if (agent.matricule === matricule) return false;
          return true;
        });
        setAgentsRH(agentsRHFiltered);
      }
    } catch (error) {
      console.error('Erreur chargement agents RH:', error);
      setAgentsRH([]);
    }
  };

  // Charger l'historique des demandes traitées
  const fetchHistorique = async () => {
    try {
      const response = await fetch(`/api/dpaf/demandes-historique/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setDemandesHistorique(data);
        setStats(prev => ({ ...prev, historique_count: data.length }));
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    }
  };

  // Charger toutes les données en parallèle
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [transmisesRes, assigneesRes, actesRes] = await Promise.all([
        fetch(`/api/dpaf/demandes-transmises/${matricule}/`),
        fetch(`/api/dpaf/demandes-assignees/${matricule}/`),
        fetch(`/api/dpaf/actes-a-signer/${matricule}/`)
      ]);
      
      let transmisesData = [];
      if (transmisesRes.ok) {
        transmisesData = await transmisesRes.json();
        setDemandesTransmises(transmisesData);
      }

      let assigneesData = [];
      if (assigneesRes.ok) {
        assigneesData = await assigneesRes.json();
        setDemandesAssignees(assigneesData);
      }

      let actesData = [];
      if (actesRes.ok) {
        actesData = await actesRes.json();
        setActesASigner(actesData);
      }

      setStats(prev => ({
        ...prev,  // ✅ Conserve l'historique_count déjà mis à jour
        a_assigner: transmisesData.length,
        assignees: assigneesData.length,
        en_cours: assigneesData.filter(d => d.statut === 'en_cours_traitement').length,
        terminees: assigneesData.filter(d => d.statut === 'termine' || d.statut === 'acte_genere').length,
        actes_a_signer: actesData.length,
      }));

    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignerRH = async (demandeId) => {
    if (!selectedAgentRH) {
      alert('Veuillez sélectionner un agent RH');
      return;
    }
    
    try {
      const response = await fetch(`/api/dpaf/assigner-rh/${demandeId}/`, {
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
        fetchAllData();
        fetchHistorique();
      } else {
        alert(data.error || 'Erreur lors de l\'assignation');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleSignerActe = async (reference) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/dpaf/signer-acte/${reference}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dpaf_matricule: matricule,
          commentaire: signatureCommentaire
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Acte_Signe_${reference}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert('✅ Acte signé avec succès !');
        setShowSignerModal(false);
        setSelectedActe(null);
        setSignatureCommentaire('');
        fetchAllData();
        fetchHistorique();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la signature');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
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

  const handleVoirActe = async (reference, acte) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/actes/${encodeURIComponent(reference)}/download/`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewTitle(`Acte ${reference}`);
        setShowPreviewModal(true);
      } else {
        alert('Erreur lors du chargement de l\'acte');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleSigner = (acte) => {
    setSelectedActe(acte);
    setShowSignerModal(true);
  };

  const checkSignatureCachet = async () => {
    try {
      const response = await fetch(`/api/agent/signature-cachet/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setHasSignature(!!data.signature);
        setHasCachet(!!data.cachet);
      }
    } catch (error) {
      console.error('Erreur vérification signature:', error);
    }
  };

  const getStatusBadge = (statut) => {
    const badges = {
      'transmise_dpaf': <span className="badge-warning">📤 Transmise</span>,
      'assignee_rh': <span className="badge-info">👥 Assignée RH</span>,
      'en_cours_traitement': <span className="badge-info">⚙️ En cours</span>,
      'acte_genere': <span className="badge-success">📄 Acte généré</span>,
      'termine': <span className="badge-success">✅ Terminé</span>,
      'attente_signature_dpaf': <span className="badge-warning">✍️ En attente de signature</span>,
      'signe': <span className="badge-success">✅ Signé</span>,
      'remis': <span className="badge-success">📋 Remis à l'agent</span>
    };
    return badges[statut] || <span className="badge-secondary">{statut}</span>;
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
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>📊 Tableau de bord - DPAF</h2>
            <p>Gestion et assignment des demandes aux agents RH et signature des actes</p>
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
          <div className="stat-card" style={{ borderLeftColor: '#EF4444' }}>
            <div className="stat-number">{stats.actes_a_signer}</div>
            <div className="stat-label">✍️ Actes à signer</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#6B7280' }}>
            <div className="stat-number">{stats.historique_count}</div>
            <div className="stat-label">📜 Historique</div>
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
                  <th>Date transmission</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center">⏳ Chargement...</td></tr>
                ) : demandesTransmises.length === 0 ? (
                  <tr><td colSpan="6" className="text-center">📭 Aucune demande à assigner</td></tr>
                ) : (
                  demandesTransmises.map((d) => (
                    <tr key={d.id}>
                      <td>{d.agent_nom} {d.agent_prenom}</td>
                      <td>{d.agent_matricule}</td>
                      <td>{d.type_demande}</td>
                      <td>{d.date_transmission ? new Date(d.date_transmission).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <button className="btn-assigner" onClick={() => handleVoirDetails(d)}>
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

        {/* Onglets pour les demandes assignées */}
        <div className="filter-tabs" style={{ marginTop: '20px', marginBottom: '10px' }}>
          <button 
            className={`filter-tab ${activeTab === 'encours' ? 'active' : ''}`} 
            onClick={() => setActiveTab('encours')}
          >
            📋 Demandes en cours ({stats.assignees})
          </button>
          <button 
            className={`filter-tab ${activeTab === 'historique' ? 'active' : ''}`} 
            onClick={() => setActiveTab('historique')}
          >
            📜 Historique des demandes ({stats.historique_count})
          </button>
        </div>

        {/* SECTION 2: Demandes assignées en cours */}
        {activeTab === 'encours' && (
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
                    <tr><td colSpan="6" className="text-center">⏳ Chargement...</td></tr>
                  ) : demandesAssignees.length === 0 ? (
                    <tr><td colSpan="6" className="text-center">📭 Aucune demande en cours</td></tr>
                  ) : (
                    demandesAssignees.map((d) => (
                      <tr key={d.id}>
                        <td>{d.agent_nom} {d.agent_prenom}</td>
                        <td>{d.type_demande}</td>
                        <td>{d.agent_rh_nom} {d.agent_rh_prenom}</td>
                        <td>{getStatusBadge(d.statut)}</td>
                        <td>{d.date_assignation ? new Date(d.date_assignation).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>
                          <button className="btn-view" onClick={() => handleVoirSuivi(d)}>
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
        )}

        {/* SECTION 2bis: Historique des demandes traitées */}
        {activeTab === 'historique' && (
          <div className="admin-section">
            <h3>📜 Historique des demandes traitées</h3>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Type</th>
                    <th>Agent RH</th>
                    <th>Statut final</th>
                    <th>Date soumission</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6" className="text-center">⏳ Chargement...</td></tr>
                  ) : demandesHistorique.length === 0 ? (
                    <tr><td colSpan="6" className="text-center">📭 Aucune demande dans l'historique</td></tr>
                  ) : (
                    demandesHistorique.map((d) => (
                      <tr key={d.id}>
                        <td>{d.agent_nom} {d.agent_prenom}</td>
                        <td>{d.type_demande}</td>
                        <td>{d.agent_rh_nom || '-'} {d.agent_rh_prenom || ''}</td>
                        <td>{getStatusBadge(d.statut)}</td>
                        <td>{d.date_soumission ? new Date(d.date_soumission).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>
                          <button className="btn-view" onClick={() => handleVoirSuivi(d)}>
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
        )}

        {(!hasSignature || !hasCachet) && actesASigner.length > 0 && (
          <div style={{ 
            background: '#fff3cd', 
            padding: '15px', 
            borderRadius: '8px', 
            borderLeft: '4px solid #ffc107',
            marginBottom: '20px'
          }}>
            <p>⚠️ <strong>Attention :</strong> Vous devez uploader votre signature et votre cachet dans votre {''}
            <span 
              onClick={() => navigate('/profil')} 
              style={{ fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', color: '#0056b3' }}
            >
              profil
            </span> avant de pouvoir signer des actes.</p>
            {!hasSignature && <p>→ Signature manquante</p>}
            {!hasCachet && <p>→ Cachet manquant</p>}
          </div>
        )}

        {/* SECTION 3: Actes à signer */}
        <div className="admin-section">
          <h3>✍️ Actes à signer</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type d'acte</th>
                  <th>Référence</th>
                  <th>Date demande</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="text-center">⏳ Chargement...</td></tr>
                ) : actesASigner.length === 0 ? (
                  <tr><td colSpan="5" className="text-center">📭 Aucun acte à signer</td></tr>
                ) : (
                  actesASigner.map((acte) => (
                    <tr key={acte.reference}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_demande ? new Date(acte.date_demande).toLocaleDateString('fr-FR') : acte.date_generation ? new Date(acte.date_generation).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference, acte)}>
                            👁️ Voir l'acte
                          </button>
                          <button 
                            className="btn-signer" 
                            onClick={() => handleSigner(acte)}
                            disabled={!hasSignature || !hasCachet}
                            title={!hasSignature ? 'Vous devez d\'abord uploader votre signature' : !hasCachet ? 'Vous devez d\'abord uploader votre cachet' : 'Signer l\'acte'}
                            style={{ 
                              opacity: (!hasSignature || !hasCachet) ? 0.5 : 1,
                              cursor: (!hasSignature || !hasCachet) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            ✍️ Signer l'acte
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

      {/* MODAL ASSIGNER À UN AGENT RH - VERSION ÉLÉGANTE */}
      {showAssignerModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowAssignerModal(false)}>
          <div className="modal-content assigner-modal-elegant" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-elegant">
              <div className="modal-header-content-elegant">
                <div className="header-icon-circle-elegant">
                  <span className="header-icon-large">👥</span>
                </div>
                <div className="header-title-section-elegant">
                  <h3 className="modal-title-elegant">Assigner à un agent RH</h3>
                  <p className="modal-subtitle-elegant">Choisissez l'agent responsable du traitement de cette demande</p>
                </div>
                <button className="modal-close-elegant" onClick={() => setShowAssignerModal(false)}>
                  ✕
                </button>
              </div>
            </div>
            
            <div className="modal-body-elegant">
              {/* Carte de la demande */}
              <div className="demande-info-card-elegant">
                <div className="demande-card-header-elegant">
                  <span className="card-header-icon">📋</span>
                  <span className="card-header-title">Information de la demande</span>
                </div>
                <div className="demande-details-grid-elegant">
                  <div className="demande-detail-item-elegant">
                    <span className="detail-label-elegant">Agent concerné</span>
                    <div className="detail-value-with-icon-elegant">
                      <span className="detail-icon-elegant">👤</span>
                      <strong>{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</strong>
                    </div>
                  </div>
                  <div className="demande-detail-item-elegant">
                    <span className="detail-label-elegant">Matricule</span>
                    <div className="detail-value-with-icon-elegant">
                      <span className="detail-icon-elegant">🆔</span>
                      <code className="matricule-code-elegant">{selectedDemande.agent_matricule}</code>
                    </div>
                  </div>
                  <div className="demande-detail-item-elegant">
                    <span className="detail-label-elegant">Type de demande</span>
                    <div className="detail-value-with-icon-elegant">
                      <span className="detail-icon-elegant">📌</span>
                      <span className="type-badge-elegant">{selectedDemande.type_demande}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sélection agent RH */}
              <div className="selection-section-elegant">
                <div className="selection-header-elegant">
                  <span className="selection-header-icon">🎯</span>
                  <span className="selection-header-title">Sélectionner l'agent RH</span>
                </div>
                
                <div className="agents-list-elegant">
                  {agentsRH.length === 0 ? (
                    <div className="no-agents-message-elegant">
                      <span className="no-agents-icon">⚠️</span>
                      <p>Aucun agent RH disponible</p>
                      <small>Veuillez contacter l'administrateur pour ajouter des agents RH</small>
                    </div>
                  ) : (
                    <div className="agents-radio-group-elegant">
                      {agentsRH.map(agent => (
                        <label 
                          key={agent.matricule} 
                          className={`agent-card-radio-elegant ${selectedAgentRH === agent.matricule ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="agentRH"
                            value={agent.matricule}
                            checked={selectedAgentRH === agent.matricule}
                            onChange={(e) => setSelectedAgentRH(e.target.value)}
                            className="agent-radio-input-elegant"
                          />
                          <div className="agent-card-content-elegant">
                            <div className="agent-avatar-elegant">
                              <span>{agent.prenom?.charAt(0)}{agent.nom?.charAt(0)}</span>
                            </div>
                            <div className="agent-info-elegant">
                              <div className="agent-name-elegant">
                                {agent.nom} {agent.prenom}
                              </div>
                              <div className="agent-details-elegant">
                                <span className="agent-matricule-badge-elegant">{agent.matricule}</span>
                                <span className="agent-poste-badge-elegant">{agent.poste || 'Agent RH'}</span>
                              </div>
                            </div>
                            {selectedAgentRH === agent.matricule && (
                              <div className="agent-selected-check-elegant">
                                ✓
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div className="instructions-section-elegant">
                <div className="instructions-header-elegant">
                  <span className="instructions-icon">📝</span>
                  <span className="instructions-title">Instructions pour l'agent RH</span>
                  <span className="optional-badge-elegant">Optionnel</span>
                </div>
                <textarea
                  className="instructions-textarea-elegant"
                  rows="3"
                  placeholder="Ajoutez des instructions spécifiques pour le traitement de cette demande..."
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </div>
            </div>
            
            <div className="modal-footer-elegant">
              <button className="btn-cancel-elegant" onClick={() => setShowAssignerModal(false)}>
                Annuler
              </button>
              <button 
                className={`btn-assigner-elegant ${!selectedAgentRH ? 'disabled' : ''}`}
                onClick={() => handleAssignerRH(selectedDemande.id)}
                disabled={!selectedAgentRH}
              >
                <span className="btn-icon">✓</span>
                Assigner la demande
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUIVI DE LA DEMANDE - VERSION AMÉLIORÉE */}
      {showSuiviModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowSuiviModal(false)}>
          <div className="modal-content suivi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header suivi-modal-header">
              <div className="header-icon-wrapper">
                <span className="header-icon">📋</span>
                <h3>Suivi de la demande</h3>
              </div>
              <button className="modal-close" onClick={() => setShowSuiviModal(false)}>✕</button>
            </div>
            
            <div className="modal-body suivi-modal-body">
              {/* Carte Agent */}
              <div className="suivi-agent-card">
                <div className="agent-avatar">
                  <span>{selectedDemande.agent_prenom?.charAt(0)}{selectedDemande.agent_nom?.charAt(0)}</span>
                </div>
                <div className="agent-info-card">
                  <h4>{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</h4>
                  <p className="agent-matricule">Matricule: {selectedDemande.agent_matricule}</p>
                </div>
              </div>

              {/* Carte Détails Demande */}
              <div className="suivi-details-card">
                <div className="detail-item">
                  <span className="detail-icon">📌</span>
                  <div className="detail-content">
                    <span className="detail-label">Type de demande</span>
                    <strong className="detail-value">{selectedDemande.type_demande}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">👥</span>
                  <div className="detail-content">
                    <span className="detail-label">Assigné à</span>
                    <strong className="detail-value">{selectedDemande.agent_rh_nom || 'Non assigné'} {selectedDemande.agent_rh_prenom || ''}</strong>
                  </div>
                </div>
              </div>

              {/* Timeline moderne - CORRIGÉE */}
              <div className="suivi-timeline-modern">
                <h4 className="timeline-title">📅 Chronologie du traitement</h4>
                
                <div className="timeline-modern">
                  {/* Étape 1 - Demande soumise */}
                  <div className={`timeline-modern-step ${selectedDemande.date_soumission ? 'completed' : 'active'}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">📝</span>
                        <span className="step-title">Demande soumise</span>
                        <span className="step-status">Par l'agent</span>
                      </div>
                      <p className="step-description">Demande soumise le {selectedDemande.date_soumission ? new Date(selectedDemande.date_soumission).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                  </div>

                  {/* Étape 2 - Transmission au DPAF */}
                  <div className={`timeline-modern-step ${selectedDemande.statut !== 'transmise_dpaf' && selectedDemande.statut !== 'assignee_rh' && selectedDemande.statut !== 'en_cours_traitement' && selectedDemande.statut !== 'acte_genere' && selectedDemande.statut !== 'remis' ? 'pending' : selectedDemande.statut === 'transmise_dpaf' ? 'active' : 'completed'}`}>
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
                      <p className="step-description">Demande transmise pour assignment à un agent RH</p>
                    </div>
                  </div>

                  {/* Étape 3 - Assignation à un agent RH */}
                  <div className={`timeline-modern-step ${selectedDemande.statut === 'assignee_rh' || selectedDemande.statut === 'en_cours_traitement' || selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'remis' ? 'completed' : selectedDemande.statut === 'transmise_dpaf' ? 'pending' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">👥</span>
                        <span className="step-title">Assignation à un agent RH</span>
                        <span className="step-status">Agent: {selectedDemande.agent_rh_nom || 'En attente'} {selectedDemande.agent_rh_prenom || ''}</span>
                      </div>
                      <p className="step-description">Demande assignée pour traitement par les RH</p>
                    </div>
                  </div>

                  {/* Étape 4 - Traitement par l'agent RH */}
                  <div className={`timeline-modern-step ${selectedDemande.statut === 'en_cours_traitement' || selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'remis' ? 'completed' : selectedDemande.statut === 'assignee_rh' ? 'active' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">⚙️</span>
                        <span className="step-title">Traitement par l'agent RH</span>
                        <span className="step-status">En cours de traitement</span>
                      </div>
                      <p className="step-description">L'agent RH vérifie et traite la demande</p>
                    </div>
                  </div>

                  {/* Étape 5 - Génération de l'acte */}
                  <div className={`timeline-modern-step ${selectedDemande.statut === 'acte_genere' || selectedDemande.statut === 'remis' ? 'completed' : ''}`}>
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
                      <p className="step-description">Acte généré et envoyé à la secrétaire</p>
                    </div>
                  </div>

                  {/* Étape 6 - Signature DPAF */}
                  <div className={`timeline-modern-step ${selectedDemande.statut === 'attente_signature_dpaf' ? 'active' : selectedDemande.statut === 'signe' || selectedDemande.statut === 'remis' ? 'completed' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">✍️</span>
                        <span className="step-title">Signature par le DPAF</span>
                        <span className="step-status">En attente de signature</span>
                      </div>
                      <p className="step-description">Le DPAF signe l'acte avec son cachet officiel</p>
                    </div>
                  </div>

                  {/* Étape 7 - Remise à l'agent */}
                  <div className={`timeline-modern-step ${selectedDemande.statut === 'remis' ? 'completed' : ''}`}>
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">✅</span>
                        <span className="step-title">Remise à l'agent</span>
                        <span className="step-status">Par la secrétaire</span>
                      </div>
                      <p className="step-description">Acte remis à l'agent concerné</p>
                    </div>
                  </div>
                </div>
              </div>

              {selectedDemande.commentaire_dpaf && (
                <div className="suivi-commentaire-card">
                  <div className="commentaire-header">
                    <span className="commentaire-icon">📝</span>
                    <h4>Instructions du DPAF</h4>
                  </div>
                  <div className="commentaire-content">
                    <p>{selectedDemande.commentaire_dpaf}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer suivi-modal-footer">
              <button className="btn-fermer" onClick={() => setShowSuiviModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SIGNER ACTE */}
      {showSignerModal && selectedActe && (
        <div className="modal-overlay" onClick={() => setShowSignerModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✍️ Signature de l'acte</h3>
              <button className="modal-close" onClick={() => setShowSignerModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div style={{ background: '#f0f8ff', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <p><strong>📄 Acte N°:</strong> {selectedActe.reference}</p>
                <p><strong>👤 Agent:</strong> {selectedActe.agent_nom} {selectedActe.agent_prenom}</p>
                <p><strong>📋 Type:</strong> {selectedActe.type_acte}</p>
              </div>
              
              <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <p><strong>Signataire :</strong> {userName}</p>
                <p><strong>Fonction :</strong> Directeur de la Planification, de l'Administration et des Finances</p>
                <p><strong>Date :</strong> {new Date().toLocaleDateString('fr-FR')}</p>
                <p><strong>Heure :</strong> {new Date().toLocaleTimeString('fr-FR')}</p>
              </div>
              
              <div className="form-group">
                <label>Commentaire (optionnel)</label>
                <textarea
                  rows="2"
                  placeholder="Ajoutez un commentaire..."
                  value={signatureCommentaire}
                  onChange={(e) => setSignatureCommentaire(e.target.value)}
                />
              </div>
              
              <div style={{ background: '#fff3cd', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #ffc107' }}>
                <p>⚠️ En cliquant sur "Signer", votre signature et votre cachet officiel seront automatiquement apposés sur l'acte.</p>
                <p>Cette action est irréversible et engage votre responsabilité.</p>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowSignerModal(false)}>Annuler</button>
              <button 
                className="btn-signer" 
                onClick={() => handleSignerActe(selectedActe.reference)}
                disabled={!hasSignature || !hasCachet}
                style={{ 
                  background: '#dc3545',
                  opacity: (!hasSignature || !hasCachet) ? 0.5 : 1,
                  cursor: (!hasSignature || !hasCachet) ? 'not-allowed' : 'pointer'
                }}
              >
                🏛️ Signer avec mon cachet officiel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL APERÇU PDF */}
      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => {
          setShowPreviewModal(false);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl('');
        }}>
          <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header preview-modal-header">
              <h3>📄 {previewTitle}</h3>
              <button className="modal-close" onClick={() => {
                setShowPreviewModal(false);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl('');
              }}>✕</button>
            </div>
            <div className="modal-body preview-modal-body">
              {previewUrl ? (
                <iframe 
                  src={previewUrl} 
                  title={previewTitle}
                  className="pdf-preview-iframe"
                  frameBorder="0"
                />
              ) : (
                <div className="loading-preview">Chargement de l'aperçu...</div>
              )}
            </div>
            <div className="modal-footer preview-modal-footer">
              <button 
                className="btn-download" 
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = previewUrl;
                  link.download = previewTitle;
                  link.click();
                }}
              >
                ⬇️ Télécharger
              </button>
              <button className="btn-close" onClick={() => {
                setShowPreviewModal(false);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl('');
              }}>Fermer</button>
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