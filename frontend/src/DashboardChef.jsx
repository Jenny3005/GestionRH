import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import './App.css';

export default function DashboardChef() {
  const navigate = useNavigate();
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [stats, setStats] = useState({ en_attente_chef: 0, validees: 0, refusees: 0 });
  const [filter, setFilter] = useState('en_attente_chef'); // en_attente, valide, refuse
  
  const matricule = localStorage.getItem('userMatricule');
  const userName = `${localStorage.getItem('userPrenom') || ''} ${localStorage.getItem('userNom') || ''}`.trim();
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchDemandes();
  }, []);


  const fetchDemandes = async () => {
    setLoading(true);
    setError('');
    try {
      // Récupérer toutes les demandes de la direction (sans filtre statut)
      const response = await fetch(`http://localhost:8000/api/conges/direction/${encodeURIComponent(matricule)}/`);
      const data = await response.json();

      if (response.ok && Array.isArray(data)) {
        setDemandes(data);
        // Calculer les statistiques
        const statsCalc = {
          en_attente_chef: data.filter(d => d.statut === 'en_attente_chef' || !d.statut).length,
          validees: data.filter(d => d.statut === 'valide').length,
          refusees: data.filter(d => d.statut === 'refuse').length
        };
        setStats(statsCalc);
      } else {
        setDemandes([]);
        setError(data?.error || 'Impossible de récupérer les demandes.');
      }
    } catch (error) {
      console.error('Erreur:', error);
      setDemandes([]);
      setError('Erreur de connexion au serveur. Vérifiez que le backend Django est démarré.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleDateString('fr-FR');
    } catch {
      return '-';
    }
  };

  const getStatusBadge = (statut) => {
    switch(statut) {
      case 'valide':
        return <span className="badge-success">✓ Validée</span>;
      case 'refuse':
        return <span className="badge-danger">✗ Rejetée</span>;
      default:
        return <span className="badge-warning">⏳ En attente</span>;
    }
  };

  const validerDemande = async (demandeId, decision) => {
    if (!commentaire.trim() && decision === 'refuse') {
      if (!window.confirm('Aucun commentaire fourni. Voulez-vous vraiment rejeter cette demande ?')) {
        return;
      }
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/conges/${demandeId}/valider/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule_chef: matricule,
          decision: decision,
          commentaire: commentaire
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ Demande ${decision === 'valide' ? 'validée' : 'rejetée'} avec succès`);
        fetchDemandes(); // Recharger la liste
        setSelectedDemande(null);
        setCommentaire('');
      } else {
        alert(`❌ Erreur: ${data.error || 'Problème lors de la validation'}`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur de connexion au serveur');
    }
  };

  // Filtrer les demandes selon l'onglet sélectionné
  const filteredDemandes = demandes.filter(d => {
    if (filter === 'en_attente_chef') return d.statut === 'en_attente_chef' || d.statut === 'en_attente_chef';
    if (filter === 'valide') return d.statut === 'valide';
    if (filter === 'refuse') return d.statut === 'refuse';
    return true;
  });

  return (
    <div className="intranet-home">
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
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Gestion des demandes de congé</h2>
            <p>Validez ou rejetez les demandes de votre direction</p>
          </div>
        </section>

        {/* Statistiques */}
        <div className="stats-container">
          <div className="stat-card" onClick={() => setFilter('en_attente_chef')}>
            <div className="stat-number">{stats.en_attente_chef}</div>
            <div className="stat-label">En attente</div>
          </div>
          <div className="stat-card" onClick={() => setFilter('valide')}>
            <div className="stat-number">{stats.validees}</div>
            <div className="stat-label">Validées</div>
          </div>
          <div className="stat-card" onClick={() => setFilter('refuse')}>
            <div className="stat-number">{stats.refusees}</div>
            <div className="stat-label">Rejetées</div>
          </div>
        </div>

        {/* Bouton rafraîchir */}
        <div className="admin-header">
          <h3> Demandes {filter === 'en_attente_chef' ? 'en attente' : filter === 'valide' ? 'validées' : 'rejetées'}</h3>
          <button className="btn-refresh" onClick={fetchDemandes} disabled={loading}>
            🔄 {loading ? 'Chargement...' : 'Rafraîchir'}
          </button>
        </div>

        <div className="admin-section">
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Matricule</th>
                  <th>Type</th>
                  <th>Période</th>
                  <th>Jours</th>
                  <th>Date demande</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" className="text-center"> Chargement des demandes...</td></tr>
                ) : error ? (
                  <tr><td colSpan="8" className="text-center error-text">❌ {error}</td></tr>
                ) : filteredDemandes.length === 0 ? (
                  <tr><td colSpan="8" className="text-center"> Aucune demande {filter === 'en_attente_chef' ? 'en attente' : filter === 'valide' ? 'validée' : 'rejetée'}</td></tr>
                ) : (
                  filteredDemandes.map((d) => (
                    <tr key={d.id} className={d.statut === 'valide' ? 'row-validated' : d.statut === 'refuse' ? 'row-rejected' : ''}>
                      <td>{d.agent || d.nom_demandeur || '-'}</td>
                      <td>{d.matricule || d.matricule_demandeur || '-'}</td>
                      <td>{d.type_demande || d.type_conge || '-'}</td>
                      <td>{formatDate(d.date_debut)} - {formatDate(d.date_fin)}</td>
                      <td>{d.nombre_jours ?? d.jours_demandes ?? '-'} jours</td>
                      <td>{formatDate(d.date_soumission || d.created_at)}</td>
                      <td>{getStatusBadge(d.statut)}</td>
                      <td>
                        {(!d.statut || d.statut === 'en_attente_chef') ? (
                          <button className="btn-validate" onClick={() => setSelectedDemande(d)}>
                             Traiter
                          </button>
                        ) : (
                          <button className="btn-view" onClick={() => setSelectedDemande(d)}>
                            👁️ Voir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal de validation - Version moderne */}
      {selectedDemande && (
        <div className="modal-overlay" onClick={() => {
          setSelectedDemande(null);
          setCommentaire('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            
            {/* En-tête avec icône et titre */}
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-icon-badge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="M12 8v4l2 2"/>
                  </svg>
                </div>
                <div>
                  <h3 className="modal-title">Validation de demande</h3>
                  <p className="modal-subtitle">
                    {selectedDemande.agent || selectedDemande.nom_demandeur}
                  </p>
                </div>
              </div>
              <button 
                className="modal-close-btn" 
                onClick={() => {
                  setSelectedDemande(null);
                  setCommentaire('');
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Corps du modal */}
            <div className="modal-body">
              {/* Carte d'identité du demandeur */}
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Matricule</span>
                  <span className="info-value">{selectedDemande.matricule || selectedDemande.matricule_demandeur}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Type de demande</span>
                  <span className="info-value">{selectedDemande.type_demande || selectedDemande.type_conge}</span>
                </div>
              </div>

              {/* Période */}
              <div className="period-card">
                <div className="period-item">
                  <span className="period-label">📅 Date de début</span>
                  <span className="period-value">{formatDate(selectedDemande.date_debut)}</span>
                </div>
                <div className="period-arrow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                <div className="period-item">
                  <span className="period-label">📅 Date de fin</span>
                  <span className="period-value">{formatDate(selectedDemande.date_fin)}</span>
                </div>
              </div>

              {/* Détails supplémentaires */}
              <div className="details-row">
                <div className="detail-chip">
                  <span className="chip-label">📆 Jours</span>
                  <span className="chip-value">{selectedDemande.nombre_jours ?? selectedDemande.jours_demandes}</span>
                </div>
                <div className="detail-chip status-chip">
                  <span className="chip-label">Statut</span>
                  <span className="chip-value">{getStatusBadge(selectedDemande.statut)}</span>
                </div>
              </div>

              {/* Commentaire existant */}
              {selectedDemande.commentaire && (
                <div className="existing-comment">
                  <div className="comment-header">
                    <span className="comment-icon">💬</span>
                    <span className="comment-label">Commentaire du demandeur</span>
                  </div>
                  <p className="comment-text">{selectedDemande.commentaire}</p>
                </div>
              )}

              {/* Zone de commentaire pour validation */}
              {(!selectedDemande.statut || selectedDemande.statut === 'en_attente_chef') && (
                <div className="comment-area">
                  <label className="comment-label">
                    Votre commentaire
                    <span className="required-star">*</span>
                    <span className="label-hint">(obligatoire pour un rejet)</span>
                  </label>
                  <textarea 
                    value={commentaire} 
                    onChange={(e) => setCommentaire(e.target.value)} 
                    rows="3"
                    placeholder="Ajoutez un commentaire pour justifier votre décision..."
                    className="comment-textarea"
                  />
                </div>
              )}
            </div>

            {/* Pied du modal - Boutons d'action */}
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setSelectedDemande(null);
                  setCommentaire('');
                }}
              >
                {(!selectedDemande.statut || selectedDemande.statut === 'en_attente_chef') ? 'Annuler' : 'Fermer'}
              </button>
              
              {(!selectedDemande.statut || selectedDemande.statut === 'en_attente_chef') && (
                <>
                  <button 
                    className="btn-reject" 
                    onClick={() => validerDemande(selectedDemande.id, 'refuse')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Rejeter
                  </button>
                  <button 
                    className="btn-validate" 
                    onClick={() => validerDemande(selectedDemande.id, 'valide')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Valider
                  </button>
                </>
              )}
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
                <li><a href="https://www.numerique.gouv.bj" target="_blank" rel="noopener noreferrer">Portail du Ministère</a></li>
                <li><a href="https://eservices.travail.gouv.bj" target="_blank" rel="noopener noreferrer">E-Services SIGRH</a></li>
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-018/" target="_blank" rel="noopener noreferrer">Statut de l'Agent (SGG)</a></li>
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