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
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/auth');
  };

  const userName = `${userInfo.prenom} ${userInfo.nom}`;

  // Données statiques pour l'aperçu
  const stats = [
    { label: "Demandes en cours", value: "4", icon: "📋", color: "#3B82F6" },
    { label: "Solde congés", value: "18.5", icon: "🌴", color: "#10B981", unit: "jours" },
    { label: "Notifications", value: "3", icon: "🔔", color: "#F59E0B" },
    { label: "Complétude dossier", value: "76%", icon: "📊", color: "#8B5CF6" }
  ];

  const demandesRecentes = [
    { id: 1, type: "Attestation de travail", date: "15/05/2026", statut: "En cours" },
    { id: 2, type: "Demande de congé", date: "10/05/2026", statut: "Approuvée" },
    { id: 3, type: "Avancement", date: "01/05/2026", statut: "En attente" },
    { id: 4, type: "Certificat médical", date: "28/04/2026", statut: "Validé" }
  ];

  const soldesConges = {
    annee: 2026,
    jours_acquis: 30,
    jours_pris: 11.5,
    jours_restants: 18.5,
    jours_prevus: 5
  };

  const notifications = [
    { id: 1, message: "Votre demande de congé a été approuvée", date: "10/05/2026", lu: false, type: "success" },
    { id: 2, message: "Nouveau document disponible dans votre dossier", date: "08/05/2026", lu: false, type: "info" },
    { id: 3, message: "Pièce d'identité expirant dans 30 jours", date: "05/05/2026", lu: true, type: "warning" }
  ];

  const prochainAvancement = {
    echelon_actuel: "8ème échelon",
    echelon_suivant: "9ème échelon",
    date_prevue: "15/12/2026",
    jours_restants: 208,
    conditions_remplies: true
  };

  const alertesPieces = [
    { id: 1, piece: "Carte Nationale d'Identité", date_expiration: "15/06/2026", jours_restants: 26, statut: "warning" },
    { id: 2, piece: "Certificat médical", date_expiration: "10/07/2026", jours_restants: 51, statut: "info" },
    { id: 3, piece: "Diplôme Master", date_expiration: "Permanent", jours_restants: null, statut: "valid" }
  ];

  const completudeDossier = {
    total: 85,
    pieces_manquantes: ["Attestation de résidence", "Relevé bancaire"],
    pieces_expirees: ["Carte Nationale d'Identité"]
  };

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
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
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Bienvenue sur votre Espace Agent</h2>
            <p>Bonjour {userInfo.prenom} {userInfo.nom} ! Gérez vos demandes, consultez vos congés et suivez votre carrière.</p>
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
                {stat.unit && <span className="agent-stat-unit">{stat.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* GRILLE PRINCIPALE */}
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
                  <tr><th>Type</th><th>Date</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {demandesRecentes.map((d) => (
                    <tr key={d.id}>
                      <td>{d.type}</td>
                      <td>{d.date}</td>
                      <td><span className={`status-badge ${d.statut === 'Approuvée' ? 'approved' : d.statut === 'En cours' ? 'pending' : 'waiting'}`}>{d.statut}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Solde congés */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>🌴 Solde congés {soldesConges.annee}</h3>
              <button className="agent-card-btn" onClick={() => navigate('/demarches')}>Demander →</button>
            </div>
            <div className="soldes-conges">
              <div className="solde-item">
                <span className="solde-label">Jours acquis</span>
                <span className="solde-value">{soldesConges.jours_acquis} jours</span>
              </div>
              <div className="solde-item">
                <span className="solde-label">Jours pris</span>
                <span className="solde-value">{soldesConges.jours_pris} jours</span>
              </div>
              <div className="solde-item">
                <span className="solde-label">Jours restants</span>
                <span className="solde-value highlight">{soldesConges.jours_restants} jours</span>
              </div>
              <div className="solde-item">
                <span className="solde-label">Jours prévus</span>
                <span className="solde-value">{soldesConges.jours_prevus} jours</span>
              </div>
              <div className="progress-bar-conges">
                <div className="progress-fill-conges" style={{ width: `${(soldesConges.jours_pris / soldesConges.jours_acquis) * 100}%` }}></div>
              </div>
              <div className="progress-labels">
                <span>Pris {soldesConges.jours_pris}j</span>
                <span>Restant {soldesConges.jours_restants}j</span>
              </div>
            </div>
          </div>
        </div>

        {/* DEUXIÈME LIGNE */}
        <div className="agent-dashboard-grid">
          
          {/* Notifications */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>🔔 Notifications</h3>
              <button className="agent-card-btn">Marquer tout lu →</button>
            </div>
            <div className="notifications-list">
              {notifications.map((notif) => (
                <div key={notif.id} className={`notification-item ${!notif.lu ? 'unread' : ''}`}>
                  <div className="notification-icon">
                    {notif.type === 'success' && '✅'}
                    {notif.type === 'info' && 'ℹ️'}
                    {notif.type === 'warning' && '⚠️'}
                  </div>
                  <div className="notification-content">
                    <div className="notification-message">{notif.message}</div>
                    <div className="notification-date">{notif.date}</div>
                  </div>
                  {!notif.lu && <div className="notification-badge"></div>}
                </div>
              ))}
            </div>
          </div>

          {/* Prochain avancement */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>📈 Prochain avancement</h3>
              <button className="agent-card-btn" onClick={() => navigate('/carriere')}>Détails →</button>
            </div>
            <div className="avancement-info">
              <div className="avancement-item">
                <span className="avancement-label">Échelon actuel</span>
                <span className="avancement-value">{prochainAvancement.echelon_actuel}</span>
              </div>
              <div className="avancement-item">
                <span className="avancement-label">Échelon suivant</span>
                <span className="avancement-value highlight">{prochainAvancement.echelon_suivant}</span>
              </div>
              <div className="avancement-item">
                <span className="avancement-label">Date prévue</span>
                <span className="avancement-value">{prochainAvancement.date_prevue}</span>
              </div>
              <div className="avancement-item">
                <span className="avancement-label">Jours restants</span>
                <span className="avancement-value">{prochainAvancement.jours_restants} jours</span>
              </div>
              <div className="avancement-status">
                {prochainAvancement.conditions_remplies ? (
                  <span className="status-success">✅ Toutes les conditions sont remplies</span>
                ) : (
                  <span className="status-warning">⚠️ Certaines conditions non remplies</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* TROISIÈME LIGNE */}
        <div className="agent-dashboard-grid">
          
          {/* Complétude dossier */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>📁 Complétude du dossier</h3>
              <button className="agent-card-btn" onClick={() => navigate('/documents')}>Compléter →</button>
            </div>
            <div className="completude-dossier">
              <div className="completude-circle">
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#E2E8F0" strokeWidth="10"/>
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#D4AF37" strokeWidth="10" 
                          strokeDasharray="283" strokeDashoffset={283 - (283 * completudeDossier.total / 100)}
                          strokeLinecap="round" transform="rotate(-90 50 50)"/>
                </svg>
                <div className="completude-text">{completudeDossier.total}%</div>
              </div>
              <div className="completude-details">
                <div className="completude-item missing">
                  <span>📄 Pièces manquantes</span>
                  <span>{completudeDossier.pieces_manquantes.length}</span>
                </div>
                <div className="completude-item expired">
                  <span>⚠️ Pièces expirées</span>
                  <span>{completudeDossier.pieces_expirees.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Alertes pièces expirées */}
          <div className="agent-card">
            <div className="agent-card-header">
              <h3>⚠️ Alertes documents</h3>
              <button className="agent-card-btn" onClick={() => navigate('/documents')}>Mettre à jour →</button>
            </div>
            <div className="alertes-pieces">
              {alertesPieces.map((piece) => (
                <div key={piece.id} className={`alerte-piece ${piece.statut}`}>
                  <div className="piece-info">
                    <span className="piece-nom">{piece.piece}</span>
                    {piece.date_expiration && (
                      <span className="piece-expiration">Expire le {piece.date_expiration}</span>
                    )}
                  </div>
                  {piece.jours_restants && (
                    <div className="piece-urgence">
                      <span className={`urgence-badge ${piece.jours_restants < 30 ? 'urgent' : 'normal'}`}>
                        {piece.jours_restants} jours restants
                      </span>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn-upload-doc">📤 Déposer un nouveau document</button>
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
              <div className="agent-info-item"><span className="agent-info-label">Matricule</span><span className="agent-info-value">{userInfo.matricule}</span></div>
              <div className="agent-info-item"><span className="agent-info-label">Nom complet</span><span className="agent-info-value">{userName}</span></div>
              <div className="agent-info-item"><span className="agent-info-label">Email</span><span className="agent-info-value">{userInfo.email}</span></div>
              <div className="agent-info-item"><span className="agent-info-label">Téléphone</span><span className="agent-info-value">{userInfo.telephone || 'Non renseigné'}</span></div>
              <div className="agent-info-item"><span className="agent-info-label">Poste</span><span className="agent-info-value">{userInfo.poste}</span></div>
              <div className="agent-info-item"><span className="agent-info-label">Direction</span><span className="agent-info-value">{userInfo.direction}</span></div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mnd-grand-footer">
        <div className="benin-national-tricolor-line"></div>
        <div className="footer-main-content">
          <div className="footer-centered-logo-zone">
            <img src="/logo2.png" alt="Logo MND" className="footer-logo-official-center" />
            <p className="brand-motto-centered">Ministère du Numérique et de la Digitalisation — République du Bénin</p>
          </div>
        </div>
        <div className="footer-bottom-bar">
          <p>© 2026 Ministère du Numérique et de la Digitalisation — Espace Agent</p>
        </div>
      </footer>
    </div>
  );
}