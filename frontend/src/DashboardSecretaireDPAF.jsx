// DashboardSecretaire.jsx - Version corrigée avec les bons endpoints

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import './App.css';

export default function DashboardSecretaire() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // États
  const [demandesValidees, setDemandesValidees] = useState([]);
  const [actesRecus, setActesRecus] = useState([]);
  
  // Modals
  const [showTransmettreModal, setShowTransmettreModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [motifCorrection, setMotifCorrection] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    a_transmettre: 0,
    actes_recus: 0
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
      // 1. Demandes validées par le chef (statut = 'valide' et non transmises)
      const valideesRes = await fetch(`http://localhost:8000/api/secretaire/demandes-validees/${matricule}/`);
      if (valideesRes.ok) {
        const data = await valideesRes.json();
        setDemandesValidees(data);
      }

      // 2. Actes reçus des RH (à remettre aux agents)
      const actesRecusRes = await fetch(`http://localhost:8000/api/secretaire/actes-recus/${matricule}/`);
      if (actesRecusRes.ok) {
        const data = await actesRecusRes.json();
        setActesRecus(data);
      }

      // Mettre à jour les stats
      setStats({
        a_transmettre: demandesValidees.length,
        actes_recus: actesRecus.length
      });

    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  // Transmettre une demande au DPAF
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
        fetchData(); // Recharger les données
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la transmission');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  // Remettre un acte à l'agent
  const handleRemettreActe = async (acteId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/secretaire/remettre-acte/${acteId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretaire_matricule: matricule,
          date_remise: new Date().toISOString().split('T')[0]
        })
      });
      
      if (response.ok) {
        alert('✅ Acte remis à l\'agent avec succès');
        fetchData(); // Recharger les données
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la remise');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  // Renvoyer un acte pour correction
  const handleRetourCorrection = async (acteId) => {
    if (!motifCorrection.trim()) {
      alert('Veuillez indiquer le motif de correction');
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/secretaire/retour-correction/${acteId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motif: motifCorrection,
          secretaire_matricule: matricule
        })
      });
      
      if (response.ok) {
        alert('✅ Acte renvoyé pour correction');
        setShowCorrectionModal(false);
        setSelectedDemande(null);
        setMotifCorrection('');
        fetchData(); // Recharger les données
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors du retour');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  // Voir l'acte
  const handleVoirActe = async (acteId) => {
    window.open(`http://localhost:8000/api/actes/${acteId}/download/`, '_blank');
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
              <div className="avatar-circle">{userName.charAt(0) || 'S'}</div>
              <div className="user-meta">
                <span className="user-name">{userName}</span>
                <span className="user-role">Secrétaire DPAF</span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => navigate('/secretaire/dashboard')}>📊 Tableau de bord</button>
                <button className="dropdown-item" onClick={() => navigate('/profil')}>👤 Mon profil</button>
                <button className="dropdown-item logout" onClick={handleLogout}>🔓 Se déconnecter</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>📋 Tableau de bord - Secrétariat DPAF</h2>
            <p>Transmission des demandes au DPAF et remise des actes aux agents</p>
          </div>
        </section>

        {/* STATISTIQUES */}
        <div className="stats-container">
          <div className="stat-card">
            <div className="stat-number">{stats.a_transmettre}</div>
            <div className="stat-label">📋 À transmettre au DPAF</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.actes_recus}</div>
            <div className="stat-label">📄 Actes reçus</div>
          </div>
        </div>

        {/* SECTION 1: Demandes validées à transmettre au DPAF */}
        <div className="admin-section">
          <h3>📋 Demandes validées à transmettre au DPAF</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Matricule</th>
                  <th>Type</th>
                  <th>Période</th>
                  <th>Date validation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center">Chargement...</td></tr>
                ) : demandesValidees.length === 0 ? (
                  <tr><td colSpan="6" className="text-center">Aucune demande à transmettre</td></tr>
                ) : (
                  demandesValidees.map((d) => (
                    <tr key={d.id}>
                      <td>{d.agent_nom} {d.agent_prenom}</td>
                      <td>{d.agent_matricule}</td>
                      <td>{d.type_demande}</td>
                      <td>{d.date_debut} - {d.date_fin}</td>
                      <td>{d.date_validation ? new Date(d.date_validation).toLocaleDateString('fr-FR') : '-'}</td>
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

        {/* SECTION 2: Actes reçus à remettre aux agents */}
        <div className="admin-section">
          <h3>📄 Actes reçus - À remettre aux agents</h3>
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
                  <tr><td colSpan="5" className="text-center">Chargement...</td></tr>
                ) : actesRecus.length === 0 ? (
                  <tr><td colSpan="5" className="text-center">Aucun acte reçu</td></tr>
                ) : (
                  actesRecus.map((acte) => (
                    <tr key={acte.id}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_reception ? new Date(acte.date_reception).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.id)}>
                            👁️ Voir l'acte
                          </button>
                          <button className="btn-remettre" onClick={() => handleRemettreActe(acte.id)}>
                            📋 Remettre à l'agent
                          </button>
                          <button 
                            className="btn-correction"
                            onClick={() => {
                              setSelectedDemande(acte);
                              setShowCorrectionModal(true);
                            }}
                          >
                            🔧 Renvoyer pour correction
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

      {/* MODAL TRANSMETTRE AU DPAF */}
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
              <button onClick={() => setShowTransmettreModal(false)}>Annuler</button>
              <button onClick={() => handleTransmettreDPAF(selectedDemande.id)}>Transmettre</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RENVOYER POUR CORRECTION */}
      {showCorrectionModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowCorrectionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>🔧 Renvoyer pour correction</h3>
            <p>Acte pour <strong>{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</strong></p>
            <div className="form-group">
              <label>Motif de la correction *</label>
              <textarea
                rows="4"
                placeholder="Décrivez les corrections à apporter..."
                value={motifCorrection}
                onChange={(e) => setMotifCorrection(e.target.value)}
                required
              />
            </div>
            <div className="modal-buttons">
              <button onClick={() => setShowCorrectionModal(false)}>Annuler</button>
              <button onClick={() => handleRetourCorrection(selectedDemande.id)}>Renvoyer</button>
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