import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

export default function DashboardAgent() {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userInfo, setUserInfo] = useState({
    nom: '',
    prenom: '',
    matricule: '',
    email: '',
    telephone: '',
    poste: '',
    direction: '',
    typecontrat: ''
  });
  const [loading, setLoading] = useState(true);
  const [demandes, setDemandes] = useState([]);
  const [conges, setConges] = useState([]);

  useEffect(() => {
    const matricule = localStorage.getItem('userMatricule');
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchUserInfo(matricule);
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

  const fetchUserInfo = async (matricule) => {
    try {
      const response = await fetch(`http://localhost:8000/api/agent/${matricule}/`);
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
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/auth');
  };

  const userName = `${userInfo.prenom} ${userInfo.nom}`;

  // Données fictives pour la démonstration
  const stats = [
    { label: "Demandes en cours", value: "3", icon: "📋", color: "#3B82F6" },
    { label: "Congés pris", value: "12", icon: "🌴", color: "#10B981" },
    { label: "Documents", value: "8", icon: "📄", color: "#F59E0B" },
    { label: "Jours restants", value: "18", icon: "⏳", color: "#8B5CF6" }
  ];

  const recentDemandes = [
    { id: 1, type: "Attestation de travail", date: "15/05/2026", statut: "En cours" },
    { id: 2, type: "Demande de congé", date: "10/05/2026", statut: "Approuvée" },
    { id: 3, type: "Avancement", date: "01/05/2026", statut: "En attente" }
  ];

  const upcomingConges = [
    { id: 1, type: "Congé annuel", date: "01/06/2026 - 15/06/2026", jours: 15 },
    { id: 2, type: "Autorisation exceptionnelle", date: "25/05/2026", jours: 1 }
  ];

  return (
    <div className="intranet-home">
      {/* BARRE DE NAVIGATION */}
      <header className="intranet-navbar">
        <div className="nav-left-zone">
           <a href="/" className="logo-nav-link">
            <img 
              src="/logo_MND.png" 
              alt="Logo MND" 
              className="mnd-official-logo" 
            />
          </a>
        </div>
        <nav className="nav-central-links">
          <a href="/dashboard" className="nav-tab-item active">Accueil</a>
          <a href="/demarches" className="nav-tab-item">Démarches RH</a>
          <a href="/documents" className="nav-tab-item">Documents</a>
          <a href="/profil" className="nav-tab-item">Mon Profil</a>
        </nav>
        <div className="nav-right">
          <div className="user-menu-container">
            <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="avatar-circle">{userInfo.prenom?.charAt(0) || 'A'}</div>
              <div className="user-meta">
                <span className="user-name">{userName || 'Agent'}</span>
                <span className="user-role">Agent</span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <strong>{userName}</strong>
                  <small>{userInfo.email}</small>
                </div>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item" onClick={() => navigate('/dashboard')}>📊 Tableau de bord</button>
                <button className="dropdown-item" onClick={() => navigate('/profil')}>👤 Mon profil</button>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item logout" onClick={handleLogout}>🔓 Se déconnecter</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="intranet-main">
        {/* BANDEAU HERO */}
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Bienvenue sur votre Espace Agent</h2>
            <p>
              Gérez vos demandes, consultez vos congés et accédez à vos documents officiels.
            </p>
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
              </div>
            </div>
          ))}
        </div>

        {/* CONTENU PRINCIPAL */}
        <div className="agent-dashboard-grid">
          {/* Demandes récentes */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>📋 Demandes récentes</h3>
              <button className="agent-card-btn" onClick={() => navigate('/demarches')}>Voir tout →</button>
            </div>
            <div className="agent-table-container">
              <table className="agent-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDemandes.map((demande) => (
                    <tr key={demande.id}>
                      <td>{demande.type}</td>
                      <td>{demande.date}</td>
                      <td>
                        <span className={`status-badge ${demande.statut === 'Approuvée' ? 'approved' : demande.statut === 'En cours' ? 'pending' : 'waiting'}`}>
                          {demande.statut}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Congés à venir */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>🌴 Congés à venir</h3>
              <button className="agent-card-btn" onClick={() => navigate('/demarches')}>Demander →</button>
            </div>
            <div className="agent-conges-list">
              {upcomingConges.map((conge) => (
                <div key={conge.id} className="agent-conge-item">
                  <div className="agent-conge-info">
                    <span className="agent-conge-type">{conge.type}</span>
                    <span className="agent-conge-date">{conge.date}</span>
                  </div>
                  <span className="agent-conge-jours">{conge.jours} jour(s)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Informations personnelles */}
        <div className="agent-profile-section">
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>👤 Mes informations</h3>
              <button className="agent-card-btn" onClick={() => navigate('/profil')}>Modifier →</button>
            </div>
            <div className="agent-info-grid">
              <div className="agent-info-item">
                <span className="agent-info-label">Matricule</span>
                <span className="agent-info-value">{userInfo.matricule}</span>
              </div>
              <div className="agent-info-item">
                <span className="agent-info-label">Nom complet</span>
                <span className="agent-info-value">{userName}</span>
              </div>
              <div className="agent-info-item">
                <span className="agent-info-label">Email</span>
                <span className="agent-info-value">{userInfo.email}</span>
              </div>
              <div className="agent-info-item">
                <span className="agent-info-label">Téléphone</span>
                <span className="agent-info-value">{userInfo.telephone || 'Non renseigné'}</span>
              </div>
              <div className="agent-info-item">
                <span className="agent-info-label">Poste</span>
                <span className="agent-info-value">{userInfo.poste}</span>
              </div>
              <div className="agent-info-item">
                <span className="agent-info-label">Direction</span>
                <span className="agent-info-value">{userInfo.direction}</span>
              </div>
              <div className="agent-info-item">
                <span className="agent-info-label">Type de contrat</span>
                <span className="agent-info-value">{userInfo.typecontrat === 'APE' ? 'Agent Permanent' : 'Agent Contractuel'}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

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
                <li><a href="#accueil">Accueil Portail</a></li>
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