import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import './App.css';

export default function DashboardSecretaire() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  
  // États pour la secrétaire
  const [demandesValidees, setDemandesValidees] = useState([]);  // Demandes validées par le chef
  const [demandesTransmises, setDemandesTransmises] = useState([]);  // Demandes transmises au DPAF
  const [actesATransmettre, setActesATransmettre] = useState([]);  // Actes reçus des RH à transmettre au DPAF
  const [actesARemettre, setActesARemettre] = useState([]);  // Actes signés à remettre aux agents
  
  // Modals
  const [showTransmettreModal, setShowTransmettreModal] = useState(false);
  const [showTransmettreActeModal, setShowTransmettreActeModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [selectedActe, setSelectedActe] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    a_transmettre: 0,
    transmises: 0,
    actes_a_transmettre: 0,
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
      // 1. Demandes validées par le chef (statut = 'valide')
      const valideesRes = await fetch(`http://localhost:8000/api/secretaire/demandes-validees/${matricule}/`);
      if (valideesRes.ok) {
        const data = await valideesRes.json();
        console.log('📋 Demandes validées:', data);
        setDemandesValidees(data);
      }

      // 2. Demandes déjà transmises au DPAF
      const transmisesRes = await fetch(`http://localhost:8000/api/secretaire/demandes-transmises/${matricule}/`);
      if (transmisesRes.ok) {
        const data = await transmisesRes.json();
        console.log('📤 Demandes transmises:', data);
        setDemandesTransmises(data);
      }

      // 3. Actes à transmettre au DPAF (statut = 'envoye_secretaire')
      const actesATransmettreRes = await fetch(`http://localhost:8000/api/secretaire/actes-a-transmettre/${matricule}/`);
      if (actesATransmettreRes.ok) {
        const data = await actesATransmettreRes.json();
        console.log('📄 Actes à transmettre au DPAF:', data);
        setActesATransmettre(data);
      }

      // 4. Actes signés à remettre aux agents (statut = 'signe')
      const actesARemettreRes = await fetch(`http://localhost:8000/api/secretaire/actes-a-remettre/${matricule}/`);
      if (actesARemettreRes.ok) {
        const data = await actesARemettreRes.json();
        console.log('📄 Actes à remettre aux agents:', data);
        setActesARemettre(data);
      }

      // Mettre à jour les stats
      setStats({
        a_transmettre: demandesValidees.length,
        transmises: demandesTransmises.length,
        actes_a_transmettre: actesATransmettre.length,
        actes_a_remettre: actesARemettre.length
      });

    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransmettreDPAF = async (demandeId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/secretaire/transmettre-dpaf/${demandeId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretaire_matricule: matricule,
          commentaire: commentaire
        })
      });
      
      if (response.ok) {
        alert('✅ Demande transmise au DPAF avec succès');
        setShowTransmettreModal(false);
        setSelectedDemande(null);
        setCommentaire('');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la transmission');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleTransmettreActeDPAF = async (reference) => {
    try {
      const response = await fetch(`http://localhost:8000/api/secretaire/transmettre-acte-dpaf/${encodeURIComponent(reference)}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretaire_matricule: matricule,
          commentaire: commentaire
        })
      });
      
      if (response.ok) {
        alert('✅ Acte transmis au DPAF pour signature');
        setShowTransmettreActeModal(false);
        setSelectedActe(null);
        setCommentaire('');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la transmission');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleRemettreActe = async (reference) => {
    try {
      const response = await fetch(`http://localhost:8000/api/secretaire/remettre-acte/${reference}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretaire_matricule: matricule
        })
      });
      
      if (response.ok) {
        alert('✅ Acte remis à l\'agent avec succès');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la remise');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleVoirActe = (reference) => {
    window.open(`http://localhost:8000/api/actes/${encodeURIComponent(reference)}/download/`, '_blank');
  };

  const getStatusBadge = (statut) => {
    const badges = {
      'valide': <span className="badge-success">✅ Validée par le chef</span>,
      'transmise_dpaf': <span className="badge-warning">📤 Transmise au DPAF</span>,
      'acte_genere': <span className="badge-info">📄 Acte généré</span>,
      'envoye_secretaire': <span className="badge-warning">📤 Reçu du RH</span>,
      'signe': <span className="badge-success">✅ Signé par DPAF</span>
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
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>📊 Tableau de bord - Secrétariat DPAF</h2>
            <p>Transmission des demandes au DPAF, signature des actes et remise aux agents</p>
          </div>
        </section>

        {/* STATISTIQUES */}
        <div className="stats-container">
          <div className="stat-card" style={{ borderLeftColor: '#F59E0B' }}>
            <div className="stat-number">{stats.a_transmettre}</div>
            <div className="stat-label">📋 Demandes à transmettre</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#3B82F6' }}>
            <div className="stat-number">{stats.transmises}</div>
            <div className="stat-label">📤 Demandes transmises</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#8B5CF6' }}>
            <div className="stat-number">{stats.actes_a_transmettre}</div>
            <div className="stat-label">📄 Actes à transmettre</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#10B981' }}>
            <div className="stat-number">{stats.actes_a_remettre}</div>
            <div className="stat-label">📋 Actes à remettre</div>
          </div>
        </div>

        {/* SECTION 1: Demandes validées à transmettre au DPAF */}
        <div className="admin-section">
          <h3>📋 Demandes validées par le chef - À transmettre au DPAF</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Matricule</th>
                  <th>Type</th>
                  <th>Période</th>
                  <th>Date validation</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-center">⏳ Chargement...</td>
                  </tr>
                ) : demandesValidees.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center">📭 Aucune demande validée à transmettre</td>
                  </tr>
                ) : (
                  demandesValidees.map((d) => (
                    <tr key={d.id}>
                      <td>{d.agent_nom} {d.agent_prenom}</td>
                      <td>{d.agent_matricule}</td>
                      <td>{d.type_demande}</td>
                      <td>{d.date_debut ? `${d.date_debut} - ${d.date_fin}` : '-'}</td>
                      <td>{d.date_validation ? new Date(d.date_validation).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>{getStatusBadge(d.statut)}</td>
                      <td>
                        <button 
                          className="btn-transmettre"
                          onClick={() => {
                            setSelectedDemande(d);
                            setShowTransmettreModal(true);
                          }}
                        >
                          📤 Transmettre au DPAF
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: Actes à transmettre au DPAF */}
        <div className="admin-section">
          <h3>📄 Actes reçus des RH - À transmettre au DPAF</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type d'acte</th>
                  <th>Référence</th>
                  <th>Date réception</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="text-center">⏳ Chargement...</td>
                  </tr>
                ) : actesATransmettre.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center">📭 Aucun acte à transmettre</td>
                  </tr>
                ) : (
                  actesATransmettre.map((acte) => (
                    <tr key={acte.reference}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_reception ? new Date(acte.date_reception).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference)}>
                            👁️ Voir l'acte
                          </button>
                          <button 
                            className="btn-transmettre-dpaf"
                            onClick={() => {
                              setSelectedActe(acte);
                              setShowTransmettreActeModal(true);
                            }}
                          >
                            📤 Transmettre au DPAF
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

        {/* SECTION 3: Actes signés à remettre aux agents */}
        <div className="admin-section">
          <h3>✅ Actes signés par le DPAF - À remettre aux agents</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type d'acte</th>
                  <th>Référence</th>
                  <th>Date signature</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="text-center">⏳ Chargement...</td>
                  </tr>
                ) : actesARemettre.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center">📭 Aucun acte à remettre</td>
                  </tr>
                ) : (
                  actesARemettre.map((acte) => (
                    <tr key={acte.reference}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_signature ? new Date(acte.date_signature).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference)}>
                            👁️ Voir l'acte
                          </button>
                          <button 
                            className="btn-remettre"
                            onClick={() => handleRemettreActe(acte.reference)}
                          >
                            📋 Remettre à l'agent
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

      {/* MODAL TRANSMETTRE DEMANDE AU DPAF */}
      {showTransmettreModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowTransmettreModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>📤 Transmettre au DPAF</h3>
            <p>Demande de <strong>{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</strong></p>
            <div className="form-group">
              <label>Commentaire (optionnel)</label>
              <textarea
                rows="3"
                placeholder="Ajoutez un commentaire pour le DPAF..."
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
              />
            </div>
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowTransmettreModal(false)}>Annuler</button>
              <button className="btn-transmettre" onClick={() => handleTransmettreDPAF(selectedDemande.id)}>Transmettre</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TRANSMETTRE ACTE AU DPAF */}
      {showTransmettreActeModal && selectedActe && (
        <div className="modal-overlay" onClick={() => setShowTransmettreActeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>📤 Transmettre l'acte au DPAF</h3>
            <p>Acte pour <strong>{selectedActe.agent_nom} {selectedActe.agent_prenom}</strong></p>
            <p><strong>Référence:</strong> {selectedActe.reference}</p>
            <div className="form-group">
              <label>Commentaire (optionnel)</label>
              <textarea
                rows="3"
                placeholder="Ajoutez un commentaire pour le DPAF..."
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
              />
            </div>
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowTransmettreActeModal(false)}>Annuler</button>
              <button className="btn-transmettre" onClick={() => handleTransmettreActeDPAF(selectedActe.reference)}>Transmettre</button>
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