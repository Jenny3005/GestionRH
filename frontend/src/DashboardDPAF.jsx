// DashboardDPAF.jsx - Version corrigée (uniquement les agents avec rôle 'rh')

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
  const [actesASigner, setActesASigner] = useState([]);
  const [agentsRH, setAgentsRH] = useState([]);
  
  // Modals
  const [showAssignerModal, setShowAssignerModal] = useState(false);
  const [showSuiviModal, setShowSuiviModal] = useState(false);
  const [showSignerModal, setShowSignerModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [selectedActe, setSelectedActe] = useState(null);
  const [selectedAgentRH, setSelectedAgentRH] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [signatureCommentaire, setSignatureCommentaire] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    a_assigner: 0,
    assignees: 0,
    en_cours: 0,
    terminees: 0,
    actes_a_signer: 0
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
  }, []);

  // Charger UNIQUEMENT les agents avec rôle 'rh'
  const fetchAgentsRH = async () => {
    try {
      // Essayer d'abord l'endpoint spécifique
      let response = await fetch('http://localhost:8000/api/agents/rh/');
      
      if (!response.ok) {
        // Fallback: récupérer tous les agents et filtrer
        response = await fetch('http://localhost:8000/api/agents/');
        if (response.ok) {
          const allAgents = await response.json();
          console.log('👥 Tous les agents:', allAgents);
          
          // Filtrer pour ne garder que ceux avec rôle 'rh'
          const agentsRHFiltered = allAgents.filter(agent => {
            // Garder uniquement les agents avec rôle 'rh'
            if (agent.role !== 'rh') return false;
            
            // Exclure l'utilisateur DPAF connecté (au cas où)
            if (agent.matricule === matricule) return false;
            
            return true;
          });
          
          console.log('✅ Agents RH disponibles (rôle = rh):', agentsRHFiltered);
          setAgentsRH(agentsRHFiltered);
          return;
        }
      } else {
        const agentsRHData = await response.json();
        console.log('👥 Agents RH (endpoint spécifique):', agentsRHData);
        
        // Filtrer aussi au cas où l'API retournerait autre chose
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

  // Charger toutes les données en parallèle
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [transmisesRes, assigneesRes, actesRes] = await Promise.all([
        fetch(`http://localhost:8000/api/dpaf/demandes-transmises/${matricule}/`),
        fetch(`http://localhost:8000/api/dpaf/demandes-assignees/${matricule}/`),
        fetch(`http://localhost:8000/api/dpaf/actes-a-signer/${matricule}/`)
      ]);
      
      let transmisesData = [];
      if (transmisesRes.ok) {
        transmisesData = await transmisesRes.json();
        console.log('📋 Demandes transmises:', transmisesData);
        setDemandesTransmises(transmisesData);
      }

      let assigneesData = [];
      if (assigneesRes.ok) {
        assigneesData = await assigneesRes.json();
        console.log('📋 Demandes assignées:', assigneesData);
        setDemandesAssignees(assigneesData);
      }

      let actesData = [];
      if (actesRes.ok) {
        actesData = await actesRes.json();
        console.log('✍️ Actes à signer:', actesData);
        setActesASigner(actesData);
      }

      // Mettre à jour les stats avec toutes les données
      setStats({
        a_assigner: transmisesData.length,
        assignees: assigneesData.length,
        en_cours: assigneesData.filter(d => d.statut === 'en_cours_traitement').length,
        terminees: assigneesData.filter(d => d.statut === 'termine' || d.statut === 'acte_genere').length,
        actes_a_signer: actesData.length
      });

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
        fetchAllData();
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
      const response = await fetch(`http://localhost:8000/api/dpaf/signer-acte/${reference}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dpaf_matricule: matricule,
          commentaire: signatureCommentaire
        })
      });
      
      if (response.ok) {
        alert('✅ Acte signé avec succès !');
        setShowSignerModal(false);
        setSelectedActe(null);
        setSignatureCommentaire('');
        fetchAllData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la signature');
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

  const handleVoirActe = (reference) => {
    window.open(`http://localhost:8000/api/actes/${reference}/download/`, '_blank');
  };

  const handleSigner = (acte) => {
    setSelectedActe(acte);
    setShowSignerModal(true);
  };

  const getStatusBadge = (statut) => {
    const badges = {
      'transmise_dpaf': <span className="badge-warning">📤 Transmise</span>,
      'assignee_rh': <span className="badge-info">👥 Assignée RH</span>,
      'en_cours_traitement': <span className="badge-info">⚙️ En cours</span>,
      'acte_genere': <span className="badge-success">📄 Acte généré</span>,
      'termine': <span className="badge-success">✅ Terminé</span>,
      'attente_signature_dpaf': <span className="badge-warning">✍️ En attente de signature</span>,
      'signe': <span className="badge-success">✅ Signé</span>
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
                  <tr>
                    <td colSpan="5" className="text-center">⏳ Chargement...</td>
                  </tr>
                ) : actesASigner.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center">📭 Aucun acte à signer</td>
                  </tr>
                ) : (
                  actesASigner.map((acte) => (
                    <tr key={acte.reference}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_demande ? new Date(acte.date_demande).toLocaleDateString('fr-FR') : acte.date_generation ? new Date(acte.date_generation).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference)}>
                            👁️ Voir l'acte
                          </button>
                          <button 
                            className="btn-signer"
                            onClick={() => handleSigner(acte)}
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

      {/* MODAL ASSIGNER À UN AGENT RH */}
      {showAssignerModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowAssignerModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>👥 Assigner à un agent RH</h3>
              <button className="modal-close" onClick={() => setShowAssignerModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
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
                {agentsRH.length === 0 && (
                  <p style={{ color: '#dc3545', fontSize: '12px', marginTop: '5px' }}>
                    ⚠️ Aucun agent RH disponible. Veuillez contacter l'administrateur.
                  </p>
                )}
                <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
                  📌 Seuls les agents avec le rôle "RH" peuvent être sélectionnés.
                </small>
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
            </div>
            
            <div className="modal-footer">
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
                style={{ background: '#dc3545' }}
              >
                🏛️ Signer avec mon cachet officiel
              </button>
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