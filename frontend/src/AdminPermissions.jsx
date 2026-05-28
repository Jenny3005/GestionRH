import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNav from './AdminNav';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import './App.css';

export default function AdminPermissions() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isAdmin } = usePermissions();
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ code: '', description: '' });

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
    // Vérifier si l'utilisateur a la permission de gérer les permissions
    if (!permissionsLoading && !hasPermission('GERER_PERMISSIONS') && !isAdmin()) {
      navigate('/admin/dashboard');
      return;
    }
  }, [permissionsLoading]);

  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    fetchPermissions();
    fetchRoles();
    fetchRolePermissions();
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

  const fetchPermissions = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/permissions/');
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
      const response = await fetch('http://localhost:8000/api/roles/');
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
      const response = await fetch('http://localhost:8000/api/role-permissions/');
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
    
    // Vérifier la permission d'ajouter
    if (!hasPermission('AJOUTER_PERMISSION') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'ajouter des permissions");
      return;
    }
    
    if (!formData.code || !formData.description) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/permissions/add/', {
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
    // Vérifier la permission de supprimer
    if (!hasPermission('SUPPRIMER_PERMISSION') && !isAdmin()) {
      alert("Vous n'avez pas la permission de supprimer des permissions");
      return;
    }
    
    if (window.confirm(`Supprimer la permission "${code}" ?`)) {
      try {
        const response = await fetch(`http://localhost:8000/api/permissions/${code}/delete/`, {
          method: 'DELETE'
        });
        if (response.ok) {
          alert('✅ Permission supprimée');
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
    // Vérifier la permission d'attribuer
    if (!hasPermission('ATTRIBUER_PERMISSION') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'attribuer des permissions aux rôles");
      return;
    }
    
    try {
      const response = await fetch('http://localhost:8000/api/role-permissions/toggle/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: roleId,
          permission_code: permissionCode,
          assign: isChecked
        })
      });

      if (response.ok) {
        console.log('Permission mise à jour');
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

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  // Permissions système à ne pas supprimer
  const SYSTEM_PERMISSIONS = ['GERER_PERMISSIONS', 'AJOUTER_PERMISSION', 'SUPPRIMER_PERMISSION', 'ATTRIBUER_PERMISSION', 'VOIR_AGENTS', 'AJOUTER_AGENT', 'MODIFIER_ROLE', 'EXPORTER_AGENTS', 'IMPORTER_AGENTS', 'SOUMETTRE_DEMANDE', 'DEPOSER_PIECE', 'ACTIVER_COMPTE'];

  // Affichage du chargement des permissions
  if (permissionsLoading) {
    return <div className="loading-screen">Chargement des permissions...</div>;
  }

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
                <button className="dropdown-item" onClick={() => navigate('/admin/permissions')}>🔐 Permissions</button>
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
            <h2>🔐 Gestion des Permissions</h2>
            <p>Gérez les droits d'accès par rôle.</p>
          </div>
        </section>

        <div className="admin-actions-bar">
          <div className="action-buttons">
            <Can permission="AJOUTER_PERMISSION">
              <button className="btn-add" onClick={() => setShowModal(true)}>➕ Ajouter une permission</button>
            </Can>
          </div>
        </div>

        {/* Liste des permissions */}
        <div className="permissions-list">
          <h3>📋 Liste des permissions</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="3">Chargement...</td></tr>
                ) : permissions.length === 0 ? (
                  <tr><td colSpan="3">Aucune permission trouvée</td></tr>
                ) : (
                  permissions.map((perm) => (
                    <tr key={perm.code}>
                      <td><code>{perm.code}</code></td>
                      <td>{perm.description}</td>
                      <td>
                        <Can permission="SUPPRIMER_PERMISSION">
                          {!SYSTEM_PERMISSIONS.includes(perm.code) ? (
                            <button 
                              className="btn-delete"
                              onClick={() => handleDeletePermission(perm.code)}
                            >
                              🗑️ Supprimer
                            </button>
                          ) : (
                            <span className="system-badge-small">Système</span>
                          )}
                        </Can>
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
          <h3>🔗 Attribuer des permissions aux rôles</h3>
          <div className="roles-permissions-grid">
            {roles.map((role) => (
              <div key={role.id} className="role-permission-card">
                <h4>
                  {role.libelle === 'admin' && '👑 '}
                  {role.libelle === 'rh' && '📋 '}
                  {role.libelle === 'chef' && '⭐ '}
                  {role.libelle === 'agent' && '👤 '}
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
                        disabled={role.libelle === 'admin' && perm.code === 'GERER_PERMISSIONS'}
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
            <h3>➕ Ajouter une permission</h3>
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