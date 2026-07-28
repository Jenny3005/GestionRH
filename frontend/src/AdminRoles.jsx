import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings2, Users, ShieldCheck, FileText, FilePlus2, UserCircle2, LogOut, ChevronDown, ChevronRight, Menu, Plus, MapPin } from 'lucide-react';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import './App.css';

export default function AdminRoles() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isAdmin } = usePermissions();
  const [roles, setRoles] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filteredAgents, setFilteredAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [formData, setFormData] = useState({
    libelle: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [agentSearchTerm, setAgentSearchTerm] = useState('');

  const userNom = localStorage.getItem('userNom');
  const userPrenom = localStorage.getItem('userPrenom');
  const userEmail = localStorage.getItem('userEmail');
  const userName = `${userPrenom} ${userNom}`;

  // Rôles système à ne pas pouvoir supprimer
  const SYSTEM_ROLES = ['admin', 'agent'];

  // Vérifier les droits d'accès
  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    if (!permissionsLoading && !hasPermission('GERER_ROLES') && !isAdmin()) {
      navigate('/app-admin/dashboard');
      return;
    }
  }, [permissionsLoading, hasPermission, isAdmin, navigate]);

  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    fetchRoles();
    fetchAgents();
  }, []);

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

  const navigateTo = (path) => {
    navigate(path);
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const fetchRoles = async () => {
    setRolesLoaded(false);
    try {
      const response = await fetch('/api/roles/');
      if (response.ok) {
        const data = await response.json();
        setRoles(Array.isArray(data) ? data.sort((a, b) => a.libelle.localeCompare(b.libelle)) : []);
      } else {
        console.error('Erreur fetchRoles:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
      setRolesLoaded(true);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/agents/');
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
    
    if (!hasPermission('AJOUTER_ROLE') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'ajouter des rôles");
      return;
    }
    
    if (!formData.libelle) {
      alert('Veuillez saisir un libellé');
      return;
    }

    if (roles.some(r => r.libelle.toLowerCase() === formData.libelle.toLowerCase())) {
      alert('Ce rôle existe déjà');
      return;
    }

    try {
      const response = await fetch('/api/roles/add/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libelle: formData.libelle.toLowerCase() })
      });

      if (response.ok) {
        alert(' Rôle ajouté avec succès');
        setShowModal(false);
        setFormData({ libelle: '' });
        fetchRoles();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const assignRole = async (agentMatricule) => {
    if (!hasPermission('ATTRIBUER_ROLE') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'attribuer des rôles");
      return;
    }
    
    try {
      const response = await fetch(`/api/agents/${agentMatricule}/role/update/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: selectedRole.id })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(result.message || ` Rôle attribué avec succès !`);
        fetchAgents();
        fetchRoles();
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
    if (!hasPermission('SUPPRIMER_ROLE') && !isAdmin()) {
      alert("Vous n'avez pas la permission de supprimer des rôles");
      return;
    }
    
    if (SYSTEM_ROLES.includes(roleLibelle)) {
      alert(` Le rôle "${roleLibelle}" est un rôle système et ne peut pas être supprimé`);
      return;
    }
    
    const agentsWithRole = agents.filter(agent => {
      const agentRoles = agent.roles?.map(r => r.libelle) || [];
      return agentRoles.includes(roleLibelle);
    });
    
    if (agentsWithRole.length > 0) {
      alert(` Impossible de supprimer ce rôle car ${agentsWithRole.length} agent(s) l'ont encore. Retirez d'abord le rôle de ces agents.`);
      return;
    }
    
    if (window.confirm(`Supprimer le rôle "${roleLibelle}" ?`)) {
      try {
        const response = await fetch(`/api/roles/${roleId}/delete/`, {
          method: 'DELETE'
        });
        if (response.ok) {
          alert(' Rôle supprimé');
          fetchRoles();
        } else {
          const error = await response.json();
          alert(error.error || 'Erreur lors de la suppression');
        }
      } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur de connexion');
      }
    }
  };

  const normalizeRoleString = (role) => String(role || '').trim().toLowerCase();

  const getRoleLabel = (role) => {
    const normalized = normalizeRoleString(role);
    const labels = {
      'admin': 'Administrateur',
      'rh': 'Ressources Humaines',
      'chef': 'Chef de service',
      'agent': 'Agent',
      'dpaf': 'DPAF',
      'dapaf': 'DAPAF',
      'secretaire': 'Secrétaire DPAF',
      'rh/secretaire': 'RH / Secrétaire'
    };
    return labels[normalized] || role || 'Rôle inconnu';
  };

  const getRoleBadgeClass = (role) => {
    const normalized = normalizeRoleString(role);
    const classes = {
      'admin': 'role-badge admin',
      'rh': 'role-badge rh',
      'chef': 'role-badge chef',
      'agent': 'role-badge agent',
      'dpaf': 'role-badge dpaf',
      'dapaf': 'role-badge dapaf',
      'secretaire': 'role-badge secretaire',
      'rh/secretaire': 'role-badge rh-secretaire'
    };
    return classes[normalized] || 'role-badge custom';
  };

  const getRoleIcon = () => '';

  const getRoleDescription = (role) => {
    const normalized = normalizeRoleString(role);
    const descriptions = {
      'admin': 'Accès total à toutes les fonctionnalités',
      'rh': 'Gestion des agents, validation des demandes',
      'chef': 'Supervision équipe, validation des congés',
      'agent': 'Accès à son espace personnel uniquement',
      'dpaf': 'Assignment des demandes aux agents RH',
      'dapaf': 'Assignment des demandes aux agents DPAF',
      'secretaire': 'Accès des secrétaires DPAF',
      'rh/secretaire': 'Gestion RH + Transmission au DPAF'
    };
    return descriptions[normalized] || 'Rôle personnalisé créé par l\'administrateur';
  };

  const filteredRoles = roles.filter(role => {
    const search = normalizeRoleString(searchTerm);
    return normalizeRoleString(role.libelle).includes(search) ||
      normalizeRoleString(getRoleLabel(role.libelle)).includes(search);
  });

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
            className={`sidebar-item ${window.location.pathname === '/app-admin/dashboard' ? 'active' : ''}`}
            onClick={() => navigateTo('/app-admin/dashboard')}
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
                    className={`sidebar-subitem ${window.location.pathname === '/app-admin/agents' ? 'active' : ''}`}
                    onClick={() => navigateTo('/app-admin/agents')}
                  >
                    <span className="sidebar-icon"><Users size={16} /></span>
                    <span className="sidebar-label">Agents</span>
                  </button>
                </Can>
                <Can permission="GERER_ROLES">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/app-admin/roles' ? 'active' : ''}`}
                    onClick={() => navigateTo('/app-admin/roles')}
                  >
                    <span className="sidebar-icon"><ShieldCheck size={16} /></span>
                    <span className="sidebar-label">Rôles</span>
                  </button>
                </Can>
                <Can permission="GERER_PERMISSIONS">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/app-admin/permissions' ? 'active' : ''}`}
                    onClick={() => navigateTo('/app-admin/permissions')}
                  >
                    <span className="sidebar-icon"><ShieldCheck size={16} /></span>
                    <span className="sidebar-label">Permissions</span>
                  </button>
                </Can>
                <Can permission="GERE_TYPE_DEMANDE">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/app-admin/types-demande' ? 'active' : ''}`}
                    onClick={() => navigateTo('/app-admin/types-demande')}
                  >
                    <span className="sidebar-icon"><FileText size={16} /></span>
                    <span className="sidebar-label">Types de demande</span>
                  </button>
                </Can>
                <Can permission="GERER_TYPES_PIECE">
                  <button 
                    className={`sidebar-subitem ${window.location.pathname === '/app-admin/types-piece' ? 'active' : ''}`}
                    onClick={() => navigateTo('/app-admin/types-piece')}
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
              <Menu size={18} />
            </button>
            <span className="admin-page-title">Gestion des Rôles</span>
          </div>
          <div className="admin-navbar-right">
            <span className="admin-user-name">{userName}</span>
          </div>
        </header>

        {/* ===== CONTENU ===== */}
        <main className="admin-content">
          <section className="hero-banner-intranet">
            <div className="banner-content">
              <h2>Gestion des Rôles</h2>
              <p>Créez, modifiez et gérez tous les rôles des agents (système + personnalisés).</p>
            </div>
          </section>

          <div className="admin-actions-bar">
            <div className="search-box">
              <input
                type="text"
                placeholder="Rechercher un rôle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="action-buttons">
              <Can permission="AJOUTER_ROLE">
                <button className="btn-add" onClick={() => setShowModal(true)}><Plus size={16} />Ajouter un rôle personnalisé</button>
              </Can>
            </div>
          </div>

          {/* CARDS DES RÔLES */}
          <div className="roles-cards-grid">
            {loading ? (
              <p> Chargement...</p>
            ) : filteredRoles.length === 0 ? (
              <div className="empty-state">
                <p> Aucun rôle trouvé</p>
                <Can permission="AJOUTER_ROLE">
                  <button className="btn-add" onClick={() => setShowModal(true)}>Créer un rôle</button>
                </Can>
              </div>
            ) : (
              filteredRoles.map((role) => (
                <div key={role.id} className="role-card">
                  <div className="role-card-icon" aria-hidden="true"></div>
                  <div className="role-card-content">
                    <h3>{getRoleLabel(role.libelle)}</h3>
                    <div className="role-card-meta">
                      <span className={getRoleBadgeClass(role.libelle)}>{role.libelle}</span>
                    </div>
                    <p className="role-description">
                      {getRoleDescription(role.libelle)}
                    </p>
                  </div>
                  <div className="role-card-actions">
                    <button 
                      className="admin-action-icon-btn edit"
                      onClick={() => {
                        setSelectedRole(role);
                        setAgentSearchTerm('');
                        setShowAssignModal(true);
                      }}
                      title="Attribuer"
                      aria-label="Attribuer"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="8" cy="7" r="4" />
                        <path d="M19 8v6" />
                        <path d="M22 11h-6" />
                      </svg>
                    </button>
                    {!SYSTEM_ROLES.includes(role.libelle) && (
                      <button 
                        className="admin-action-icon-btn delete"
                        onClick={() => handleDeleteRole(role.id, role.libelle)}
                        title="Supprimer"
                        aria-label="Supprimer"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* STATISTIQUES DES RÔLES */}
          <section className="roles-stats">
            <h3>Répartition des agents par rôle</h3>
            <div className="stats-roles-grid">
              {roles.length === 0 ? (
                <p>Aucun rôle trouvé</p>
              ) : (
                roles.map((role) => {
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
                          {!isSystemRole && <span className="custom-badge">Personnalisé</span>}
                        </span>
                        <span className="stat-role-count">{count} agent(s)</span>
                      </div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ 
                            width: `${percentage}%`,
                            background: isSystemRole ? '#3B82F6' : '#10B981'
                          }} 
                        ></div>
                      </div>
                      <span className="stat-role-percentage">{percentage}%</span>
                    </div>
                  );
                })
              )}
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
                <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><MapPin size={16} style={{ color: '#D4AF37' }} /> Avenue Jean-Paul II, Cotonou, Bénin</p>
                <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><Phone size={16} style={{ color: '#D4AF37' }} /> +229 21 30 70 13</p>
                <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><Mail size={16} style={{ color: '#D4AF37' }} /> numerique@gouv.bj</p>
              </div>
            </div>
          </div>
          <div className="footer-bottom-bar">
            <p>© 2026 Ministère du Numérique et de la Digitalisation — République du Bénin.</p>
          </div>
        </footer>
      </div>

      {/* MODAL AJOUT RÔLE */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Ajouter un rôle personnalisé</h3>
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
      {showAssignModal && selectedRole && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h3>Attribuer le rôle "{getRoleLabel(selectedRole.libelle)}"</h3>
            <p>Sélectionnez les agents qui auront ce rôle :</p>
            
            <div className="assign-search-box">
              <input
                type="text"
                placeholder=" Rechercher un agent par nom ou prénom..."
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
                            assignRole(agent.matricule);
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
    </div>
  );
}