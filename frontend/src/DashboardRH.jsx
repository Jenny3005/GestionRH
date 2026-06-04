import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import usePermissions from './hooks/usePermissions';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import UserMenu from './UserMenu';
import './App.css';

export default function DashboardRH() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  
  const [userInfo, setUserInfo] = useState({
    nom: localStorage.getItem('userNom') || '',
    prenom: localStorage.getItem('userPrenom') || '',
    matricule: localStorage.getItem('userMatricule') || '',
    email: localStorage.getItem('userEmail') || '',
    role: 'Ressources Humaines'
  });

  // Données dynamiques
  const [stats, setStats] = useState({
    totalAgents: 0,
    demandesEnAttente: 0,
    demandesEnCours: 0,
    actesAEnvoyer: 0,
    documentsExpires: 0,
    annoncesActives: 0,
    dossiersIncomplets: 0,
    facturesATraiter: 0
  });

  const [demandesAssignees, setDemandesAssignees] = useState([]);
  const [demandesEnCours, setDemandesEnCours] = useState([]);
  const [demandesTerminees, setDemandesTerminees] = useState([]);
  const [actesGeneres, setActesGeneres] = useState([]);
  const [agentsRecents, setAgentsRecents] = useState([]);
  const [vraisAgents, setVraisAgents] = useState([]);
  const [annonces, setAnnonces] = useState([]);

  const [showAddAgentModal, setShowAddAgentModal] = useState(false);

  const [newAgent, setNewAgent] = useState({
    matricule: '',
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    poste: 'Agent',
    direction: '',
    typecontrat: 'APE',
    date_prise_service: new Date().toISOString().split('T')[0]
  });

  const userName = `${userInfo.prenom} ${userInfo.nom}`.trim();
  const matricule = localStorage.getItem('userMatricule');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    
    const role = localStorage.getItem('userRole');
    if (role !== 'rh' && role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const matriculeRH = localStorage.getItem('userMatricule');
      
      // 1. CHARGER LES AGENTS
      console.log('🔍 Chargement des agents...');
      const agentsRes = await fetch('http://localhost:8000/api/agents/');
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        console.log('✅ Agents chargés:', agentsData.length);
        setVraisAgents(agentsData);
        setAgentsRecents(agentsData.slice(0, 10));
        setStats(prev => ({ ...prev, totalAgents: agentsData.length }));
      } else {
        console.error('❌ Erreur chargement agents:', agentsRes.status);
      }

      // 2. Demandes assignées au RH (statut = 'assignee_rh')
      console.log('🔍 Chargement demandes assignées...');
      const assigneesRes = await fetch(`http://localhost:8000/api/rh/demandes-assignees/${matriculeRH}/`);
      if (assigneesRes.ok) {
        const data = await assigneesRes.json();
        console.log('📋 Demandes assignées:', data.length);
        setDemandesAssignees(data);
        setStats(prev => ({ ...prev, demandesEnAttente: data.length }));
      }

      // 3. Demandes en cours de traitement (statut = 'en_cours_traitement')
      console.log('🔍 Chargement demandes en cours...');
      const enCoursRes = await fetch(`http://localhost:8000/api/rh/demandes-cours/${matriculeRH}/`);
      if (enCoursRes.ok) {
        const data = await enCoursRes.json();
        console.log('⚙️ Demandes en cours:', data.length);
        setDemandesEnCours(data);
        setStats(prev => ({ ...prev, demandesEnCours: data.length }));
      }

      // 4. Actes générés à envoyer (statut = 'genere')
      console.log('🔍 Chargement actes générés...');
      const actesRes = await fetch(`http://localhost:8000/api/rh/actes-a-envoyer/${matriculeRH}/`);
      if (actesRes.ok) {
        const data = await actesRes.json();
        console.log('📄 Actes à envoyer:', data.length);
        setActesGeneres(data);
        setStats(prev => ({ ...prev, actesAEnvoyer: data.length }));
      }

      // 5. Demandes terminées
      const termineesRes = await fetch(`http://localhost:8000/api/rh/demandes-terminees/${matriculeRH}/`);
      if (termineesRes.ok) {
        const data = await termineesRes.json();
        console.log('✅ Demandes terminées:', data.length);
        setDemandesTerminees(data);
      }

      // 6. Compter tous les documents expirés de tous les agents
      const expiredRes = await fetch('http://localhost:8000/api/documents/expired-count/');
      if (expiredRes.ok) {
        const data = await expiredRes.json();
        setStats(prev => ({ ...prev, documentsExpires: data.total_expired || 0 }));
      }

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTraiterDemande = async (demandeId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/rh/commencer-traitement/${demandeId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rh_matricule: matricule })
      });
      
      if (response.ok) {
        alert('✅ Traitement commencé, la demande passe en "En cours"');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors du début du traitement');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleGenererActe = async (demande) => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    try {
      const annee = new Date().getFullYear();
      const refNumber = `${annee}${Date.now()}`;
      const reference = `${refNumber}/MND/RH`;
      
      const response = await fetch(`http://localhost:8000/api/rh/generer-acte/${demande.id}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rh_matricule: matricule,
          reference: reference,
          contenu: '',
          observations: ''
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Autorisation_Conge_${demande.agent_nom}_${demande.agent_prenom}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert('✅ Acte généré avec succès !');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleEnvoyerSecretaire = async (reference) => {
    try {
      const response = await fetch(`http://localhost:8000/api/rh/envoyer-acte-secretaire/${reference}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rh_matricule: matricule })
      });
      
      if (response.ok) {
        alert('✅ Acte envoyé à la secrétaire !');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de l\'envoi');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleVoirActe = (reference) => {
     window.open(`http://localhost:8000/api/actes/${reference}/download/`, '_blank');
  };

  const getStatutBadge = (statut) => {
    const statusMap = {
      'assignee_rh': { class: 'status-pending', text: '📋 À traiter' },
      'en_cours_traitement': { class: 'status-progress', text: '⚙️ En cours' },
      'acte_genere': { class: 'status-approved', text: '📄 Acte généré' },
      'envoye_secretaire': { class: 'status-sent', text: '📤 Envoyé secrétaire' },
      'termine': { class: 'status-approved', text: '✅ Terminé' },
      'valide': { class: 'status-approved', text: 'Validé' },
      'refuse': { class: 'status-rejected', text: 'Rejeté' },
      'actif': { class: 'status-active', text: 'Actif' },
      'inactif': { class: 'status-inactive', text: 'Inactif' }
    };
    const status = statusMap[statut] || { class: 'status-pending', text: statut };
    return <span className={`status-badge ${status.class}`}>{status.text}</span>;
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const handleAddAgent = () => {
    setShowAddAgentModal(true);
    document.body.style.overflow = 'hidden';
  };

  const closeAddAgentModal = () => {
    setShowAddAgentModal(false);
    document.body.style.overflow = '';
    setNewAgent({
      matricule: '', nom: '', prenom: '', email: '', telephone: '',
      poste: 'Agent', direction: '', typecontrat: 'APE',
      date_prise_service: new Date().toISOString().split('T')[0]
    });
  };

  const handleSubmitNewAgent = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch('http://localhost:8000/api/register/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAgent)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ Agent ${data.matricule} créé avec succès !`);
        closeAddAgentModal();
        fetchData();
      } else {
        alert(`❌ Erreur: ${data.error || 'Erreur lors de la création'}`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleImportAgents = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json,.xlsx,.xls';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        let agents = [];
        
        if (file.name.endsWith('.json')) {
          const text = await file.text();
          agents = JSON.parse(text);
        } else if (file.name.endsWith('.csv')) {
          const text = await file.text();
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) {
            alert('Fichier CSV vide ou invalide');
            return;
          }
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          agents = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const agent = {};
            headers.forEach((h, i) => agent[h] = values[i] || '');
            return agent;
          });
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const data = await file.arrayBuffer();
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawAgents = XLSX.utils.sheet_to_json(firstSheet);
          
          agents = rawAgents.map(agent => ({
            matricule: agent.Matricule || agent.matricule || '',
            nom: agent.Nom || agent.nom || '',
            prenom: agent['Prénom'] || agent.Prénom || agent.prenom || '',
            email: agent.Email || agent.email || '',
            telephone: agent.Téléphone || agent.telephone || '',
            poste: agent.Poste || agent.poste || '',
            direction: agent.Direction || agent.direction || '',
            typecontrat: agent['Type de contrat'] || agent.typecontrat || 'APE',
            date_prise_service: agent['Date de prise de service'] || agent.date_prise_service || '2024-01-01'
          }));
        } else {
          alert('Format non supporté. Utilisez CSV, JSON ou Excel.');
          return;
        }
        
        if (!agents || agents.length === 0) {
          alert('Aucun agent trouvé dans le fichier');
          return;
        }
        
        const response = await fetch('http://localhost:8000/api/import-agents/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agents })
        });
        
        const result = await response.json();
        if (response.ok) {
          alert(`✅ ${result.success_count} agents importés avec succès !`);
          fetchData();
        } else {
          alert(`❌ Erreur: ${result.error}`);
        }
      } catch (error) {
        console.error('Erreur import:', error);
        alert('Erreur lors de l\'import.');
      }
    };
    
    input.click();
  };

  // ✅ Export des données
  const handleExportExcel = async (type) => {
    try {
      let data = [];
      let filename = '';
      
      if (type === 'agents') {
        const res = await fetch('http://localhost:8000/api/agents/');
        if (res.ok) {
          const agents = await res.json();
          // ✅ Formater les agents avec les rôles et Oui/Non
          data = agents.map(agent => formatAgentForExport(agent));
          filename = 'Liste_Agents.xlsx';
        }
      } else if (type === 'stats') {
        const res = await fetch('http://localhost:8000/api/stats/');
        if (res.ok) {
          const statsData = await res.json();
          data = [statsData];
          filename = 'Statistiques_RH.xlsx';
        }
      } else if (type === 'dossiers') {
        // Récupérer tous les agents avec leur taux de complétude
        const res = await fetch('http://localhost:8000/api/agents/');
        if (res.ok) {
          const agents = await res.json();
          for (let agent of agents) {
            try {
              const docRes = await fetch(`/api/rh/documents/${agent.matricule}/`, {
                headers: { 'X-User-Matricule': matricule }
              });
              if (docRes.ok) {
                const docData = await docRes.json();
                data.push({
                  matricule: agent.matricule,
                  nom: agent.nom,
                  prenom: agent.prenom,
                  direction: agent.direction,
                  taux_completude: docData.dossier?.taux_completude || 0,
                  documents_importes: docData.documents?.length || 0,
                  documents_manquants: docData.missing_documents?.length || 0
                });
              }
            } catch (e) {}
          }
          filename = 'Etat_Dossiers.xlsx';
        }
      }
      
      if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Données');
        XLSX.writeFile(wb, filename);
      } else {
        alert('Aucune donnée à exporter');
      }
    } catch (error) {
      console.error('Erreur export:', error);
      alert('Erreur lors de l\'export');
    }
  };

  const handleExportPDF = async (type) => {
    try {
      const doc = new jsPDF();
      
      // ✅ Gros logo en haut à gauche
      const logoUrl = '/logo_MND.png';
      doc.addImage(logoUrl, 'PNG', 10, 1, 60, 60);  // y=5 pour le remonter
      
      // Texte aligné au milieu du logo (y=25 environ)
      doc.setFontSize(16);
      doc.setTextColor(0, 51, 102);
      doc.text('Ministère du Numérique et de la Digitalisation', 75, 30);
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text('République du Bénin', 75, 38);

      // ✅ Type de document AVANT la ligne
      doc.setFontSize(13);
      doc.setTextColor(100, 100, 100);
      doc.text(type === 'agents' ? 'Liste des agents' : type === 'stats' ? 'Statistiques RH' : 'État des dossiers agents', 14, 65);
      
      // Ligne de séparation sous le logo
      doc.setDrawColor(0, 123, 255);
      doc.setLineWidth(0.5);
      doc.line(14, 70, 196, 70);  // Sous le logo de 60px
      
      if (type === 'agents') {
        const res = await fetch('http://localhost:8000/api/agents/');
        if (res.ok) {
          const agents = await res.json();
          const formatted = agents.map(agent => formatAgentForExport(agent));
          
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 0);
          
          autoTable(doc, {
            startY: 85,
            head: [['Matricule', 'Nom', 'Prénom', 'Email', 'Poste', 'Direction', 'Rôle(s)', 'Actif']],
            body: formatted.map(a => [a.Matricule, a.Nom, a['Prénom'], a.Email, a.Poste, a.Direction, a['Rôle(s)'], a.Actif]),
            theme: 'grid',
            headStyles: { fillColor: [0, 123, 255] },
            styles: { fontSize: 7 }
          });
          
          const pageCount = doc.internal.getNumberOfPages();
          for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(`Page ${i} / ${pageCount} - Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 290);
          }
          
          doc.save('Liste_Agents.pdf');
        }
      } else if (type === 'stats') {
        const res = await fetch('http://localhost:8000/api/stats/');
        if (res.ok) {
          const stats = await res.json();
          
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 0);
          
          autoTable(doc, {
            startY: 85,
            head: [['Indicateur', 'Valeur']],
            body: [
              ['Total agents', stats.total_agents],
              ['Agents actifs', stats.agents_actifs],
              ['Total rôles', stats.total_roles],
              ['Types de demande', stats.total_types_demande],
              ['Types de pièces', stats.total_types_piece],
              ['Total demandes', stats.total_demandes]
            ],
            theme: 'grid',
            headStyles: { fillColor: [0, 123, 255] }
          });
          
          doc.save('Statistiques_RH.pdf');
        }
      } else if (type === 'dossiers') {
        const res = await fetch('http://localhost:8000/api/agents/');
        if (res.ok) {
          const agents = await res.json();
          const dossiers = [];
          
          for (let agent of agents.slice(0, 20)) {
            try {
              const docRes = await fetch(`/api/rh/documents/${agent.matricule}/`, {
                headers: { 'X-User-Matricule': matricule }
              });
              if (docRes.ok) {
                const docData = await docRes.json();
                dossiers.push([
                  agent.matricule,
                  `${agent.nom} ${agent.prenom}`,
                  agent.direction || '-',
                  `${docData.dossier?.taux_completude || 0}%`,
                  docData.documents?.length || 0,
                  docData.missing_documents?.length || 0
                ]);
              }
            } catch (e) {}
          }
          
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 0);
          
          autoTable(doc, {
            startY: 85,
            head: [['Matricule', 'Agent', 'Direction', 'Complétude', 'Docs', 'Manquants']],
            body: dossiers,
            theme: 'grid',
            headStyles: { fillColor: [0, 123, 255] },
            styles: { fontSize: 8 }
          });
          
          doc.save('Etat_Dossiers.pdf');
        }
      }
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert('Erreur lors de l\'export PDF');
    }
  };

  const handleExportCSV = async (type) => {
    try {
      let data = [];
      let filename = '';
      
      if (type === 'agents') {
        const res = await fetch('http://localhost:8000/api/agents/');
        if (res.ok) {
          const agents = await res.json();
          // ✅ Formater les agents
          data = agents.map(agent => formatAgentForExport(agent));
          filename = 'Liste_Agents.csv';
        }
      }
      
      if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        const csv = XLSX.utils.sheet_to_csv(ws);
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
      }
    } catch (error) {
      console.error('Erreur export:', error);
      alert('Erreur lors de l\'export');
    }
  };

  const formatAgentForExport = (agent) => {
    // Convertir les rôles en chaîne lisible
    const roles = agent.roles?.map(r => r.libelle).join(', ') || 'agent';
    
    return {
      'Matricule': agent.matricule,
      'Nom': agent.nom,
      'Prénom': agent.prenom,
      'Email': agent.email,
      'Téléphone': agent.telephone,
      'Poste': agent.poste || 'Agent',
      'Direction': agent.direction || 'À renseigner',
      'Rôle(s)': roles,
      'Actif': agent.actif === 1 ? 'Oui' : 'Non'
    };
  };

  const handleViewDocuments = (agentMatricule) => {
    navigate(`/rh/documents/${agentMatricule}`);
  };

  if (permissionsLoading || loading) {
    return <div className="loading-screen">Chargement...</div>;
  }

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
        </div>
        <nav className="nav-central-links">
          <a href="#" className={`nav-tab-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            📊 Tableau de bord
          </a>
          <a href="#" className={`nav-tab-item ${activeTab === 'dossiers' ? 'active' : ''}`} onClick={() => setActiveTab('dossiers')}>
            📁 Gestion des dossiers
          </a>
          <a href="#" className={`nav-tab-item ${activeTab === 'annonces' ? 'active' : ''}`} onClick={() => setActiveTab('annonces')}>
            📢 Annonces & candidatures
          </a>
          <a href="#" className={`nav-tab-item ${activeTab === 'rapports' ? 'active' : ''}`} onClick={() => setActiveTab('rapports')}>
            📊 Rapports & export
          </a>
        </nav>
        <div className="nav-right">
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>📋 Gestion des Ressources Humaines</h2>
            <p>Bienvenue {userInfo.prenom} ! Gérez les dossiers, traitez les demandes et pilotez les ressources humaines.</p>
          </div>
        </section>

        {/* ==================== ONGLET DASHBOARD ==================== */}
        {activeTab === 'dashboard' && (
          <>
            {/* Statistiques */}
            <div className="rh-stats-grid">
              <div className="rh-stat-card">
                <div className="rh-stat-icon">👥</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.totalAgents}</span>
                  <span className="rh-stat-label">Agents actifs</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📋</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.demandesEnAttente}</span>
                  <span className="rh-stat-label">Demandes à traiter</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">⚙️</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.demandesEnCours}</span>
                  <span className="rh-stat-label">Demandes en cours</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📄</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.actesAEnvoyer}</span>
                  <span className="rh-stat-label">Actes à envoyer</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">⚠️</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.documentsExpires}</span>
                  <span className="rh-stat-label">Documents expirés</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📢</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.annoncesActives}</span>
                  <span className="rh-stat-label">Annonces actives</span>
                </div>
              </div>
            </div>

            {/* SECTION 1: Demandes assignées à traiter */}
            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📋 Demandes assignées à traiter</h3>
                <button className="rh-card-btn" onClick={() => setActiveTab('dossiers')}>Voir tout →</button>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Type</th>
                      <th>Date assignation</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demandesAssignees.length === 0 ? (
                      <tr><td colSpan="5" className="text-center">📭 Aucune demande à traiter</td></tr>
                    ) : (
                      demandesAssignees.map((demande) => (
                        <tr key={demande.id}>
                          <td>{demande.agent_nom} {demande.agent_prenom}</td>
                          <td>{demande.type_demande}</td>
                          <td>{demande.date_assignation ? new Date(demande.date_assignation).toLocaleDateString('fr-FR') : '-'}</td>
                          <td>{getStatutBadge(demande.statut)}</td>
                          <td>
                            <button className="btn-traiter" onClick={() => handleTraiterDemande(demande.id)}>
                              ▶️ Traiter
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECTION 2: Demandes en cours de traitement */}
            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>⚙️ Demandes en cours de traitement</h3>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Type</th>
                      <th>Date début traitement</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demandesEnCours.length === 0 ? (
                      <tr><td colSpan="5" className="text-center">📭 Aucune demande en cours</td></tr>
                    ) : (
                      demandesEnCours.map((demande) => (
                        <tr key={demande.id}>
                          <td>{demande.agent_nom} {demande.agent_prenom}</td>
                          <td>{demande.type_demande}</td>
                          <td>{demande.date_debut_traitement ? new Date(demande.date_debut_traitement).toLocaleDateString('fr-FR') : '-'}</td>
                          <td>{getStatutBadge(demande.statut)}</td>
                          <td>
                            <button className="btn-generer" onClick={() => handleGenererActe(demande)}>
                              📄 Générer l'acte
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECTION 3: Actes générés à envoyer */}
            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📄 Actes générés - En attente d'envoi</h3>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Type d'acte</th>
                      <th>Référence</th>
                      <th>Date génération</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actesGeneres.length === 0 ? (
                      <tr><td colSpan="5" className="text-center">📭 Aucun acte en attente</td></tr>
                    ) : (
                      actesGeneres.map((acte) => (
                        <tr key={acte.id}>
                          <td>{acte.agent_nom} {acte.agent_prenom}</td>
                          <td>{acte.type_acte}</td>
                          <td><code>{acte.reference}</code></td>
                          <td>{acte.date_generation ? new Date(acte.date_generation).toLocaleDateString('fr-FR') : '-'}</td>
                          <td>
                            <div className="action-buttons-cell">
                              <button className="btn-view" onClick={() => handleVoirActe(acte.reference)}>
                                👁️ Voir l'acte
                              </button>
                              <button className="btn-envoyer" onClick={() => handleEnvoyerSecretaire(acte.reference)}>
                                📤 Envoyer à la secrétaire
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECTION 4: Derniers agents inscrits */}
            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>👥 Derniers agents inscrits</h3>
                <button className="rh-card-btn" onClick={() => setActiveTab('dossiers')}>Voir tous les agents →</button>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom complet</th>
                      <th>Poste</th>
                      <th>Direction</th>
                      <th>Statut</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentsRecents.length === 0 ? (
                      <tr><td colSpan="6" className="text-center">📭 Aucun agent trouvé</td></tr>
                    ) : (
                      agentsRecents.map((agent) => (
                        <tr key={agent.matricule}>
                          <td>{agent.matricule}</td>
                          <td>{agent.nom} {agent.prenom}</td>
                          <td>{agent.poste || 'Agent'}</td>
                          <td>{agent.direction || 'À renseigner'}</td>
                          <td>{getStatutBadge(agent.actif ? 'actif' : 'inactif')}</td>
                          <td className="rh-actions-cell">
                            <button className="btn-icon" title="Voir dossier" onClick={() => handleViewDocuments(agent.matricule)}>📁</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ==================== ONGLET GESTION DES DOSSIERS ==================== */}
        {activeTab === 'dossiers' && (
          <div className="rh-section">
            <div className="rh-actions-bar">
              <div className="rh-search-box">
                <input 
                  type="text" 
                  placeholder="Rechercher un agent (matricule, nom, prénom)..." 
                  className="rh-search-input"
                  onChange={(e) => {
                    const search = e.target.value.toLowerCase();
                    if (search.length > 0) {
                      const filtered = vraisAgents.filter(a => 
                        a.matricule.toLowerCase().includes(search) ||
                        a.nom.toLowerCase().includes(search) ||
                        a.prenom.toLowerCase().includes(search)
                      );
                      setAgentsRecents(filtered);
                    } else {
                      setAgentsRecents(vraisAgents.slice(0, 10));
                    }
                  }}
                />
              </div>
              <div className="rh-actions-buttons">
                <button className="btn-rh-primary" onClick={handleAddAgent}>➕ Nouvel agent</button>
                <button className="btn-rh-secondary" onClick={handleImportAgents}>📤 Importer liste</button>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📋 Gestion des dossiers agents ({vraisAgents.length} agents)</h3>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom & Prénom</th>
                      <th>Email</th>
                      <th>Poste</th>
                      <th>Direction</th>
                      <th>Statut</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vraisAgents.length === 0 ? (
                      <tr><td colSpan="7" className="text-center">📭 Aucun agent trouvé</td></tr>
                    ) : (
                      agentsRecents.map((agent) => (
                        <tr key={agent.matricule}>
                          <td><strong>{agent.matricule}</strong></td>
                          <td>{agent.nom} {agent.prenom}</td>
                          <td>{agent.email}</td>
                          <td>{agent.poste || 'Agent'}</td>
                          <td>{agent.direction || 'À renseigner'}</td>
                          <td>{getStatutBadge(agent.actif ? 'actif' : 'inactif')}</td>
                          <td className="rh-actions-cell">
                            <button className="btn-icon" title="Voir dossier" onClick={() => handleViewDocuments(agent.matricule)}>📁</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* ✅ PAGINATION */}
                {vraisAgents.length > 10 && (
                  <div className="rh-pagination" style={{ padding: '15px', textAlign: 'center', borderTop: '1px solid #eee' }}>
                    {agentsRecents.length < vraisAgents.length ? (
                      <button className="btn-rh-secondary" onClick={() => setAgentsRecents(vraisAgents)}>
                        Voir tous les {vraisAgents.length} agents
                      </button>
                    ) : (
                      <button className="btn-rh-secondary" onClick={() => setAgentsRecents(vraisAgents.slice(0, 10))}>
                        Afficher moins (10 premiers)
                      </button>
                    )}
                    <span style={{ marginLeft: '15px', color: '#666', fontSize: '13px' }}>
                      Affichage : {agentsRecents.length} / {vraisAgents.length} agents
                    </span>
                  </div>
                )}
              </div>
            </div>
        )}

        {/* ==================== ONGLET ANNONCES & CANDIDATURES ==================== */}
        {activeTab === 'annonces' && (
          <div className="rh-section">
            <div className="rh-actions-bar">
              <div className="rh-actions-buttons">
                <button className="btn-rh-primary">➕ Nouvelle annonce</button>
                <button className="btn-rh-primary">📢 Appel à candidature</button>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📢 Annonces et appels à candidature</h3>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th>Date publication</th>
                      <th>Date clôture</th>
                      <th>Statut</th>
                      <th>Candidatures</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Recrutement Assistant RH</td>
                      <td>2026-05-15</td>
                      <td>2026-06-15</td>
                      <td>{getStatutBadge('Active')}</td>
                      <td>12</td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Voir candidatures">👥</button>
                        <button className="btn-icon" title="Modifier">✏️</button>
                      </td>
                    </tr>
                    <tr>
                      <td>Appel à candidature - Chef projet</td>
                      <td>2026-05-10</td>
                      <td>2026-05-30</td>
                      <td>{getStatutBadge('Active')}</td>
                      <td>8</td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Voir candidatures">👥</button>
                        <button className="btn-icon" title="Modifier">✏️</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ONGLET RAPPORTS & EXPORT ==================== */}
        {activeTab === 'rapports' && (
          <div className="rh-section">
            <div className="rh-stats-grid">
              <div className="rh-stat-card clickable" onClick={() => handleExportExcel('stats')}>
                <div className="rh-stat-icon">📊</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Rapport mensuel</span>
                  <span className="rh-stat-label">Mai 2026</span>
                </div>
              </div>
              <div className="rh-stat-card clickable" onClick={() => handleExportExcel('agents')}>
                <div className="rh-stat-icon">👥</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Effectifs par direction</span>
                  <span className="rh-stat-label">Analyse</span>
                </div>
              </div>
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">🌴</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Congés pris</span>
                  <span className="rh-stat-label">Statistiques</span>
                </div>
              </div>
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">📈</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Turnover</span>
                  <span className="rh-stat-label">Taux de rotation</span>
                </div>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📑 Exporter des rapports</h3>
              </div>
              <div className="rh-export-options">
                <div className="export-option">
                  <h4>📋 Liste des agents</h4>
                  <p>Export complet des agents avec leurs informations</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel" onClick={() => handleExportExcel('agents')}>📊 Excel</button>
                    <button className="btn-export-pdf" onClick={() => handleExportPDF('agents')}>📄 PDF</button>
                    <button className="btn-export-csv" onClick={() => handleExportCSV('agents')}>📝 CSV</button>
                  </div>
                </div>
                <div className="export-option">
                  <h4>📊 Statistiques RH</h4>
                  <p>Effectifs, recrutements, départs, congés</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel" onClick={() => handleExportExcel('stats')}>📊 Excel</button>
                    <button className="btn-export-pdf" onClick={() => handleExportPDF('stats')}>📄 PDF</button>
                  </div>
                </div>
                <div className="export-option">
                  <h4>📁 État des dossiers</h4>
                  <p>Complétude et documents manquants par agent</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel" onClick={() => handleExportExcel('dossiers')}>📊 Excel</button>
                    <button className="btn-export-pdf" onClick={() => handleExportPDF('dossiers')}>📄 PDF</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL AJOUT AGENT */}
        {showAddAgentModal && (
          <div className="modal-overlay" onClick={closeAddAgentModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>➕ Ajouter un nouvel agent</h3>
                <button className="modal-close" onClick={closeAddAgentModal}>✕</button>
              </div>
              
              <form onSubmit={handleSubmitNewAgent}>
                <div className="modal-body">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Matricule *</label>
                      <input
                        type="text"
                        value={newAgent.matricule}
                        onChange={(e) => setNewAgent({...newAgent, matricule: e.target.value.toUpperCase()})}
                        placeholder="Ex: MND-2026-001"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Nom *</label>
                      <input
                        type="text"
                        value={newAgent.nom}
                        onChange={(e) => setNewAgent({...newAgent, nom: e.target.value})}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Prénom *</label>
                      <input
                        type="text"
                        value={newAgent.prenom}
                        onChange={(e) => setNewAgent({...newAgent, prenom: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Email *</label>
                      <input
                        type="email"
                        value={newAgent.email}
                        onChange={(e) => setNewAgent({...newAgent, email: e.target.value})}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Téléphone *</label>
                      <input
                        type="text"
                        value={newAgent.telephone}
                        onChange={(e) => setNewAgent({...newAgent, telephone: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Poste</label>
                      <input
                        type="text"
                        value={newAgent.poste}
                        onChange={(e) => setNewAgent({...newAgent, poste: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Direction</label>
                      <select
                        value={newAgent.direction}
                        onChange={(e) => setNewAgent({...newAgent, direction: e.target.value})}
                      >
                        <option value="">Sélectionner une direction</option>
                        <option value="DDIGIT">DDIGIT (Direction de la Digitalisation)</option>
                        <option value="DSI">DSI (Direction des Systèmes d'Information)</option>
                        <option value="DNUM">DNUM (Direction du Numérique)</option>
                        <option value="DPAF">DPAF (Direction de la Planification, de l'Administration et des Finances)</option>
                        <option value="SGM">SGM (Secrétariat Général du Ministère)</option>
                        <option value="SG">SG (Secrétariat Général)</option>
                        <option value="DGM">DGM (Direction Rattachée)</option>
                        <option value="DCP">DCP (Direction Rattachée)</option>
                        <option value="DM">DM (Direction des Médias)</option>
                        <option value="Cabinet du Ministère">Cabinet du Ministère</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Type de contrat</label>
                      <select
                        value={newAgent.typecontrat}
                        onChange={(e) => setNewAgent({...newAgent, typecontrat: e.target.value})}
                      >
                        <option value="APE">APE</option>
                        <option value="ACDPE">ACDPE</option>
                        <option value="AAE">AAE</option>
                        <option value="ACE">ACE</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Date de prise de service *</label>
                      <input
                        type="date"
                        value={newAgent.date_prise_service}
                        onChange={(e) => setNewAgent({...newAgent, date_prise_service: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                </div>
                
                <div className="modal-footer">
                  <button type="button" className="btn-rh-secondary" onClick={closeAddAgentModal}>Annuler</button>
                  <button type="submit" className="btn-rh-primary">✅ Créer l'agent</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

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