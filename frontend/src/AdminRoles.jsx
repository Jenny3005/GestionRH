import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

export default function AdminRoles() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [formData, setFormData] = useState({
    libelle: ''
  });
  const [searchTerm, setSearchTerm] = useState('');

  const userNom = localStorage.getItem('userNom');
  const userPrenom = localStorage.getItem('userPrenom');
  const userEmail = localStorage.getItem('userEmail');
  const userName = `${userPrenom} ${userNom}`;

  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    fetchRoles();
    fetchAgents();
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

  const fetchRoles = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/roles/');
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/agents/');
      if (response.ok) {
        const data = await response.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddRole = async (e) => {
    e.preventDefault();
    if (!formData.libelle) {
      alert('Veuillez saisir un libellé');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/roles/add/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libelle: formData.libelle })
      });

      if (response.ok) {
        alert('Rôle ajouté avec succès');
        setShowModal(false);
        setFormData({ libelle: '' });
        fetchRoles();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleDeleteRole = async (roleId, roleLibelle) => {
    if (roleLibelle === 'admin') {
      alert('Le rôle Administrateur ne peut pas être supprimé');
      return;
    }
    if (window.confirm(`Supprimer le rôle "${roleLibelle}" ?`)) {
      try {
        const response = await fetch(`http://localhost:8000/api/roles/${roleId}/delete/`, {
          method: 'DELETE'
        });
        if (response.ok) {
          alert('Rôle supprimé');
          fetchRoles();
        } else {
          alert('Erreur lors de la suppression');
        }
      } catch (error) {
        console.error('Erreur:', error);
      }
    }
  };

  const getRoleLabel = (role) => {
    switch(role) {
      case 'admin': return 'Administrateur';
      case 'rh': return 'Ressources Humaines';
      case 'chef': return 'Chef de service';
      default: return role;
    }
  };

  const getRoleBadgeClass = (role) => {
    switch(role) {
      case 'admin': return 'role-badge admin';
      case 'rh': return 'role-badge rh';
      case 'chef': return 'role-badge chef';
      default: return 'role-badge agent';
    }
  };

  const getRoleIcon = (role) => {
    switch(role) {
      case 'admin': return '👑';
      case 'rh': return '👥';
      case 'chef': return '⭐';
      default: return '👤';
    }
  };

  const filteredRoles = roles.filter(role =>
    role.libelle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLogout = () => {
    localStorage.clear();
    navigate('/auth');
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
          <a href="/admin/dashboard" className="nav-tab-item">Dashboard</a>
          <a href="/admin/agents" className="nav-tab-item">Agents</a>
          <a href="/admin/roles" className="nav-tab-item active">Rôles</a>
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
                <button className="dropdown-item" onClick={() => navigate('/admin/dashboard')}>📊 Tableau de bord</button>
                <button className="dropdown-item" onClick={() => navigate('/admin/agents')}>👥 Agents</button>
                <button className="dropdown-item" onClick={() => navigate('/admin/roles')}>⚙️ Rôles</button>
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
            <h2>Gestion des Rôles</h2>
            <p>Créez, modifiez et gérez les rôles des agents.</p>
          </div>
        </section>

        <div className="admin-actions-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Rechercher un rôle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="action-buttons">
            <button className="btn-add" onClick={() => setShowModal(true)}>➕ Ajouter un rôle</button>
          </div>
        </div>

        {/* CARDS DES RÔLES */}
        <div className="roles-cards-grid">
          {loading ? (
            <p>Chargement...</p>
          ) : filteredRoles.length === 0 ? (
            <p>Aucun rôle trouvé</p>
          ) : (
            filteredRoles.map((role) => (
              <div key={role.id} className="role-card">
                <div className="role-card-icon">{getRoleIcon(role.libelle)}</div>
                <div className="role-card-content">
                  <h3>{getRoleLabel(role.libelle)}</h3>
                  <span className={getRoleBadgeClass(role.libelle)}>{role.libelle}</span>
                  <p className="role-description">
                    {role.libelle === 'admin' && 'Accès total à toutes les fonctionnalités'}
                    {role.libelle === 'rh' && 'Gestion des agents, validation des demandes'}
                    {role.libelle === 'chef' && 'Supervision équipe, validation des congés'}
                    {role.libelle === 'agent' && 'Accès à son espace personnel uniquement'}
                    {!['admin', 'rh', 'chef', 'agent'].includes(role.libelle) && 'Rôle personnalisé'}
                  </p>
                </div>
                <div className="role-card-actions">
                  <button 
                    className="btn-assign"
                    onClick={() => {
                      setSelectedRole(role);
                      setShowAssignModal(true);
                    }}
                  >
                    👥 Attribuer
                  </button>
                  {role.libelle !== 'admin' && role.libelle !== 'agent' && (
                    <button 
                      className="btn-delete-role"
                      onClick={() => handleDeleteRole(role.id, role.libelle)}
                    >
                      🗑️ Supprimer
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* STATISTIQUES DES RÔLES */}
        <section className="roles-stats">
          <h3>📊 Répartition des agents par rôle</h3>
          <div className="stats-roles-grid">
            {roles.map((role) => {
              const count = agents.filter(a => a.role_libelle === role.libelle).length;
              const percentage = agents.length ? Math.round((count / agents.length) * 100) : 0;
              return (
                <div key={role.id} className="stat-role-item">
                  <div className="stat-role-header">
                    <span className="stat-role-name">{getRoleLabel(role.libelle)}</span>
                    <span className="stat-role-count">{count} agent(s)</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
                  </div>
                  <span className="stat-role-percentage">{percentage}%</span>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* MODAL AJOUT RÔLE */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>➕ Ajouter un rôle</h3>
            <form onSubmit={handleAddRole}>
              <div className="form-group">
                <label>Libellé du rôle</label>
                <input
                  type="text"
                  name="libelle"
                  placeholder="Ex: superviseur, assistant, etc."
                  value={formData.libelle}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="modal-buttons">
                <button type="button" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ATTRIBUER RÔLE */}
      {showAssignModal && selectedRole && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h3>Attribuer le rôle "{getRoleLabel(selectedRole.libelle)}"</h3>
            <p>Sélectionnez les agents qui auront ce rôle :</p>
            <div className="agents-list-modal">
              {agents.filter(a => a.role_libelle !== selectedRole.libelle).map(agent => (
                <div key={agent.id} className="agent-check-item">
                  <label>
                    <input
                      type="checkbox"
                      value={agent.id}
                      onChange={async (e) => {
                        if (e.target.checked) {
                          await fetch(`http://localhost:8000/api/agents/${agent.id}/role/`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role_id: selectedRole.id })
                          });
                          alert(`${agent.prenom} ${agent.nom} a maintenant le rôle ${getRoleLabel(selectedRole.libelle)}`);
                          fetchAgents();
                          fetchRoles();
                        }
                      }}
                    />
                    {agent.prenom} {agent.nom} - {agent.matricule}
                  </label>
                </div>
              ))}
            </div>
            <div className="modal-buttons">
              <button onClick={() => setShowAssignModal(false)}>Fermer</button>
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
        </div>
        <div className="footer-bottom-bar">
          <p>© 2026 Ministère du Numérique et de la Digitalisation — Gestion des Rôles</p>
        </div>
      </footer>
    </div>
  );
}