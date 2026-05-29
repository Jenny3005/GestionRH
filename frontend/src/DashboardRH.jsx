import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import usePermissions from './hooks/usePermissions';
import './App.css';

export default function DashboardRH() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  
  const [userInfo, setUserInfo] = useState({
    nom: localStorage.getItem('userNom') || '',
    prenom: localStorage.getItem('userPrenom') || '',
    matricule: localStorage.getItem('userMatricule') || '',
    email: localStorage.getItem('userEmail') || '',
    role: 'Ressources Humaines'
  });

  // Données dynamiques
  const [stats, setStats] = useState({
    totalAgents: 0,
    demandesEnAttente: 0,
    documentsExpires: 0,
    annoncesActives: 0,
    dossiersIncomplets: 0,
    facturesATraiter: 0
  });

  const [demandesRecentes, setDemandesRecentes] = useState([]);
  const [agentsRecents, setAgentsRecents] = useState([]);
  const [vraisAgents, setVraisAgents] = useState([]);
  const [documentsExpirant, setDocumentsExpirant] = useState([]);
  const [annonces, setAnnonces] = useState([]);

  const userName = `${userInfo.prenom} ${userInfo.nom}`.trim();
  const matricule = localStorage.getItem('userMatricule');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    
    const role = localStorage.getItem('userRole');
    if (role !== 'rh') {
      navigate('/dashboard');
      return;
    }
    
    fetchData();
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

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Récupérer les statistiques
      const statsRes = await fetch('http://localhost:8000/api/stats/');
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(prev => ({
          ...prev,
          totalAgents: data.total_agents || 0,
          demandesEnAttente: data.demandes_en_attente || 0
        }));
      }

      // 2. Récupérer les agents
      const agentsRes = await fetch('http://localhost:8000/api/agents/');
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setVraisAgents(data);
        setAgentsRecents(data.slice(0, 5));
      }

      // 3. Récupérer les demandes assignées à ce RH
      const demandesRes = await fetch(`http://localhost:8000/api/rh/demandes-assignees/${matricule}/`);
      if (demandesRes.ok) {
        const data = await demandesRes.json();
        setDemandesRecentes(data.slice(0, 5));
        setStats(prev => ({ ...prev, demandesEnAttente: data.length }));
      }

    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatutBadge = (statut) => {
    const statusMap = {
      'en_attente_chef': { class: 'status-pending', text: 'En attente chef' },
      'assignee_rh': { class: 'status-pending', text: 'À traiter' },
      'en_cours_traitement': { class: 'status-progress', text: 'En cours' },
      'valide': { class: 'status-approved', text: 'Validé' },
      'refuse': { class: 'status-rejected', text: 'Rejeté' },
      'actif': { class: 'status-active', text: 'Actif' },
      'inactif': { class: 'status-inactive', text: 'Inactif' },
      'en_conge': { class: 'status-away', text: 'En congé' },
      'En attente': { class: 'status-pending', text: 'En attente' },
      'En cours': { class: 'status-progress', text: 'En cours' },
      'Validé': { class: 'status-approved', text: 'Validé' },
      'Active': { class: 'status-active', text: 'Active' },
      'Clôturée': { class: 'status-closed', text: 'Clôturée' },
      'Urgent': { class: 'status-urgent', text: '⚠️ Urgent' },
      'Attention': { class: 'status-warning', text: '⚠️ Attention' }
    };
    const status = statusMap[statut] || { class: 'status-pending', text: statut };
    return <span className={`status-badge ${status.class}`}>{status.text}</span>;
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  if (permissionsLoading || loading) {
    return <div className="loading-screen">Chargement...</div>;
  }

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
        </div>
        <nav className="nav-central-links">
          <a href="#" className={`nav-tab-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            📊 Tableau de bord
          </a>
          <a href="#" className={`nav-tab-item ${activeTab === 'dossiers' ? 'active' : ''}`} onClick={() => setActiveTab('dossiers')}>
            📁 Gestion des dossiers
          </a>
          <a href="#" className={`nav-tab-item ${activeTab === 'annonces' ? 'active' : ''}`} onClick={() => setActiveTab('annonces')}>
            📢 Annonces & candidatures
          </a>
          <a href="#" className={`nav-tab-item ${activeTab === 'rapports' ? 'active' : ''}`} onClick={() => setActiveTab('rapports')}>
            📊 Rapports & export
          </a>
        </nav>
        <div className="nav-right">
          <div className="user-menu-container">
            <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="avatar-circle">{userInfo.prenom?.charAt(0) || 'R'}</div>
              <div className="user-meta">
                <span className="user-name">{userName || 'Agent RH'}</span>
                <span className="user-role">Ressources Humaines</span>
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
                <button className="dropdown-item" onClick={() => navigate('/rh/dashboard')}>📊 Tableau de bord RH</button>
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
            <h2>📋 Gestion des Ressources Humaines</h2>
            <p>Bienvenue {userInfo.prenom} ! Gérez les dossiers, traitez les demandes et pilotez les ressources humaines.</p>
          </div>
        </section>

        {/* ==================== ONGLET DASHBOARD ==================== */}
        {activeTab === 'dashboard' && (
          <>
            {/* Statistiques */}
            <div className="rh-stats-grid">
              <div className="rh-stat-card">
                <div className="rh-stat-icon">👥</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.totalAgents}</span>
                  <span className="rh-stat-label">Agents actifs</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📋</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.demandesEnAttente}</span>
                  <span className="rh-stat-label">Demandes à traiter</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">⚠️</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.documentsExpires}</span>
                  <span className="rh-stat-label">Documents expirés</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📢</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.annoncesActives}</span>
                  <span className="rh-stat-label">Annonces actives</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📁</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.dossiersIncomplets}</span>
                  <span className="rh-stat-label">Dossiers incomplets</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">💰</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.facturesATraiter}</span>
                  <span className="rh-stat-label">Factures à traiter</span>
                </div>
              </div>
            </div>

            {/* Demandes récentes */}
            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📝 Demandes assignées à traiter</h3>
                <button className="rh-card-btn" onClick={() => setActiveTab('dossiers')}>Voir tout →</button>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Type</th>
                      <th>Date assignation</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demandesRecentes.length === 0 ? (
                      <tr><td colSpan="5" className="text-center">📭 Aucune demande assignée</td></tr>
                    ) : (
                      demandesRecentes.map((demande) => (
                        <tr key={demande.id}>
                          <td>{demande.agent_nom} {demande.agent_prenom}</td>
                          <td>{demande.type_demande}</td>
                          <td>{demande.date_assignation ? new Date(demande.date_assignation).toLocaleDateString('fr-FR') : '-'}</td>
                          <td>{getStatutBadge(demande.statut)}</td>
                          <td>
                            <button className="btn-traiter" onClick={() => alert(`Traiter la demande ${demande.id}`)}>
                              ▶️ Traiter
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Derniers agents inscrits */}
            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>👥 Derniers agents inscrits</h3>
                <button className="rh-card-btn" onClick={() => setActiveTab('dossiers')}>Voir tous les agents →</button>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom complet</th>
                      <th>Poste</th>
                      <th>Direction</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentsRecents.length === 0 ? (
                      <tr><td colSpan="6" className="text-center">📭 Aucun agent trouvé</td></tr>
                    ) : (
                      agentsRecents.map((agent) => (
                        <tr key={agent.matricule}>
                          <td>{agent.matricule}</td>
                          <td>{agent.nom} {agent.prenom}</td>
                          <td>{agent.poste || 'Agent'}</td>
                          <td>{agent.direction || 'À renseigner'}</td>
                          <td>{getStatutBadge(agent.actif ? 'actif' : 'inactif')}</td>
                          <td>
                            <button className="btn-icon" title="Voir dossier">👁️</button>
                            <button className="btn-icon" title="Modifier">✏️</button>
                            <button className="btn-icon" title="Documents">📄</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ==================== ONGLET GESTION DES DOSSIERS ==================== */}
        {activeTab === 'dossiers' && (
          <div className="rh-section">
            <div className="rh-actions-bar">
              <div className="rh-search-box">
                <input type="text" placeholder="Rechercher un agent (matricule, nom, prénom)..." className="rh-search-input" />
              </div>
              <div className="rh-actions-buttons">
                <button className="btn-rh-primary">➕ Nouvel agent</button>
                <button className="btn-rh-secondary">📤 Importer liste</button>
                <button className="btn-rh-secondary">📊 Statistiques</button>
              </div>
            </div>

            <div className="rh-filters">
              <button className="filter-btn active">Tous</button>
              <button className="filter-btn">Dossiers complets</button>
              <button className="filter-btn">Dossiers incomplets</button>
              <button className="filter-btn">Documents expirés</button>
              <button className="filter-btn">En congé</button>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📋 Gestion des dossiers agents</h3>
                <button className="rh-card-btn">Exporter la liste →</button>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th><input type="checkbox" /></th>
                      <th>Matricule</th>
                      <th>Nom & Prénom</th>
                      <th>Poste</th>
                      <th>Direction</th>
                      <th>Documents</th>
                      <th>Dernière mise à jour</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vraisAgents.slice(0, 10).map((agent) => (
                      <tr key={agent.matricule}>
                        <td><input type="checkbox" /></td>
                        <td>{agent.matricule}</td>
                        <td>{agent.nom} {agent.prenom}</td>
                        <td>{agent.poste || 'Agent'}</td>
                        <td>{agent.direction || 'À renseigner'}</td>
                        <td>
                          <div className="document-progress">
                            <div className="progress-bar" style={{ width: '65%' }}></div>
                            <span>65%</span>
                          </div>
                        </td>
                        <td>{new Date().toLocaleDateString('fr-FR')}</td>
                        <td className="rh-actions-cell">
                          <button className="btn-icon" title="Consulter">👁️</button>
                          <button className="btn-icon" title="Ajouter pièce">📎</button>
                          <button className="btn-icon" title="Modifier">✏️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ONGLET ANNONCES & CANDIDATURES ==================== */}
        {activeTab === 'annonces' && (
          <div className="rh-section">
            <div className="rh-actions-bar">
              <div className="rh-actions-buttons">
                <button className="btn-rh-primary">➕ Nouvelle annonce</button>
                <button className="btn-rh-primary">📢 Appel à candidature</button>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📢 Annonces et appels à candidature</h3>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th>Date publication</th>
                      <th>Date clôture</th>
                      <th>Statut</th>
                      <th>Candidatures</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Recrutement Assistant RH</td>
                      <td>2026-05-15</td>
                      <td>2026-06-15</td>
                      <td>{getStatutBadge('Active')}</td>
                      <td>12</td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Voir candidatures">👥</button>
                        <button className="btn-icon" title="Modifier">✏️</button>
                      </td>
                    </tr>
                    <tr>
                      <td>Appel à candidature - Chef projet</td>
                      <td>2026-05-10</td>
                      <td>2026-05-30</td>
                      <td>{getStatutBadge('Active')}</td>
                      <td>8</td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Voir candidatures">👥</button>
                        <button className="btn-icon" title="Modifier">✏️</button>
                      </td>
                    </tr>
                    <tr>
                      <td>Formation Excel avancé</td>
                      <td>2026-05-01</td>
                      <td>2026-05-20</td>
                      <td>{getStatutBadge('Clôturée')}</td>
                      <td>25</td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Voir candidatures">👥</button>
                        <button className="btn-icon" title="Dupliquer">📋</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📝 Candidatures reçues</h3>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Candidat</th>
                      <th>Poste</th>
                      <th>Date candidature</th>
                      <th>Statut</th>
                      <th>CV</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Amadou TRAORE</td>
                      <td>Assistant RH</td>
                      <td>2026-05-18</td>
                      <td>{getStatutBadge('En attente')}</td>
                      <td><button className="btn-link">📄 Télécharger</button></td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Accepter">✅</button>
                        <button className="btn-icon" title="Rejeter">❌</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ONGLET RAPPORTS & EXPORT ==================== */}
        {activeTab === 'rapports' && (
          <div className="rh-section">
            <div className="rh-stats-grid">
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">📊</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Rapport mensuel</span>
                  <span className="rh-stat-label">Mai 2026</span>
                </div>
              </div>
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">👥</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Effectifs par direction</span>
                  <span className="rh-stat-label">Analyse</span>
                </div>
              </div>
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">🌴</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Congés pris</span>
                  <span className="rh-stat-label">Statistiques</span>
                </div>
              </div>
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">📈</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Turnover</span>
                  <span className="rh-stat-label">Taux de rotation</span>
                </div>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📑 Exporter des rapports</h3>
              </div>
              <div className="rh-export-options">
                <div className="export-option">
                  <h4>Liste des agents</h4>
                  <p>Export complet des agents avec leurs informations</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel">📊 Excel</button>
                    <button className="btn-export-pdf">📄 PDF</button>
                    <button className="btn-export-csv">📝 CSV</button>
                  </div>
                </div>
                <div className="export-option">
                  <h4>Statistiques RH</h4>
                  <p>Effectifs, recrutements, départs, congés</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel">📊 Excel</button>
                    <button className="btn-export-pdf">📄 PDF</button>
                  </div>
                </div>
                <div className="export-option">
                  <h4>Dossiers agents</h4>
                  <p>État des dossiers et documents manquants</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel">📊 Excel</button>
                    <button className="btn-export-pdf">📄 PDF</button>
                  </div>
                </div>
              </div>
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