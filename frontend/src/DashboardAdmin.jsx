import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

export default function DashboardAdmin() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState({
    total_agents: 0,
    agents_actifs: 0,
    total_roles: 0,
    total_demandes: 0
  });
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const userNom = localStorage.getItem('userNom');
  const userPrenom = localStorage.getItem('userPrenom');
  const userEmail = localStorage.getItem('userEmail');
  const userRole = localStorage.getItem('userRole');
  const userName = `${userPrenom} ${userNom}`;

  useEffect(() => {
    // Vérifier si l'utilisateur est connecté et a le rôle admin
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    if (userRole !== 'admin') {
      navigate('/dashboard');
      return;
    }
    
    fetchAgents();
    fetchStats();
  }, []);

  // Fermer le dropdown en cliquant ailleurs
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.user-menu-container')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

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
    try {
      const response = await fetch(`http://localhost:8000/api/agents/${agentId}/toggle/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: currentStatus ? 0 : 1 })
      });
      if (response.ok) {
        fetchAgents();
        fetchStats();
        alert('Statut modifié avec succès');
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/'); 
  };

  // Fonction pour afficher le libellé du rôle
  const getRoleLabel = (role) => {
    switch(role) {
      case 'admin': return 'Administrateur';
      case 'rh': return 'RH';
      case 'chef': return 'Chef de service';
      default: return 'Agent';
    }
  };

  return (
    <div className="intranet-home">
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
          <a href="/admin/dashboard" className="nav-tab-item active">Dashboard</a>
          <a href="/admin/agents" className="nav-tab-item">Agents</a>
          <a href="/admin/roles" className="nav-tab-item">Rôles</a>
          <a href="/admin/demandes" className="nav-tab-item">Demandes</a>
        </nav>
        <div className="nav-right">
          <div className="user-menu-container">
            <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="avatar-circle">{userPrenom?.charAt(0) || 'A'}</div>
              <div className="user-meta">
                <span className="user-name">{userName}</span>
                <span className="user-role">Administrateur</span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
            
            {dropdownOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <strong>{userName}</strong>
                  <small>{userEmail}</small>
                </div>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item" onClick={() => navigate('/admin/dashboard')}>
                  📊 Tableau de bord
                </button>
                <button className="dropdown-item" onClick={() => navigate('/profile')}>
                  👤 Mon profil
                </button>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item logout" onClick={handleLogout}>
                  🔓 Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="intranet-main">
        {/* BANDEAU HERO */}
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Tableau de bord Administrateur</h2>
            <p>Bienvenue {userPrenom} {userNom} ! Gérez les agents, les rôles et les demandes depuis cet espace.</p>
          </div>
        </section>

        {/* STATISTIQUES - 4 CARDS */}
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
            <div className="admin-stat-icon">📋</div>
            <div className="admin-stat-info">
              <h3>Demandes</h3>
              <p className="admin-stat-number">{stats.total_demandes}</p>
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
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8">Chargement...</td></tr>
                ) : agents.length === 0 ? (
                  <tr><td colSpan="8">Aucun agent trouvé</td></tr>
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.id}>
                      <td>{agent.matricule}</td>
                      <td>{agent.nom}</td>
                      <td>{agent.prenom}</td>
                      <td>{agent.email}</td>
                      <td>{agent.telephone || '-'}</td>
                      <td>
                        <span className={`role-badge ${agent.role_libelle}`}>
                          {getRoleLabel(agent.role_libelle)}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${agent.actif ? 'active' : 'inactive'}`}>
                          {agent.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>
                        <button 
                          className="btn-table-toggle"
                          onClick={() => toggleAgentStatus(agent.id, agent.actif)}
                        >
                          {agent.actif ? '🔴 Désactiver' : '🟢 Activer'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ACTIONS RAPIDES */}
        <section className="admin-actions">
          <h3>⚡ Actions rapides</h3>
          <div className="admin-actions-grid">
            <button className="admin-action-btn" onClick={() => navigate('/admin/agents/add')}>
              ➕ Ajouter un agent
            </button>
            <button className="admin-action-btn" onClick={() => navigate('/admin/roles')}>
              ⚙️ Gérer les rôles
            </button>
            <button className="admin-action-btn" onClick={() => fetchAgents()}>
              🔄 Actualiser
            </button>
          </div>
        </section>
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
          <p>© 2026 Ministère du Numérique et de la Digitalisation — Espace Administrateur</p>
        </div>
      </footer>
    </div>
  );
}