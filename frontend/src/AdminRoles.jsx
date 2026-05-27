import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNav from './AdminNav';
import './App.css';

export default function AdminRoles() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [customRoles, setCustomRoles] = useState([]); // Rôles personnalisés uniquement
  const [agents, setAgents] = useState([]);
  const [filteredAgents, setFilteredAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [formData, setFormData] = useState({
    libelle: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [agentSearchTerm, setAgentSearchTerm] = useState('');

  const userNom = localStorage.getItem('userNom');
  const userPrenom = localStorage.getItem('userPrenom');
  const userEmail = localStorage.getItem('userEmail');
  const userName = `${userPrenom} ${userNom}`;

  // Rôles système à ne pas afficher dans la liste des rôles personnalisables
  const SYSTEM_ROLES = ['admin', 'agent'];

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

  // Filtrer les agents pour le modal
  useEffect(() => {
    if (selectedRole) {
      const filtered = agents.filter(agent => {
        const agentRoles = agent.roles?.map(r => r.libelle) || [];
        const hasRole = agentRoles.includes(selectedRole.libelle);
        const matchesSearch = agent.prenom?.toLowerCase().includes(agentSearchTerm.toLowerCase()) ||
                             agent.nom?.toLowerCase().includes(agentSearchTerm.toLowerCase());
        return !hasRole && matchesSearch;
      });
      setFilteredAgents(filtered);
    }
  }, [agents, selectedRole, agentSearchTerm]);

  const fetchRoles = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/roles/');
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
        // Filtrer pour ne garder que les rôles personnalisés (non système)
        const custom = data.filter(role => !SYSTEM_ROLES.includes(role.libelle));
        setCustomRoles(custom);
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

    // Vérifier si le rôle existe déjà
    if (roles.some(r => r.libelle.toLowerCase() === formData.libelle.toLowerCase())) {
      alert('Ce rôle existe déjà');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/roles/add/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libelle: formData.libelle.toLowerCase() })
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

  // Modifiez la fonction assignRole
  const assignRole = async (agentMatricule) => {
    try {
      const response = await fetch(`http://localhost:8000/api/agents/${agentMatricule}/role/update/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: selectedRole.id })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(result.message || `Rôle attribué avec succès !`);
        fetchAgents();
        fetchRoles();
        // Mettre à jour la liste filtrée
        const updatedFiltered = filteredAgents.filter(agent => agent.matricule !== agentMatricule);
        setFilteredAgents(updatedFiltered);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de l\'attribution');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleDeleteRole = async (roleId, roleLibelle) => {
    if (SYSTEM_ROLES.includes(roleLibelle)) {
      alert(`Le rôle "${roleLibelle}" est un rôle système et ne peut pas être supprimé`);
      return;
    }
    
    // Vérifier si des agents ont ce rôle
    const agentsWithRole = agents.filter(agent => {
      const agentRoles = agent.roles?.map(r => r.libelle) || [];
      return agentRoles.includes(roleLibelle);
    });
    
    if (agentsWithRole.length > 0) {
      alert(`Impossible de supprimer ce rôle car ${agentsWithRole.length} agent(s) l'ont encore. Retirez d'abord le rôle de ces agents.`);
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
          const error = await response.json();
          alert(error.error || 'Erreur lors de la suppression');
        }
      } catch (error) {
        console.error('Erreur:', error);
      }
    }
  };

  const getRoleLabel = (role) => {
    const labels = {
      'admin': 'Administrateur',
      'rh': 'Ressources Humaines',
      'chef': 'Chef de service',
      'agent': 'Agent'
    };
    return labels[role] || role;
  };

  const getRoleBadgeClass = (role) => {
    const classes = {
      'admin': 'role-badge admin',
      'rh': 'role-badge rh',
      'chef': 'role-badge chef',
      'agent': 'role-badge agent'
    };
    return classes[role] || 'role-badge custom';
  };

  const getRoleIcon = (role) => {
    const icons = {
      'admin': '👑',
      'rh': '👥',
      'chef': '⭐',
      'agent': '👤'
    };
    return icons[role] || '🏷️';
  };

  const getRoleDescription = (role) => {
    const descriptions = {
      'admin': 'Accès total à toutes les fonctionnalités',
      'rh': 'Gestion des agents, validation des demandes',
      'chef': 'Supervision équipe, validation des congés',
      'agent': 'Accès à son espace personnel uniquement'
    };
    return descriptions[role] || 'Rôle personnalisé créé par l\'administrateur';
  };

  const filteredRoles = customRoles.filter(role =>
    role.libelle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLogout = () => {
    localStorage.clear();
    navigate('/'); 
  };

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
        </div>
        <AdminNav />
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
            <p>Créez, modifiez et gérez les rôles personnalisés des agents.</p>
          </div>
        </section>

        <div className="admin-actions-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Rechercher un rôle personnalisé..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="action-buttons">
            <button className="btn-add" onClick={() => setShowModal(true)}>➕ Ajouter un rôle personnalisé</button>
          </div>
        </div>

        {/* CARDS DES RÔLES PERSONNALISÉS */}
        <div className="roles-cards-grid">
          {loading ? (
            <p>Chargement...</p>
          ) : filteredRoles.length === 0 ? (
            <div className="empty-state">
              <p>📭 Aucun rôle personnalisé trouvé</p>
              <button className="btn-add" onClick={() => setShowModal(true)}>➕ Créer votre premier rôle</button>
            </div>
          ) : (
            filteredRoles.map((role) => (
              <div key={role.id} className="role-card">
                <div className="role-card-icon">{getRoleIcon(role.libelle)}</div>
                <div className="role-card-content">
                  <h3>{getRoleLabel(role.libelle)}</h3>
                  <span className={getRoleBadgeClass(role.libelle)}>{role.libelle}</span>
                  <p className="role-description">
                    {getRoleDescription(role.libelle)}
                  </p>
                </div>
                <div className="role-card-actions">
                  <button 
                    className="btn-assign"
                    onClick={() => {
                      setSelectedRole(role);
                      setAgentSearchTerm('');
                      setShowAssignModal(true);
                    }}
                  >
                    👥 Attribuer
                  </button>
                  <button 
                    className="btn-delete-role"
                    onClick={() => handleDeleteRole(role.id, role.libelle)}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* STATISTIQUES DES RÔLES (inclut aussi les rôles système pour la vue d'ensemble) */}
        <section className="roles-stats">
          <h3>📊 Répartition des agents par rôle</h3>
          <div className="stats-roles-grid">
            {roles.map((role) => {
              const count = agents.filter(a => {
                const agentRoles = a.roles?.map(r => r.libelle) || [];
                return agentRoles.includes(role.libelle);
              }).length;
              const percentage = agents.length ? Math.round((count / agents.length) * 100) : 0;
              const isSystemRole = SYSTEM_ROLES.includes(role.libelle);
              return (
                <div key={role.id} className="stat-role-item">
                  <div className="stat-role-header">
                    <span className="stat-role-name">
                      {getRoleLabel(role.libelle)}
                      {isSystemRole && <span className="system-badge">Système</span>}
                    </span>
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
            <h3>➕ Ajouter un rôle personnalisé</h3>
            <form onSubmit={handleAddRole}>
              <div className="form-group">
                <label>Libellé du rôle</label>
                <input
                  type="text"
                  name="libelle"
                  placeholder="Ex: superviseur, assistant, gestionnaire, etc."
                  value={formData.libelle}
                  onChange={handleChange}
                  required
                />
                <small className="form-hint">Le libellé sera automatiquement mis en minuscules</small>
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
      {/* MODAL ATTRIBUER RÔLE AVEC BARRE DE RECHERCHE */}
      {/* MODAL ATTRIBUER RÔLE */}
      {showAssignModal && selectedRole && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h3>Attribuer le rôle "{getRoleLabel(selectedRole.libelle)}"</h3>
            <p>Sélectionnez les agents qui auront ce rôle :</p>
            
            <div className="assign-search-box">
              <input
                type="text"
                placeholder="🔍 Rechercher un agent par nom ou prénom..."
                value={agentSearchTerm}
                onChange={(e) => setAgentSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="agents-list-modal">
              {filteredAgents.length === 0 ? (
                <p className="no-agents-message">
                  {agentSearchTerm ? 'Aucun agent trouvé' : 'Tous les agents ont déjà ce rôle'}
                </p>
              ) : (
                filteredAgents.map(agent => (
                  <div key={agent.matricule} className="agent-check-item">
                    <label>
                      <input
                        type="checkbox"
                        value={agent.matricule}
                        onChange={(e) => {
                          if (e.target.checked) {
                            assignRole(agent.matricule); // Passer le matricule
                          }
                        }}
                      />
                      <span className="agent-name">{agent.prenom} {agent.nom}</span>
                      <span className="agent-poste">{agent.poste || 'Poste non spécifié'}</span>
                    </label>
                  </div>
                ))
              )}
            </div>
            
            <div className="modal-buttons">
              <button onClick={() => setShowAssignModal(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

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
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-18/" target="_blank" rel="noopener noreferrer">Statut de l'Agent (SGG)</a></li>
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