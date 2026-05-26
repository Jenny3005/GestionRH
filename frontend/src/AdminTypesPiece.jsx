import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from 'react-data-table-component';
import AdminNav from './AdminNav';
import './App.css';

export default function AdminTypesPiece() {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [formData, setFormData] = useState({
    libelle: '',
    obligatoire: 0,
    duree_validite: ''
  });

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
      const response = await fetch('http://localhost:8000/api/types-piece/');
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
    if (!formData.libelle) errors.libelle = 'Libellé requis';
    if (!formData.duree_validite) errors.duree_validite = 'Durée de validité requise';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setFormData({ libelle: '', obligatoire: 0, duree_validite: '' });
    setFormErrors({});
    setSelectedType(null);
  };

  const handleAddType = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setPending(true);
    try {
      const response = await fetch('http://localhost:8000/api/types-piece/add/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert(`Type de pièce "${formData.libelle}" ajouté avec succès !`);
        setShowModal(false);
        resetForm();
        fetchTypes();
      } else {
        const error = await response.json();
        alert(error.error || "Erreur lors de l'ajout");
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
      obligatoire: type.obligatoire,
      duree_validite: type.duree_validite
    });
    setShowEditModal(true);
  };

  const handleEditType = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setPending(true);
    try {
      const response = await fetch(`http://localhost:8000/api/types-piece/${selectedType.id}/edit/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert('Type de pièce modifié avec succès !');
        setShowEditModal(false);
        resetForm();
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
    if (!window.confirm(`Supprimer le type de pièce "${libelle}" ?`)) return;

    try {
      const response = await fetch(`http://localhost:8000/api/types-piece/${id}/delete/`, {
        method: 'DELETE'
      });
      if (response.ok) {
        alert('Type de pièce supprimé avec succès');
        fetchTypes();
      } else {
        alert('Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const getRequiredLabel = (value) => (value === 1 ? 'Oui' : 'Non');

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
      name: 'Obligatoire',
      selector: row => getRequiredLabel(row.obligatoire),
      sortable: true,
      width: '130px',
      cell: row => (
        <span className={`acte-badge ${row.obligatoire === 1 ? 'yes' : 'no'}`}>
          {getRequiredLabel(row.obligatoire)}
        </span>
      ),
    },
    {
      name: 'Durée de validité',
      selector: row => row.duree_validite,
      sortable: true,
    },
    {
      name: 'Actions',
      cell: row => (
        <div className="action-buttons-cell">
          <button className="btn-edit-type" onClick={() => handleEditClick(row)}>
            Modifier
          </button>
          <button className="btn-delete-type" onClick={() => handleDeleteType(row.id, row.libelle)}>
            Supprimer
          </button>
        </div>
      ),
      width: '160px',
    },
  ];

  const filteredTypes = types.filter(type =>
    type.libelle?.toLowerCase().includes(filterText.toLowerCase()) ||
    type.duree_validite?.toLowerCase().includes(filterText.toLowerCase())
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

  const renderForm = (onSubmit, title, submitLabel) => (
    <form onSubmit={onSubmit}>
      <div className="form-group">
        <label>Libellé *</label>
        <input
          type="text"
          name="libelle"
          placeholder="Ex: Carte nationale d'identité, Diplôme, Certificat..."
          value={formData.libelle}
          onChange={handleChange}
          required
        />
        {formErrors.libelle && <span className="error-text">{formErrors.libelle}</span>}
      </div>

      <div className="form-group">
        <label>Durée de validité *</label>
        <input
          type="text"
          name="duree_validite"
          placeholder="Ex: 5 ans, 3 mois, Permanente"
          value={formData.duree_validite}
          onChange={handleChange}
          required
        />
        {formErrors.duree_validite && <span className="error-text">{formErrors.duree_validite}</span>}
      </div>

      <div className="form-group checkbox-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="obligatoire"
            checked={formData.obligatoire === 1}
            onChange={handleChange}
          />
          Pièce obligatoire dans le dossier agent
        </label>
      </div>

      <div className="modal-buttons">
        <button type="button" onClick={() => {
          setShowModal(false);
          setShowEditModal(false);
          resetForm();
        }}>
          Annuler
        </button>
        <button type="submit" disabled={pending}>
          {pending ? 'Traitement...' : submitLabel}
        </button>
      </div>
    </form>
  );

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
                <button className="dropdown-item" onClick={() => navigate('/admin/dashboard')}>Tableau de bord</button>
                <button className="dropdown-item" onClick={() => navigate('/profil')}>Mon profil</button>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item logout" onClick={handleLogout}>Se déconnecter</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Gestion des Types de Pièce</h2>
            <p>Créez, modifiez et gérez les pièces attendues dans les dossiers des agents.</p>
          </div>
        </section>

        <div className="admin-actions-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Rechercher un type de pièce..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="action-buttons">
            <button className="btn-add" onClick={() => setShowModal(true)}>Ajouter un type</button>
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
                Total : {filteredTypes.length} type(s) de pièce
              </div>
            }
          />
        </section>
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Ajouter un type de pièce</h3>
            {renderForm(handleAddType, 'Ajouter un type de pièce', 'Ajouter')}
          </div>
        </div>
      )}

      {showEditModal && selectedType && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier le type de pièce</h3>
            {renderForm(handleEditType, 'Modifier le type de pièce', 'Modifier')}
          </div>
        </div>
      )}
    </div>
  );
}
