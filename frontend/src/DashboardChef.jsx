import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import './App.css';

export default function DashboardChef() {
  const navigate = useNavigate();
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const matricule = localStorage.getItem('userMatricule');
  const userName = `${localStorage.getItem('userPrenom')} ${localStorage.getItem('userNom')}`;
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchDemandes();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.user-menu-container')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  const fetchDemandes = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`http://localhost:8000/api/conges/direction/${encodeURIComponent(matricule)}/`);
      const data = await response.json();

      if (response.ok && Array.isArray(data)) {
        setDemandes(data);
      } else {
        setDemandes([]);
        setError(data?.error || 'Impossible de recuperer les demandes.');
      }
    } catch (error) {
      console.error('Erreur:', error);
      setDemandes([]);
      setError('Erreur de connexion au serveur.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('fr-FR');
  };

  const validerDemande = async (demandeId, decision) => {
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
      
      if (response.ok) {
        alert(`Demande ${decision === 'valide' ? 'validée' : 'rejetée'} avec succès`);
        fetchDemandes();
        setSelectedDemande(null);
        setCommentaire('');
      } else {
        alert('Erreur lors de la validation');
      }
    } catch (error) {
      alert('Erreur de connexion');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

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
              <div className="avatar-circle">{userName.charAt(0) || 'C'}</div>
              <div className="user-meta">
                <span className="user-name">{userName}</span>
                <span className="user-role">Chef de service</span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => navigate('/chef/dashboard')}>📊 Tableau de bord</button>
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
            <h2>Gestion des demandes de congé</h2>
            <p>Validez ou rejetez les demandes de votre direction</p>
          </div>
        </section>

        <div className="admin-section">
          <h3>📋 Demandes en attente</h3>
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6">Chargement...</td></tr>
                ) : error ? (
                  <tr><td colSpan="6">{error}</td></tr>
                ) : demandes.length === 0 ? (
                  <tr><td colSpan="6">Aucune demande en attente</td></tr>
                ) : (
                  demandes.map((d) => (
                    <tr key={d.id}>
                      <td>{d.agent || '-'}</td>
                      <td>{d.matricule || '-'}</td>
                      <td>{d.type_demande || '-'}</td>
                      <td>{formatDate(d.date_debut)} - {formatDate(d.date_fin)}</td>
                      <td>{d.nombre_jours ?? '-'} jours</td>
                      <td>{formatDate(d.date_soumission)}</td>
                      <td>
                        <button className="btn-validate" onClick={() => setSelectedDemande(d)}>
                          📝 Traiter
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

      {/* Modal de validation */}
      {selectedDemande && (
        <div className="modal-overlay" onClick={() => setSelectedDemande(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Demande de {selectedDemande.agent}</h3>
            <p><strong>Période:</strong> {formatDate(selectedDemande.date_debut)} - {formatDate(selectedDemande.date_fin)}</p>
            <p><strong>Nombre de jours:</strong> {selectedDemande.nombre_jours}</p>
            <div className="form-group">
              <label>Commentaire (optionnel)</label>
              <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows="3"></textarea>
            </div>
            <div className="modal-buttons">
              <button onClick={() => setSelectedDemande(null)}>Annuler</button>
              <button className="btn-reject" onClick={() => validerDemande(selectedDemande.id, 'refuse')}>Rejeter</button>
              <button className="btn-validate" onClick={() => validerDemande(selectedDemande.id, 'valide')}>Valider</button>
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
