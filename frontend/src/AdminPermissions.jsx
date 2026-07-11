import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings2, Users, ShieldCheck, FileText, FilePlus2, UserCircle2, LogOut, ChevronDown, ChevronRight, Menu, Plus } from 'lucide-react';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import './App.css';

export default function AdminPermissions() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isAdmin, userRoles } = usePermissions();
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ code: '', description: '' });

  const userNom = localStorage.getItem('userNom');
  const userPrenom = localStorage.getItem('userPrenom');
  const userEmail = localStorage.getItem('userEmail');
  const userMatricule = localStorage.getItem('userMatricule');
  const userName = `${userPrenom} ${userNom}`;

  // Fonction locale pour vérifier si l'utilisateur est admin
  const checkIsAdmin = () => {
    if (isAdmin && typeof isAdmin === 'function' && isAdmin()) {
      return true;
    }
    const storedRoles = localStorage.getItem('userRoles');
    if (storedRoles) {
      try {
        const roles = JSON.parse(storedRoles);
        if (roles.includes('admin') || roles.includes('Administrateur')) {
          return true;
        }
      } catch(e) {}
    }
    return false;
  };

  // Vérifier les droits d'accès
  useEffect(() => {
    if (!userMatricule) {
      navigate('/auth');
      return;
    }
    if (!permissionsLoading) {
      const isUserAdmin = checkIsAdmin();
      const hasGererPermissions = hasPermission && hasPermission('GERER_PERMISSIONS');
      if (!isUserAdmin && !hasGererPermissions) {
        navigate('/app-admin/dashboard');
        return;
      }
    }
  }, [permissionsLoading, userMatricule, navigate, hasPermission]);

  useEffect(() => {
    if (userMatricule) {
      fetchPermissions();
      fetchRoles();
      fetchRolePermissions();
    }
  }, [userMatricule]);

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

  const fetchPermissions = async () => {
    try {
      const response = await fetch('/api/permissions/');
      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/roles/');
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const fetchRolePermissions = async () => {
    try {
      const response = await fetch('/api/role-permissions/');
      if (response.ok) {
        const data = await response.json();
        setRolePermissions(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleAddPermission = async (e) => {
    e.preventDefault();
    
    const isUserAdmin = checkIsAdmin();
    if (!isUserAdmin && !hasPermission('AJOUTER_PERMISSION')) {
      alert("Vous n'avez pas la permission d'ajouter des permissions");
      return;
    }
    
    if (!formData.code || !formData.description) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    try {
      const response = await fetch('/api/permissions/add/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert('✅ Permission ajoutée avec succès');
        setShowModal(false);
        setFormData({ code: '', description: '' });
        fetchPermissions();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleDeletePermission = async (code) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer la permission "${code}" ?\n\nCette action est irréversible.`)) {
      try {
        const response = await fetch(`/api/permissions/${code}/delete/`, {
          method: 'DELETE'
        });
        if (response.ok) {
          alert('✅ Permission supprimée avec succès');
          fetchPermissions();
          fetchRolePermissions();
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

  const handleTogglePermission = async (roleId, permissionCode, isChecked) => {
    const isUserAdmin = checkIsAdmin();
    if (!isUserAdmin && !hasPermission('ATTRIBUER_PERMISSION')) {
      alert("Vous n'avez pas la permission d'attribuer des permissions aux rôles");
      return;
    }
    
    try {
      const response = await fetch('/api/role-permissions/toggle/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: roleId,
          permission_code: permissionCode,
          assign: isChecked
        })
      });

      if (response.ok) {
        fetchRolePermissions();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  if (permissionsLoading) {
    return <div className="loading-screen">Chargement des permissions...</div>;
  }

  const isUserAdminFinal = checkIsAdmin();

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
            <span className="admin-page-title">Gestion des Permissions</span>
          </div>
          <div className="admin-navbar-right">
            <span className="admin-user-name">{userName}</span>
          </div>
        </header>

        {/* ===== CONTENU ===== */}
        <main className="admin-content">
          <section className="hero-banner-intranet">
            <div className="banner-content">
              <h2>Gestion des Permissions</h2>
              <p>Gérez les droits d'accès par rôle.</p>
            </div>
          </section>

          <div className="admin-actions-bar">
            <div className="action-buttons">
              {(isUserAdminFinal || (hasPermission && hasPermission('AJOUTER_PERMISSION'))) && (
                <button className="btn-add" onClick={() => setShowModal(true)}><Plus size={16} />Ajouter une permission</button>
              )}
            </div>
          </div>

          {/* Liste des permissions */}
          <div className="permissions-list">
            <h3>Liste des permissions</h3>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th style={{ width: '140px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center' }}>⏳ Chargement...</td>
                    </tr>
                  ) : permissions.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center' }}>📭 Aucune permission trouvée</td>
                    </tr>
                  ) : (
                    permissions.map((perm) => (
                      <tr key={perm.code}>
                        <td><code>{perm.code}</code></td>
                        <td>{perm.description}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeletePermission(perm.code)}
                            className="admin-action-icon-btn delete"
                            title="Supprimer la permission"
                            aria-label="Supprimer la permission"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Attribution des permissions aux rôles */}
          <div className="roles-permissions">
            <h3>Attribuer des permissions aux rôles</h3>
            <div className="roles-permissions-grid">
              {roles.map((role) => (
                <div key={role.id} className="role-permission-card">
                  <h4>
                    {role.libelle === 'admin' ? 'Administrateur' :
                     role.libelle === 'rh' ? 'Ressources Humaines' :
                     role.libelle === 'chef' ? 'Chef de service' :
                     role.libelle === 'agent' ? 'Agent' : role.libelle}
                  </h4>
                  <div className="permissions-checkboxes">
                    {permissions.map((perm) => (
                      <label key={perm.code} className="permission-checkbox">
                        <input 
                          type="checkbox" 
                          value={perm.code}
                          checked={rolePermissions[role.id]?.includes(perm.code) || false}
                          onChange={(e) => handleTogglePermission(role.id, perm.code, e.target.checked)}
                        />
                        <span className="permission-code">{perm.code}</span>
                        <span className="permission-desc">{perm.description}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
        {/* MODAL AJOUT PERMISSION */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Ajouter une permission</h3>
              <form onSubmit={handleAddPermission}>
                <div className="form-group">
                  <label>Code de la permission</label>
                  <input
                    type="text"
                    name="code"
                    placeholder="Ex: VOIR_RAPPORTS, MODIFIER_CONFIG"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    required
                  />
                  <small className="form-hint">Utilisez des lettres majuscules et des underscores</small>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    name="description"
                    placeholder="Description de la permission"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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