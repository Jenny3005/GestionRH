import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import DataTable from 'react-data-table-component';
import { LayoutDashboard, Settings2, Users, ShieldCheck, FileText, FilePlus2, UserCircle2, LogOut, ChevronDown, ChevronRight, Menu, Plus, Download, Upload } from 'lucide-react';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import './App.css';

export default function AdminAgents() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isAdmin } = usePermissions();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [importing, setImporting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [formData, setFormData] = useState({
    matricule: '',
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    date_prise_service: '',
    date_naissance: '',
    adresse: '',
    poste: '',
    direction: '',
    typecontrat: '',
    corps: '',
    echelon: '',
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

  // Vérifier les droits d'accès
  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    if (!permissionsLoading && !hasPermission('VOIR_AGENTS') && !isAdmin()) {
      navigate('/admin/dashboard');
      return;
    }
  }, [permissionsLoading, hasPermission, isAdmin, navigate]);

  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }
    fetchAgents();
    fetchRoles();
  }, []);

  const fetchAgents = async () => {
    setPending(true);
    try {
      const response = await fetch('/api/agents/');
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
      const response = await fetch('/api/roles/');
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

  const handleAddAgent = async (e) => {
    e.preventDefault();
    if (!hasPermission('AJOUTER_AGENT') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'ajouter des agents");
      return;
    }
    
    if (!validateForm()) return;

    setPending(true);
    try {
      const response = await fetch('/api/register/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: formData.matricule,
          nom: formData.nom,
          prenom: formData.prenom,
          email: formData.email,
          telephone: formData.telephone,
          date_prise_service: formData.date_prise_service || '2024-01-01',
          date_naissance: formData.date_naissance || null,
          adresse: formData.adresse || 'À renseigner',
          poste: formData.poste || 'Agent',
          direction: formData.direction || 'À renseigner',
          typecontrat: formData.typecontrat || 'APE',
          corps: formData.corps || '',
          echelon: formData.echelon || ''
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (formData.role_id !== '1') {
          await fetch(`/api/agents/${data.id}/role/add/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_id: formData.role_id })
          });
        }
        
        alert(`✅ Agent ajouté avec succès !\n\n Un email d'activation a été envoyé à ${formData.email}`);
        
        setShowModal(false);
        setFormData({
          matricule: '', nom: '', prenom: '', email: '', telephone: '',
          date_prise_service: '', date_naissance: '', adresse: '', poste: '', 
          direction: '', typecontrat: '', corps: '', echelon: '', role_id: '1'
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
    if (!hasPermission('MODIFIER_ROLE') && !isAdmin()) {
      alert("Vous n'avez pas la permission de modifier les rôles");
      return;
    }
    
    try {
      if (isChecked) {
        await fetch(`/api/agents/${agentId}/role/add/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role_id: roleId })
        });
      } else {
        await fetch(`/api/agents/${agentId}/role/remove/`, {
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
    if (!hasPermission('EXPORTER_AGENTS') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'exporter la liste des agents");
      return;
    }
    
    const filteredAgents = agents.filter(agent =>
      agent.nom?.toLowerCase().includes(filterText.toLowerCase()) ||
      agent.prenom?.toLowerCase().includes(filterText.toLowerCase()) ||
      agent.matricule?.toLowerCase().includes(filterText.toLowerCase())
    );

    const headers = [
      'Matricule', 'Nom', 'Prénom', 'Email', 'Téléphone', 
      'Poste', 'Direction', 'Type de contrat', 'Adresse',
      'Date de naissance', 'Corps', 'Échelon', 'Rôle(s)', 'Statut'
    ];
    
    const rows = filteredAgents.map(agent => [
      agent.matricule,
      agent.nom,
      agent.prenom,
      agent.email,
      agent.telephone || '',
      agent.poste || 'Agent',
      agent.direction || 'À renseigner',
      agent.typecontrat || 'APE',
      agent.adresse || 'À renseigner',
      agent.date_naissance || '-',
      agent.corps || '-',
      agent.echelon || '-',
      agent.roles?.map(r => getRoleLabel(r.libelle)).join(', ') || 'Agent',
      agent.actif ? 'Actif' : 'Inactif'
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Agents');
    
    ws['!cols'] = [
      {wch:15}, {wch:15}, {wch:15}, {wch:25}, {wch:15},
      {wch:20}, {wch:25}, {wch:15}, {wch:25}, {wch:15},
      {wch:20}, {wch:12}, {wch:20}, {wch:10}
    ];
    
    XLSX.writeFile(wb, `agents_mnd_${new Date().toISOString().slice(0,19)}.xlsx`);
  };

  const handleImportExcel = async (e) => {
    if (!hasPermission('IMPORTER_AGENTS') && !isAdmin()) {
      alert("Vous n'avez pas la permission d'importer des agents");
      return;
    }
    
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
          alert("❌ Format non reconnu. Colonne 'Matricule' introuvable.");
          setImporting(false);
          setPending(false);
          return;
        }
        
        const headers = rows[headerRowIndex];
        const dataRows = rows.slice(headerRowIndex + 1).filter(row => {
          const matriculeIndex = headers.indexOf('Matricule');
          return row[matriculeIndex] && String(row[matriculeIndex]).trim() !== '';
        });
        
        const agentsToImport = [];
        const warnings = [];
        
        for (let idx = 0; idx < dataRows.length; idx++) {
          const row = dataRows[idx];
          const lineNum = headerRowIndex + idx + 2;
          
          try {
            const getCellValue = (colName, defaultValue = '') => {
              const index = headers.indexOf(colName);
              if (index === -1 || !row[index]) return defaultValue;
              const value = String(row[index]).trim();
              return value || defaultValue;
            };
            
            const matricule = getCellValue('Matricule');
            const nom = getCellValue('Nom');
            const prenom = getCellValue('Prénom');
            const email = getCellValue('Email');
            const telephone = getCellValue('Téléphone');
            const poste = getCellValue('Poste', 'Agent');
            let direction = getCellValue('Direction', 'À renseigner');
            let typecontrat = getCellValue('Type de contrat', 'APE');
            const adresse = getCellValue('Adresse', 'À renseigner');
            const corps = getCellValue('Corps', '');
            const echelon = getCellValue('Grade', '');
            const dateNaissance = getCellValue('Date de Naissance');
            
            if (direction && direction.includes('(')) {
              direction = direction.split('(')[0].trim();
            }
            
            const validTypeContrats = ['APE', 'ACDPE', 'ACE', 'AAE'];
            if (!validTypeContrats.includes(typecontrat)) {
              warnings.push(`⚠️ Ligne ${lineNum} (${matricule}): Type de contrat "${typecontrat}" invalide, remplacé par APE`);
              typecontrat = 'APE';
            }
            
            let datePriseService = '2024-01-01';
            const rawDate = getCellValue('Date de Prise de Service');
            if (rawDate && rawDate !== '') {
              try {
                let dateStr = String(rawDate).trim();
                if (dateStr.includes('/')) {
                  const parts = dateStr.split('/');
                  if (parts.length === 3) {
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2];
                    if (year && year.length === 4) {
                      datePriseService = `${year}-${month}-${day}`;
                    }
                  }
                } else if (dateStr.includes('-')) {
                  const parts = dateStr.split('-');
                  if (parts.length === 3) {
                    if (parts[0].length === 4) {
                      datePriseService = dateStr;
                    } else {
                      datePriseService = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }
                  }
                }
              } catch (e) {
                warnings.push(` Ligne ${lineNum} (${matricule}): Date prise service invalide`);
              }
            }
            
            let dateNaissanceFormatted = null;
            if (dateNaissance && dateNaissance !== '') {
              try {
                let dateStr = String(dateNaissance).trim();
                if (dateStr.includes('/')) {
                  const parts = dateStr.split('/');
                  if (parts.length === 3) {
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2];
                    if (year && year.length === 4) {
                      dateNaissanceFormatted = `${year}-${month}-${day}`;
                    }
                  }
                } else if (dateStr.includes('-')) {
                  const parts = dateStr.split('-');
                  if (parts.length === 3) {
                    if (parts[0].length === 4) {
                      dateNaissanceFormatted = dateStr;
                    } else {
                      dateNaissanceFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }
                  }
                }
              } catch (e) {
                warnings.push(` Ligne ${lineNum} (${matricule}): Date naissance invalide`);
              }
            }
            
            if (!matricule) {
              warnings.push(`❌ Ligne ${lineNum}: Matricule manquant`);
              continue;
            }
            if (!nom) {
              warnings.push(`❌ Ligne ${lineNum} (${matricule}): Nom manquant`);
              continue;
            }
            if (!prenom) {
              warnings.push(`❌ Ligne ${lineNum} (${matricule}): Prénom manquant`);
              continue;
            }
            if (!email) {
              warnings.push(`❌ Ligne ${lineNum} (${matricule}): Email manquant`);
              continue;
            }
            
            agentsToImport.push({
              matricule,
              nom,
              prenom,
              email: email.toLowerCase(),
              telephone: telephone || '',
              adresse: adresse,
              direction: direction,
              typecontrat: typecontrat,
              poste: poste,
              date_prise_service: datePriseService,
              date_naissance: dateNaissanceFormatted,
              corps: corps,
              echelon: echelon
            });
            
          } catch (rowError) {
            warnings.push(`❌ Ligne ${lineNum}: Erreur - ${rowError.message}`);
          }
        }
        
        if (agentsToImport.length === 0) {
          alert(`❌ Aucune donnée valide à importer.\n\n${warnings.slice(0, 10).join('\n')}`);
          setImporting(false);
          setPending(false);
          return;
        }
        
        const confirmMessage = ` RÉSUMÉ DE L'IMPORT\n\n` +
          `✅ Agents à importer: ${agentsToImport.length}\n` +
          `⚠️ Avertissements: ${warnings.length}\n\n` +
          `${warnings.slice(0, 5).join('\n')}${warnings.length > 5 ? `\n... et ${warnings.length - 5} autres` : ''}\n\n` +
          `Continuer ?`;
        
        if (!window.confirm(confirmMessage)) {
          setImporting(false);
          setPending(false);
          return;
        }
        
        let result = null;
        try {
          const response = await fetch('/api/import-agents/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agents: agentsToImport })
          });

          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            result = await response.json();
          } else {
            const rawText = await response.text();
            result = { success: response.ok, success_count: response.ok ? agentsToImport.length : 0, error_count: response.ok ? 0 : 1, errors: response.ok ? [] : [rawText.slice(0, 200)] };
          }
        } catch (parseError) {
          result = { success: true, success_count: agentsToImport.length, error_count: 0, errors: [] };
        }
        
        if (result && result.success !== false) {
          let successMessage = `✅ IMPORT TERMINÉ !\n\n`;
          successMessage += ` Succès: ${result.success_count || 0}\n`;
          successMessage += `❌ Échecs: ${result.error_count || 0}\n`;
          
          if (result.errors && result.errors.length > 0) {
            successMessage += `\n Erreurs:\n${result.errors.slice(0, 5).join('\n')}`;
          }
          
          alert(successMessage);
          await fetchAgents();
        } else {
          alert(`❌ Erreur: ${result?.error || 'Erreur inconnue'}`);
        }
        
      } catch (error) {
        console.error("Erreur:", error);
        alert("❌ Erreur lors de l'import: " + error.message);
      } finally {
        setImporting(false);
        setPending(false);
        e.target.value = '';
      }
    };
    
    reader.onerror = (error) => {
      console.error("Erreur de lecture:", error);
      alert("❌ Erreur de lecture du fichier");
      setImporting(false);
      setPending(false);
    };
    
    reader.readAsArrayBuffer(file);
  };

  const getRoleLabel = (role) => {
    switch(role) {
      case 'admin': return 'Administrateur';
      case 'rh': return 'RH';
      case 'chef': return 'Chef de service';
      case 'agent': return 'Agent';
      case 'dpaf': return 'DPAF';
      case 'secretaire': return 'Secrétaire DPAF';
      case 'rh/secretaire': return 'RH secretaire';
      default: return role;
    }
  };

  const columns = [
    { name: '#', selector: (row, index) => index + 1, sortable: false, width: '60px' },
    { name: 'Matricule', selector: row => row.matricule, sortable: true },
    { name: 'Nom', selector: row => row.nom, sortable: true },
    { name: 'Prénom', selector: row => row.prenom, sortable: true },
    { name: 'Email', selector: row => row.email, sortable: true },
    { name: 'Téléphone', selector: row => row.telephone || '-' },
    { name: 'Direction', selector: row => row.direction || '-' },
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
          className="admin-action-icon-btn edit"
          onClick={() => { setSelectedAgent(row); setShowRoleModal(true); }}
          title="Gérer les rôles"
          aria-label="Gérer les rôles"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
          </svg>
        </button>
      ),
      width: '90px',
    },
  ];

  const filteredAgents = agents.filter(agent =>
    agent.nom?.toLowerCase().includes(filterText.toLowerCase()) ||
    agent.prenom?.toLowerCase().includes(filterText.toLowerCase()) ||
    agent.matricule?.toLowerCase().includes(filterText.toLowerCase()) ||
    agent.email?.toLowerCase().includes(filterText.toLowerCase())
  );

  const customStyles = {
    headCells: { style: { backgroundColor: '#0B192C', color: 'white', fontWeight: 'bold', fontSize: '14px' } },
    rows: { style: { minHeight: '50px', '&:hover': { backgroundColor: '#F8FAFC' } } },
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
            <span className="admin-page-title">Gestion des Agents</span>
          </div>
          <div className="admin-navbar-right">
            <span className="admin-user-name">{userName}</span>
          </div>
        </header>

        {/* ===== CONTENU ===== */}
        <main className="admin-content">
          <section className="hero-banner-intranet">
            <div className="banner-content">
              <h2>Gestion des Agents</h2>
              <p>Consultez, ajoutez, modifiez les rôles, importez et exportez la liste des agents.</p>
            </div>
          </section>

          <div className="admin-actions-bar">
            <div className="search-box">
              <input type="text" placeholder="Rechercher un agent..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="search-input" />
            </div>
            <div className="action-buttons">
              <Can permission="AJOUTER_AGENT">
                <button className="btn-add" onClick={() => setShowModal(true)} disabled={importing}><Plus size={16} />Ajouter un agent</button>
              </Can>
              <Can permission="EXPORTER_AGENTS">
                <button className="btn-export" onClick={exportToExcel} disabled={importing}><Download size={16} />Exporter Excel</button>
              </Can>
              <Can permission="IMPORTER_AGENTS">
                <button className="btn-import" onClick={() => document.getElementById('importFile').click()} disabled={importing}>
                  {importing ? 'Import en cours...' : <><Upload size={16} />Importer Excel</>}
                </button>
              </Can>
              <input type="file" id="importFile" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} onChange={handleImportExcel} />
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
              subHeaderComponent={<div className="table-info">📋 Total : {filteredAgents.length} agent(s) sur {agents.length}</div>}
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

      {/* MODAL AJOUT AGENT */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Inviter un agent</h3>
            <p className="modal-info">📧 Un email d'activation sera envoyé à l'agent pour qu'il crée son mot de passe.</p>
            <form onSubmit={handleAddAgent}>
              <div className="form-row">
                <div className="form-group"><label>Matricule *</label><input type="text" name="matricule" value={formData.matricule} onChange={handleChange} required /></div>
                <div className="form-group"><label>Nom *</label><input type="text" name="nom" value={formData.nom} onChange={handleChange} required /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Prénom *</label><input type="text" name="prenom" value={formData.prenom} onChange={handleChange} required /></div>
                <div className="form-group"><label>Email *</label><input type="email" name="email" value={formData.email} onChange={handleChange} required /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Téléphone *</label><input type="tel" name="telephone" value={formData.telephone} onChange={handleChange} required /></div>
                <div className="form-group"><label>Direction</label><input type="text" name="direction" value={formData.direction} onChange={handleChange} placeholder="Direction" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Poste</label><input type="text" name="poste" value={formData.poste} onChange={handleChange} placeholder="Poste occupé" /></div>
                <div className="form-group"><label>Type de contrat</label>
                  <select name="typecontrat" value={formData.typecontrat} onChange={handleChange}>
                    <option value="APE">APE</option><option value="ACDPE">ACDPE</option>
                    <option value="ACE">ACE</option><option value="AAE">AAE</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Date de naissance</label><input type="date" name="date_naissance" value={formData.date_naissance} onChange={handleChange} /></div>
                <div className="form-group"><label>Date de prise de service</label><input type="date" name="date_prise_service" value={formData.date_prise_service} onChange={handleChange} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Corps</label><input type="text" name="corps" value={formData.corps} onChange={handleChange} placeholder="Ex: Ingénieur" /></div>
                <div className="form-group"><label>Échelon</label><input type="text" name="echelon" value={formData.echelon} onChange={handleChange} placeholder="Ex: A1-6" /></div>
              </div>
              <div className="form-group"><label>Adresse</label><input type="text" name="adresse" value={formData.adresse} onChange={handleChange} placeholder="Adresse complète" /></div>
              <div className="form-row">
                <div className="form-group"><label>Rôle initial</label>
                  <select name="role_id" value={formData.role_id} onChange={handleChange}>
                    {roles.map(role => (<option key={role.id} value={role.id}>{getRoleLabel(role.libelle)}</option>))}
                  </select>
                </div>
              </div>
              <div className="modal-buttons">
                <button type="button" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" disabled={pending}>📤 Envoyer l'invitation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL GÉRER RÔLES */}
      {showRoleModal && selectedAgent && (
        <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Gérer les rôles de {selectedAgent.prenom} {selectedAgent.nom}</h3>
            <p className="modal-info">Un agent peut avoir plusieurs rôles (ex: Agent + Chef)</p>
            <div className="roles-checkboxes">
              {[...new Map(roles.map(role => [role.id, role])).values()].map(role => {
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
                      {role.libelle === 'admin' && ' Accès total à toutes les fonctionnalités'}
                      {role.libelle === 'agent' && ' Soumission de demandes et suivi personnel'}
                      {role.libelle === 'chef' && ' Validation des congés de son équipe'}
                      {role.libelle === 'dpaf' && ' Assignment des demandes aux agents RH'}
                      {role.libelle === 'rh' && ' Gestion des agents et des demandes'}
                      {role.libelle === 'rh/secretaire' && ' Gestion RH + Transmission au DPAF'}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="modal-buttons"><button onClick={() => setShowRoleModal(false)}>Fermer</button></div>
          </div>
        </div>
      )}
    </div>
  );
}