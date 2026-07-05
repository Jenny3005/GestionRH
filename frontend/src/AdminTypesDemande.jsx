import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from 'react-data-table-component';
import { LayoutDashboard, Settings2, Users, ShieldCheck, FileText, FilePlus2, UserCircle2, LogOut, ChevronDown, ChevronRight, Menu, Plus } from 'lucide-react';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import './App.css';

export default function AdminTypesDemande() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isAdmin } = usePermissions();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const [formData, setFormData] = useState({
    libelle: '',
    duree_traitement_moyenne: '',
    acte_generable: 0
  });
  const [formErrors, setFormErrors] = useState({});
  const [filterText, setFilterText] = useState('');

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
    if (!permissionsLoading && !hasPermission('GERER_TYPES_DEMANDE') && !isAdmin()) {
      navigate('/admin/dashboard');
      return;
    }
  }, [permissionsLoading]);

  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    fetchTypes();
  }, []);

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

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/types-demande/');
      if (response.ok) {
        const data = await response.json();
        setTypes(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
    if (formErrors[e.target.name]) {
      setFormErrors({ ...formErrors, [e.target.name]: '' });
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.libelle) errors.libelle = "Libellé requis";
    if (!formData.duree_traitement_moyenne) errors.duree_traitement_moyenne = "Durée requise";
    if (formData.duree_traitement_moyenne && (formData.duree_traitement_moyenne < 1 || formData.duree_traitement_moyenne > 30)) {
      errors.duree_traitement_moyenne = "Durée entre 1 et 30 jours";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddType = async (e) => {
    e.preventDefault();
    
    if (!hasPermission('AJOUTER_TYPE_DEMANDE') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'ajouter des types de demande");
      return;
    }
    
    if (!validateForm()) return;

    setPending(true);
    try {
      const response = await fetch('http://localhost:8000/api/types-demande/add/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libelle: formData.libelle,
          duree_traitement_moyenne: parseInt(formData.duree_traitement_moyenne),
          acte_generable: formData.acte_generable
        })
      });

      if (response.ok) {
        alert(`✅ Type de demande "${formData.libelle}" ajouté avec succès !`);
        setShowModal(false);
        setFormData({ libelle: '', duree_traitement_moyenne: '', acte_generable: 0 });
        fetchTypes();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setPending(false);
    }
  };

  const handleEditClick = (type) => {
    if (!hasPermission('MODIFIER_TYPE_DEMANDE') && !isAdmin()) {
      alert("Vous n'avez pas la permission de modifier les types de demande");
      return;
    }
    setSelectedType(type);
    setFormData({
      libelle: type.libelle,
      duree_traitement_moyenne: type.duree_traitement_moyenne,
      acte_generable: type.acte_generable
    });
    setShowEditModal(true);
  };

  const handleEditType = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setPending(true);
    try {
      const response = await fetch(`http://localhost:8000/api/types-demande/${selectedType.id}/edit/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libelle: formData.libelle,
          duree_traitement_moyenne: parseInt(formData.duree_traitement_moyenne),
          acte_generable: formData.acte_generable
        })
      });

      if (response.ok) {
        alert(`✅ Type de demande modifié avec succès !`);
        setShowEditModal(false);
        setFormData({ libelle: '', duree_traitement_moyenne: '', acte_generable: 0 });
        setSelectedType(null);
        fetchTypes();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la modification');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setPending(false);
    }
  };

  const handleDeleteType = async (id, libelle) => {
    if (!hasPermission('SUPPRIMER_TYPE_DEMANDE') && !isAdmin()) {
      alert("Vous n'avez pas la permission de supprimer des types de demande");
      return;
    }
    
    if (window.confirm(`Supprimer le type "${libelle}" ?`)) {
      try {
        const response = await fetch(`http://localhost:8000/api/types-demande/${id}/delete/`, {
          method: 'DELETE'
        });
        if (response.ok) {
          alert('✅ Type supprimé avec succès');
          fetchTypes();
        } else {
          alert('Erreur lors de la suppression');
        }
      } catch (error) {
        console.error('Erreur:', error);
      }
    }
  };

  const getActeLabel = (acte) => {
    return acte === 1 ? '✅ Oui' : '❌ Non';
  };

  const columns = [
    {
      name: '#',
      selector: (row, index) => index + 1,
      sortable: false,
      width: '60px',
    },
    {
      name: 'Libellé',
      selector: row => row.libelle,
      sortable: true,
      width: '150px',
      grow: 0,
      style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    },
    {
      name: 'Durée (jours)',
      selector: row => row.duree_traitement_moyenne,
      sortable: true,
      width: '120px',
    },
    {
      name: 'Acte générable',
      selector: row => getActeLabel(row.acte_generable),
      sortable: true,
      width: '130px',
      cell: row => (
        <span className={`acte-badge ${row.acte_generable === 1 ? 'yes' : 'no'}`}>
          {getActeLabel(row.acte_generable)}
        </span>
      ),
    },
    {
      name: 'Actions',
      cell: row => (
        <div className="action-buttons-cell">
          <button
            className="admin-action-icon-btn edit"
            onClick={() => handleEditClick(row)}
            title="Modifier"
            aria-label="Modifier"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
            </svg>
          </button>
          <button
            className="admin-action-icon-btn delete"
            onClick={() => handleDeleteType(row.id, row.libelle)}
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
        </div>
      ),
      grow: 1,
      minWidth: '120px',
      center: true,
    },
  ];

  const filteredTypes = types.filter(type =>
    type.libelle?.toLowerCase().includes(filterText.toLowerCase())
  );

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: '#0B192C',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '14px',
      },
    },
    rows: {
      style: {
        minHeight: '50px',
        '&:hover': {
          backgroundColor: '#F8FAFC',
        },
      },
    },
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
              <Menu size={18} />
            </button>
            <span className="admin-page-title">Gestion des Types de Demande</span>
          </div>
          <div className="admin-navbar-right">
            <span className="admin-user-name">{userName}</span>
          </div>
        </header>

        {/* ===== CONTENU ===== */}
        <main className="admin-content">
          <section className="hero-banner-intranet">
            <div className="banner-content">
              <h2>Gestion des Types de Demande</h2>
              <p>Créez, modifiez et gérez les types de demande (Congé, Attestation, Absence, etc.)</p>
            </div>
          </section>

          <div className="admin-actions-bar">
            <div className="search-box">
              <input
                type="text"
                placeholder="Rechercher un type..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="action-buttons">
              <Can permission="AJOUTER_TYPE_DEMANDE">
                <button className="btn-add" onClick={() => setShowModal(true)}><Plus size={16} />Ajouter un type</button>
              </Can>
            </div>
          </div>

          <section className="admin-section">
            <DataTable
              columns={columns}
              data={filteredTypes}
              progressPending={loading}
              pagination
              paginationRowsPerPageOptions={[10, 25, 50]}
              highlightOnHover
              striped
              responsive
              customStyles={customStyles}
              subHeader
              subHeaderComponent={
                <div className="table-info">
                  Total : {filteredTypes.length} type(s) de demande
                </div>
              }
            />
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

      {/* MODAL AJOUT TYPE DE DEMANDE */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Ajouter un type de demande</h3>
            <form onSubmit={handleAddType}>
              <div className="form-group">
                <label>Libellé *</label>
                <input
                  type="text"
                  name="libelle"
                  placeholder="Ex: Congé, Attestation, Absence..."
                  value={formData.libelle}
                  onChange={handleChange}
                  required
                />
                {formErrors.libelle && <span className="error-text">{formErrors.libelle}</span>}
              </div>

              <div className="form-group">
                <label>Durée moyenne de traitement (jours) *</label>
                <input
                  type="number"
                  name="duree_traitement_moyenne"
                  placeholder="Ex: 5"
                  min="1"
                  max="30"
                  value={formData.duree_traitement_moyenne}
                  onChange={handleChange}
                  required
                />
                <small>Entre 1 et 30 jours</small>
                {formErrors.duree_traitement_moyenne && <span className="error-text">{formErrors.duree_traitement_moyenne}</span>}
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="acte_generable"
                    checked={formData.acte_generable === 1}
                    onChange={(e) => setFormData({ ...formData, acte_generable: e.target.checked ? 1 : 0 })}
                  />
                  Acte générable (PDF automatique)
                </label>
              </div>

              <div className="modal-buttons">
                <button type="button" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" disabled={pending}>
                  {pending ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MODIFIER TYPE DE DEMANDE */}
      {showEditModal && selectedType && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier le type de demande</h3>
            <form onSubmit={handleEditType}>
              <div className="form-group">
                <label>Libellé *</label>
                <input
                  type="text"
                  name="libelle"
                  placeholder="Ex: Congé, Attestation, Absence..."
                  value={formData.libelle}
                  onChange={handleChange}
                  required
                />
                {formErrors.libelle && <span className="error-text">{formErrors.libelle}</span>}
              </div>

              <div className="form-group">
                <label>Durée moyenne de traitement (jours) *</label>
                <input
                  type="number"
                  name="duree_traitement_moyenne"
                  placeholder="Ex: 5"
                  min="1"
                  max="30"
                  value={formData.duree_traitement_moyenne}
                  onChange={handleChange}
                  required
                />
                <small>Entre 1 et 30 jours</small>
                {formErrors.duree_traitement_moyenne && <span className="error-text">{formErrors.duree_traitement_moyenne}</span>}
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="acte_generable"
                    checked={formData.acte_generable === 1}
                    onChange={(e) => setFormData({ ...formData, acte_generable: e.target.checked ? 1 : 0 })}
                  />
                  Acte générable (PDF automatique)
                </label>
              </div>

              <div className="modal-buttons">
                <button type="button" onClick={() => setShowEditModal(false)}>Annuler</button>
                <button type="submit" disabled={pending}>
                  {pending ? 'Modification...' : 'Modifier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}