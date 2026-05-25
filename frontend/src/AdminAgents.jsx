import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import DataTable from 'react-data-table-component';
import './App.css';

export default function AdminAgents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [formData, setFormData] = useState({
    matricule: '',
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    date_prise_service: '',
    adresse: '',
    poste: '',
    direction: '',
    typecontrat: '',
    role_id: '1'
  });
  const [formErrors, setFormErrors] = useState({});
  const [roles, setRoles] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [pending, setPending] = useState(true);

  const userNom = localStorage.getItem('userNom');
  const userPrenom = localStorage.getItem('userPrenom');
  const userEmail = localStorage.getItem('userEmail');
  const userName = `${userPrenom} ${userNom}`;

  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    fetchAgents();
    fetchRoles();
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

  const fetchAgents = async () => {
    setPending(true);
    try {
      const response = await fetch('http://localhost:8000/api/agents/');
      if (response.ok) {
        const data = await response.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setPending(false);
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
      console.error('Erreur roles:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formErrors[e.target.name]) {
      setFormErrors({ ...formErrors, [e.target.name]: '' });
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.matricule) errors.matricule = "Matricule requis";
    if (!formData.nom) errors.nom = "Nom requis";
    if (!formData.prenom) errors.prenom = "Prénom requis";
    if (!formData.email) errors.email = "Email requis";
    if (!formData.telephone) errors.telephone = "Téléphone requis";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddAgent = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setPending(true);
    try {
      const response = await fetch('http://localhost:8000/api/register/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: formData.matricule,
          nom: formData.nom,
          prenom: formData.prenom,
          email: formData.email,
          telephone: formData.telephone,
          date_prise_service: formData.date_prise_service || '2024-01-01',
          adresse: formData.adresse || 'À renseigner',
          poste: formData.poste || 'Agent',
          direction: formData.direction || 'À renseigner',
          typecontrat: formData.typecontrat || 'APE'
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (formData.role_id !== '1') {
          await fetch(`http://localhost:8000/api/agents/${data.id}/role/add/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_id: formData.role_id })
          });
        }
        
        alert(`✅ Agent ajouté avec succès !\n\n📧 Un email d'activation a été envoyé à ${formData.email}`);
        
        setShowModal(false);
        setFormData({
          matricule: '', nom: '', prenom: '', email: '', telephone: '',
          date_prise_service: '', adresse: '', poste: '', direction: '', typecontrat: '', role_id: '1'
        });
        await fetchAgents();
      } else {
        alert(data.error || 'Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setPending(false);
    }
  };

  const toggleRole = async (agentId, roleId, isChecked) => {
    try {
      if (isChecked) {
        await fetch(`http://localhost:8000/api/agents/${agentId}/role/add/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role_id: roleId })
        });
      } else {
        await fetch(`http://localhost:8000/api/agents/${agentId}/role/remove/`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role_id: roleId })
        });
      }
      alert('Rôle mis à jour');
      fetchAgents();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la modification du rôle');
    }
  };

  const exportToExcel = () => {
    const filteredAgents = agents.filter(agent =>
      agent.nom?.toLowerCase().includes(filterText.toLowerCase()) ||
      agent.prenom?.toLowerCase().includes(filterText.toLowerCase()) ||
      agent.matricule?.toLowerCase().includes(filterText.toLowerCase())
    );

    const headers = ['Matricule', 'Nom', 'Prénom', 'Email', 'Téléphone', 'Rôle(s)', 'Statut'];
    const rows = filteredAgents.map(agent => [
      agent.matricule,
      agent.nom,
      agent.prenom,
      agent.email,
      agent.telephone || '',
      agent.roles?.map(r => getRoleLabel(r.libelle)).join(', ') || 'Agent',
      agent.actif ? 'Actif' : 'Inactif'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `agents_${new Date().toISOString().slice(0,19)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getRoleLabel = (role) => {
    switch(role) {
      case 'admin': return 'Administrateur';
      case 'rh': return 'RH';
      case 'chef': return 'Chef de service';
      default: return 'Agent';
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/'); 
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    setPending(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        
        let headerRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].includes && rows[i].includes('Matricule')) {
            headerRowIndex = i;
            break;
          }
        }
        
        if (headerRowIndex === -1) {
          alert("Format non reconnu. Colonne 'Matricule' introuvable.");
          setImporting(false);
          setPending(false);
          return;
        }
        
        const headers = rows[headerRowIndex];
        const dataRows = rows.slice(headerRowIndex + 1).filter(row => row[headers.indexOf('Matricule')]);
        
        const agentsToImport = [];
        
        for (const row of dataRows) {
          const matricule = String(row[headers.indexOf('Matricule')] || '');
          const nom = String(row[headers.indexOf('Nom')] || '');
          const prenom = String(row[headers.indexOf('Prénom')] || '');
          const email = String(row[headers.indexOf('Email')] || '');
          const telephone = String(row[headers.indexOf('Téléphone')] || '');
          const adresse = String(row[headers.indexOf('Adresse')] || 'À renseigner');
          const direction = String(row[headers.indexOf('Direction')] || 'À renseigner');
          const typecontrat = String(row[headers.indexOf('Type de contrat')] || 'APE');
          const poste = String(row[headers.indexOf('Poste')] || 'Agent');
          
          if (!matricule || !nom || !prenom || !email) {
            continue;
          }
          
          agentsToImport.push({
            matricule, nom, prenom, email, telephone,
            adresse, direction, typecontrat, poste,
            date_prise_service: '2024-01-01'
          });
        }
        
        if (agentsToImport.length === 0) {
          alert("Aucune donnée valide à importer");
          setImporting(false);
          setPending(false);
          return;
        }
        
        const response = await fetch('http://localhost:8000/api/import-agents/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agents: agentsToImport })
        });
        
        const result = await response.json();
        
        if (response.ok) {
          alert(`✅ Import terminé !\n\n✅ Succès: ${result.success_count}\n❌ Échec: ${result.error_count}`);
        } else {
          alert(`❌ Erreur: ${result.error}`);
        }
        
        await fetchAgents();
        
      } catch (error) {
        console.error("Erreur:", error);
        alert("Erreur lors de l'import: " + error.message);
      } finally {
        setImporting(false);
        setPending(false);
        e.target.value = '';
      }
    };
    
    reader.onerror = (error) => {
      console.error("Erreur de lecture:", error);
      alert("Erreur de lecture du fichier");
      setImporting(false);
      setPending(false);
    };
    
    reader.readAsArrayBuffer(file);
  };

  // Configuration des colonnes du DataTable
  const columns = [
    {
      name: '#',
      selector: (row, index) => index + 1,
      sortable: false,
      width: '60px',
    },
    {
      name: 'Matricule',
      selector: row => row.matricule,
      sortable: true,
    },
    {
      name: 'Nom',
      selector: row => row.nom,
      sortable: true,
    },
    {
      name: 'Prénom',
      selector: row => row.prenom,
      sortable: true,
    },
    {
      name: 'Email',
      selector: row => row.email,
      sortable: true,
    },
    {
      name: 'Téléphone',
      selector: row => row.telephone || '-',
    },
    {
      name: 'Rôle(s)',
      cell: row => (
        <div className="roles-multi">
          {row.roles && row.roles.length > 0 ? (
            row.roles.map((role, idx) => (
              <span key={idx} className={`role-badge ${role.libelle}`}>
                {getRoleLabel(role.libelle)}
              </span>
            ))
          ) : (
            <span className="role-badge agent">Agent</span>
          )}
        </div>
      ),
    },
    {
      name: 'Statut',
      selector: row => row.actif ? 'Actif' : 'Inactif',
      sortable: true,
      cell: row => (
        <span className={`status-badge ${row.actif ? 'active' : 'inactive'}`}>
          {row.actif ? 'Actif' : 'Inactif'}
        </span>
      ),
    },
    {
      name: 'Actions',
      cell: row => (
        <button
          className="btn-edit-role"
          onClick={() => {
            setSelectedAgent(row);
            setShowRoleModal(true);
          }}
        >
          🔄 Gérer rôles
        </button>
      ),
      width: '130px',
    },
  ];

  const filteredAgents = agents.filter(agent =>
    agent.nom?.toLowerCase().includes(filterText.toLowerCase()) ||
    agent.prenom?.toLowerCase().includes(filterText.toLowerCase()) ||
    agent.matricule?.toLowerCase().includes(filterText.toLowerCase()) ||
    agent.email?.toLowerCase().includes(filterText.toLowerCase())
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
        <nav className="nav-central-links">
          <a href="/admin/dashboard" className="nav-tab-item">Dashboard</a>
          <a href="/admin/agents" className="nav-tab-item active">Agents</a>
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
                <button className="dropdown-item" onClick={() => navigate('/admin/dashboard')}>📊 Tableau de bord</button>
                <button className="dropdown-item" onClick={() => navigate('/profile')}>👤 Mon profil</button>
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
            <h2>Gestion des Agents</h2>
            <p>Consultez, ajoutez, modifiez les rôles et exportez la liste des agents.</p>
          </div>
        </section>

        <div className="admin-actions-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Rechercher un agent..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="action-buttons">
            <button className="btn-add" onClick={() => setShowModal(true)} disabled={importing}>➕ Ajouter un agent</button>
            <button className="btn-export" onClick={exportToExcel}>📊 Exporter Excel</button>
            <button className="btn-import" onClick={() => document.getElementById('importFile').click()} disabled={importing}>
              {importing ? '⏳ Import en cours...' : '📥 Importer Excel'}
            </button>
            <input
              type="file"
              id="importFile"
              accept=".xlsx, .xls, .csv"
              style={{ display: 'none' }}
              onChange={handleImportExcel}
            />
          </div>
        </div>

        <section className="admin-section">
          <DataTable
            columns={columns}
            data={filteredAgents}
            progressPending={pending}
            pagination
            paginationRowsPerPageOptions={[10, 25, 50, 100]}
            highlightOnHover
            striped
            responsive
            customStyles={customStyles}
            subHeader
            subHeaderComponent={
              <div className="table-info">
                📊 Total : {filteredAgents.length} agent(s)
              </div>
            }
          />
        </section>
      </main>

      {/* MODAL AJOUT AGENT */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>➕ Inviter un agent</h3>
            <p className="modal-info">📧 Un email d'activation sera envoyé à l'agent pour qu'il crée son mot de passe.</p>
            <form onSubmit={handleAddAgent}>
              <div className="form-row">
                <div className="form-group">
                  <label>Matricule *</label>
                  <input type="text" name="matricule" value={formData.matricule} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Nom *</label>
                  <input type="text" name="nom" value={formData.nom} onChange={handleChange} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Prénom *</label>
                  <input type="text" name="prenom" value={formData.prenom} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Téléphone *</label>
                  <input type="tel" name="telephone" value={formData.telephone} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Rôle initial</label>
                  <select name="role_id" value={formData.role_id} onChange={handleChange}>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>
                        {getRoleLabel(role.libelle)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-buttons">
                <button type="button" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" disabled={pending}>Envoyer l'invitation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL GÉRER RÔLES - MULTI-SELECTION */}
      {showRoleModal && selectedAgent && (
        <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Gérer les rôles de {selectedAgent.prenom} {selectedAgent.nom}</h3>
            <p className="modal-info">Un agent peut avoir plusieurs rôles (ex: Agent + Chef)</p>
            
            <div className="roles-checkboxes">
              {roles.map(role => {
                const isChecked = selectedAgent.roles?.some(r => r.id === role.id) || 
                                  (role.libelle === 'agent' && (!selectedAgent.roles || selectedAgent.roles.length === 0));
                return (
                  <label key={role.id} className="role-checkbox">
                    <input
                      type="checkbox"
                      value={role.id}
                      defaultChecked={isChecked}
                      onChange={(e) => toggleRole(selectedAgent.id, role.id, e.target.checked)}
                    />
                    <span className={`role-badge ${role.libelle}`}>
                      {getRoleLabel(role.libelle)}
                    </span>
                    <span className="role-description">
                      {role.libelle === 'admin' && '👑 Accès total'}
                      {role.libelle === 'rh' && '👥 Gestion des demandes'}
                      {role.libelle === 'chef' && '⭐ Validation des congés'}
                      {role.libelle === 'agent' && '👤 Espace personnel'}
                    </span>
                  </label>
                );
              })}
            </div>
            
            <div className="modal-buttons">
              <button onClick={() => setShowRoleModal(false)}>Fermer</button>
            </div>
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