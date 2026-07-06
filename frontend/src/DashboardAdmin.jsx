import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNav from './AdminNav';
import usePermissions from './hooks/usePermissions';
import { normalizeRole, getRoleLabel } from './PortalNav';
import Can from './components/Can';
import { LayoutDashboard, Settings2, Users, ShieldCheck, FileText, FilePlus2, UserCircle2, LogOut, ChevronDown, ChevronRight } from 'lucide-react';
import './App.css';

export default function DashboardAdmin() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isAdmin } = usePermissions();
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState({
    total_agents: 0,
    agents_actifs: 0,
    total_roles: 0,
    total_demandes: 0,
    total_types_demande: 0,
    total_types_piece: 0
  });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [rhOpen, setRhOpen] = useState(false);
  
  const userNom = localStorage.getItem('userNom');
  const userPrenom = localStorage.getItem('userPrenom');
  const userEmail = localStorage.getItem('userEmail');
  const userName = `${userPrenom} ${userNom}`;

  // Vérifier les droits d'accès
  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    if (!permissionsLoading && !isAdmin() && !hasPermission('VOIR_DASHBOARD_ADMIN')) {
      navigate('/dashboard');
      return;
    }
    
    fetchAgents();
    fetchStats();
  }, [permissionsLoading]);

  const fetchAgents = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/agents/');
      if (response.ok) {
        const data = await response.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/stats/');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Erreur stats:', error);
    }
  };

  const toggleAgentStatus = async (agentId, currentStatus) => {
    if (!hasPermission('ACTIVER_AGENT') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'activer/désactiver des agents");
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/agents/${agentId}/toggle/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: currentStatus ? 0 : 1 })
      });
      if (response.ok) {
        fetchAgents();
        fetchStats();
        alert(`✅ Agent ${currentStatus ? 'désactivé' : 'activé'} avec succès`);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la modification');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/'); 
  };

  const getRoleBadgeClass = (role) => {
    switch(role) {
      case 'admin': return 'role-badge admin';
      case 'rh': return 'role-badge rh';
      case 'chef': return 'role-badge chef';
      case 'secretaire': return 'role-badge secretaire';
      case 'rh/secretaire': return 'role-badge rh-secretaire';
      default: return 'role-badge agent';
    }
  };

  const getUniqueNormalizedRoles = (agentRoles) => {
    if (!agentRoles || agentRoles.length === 0) return ['agent'];
    const normalized = agentRoles
      .map(role => {
        const raw = (role && (role.libelle || role.name || role)) || '';
        return normalizeRole(raw);
      })
      .filter(role => role !== '' && role !== null);
    return [...new Set(normalized)];
  };

  // Fonction pour la navigation avec vérification des permissions
  const navigateTo = (path) => {
    navigate(path);
    // Sur mobile, fermer la sidebar
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  if (permissionsLoading) {
    return <div className="loading-screen">Chargement des permissions...</div>;
  }

  return (
    <div className="admin-layout">
      {/* ===== SIDEBAR ===== */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{userPrenom?.charAt(0) || 'A'}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{userName}</span>
            <span className="sidebar-user-role">Administrateur</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {/* Tableau de bord */}
          <button 
            className={`sidebar-item ${window.location.pathname === '/admin/dashboard' ? 'active' : ''}`}
            onClick={() => navigateTo('/admin/dashboard')}
          >
            <span className="sidebar-icon"><LayoutDashboard size={18} /></span>
            <span className="sidebar-label">Tableau de bord</span>
          </button>

          {/* Administration - Menu déroulant */}
          <div className="sidebar-group">
            <button 
              className={`sidebar-item sidebar-parent ${adminOpen ? 'open' : ''}`}
              onClick={() => setAdminOpen(!adminOpen)}
            >
              <span className="sidebar-icon"><Settings2 size={18} /></span>
              <span className="sidebar-label">Administration</span>
              <span className="sidebar-arrow">{adminOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            </button>
            
            {adminOpen && (
              <div className="sidebar-submenu">
                <Can permission="VOIR_AGENTS">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/admin/agents' ? 'active' : ''}`}
                    onClick={() => navigateTo('/admin/agents')}
                  >
                    <span className="sidebar-icon"><Users size={16} /></span>
                    <span className="sidebar-label">Agents</span>
                  </button>
                </Can>
                <Can permission="GERER_ROLES">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/admin/roles' ? 'active' : ''}`}
                    onClick={() => navigateTo('/admin/roles')}
                  >
                    <span className="sidebar-icon"><ShieldCheck size={16} /></span>
                    <span className="sidebar-label">Rôles</span>
                  </button>
                </Can>
                <Can permission="GERER_PERMISSIONS">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/admin/permissions' ? 'active' : ''}`}
                    onClick={() => navigateTo('/admin/permissions')}
                  >
                    <span className="sidebar-icon"><ShieldCheck size={16} /></span>
                    <span className="sidebar-label">Permissions</span>
                  </button>
                </Can>
                <Can permission="GERE_TYPE_DEMANDE">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/admin/types-demande' ? 'active' : ''}`}
                    onClick={() => navigateTo('/admin/types-demande')}
                  >
                    <span className="sidebar-icon"><FileText size={16} /></span>
                    <span className="sidebar-label">Types de demande</span>
                  </button>
                </Can>
                <Can permission="GERER_TYPES_PIECE">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/admin/types-piece' ? 'active' : ''}`}
                    onClick={() => navigateTo('/admin/types-piece')}
                  >
                    <span className="sidebar-icon"><FilePlus2 size={16} /></span>
                    <span className="sidebar-label">Types de pièce</span>
                  </button>
                </Can>
              </div>
            )}
          </div>

          {/* Mon profil */}
          <button 
            className={`sidebar-item ${window.location.pathname === '/profil' ? 'active' : ''}`}
            onClick={() => navigateTo('/profil')}
          >
            <span className="sidebar-icon"><UserCircle2 size={18} /></span>
            <span className="sidebar-label">Mon profil</span>
          </button>

          {/* Déconnexion */}
          <button className="sidebar-item logout" onClick={handleLogout}>
            <span className="sidebar-icon"><LogOut size={18} /></span>
            <span className="sidebar-label">Se déconnecter</span>
          </button>
        </nav>
      </aside>

      {/* ===== CONTENU PRINCIPAL ===== */}
      <div className={`admin-main ${sidebarOpen ? 'with-sidebar' : 'without-sidebar'}`}>
        {/* ===== NAVBAR ===== */}
        <header className="admin-navbar">
          <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
          </div>
          <div className="admin-navbar-left">
            <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
              ☰
            </button>
            <span className="admin-page-title">Tableau de bord</span>
          </div>
          <div className="admin-navbar-right">
            <span className="admin-user-name">{userName}</span>
          </div>
        </header>

        {/* ===== CONTENU ===== */}
        <main className="admin-content">
          {/* BANDEAU HERO */}
          <section className="hero-banner-intranet">
            <div className="banner-content">
              <h2>📊 Tableau de bord Administrateur</h2>
              <p>Bienvenue {userPrenom} {userNom} ! Gérez les agents, les rôles et les types de demande depuis cet espace.</p>
            </div>
          </section>

          {/* STATISTIQUES */}
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-icon">👥</div>
              <div className="admin-stat-info">
                <h3>Total Agents</h3>
                <p className="admin-stat-number">{stats.total_agents}</p>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon">✅</div>
              <div className="admin-stat-info">
                <h3>Agents actifs</h3>
                <p className="admin-stat-number">{stats.agents_actifs}</p>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon">⚙️</div>
              <div className="admin-stat-info">
                <h3>Rôles</h3>
                <p className="admin-stat-number">{stats.total_roles}</p>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon">📝</div>
              <div className="admin-stat-info">
                <h3>Types de demande</h3>
                <p className="admin-stat-number">{stats.total_types_demande}</p>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon">📋</div>
              <div className="admin-stat-info">
                <h3>Demandes</h3>
                <p className="admin-stat-number">{stats.total_demandes}</p>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon">📄</div>
              <div className="admin-stat-info">
                <h3>Types de pièce</h3>
                <p className="admin-stat-number">{stats.total_types_piece}</p>
              </div>
            </div>
          </div>

          {/* LISTE DES AGENTS */}
          <section className="admin-section">
            <h3>📋 Liste des agents</h3>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Matricule</th>
                    <th>Nom</th>
                    <th>Prénom</th>
                    <th>Email</th>
                    <th>Téléphone</th>
                    <th>Rôle(s)</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="8" className="text-center">⏳ Chargement...</td></tr>
                  ) : agents.length === 0 ? (
                    <tr><td colSpan="8" className="text-center">📭 Aucun agent trouvé</td></tr>
                  ) : (
                    agents.map((agent) => {
                      const normalizedRoles = getUniqueNormalizedRoles(agent.roles);
                      return (
                        <tr key={agent.id}>
                          <td>{agent.matricule}</td>
                          <td>{agent.nom}</td>
                          <td>{agent.prenom}</td>
                          <td>{agent.email}</td>
                          <td>{agent.telephone || '-'}</td>
                          <td>
                            <div className="roles-multi">
                              {normalizedRoles.map((r, idx) => (
                                <span key={idx} className={getRoleBadgeClass(r)}>
                                  {getRoleLabel(r)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span className={`status-badge ${agent.actif ? 'active' : 'inactive'}`}>
                              {agent.actif ? '✅ Actif' : '❌ Inactif'}
                            </span>
                          </td>
                          <td>
                            <Can permission="ACTIVER_AGENT">
                              <button 
                                className="btn-table-toggle"
                                onClick={() => toggleAgentStatus(agent.id, agent.actif)}
                              >
                                {agent.actif ? '🔴 Désactiver' : '🟢 Activer'}
                              </button>
                            </Can>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ACTIONS RAPIDES */}
          <section className="admin-actions">
            <h3>⚡ Actions rapides</h3>
            <div className="admin-actions-grid">
              <Can permission="VOIR_AGENTS">
                <button className="admin-action-btn" onClick={() => navigateTo('/admin/agents')}>
                  ➕ Gérer les agents
                </button>
              </Can>
              <Can permission="GERER_ROLES">
                <button className="admin-action-btn" onClick={() => navigateTo('/admin/roles')}>
                  🎯 Gérer les rôles
                </button>
              </Can>
              <Can permission="GERE_TYPE_DEMANDE">
                <button className="admin-action-btn" onClick={() => navigateTo('/admin/types-demande')}>
                  📝 Types de demande
                </button>
              </Can>
              <Can permission="GERER_TYPES_PIECE">
                <button className="admin-action-btn" onClick={() => navigateTo('/admin/types-piece')}>
                  📄 Types de pièce
                </button>
              </Can>
              <button className="admin-action-btn" onClick={() => fetchAgents()}>
                🔄 Actualiser
              </button>
            </div>
          </section>
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
    </div>
  );
}