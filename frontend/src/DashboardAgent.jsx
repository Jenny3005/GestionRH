import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import './App.css';

export default function DashboardAgent() {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const storedNom = localStorage.getItem('userNom') || '';
  const storedPrenom = localStorage.getItem('userPrenom') || '';
  const storedEmail = localStorage.getItem('userEmail') || '';
  const storedMatricule = localStorage.getItem('userMatricule') || '';
  const [userInfo, setUserInfo] = useState({
    nom: storedNom,
    prenom: storedPrenom,
    matricule: storedMatricule,
    email: storedEmail,
    telephone: '',
    poste: '',
    direction: '',
    typecontrat: ''
  });
  const [demandesRecentes, setDemandesRecentes] = useState([]);
  const [soldeConge, setSoldeConge] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const matricule = localStorage.getItem('userMatricule');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchUserInfo();
    fetchDemandesRecentes();
    fetchSoldeConge();
    fetchNotifications();
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

  const fetchUserInfo = async () => {
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
    }
  };

  const fetchDemandesRecentes = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/conges/mes-demandes/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        // Formater les demandes pour l'affichage
        const formatted = data.slice(0, 4).map(d => ({
          id: d.id,
          type: "Demande de congé",
          date: d.date_soumission,
          statut: d.statut === 'valide' ? 'Approuvée' : d.statut === 'refuse' ? 'Rejetée' : 'En attente'
        }));
        setDemandesRecentes(formatted);
      }
    } catch (error) {
      console.error('Erreur demandes:', error);
    }
  };

  const fetchSoldeConge = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/conges/solde/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setSoldeConge(data);
      }
    } catch (error) {
      console.error('Erreur solde:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/notifications/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.slice(0, 3));
      }
    } catch (error) {
      console.error('Erreur notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const marquerNotificationLue = async (notificationId) => {
    try {
      const url = notificationId === 'all'
        ? `http://localhost:8000/api/notifications/${encodeURIComponent(matricule)}/lues/`
        : `http://localhost:8000/api/notifications/${notificationId}/lue/`;

      await fetch(url, { method: 'PUT' });
      fetchNotifications();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const userName = `${userInfo.prenom} ${userInfo.nom}`;

  // Statistiques dynamiques
  const stats = [
    { label: "Demandes en cours", value: demandesRecentes.filter(d => d.statut === 'En attente').length.toString(), icon: "📋", color: "#3B82F6" },
    { label: "Solde congés", value: soldeConge?.jours_restants || "0", icon: "🌴", color: "#10B981", unit: "jours" },
    { label: "Notifications", value: notifications.filter(n => !n.lue).length.toString(), icon: "🔔", color: "#F59E0B" },
    { label: "Complétude dossier", value: "76%", icon: "📊", color: "#8B5CF6" }
  ];

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
        </div>
        <PortalNav />
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
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Bienvenue sur votre Espace Agent</h2>
            <p>Bonjour {userInfo.prenom} {userInfo.nom} ! Gérez vos demandes, consultez vos congés et suivez votre carrière.</p>
          </div>
        </section>

        {/* STATISTIQUES DYNAMIQUES */}
        <div className="agent-stats-grid">
          {stats.map((stat, index) => (
            <div key={index} className="agent-stat-card" style={{ borderLeftColor: stat.color }}>
              <div className="agent-stat-icon">{stat.icon}</div>
              <div className="agent-stat-info">
                <span className="agent-stat-value">{stat.value}</span>
                <span className="agent-stat-label">{stat.label}</span>
                {stat.unit && <span className="agent-stat-unit">{stat.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* GRILLE PRINCIPALE */}
        <div className="agent-dashboard-grid">
          
          {/* Demandes récentes - DYNAMIQUE */}
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
                  {demandesRecentes.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center' }}>Aucune demande récente</td>
                    </tr>
                  ) : (
                    demandesRecentes.map((d) => (
                      <tr key={d.id}>
                        <td>{d.type}</td>
                        <td>{d.date}</td>
                        <td>
                          <span className={`status-badge ${d.statut === 'Approuvée' ? 'approved' : d.statut === 'En attente' ? 'pending' : 'waiting'}`}>
                            {d.statut}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Solde congés - DYNAMIQUE */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>🌴 Solde congés {soldeConge?.annee || new Date().getFullYear()}</h3>
              <button className="agent-card-btn" onClick={() => navigate('/demarches')}>Demander →</button>
            </div>
            <div className="soldes-conges">
              <div className="solde-item">
                <span className="solde-label">Jours acquis</span>
                <span className="solde-value">{soldeConge?.jours_acquis || 0} jours</span>
              </div>
              <div className="solde-item">
                <span className="solde-label">Jours pris</span>
                <span className="solde-value">{soldeConge?.jours_pris || 0} jours</span>
              </div>
              <div className="solde-item">
                <span className="solde-label">Jours restants</span>
                <span className="solde-value highlight">{soldeConge?.jours_restants || 0} jours</span>
              </div>
              <div className="progress-bar-conges">
                <div className="progress-fill-conges" style={{ 
                  width: `${((soldeConge?.jours_pris || 0) / (soldeConge?.jours_acquis || 30)) * 100}%` 
                }}></div>
              </div>
              <div className="progress-labels">
                <span>Pris {soldeConge?.jours_pris || 0}j</span>
                <span>Restant {soldeConge?.jours_restants || 0}j</span>
              </div>
            </div>
          </div>
        </div>

        {/* DEUXIÈME LIGNE */}
        <div className="agent-dashboard-grid">
          
          {/* Notifications - DYNAMIQUE */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>🔔 Notifications</h3>
              <button className="agent-card-btn" onClick={() => marquerNotificationLue('all')}>Marquer tout lu →</button>
            </div>
            <div className="notifications-list">
              {notifications.length === 0 ? (
                <p className="no-notifications">Aucune notification</p>
              ) : (
                notifications.map((notif) => (
                  <div key={notif.id} className={`notification-item ${!notif.lue ? 'unread' : ''}`}>
                    <div className="notification-icon">
                      {notif.type === 'success' && '✅'}
                      {notif.type === 'info' && 'ℹ️'}
                      {notif.type === 'warning' && '⚠️'}
                    </div>
                    <div className="notification-content">
                      <div className="notification-message">{notif.message}</div>
                      <div className="notification-date">{notif.date_envoi}</div>
                    </div>
                    {!notif.lue && <div className="notification-badge" onClick={() => marquerNotificationLue(notif.id)}></div>}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Prochain avancement - statique pour l'instant */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>📈 Prochain avancement</h3>
              <button className="agent-card-btn" onClick={() => navigate('/carriere')}>Détails →</button>
            </div>
            <div className="avancement-info">
              <div className="avancement-item">
                <span className="avancement-label">Échelon actuel</span>
                <span className="avancement-value">À renseigner</span>
              </div>
              <div className="avancement-item">
                <span className="avancement-label">Prochain échelon</span>
                <span className="avancement-value highlight">En attente</span>
              </div>
              <div className="avancement-status">
                <span className="status-info">ℹ️ Les avancements sont gérés par l'administration</span>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* FOOTER */}
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
