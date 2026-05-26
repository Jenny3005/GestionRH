import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from 'react-data-table-component';
import AdminNav from './AdminNav';
import './App.css';

export default function AdminTypesDemande() {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
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

  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    fetchTypes();
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
    if (window.confirm(`Supprimer le type "${libelle}" ?`)) {
      try {
        const response = await fetch(`http://localhost:8000/api/types-demande/${id}/delete/`, {
          method: 'DELETE'
        });
        if (response.ok) {
          alert('Type supprimé avec succès');
          fetchTypes();
        } else {
          alert('Erreur lors de la suppression');
        }
      } catch (error) {
        console.error('Erreur:', error);
      }
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
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
            className="btn-edit-type"
            onClick={() => handleEditClick(row)}
          >
            ✏️ Modifier
          </button>
          <button
            className="btn-delete-type"
            onClick={() => handleDeleteType(row.id, row.libelle)}
          >
            🗑️ Supprimer
          </button>
        </div>
      ),
      width: '160px',
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
            <h2>Gestion des Types de Demande</h2>
            <p>Créez, modifiez et gérez les types de demande (Congé, Attestation, Absence, etc.)</p>
          </div>
        </section>

        <div className="admin-actions-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Rechercher un type..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="action-buttons">
            <button className="btn-add" onClick={() => setShowModal(true)}>➕ Ajouter un type</button>
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
                📊 Total : {filteredTypes.length} type(s) de demande
              </div>
            }
          />
        </section>
      </main>

      {/* MODAL AJOUT TYPE DE DEMANDE */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>➕ Ajouter un type de demande</h3>
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
            <h3>✏️ Modifier le type de demande</h3>
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

            {/* FOOTER INSTITUTIONNEL */}
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
