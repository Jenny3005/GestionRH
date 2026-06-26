import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNav from './AdminNav';
import usePermissions from './hooks/usePermissions';
import './App.css';

export default function AdminPermissions() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isAdmin, userRoles } = usePermissions();
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
  const userMatricule = localStorage.getItem('userMatricule');
  const userName = `${userPrenom} ${userNom}`;

  // Fonction locale pour vérifier si l'utilisateur est admin
  const checkIsAdmin = () => {
    // Méthode 1: via le hook
    if (isAdmin && typeof isAdmin === 'function' && isAdmin()) {
      return true;
    }
    
    // Méthode 2: via les rôles stockés dans localStorage
    const storedRoles = localStorage.getItem('userRoles');
    if (storedRoles) {
      try {
        const roles = JSON.parse(storedRoles);
        if (roles.includes('admin') || roles.includes('Administrateur')) {
          return true;
        }
      } catch(e) {}
    }
    
    // Méthode 3: via l'email ou matricule admin par défaut
    const adminEmails = ['admin@mnd.bj', 'admin@example.com'];
    if (adminEmails.includes(userEmail)) {
      return true;
    }
    
    return false;
  };

  // Vérifier les droits d'accès
  useEffect(() => {
    if (!userMatricule) {
      navigate('/auth');
      return;
    }
    
    // Attendre que les permissions soient chargées
    if (!permissionsLoading) {
      const isUserAdmin = checkIsAdmin();
      const hasGererPermissions = hasPermission && hasPermission('GERER_PERMISSIONS');
      
      if (!isUserAdmin && !hasGererPermissions) {
        navigate('/admin/dashboard');
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
    const isUserAdmin = checkIsAdmin();
    
    if (!isUserAdmin && !hasPermission('SUPPRIMER_PERMISSION')) {
      alert("Vous n'avez pas la permission de supprimer des permissions");
      return;
    }
    
    if (window.confirm(` Êtes-vous sûr de vouloir supprimer la permission "${code}" ?\n\nCette action est irréversible et peut affecter les droits des utilisateurs.`)) {
      try {
        const response = await fetch(`http://localhost:8000/api/permissions/${code}/delete/`, {
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

  // Vérifier si l'utilisateur peut supprimer une permission
  const canDeletePermission = () => {
    return checkIsAdmin() || (hasPermission && hasPermission('SUPPRIMER_PERMISSION'));
  };

  // Affichage du chargement des permissions
  if (permissionsLoading) {
    return <div className="loading-screen">Chargement des permissions...</div>;
  }

  const isUserAdminFinal = checkIsAdmin();
  const canDelete = isUserAdminFinal || (hasPermission && hasPermission('SUPPRIMER_PERMISSION'));

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
                
                {/* Tableau de bord */}
                <button className="dropdown-item" onClick={() => navigate('/admin/dashboard')}>
                  Tableau de bord
                </button>
                
                {/* Agents */}
                <button className="dropdown-item" onClick={() => navigate('/admin/agents')}>
                  Agents
                </button>
                
                {/* Rôles */}
                <button className="dropdown-item" onClick={() => navigate('/admin/roles')}>
                  Rôles
                </button>
                
                {/* Permissions */}
                <button className="dropdown-item" onClick={() => navigate('/admin/permissions')}>
                  Permissions
                </button>
                
                {/* Types de demande - AJOUT */}
                <button className="dropdown-item" onClick={() => navigate('/admin/types-demande')}>
                  Types de demande
                </button>
                
                {/* Types de pièce - AJOUT */}
                <button className="dropdown-item" onClick={() => navigate('/admin/types-piece')}>
                  Types de pièce
                </button>
                
                <div className="dropdown-divider"></div>
                
                {/* Mon profil - AJOUT (optionnel) */}
                <button className="dropdown-item" onClick={() => navigate('/profil')}>
                  👤 Mon profil
                </button>
                
                {/* Déconnexion */}
                <button className="dropdown-item logout" onClick={handleLogout}>
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2> Gestion des Permissions</h2>
            <p>Gérez les droits d'accès par rôle.</p>
          </div>
        </section>

        <div className="admin-actions-bar">
          <div className="action-buttons">
            {(isUserAdminFinal || (hasPermission && hasPermission('AJOUTER_PERMISSION'))) && (
              <button className="btn-add" onClick={() => setShowModal(true)}>➕ Ajouter une permission</button>
            )}
          </div>
        </div>

        {/* Liste des permissions avec colonne Actions */}
        <div className="permissions-list">
          <h3> Liste des permissions</h3>
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
                    <td colSpan="3" style={{ textAlign: 'center' }}>Chargement...</td>
                  </tr>
                ) : permissions.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center' }}>Aucune permission trouvée</td>
                  </tr>
                ) : (
                  permissions.map((perm) => (
                    <tr key={perm.code}>
                      <td><code>{perm.code}</code></td>
                      <td>{perm.description}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleDeletePermission(perm.code)}
                          className="btn-delete"
                          title="Supprimer la permission"
                          disabled={!canDelete}
                        >
                          🗑️ Supprimer
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
          <h3> Attribuer des permissions aux rôles</h3>
          <div className="roles-permissions-grid">
            {roles.map((role) => (
              <div key={role.id} className="role-permission-card">
                <h4>
                  {role.libelle === 'admin' }
                  {role.libelle === 'rh' }
                  {role.libelle === 'chef' }
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
  );
}