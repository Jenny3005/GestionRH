import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import './App.css';

export default function CandidaturesPage() {
  const navigate = useNavigate();
  const [candidatures, setCandidatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const matricule = localStorage.getItem('userMatricule');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchCandidatures();
  }, []);

  const fetchCandidatures = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/candidatures/?matricule=${matricule}`);
      if (response.ok) {
        const data = await response.json();
        setCandidatures(data);
      }
    } catch (error) {
      console.error('Erreur chargement candidatures:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <a href="/" className="logo-nav-link">
          <img 
            src="/logo_MND.png" 
            alt="Logo Ministère du Numérique et de la Digitalisation" 
            className="mnd-official-logo" 
          />
        </a>
        <PortalNav />
        <div className="nav-right">
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>🎯 Mes candidatures</h2>
            <p>Consultez toutes vos candidatures aux postes vacants et leur état d'avancement</p>
          </div>
        </section>

        {loading ? (
          <div className="loading-screen">Chargement...</div>
        ) : candidatures.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <p style={{ fontSize: '18px', marginBottom: '15px' }}>📭 Aucune candidature</p>
            <p style={{ color: '#666', marginBottom: '20px' }}>Vous n'avez pas encore postulé à un poste vacant.</p>
            <button className="btn-rh-primary" onClick={() => navigate('/#opportunites')}>
            🎯 Consulter les postes vacants
            </button>
          </div>
        ) : (
          <div className="admin-section">
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Poste</th>
                    <th>Direction</th>
                    <th>Date candidature</th>
                    <th>Statut</th>
                    <th>Score</th>
                    <th>Rang</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatures.map((c, index) => (
                    <tr key={c.id || index}>
                      <td><strong>{c.intitule || c.poste || '-'}</strong></td>
                      <td>{c.direction || '-'}</td>
                      <td>{c.date_soumission ? new Date(c.date_soumission).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <span className={`status-badge ${
                            c.statut === 'acceptee' || c.statut === 'validée' ? 'approved' :
                            c.statut === 'refusee' ? 'rejected' :
                            c.statut === 'en_attente' || c.statut === 'deposee' ? 'pending' : 'progress'
                            }`}>
                            {c.statut === 'deposee' ? 'Déposée' : c.statut || 'En cours'}
                        </span>
                      </td>
                      <td>{c.score_eligibilite ? `${c.score_eligibilite}/100` : '-'}</td>
                      <td>{c.rang || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

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