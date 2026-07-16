// DashboardDPAF.jsx - Version complète avec attestations intégrées

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import usePermissions from './hooks/usePermissions';
import './App.css';

// Fonction pour normaliser le rôle
function normalizeRole(role) {
  if (!role || typeof role !== 'string') return '';
  let r = role.trim().toLowerCase();
  try {
    r = r.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  } catch (e) {}
  r = r.replace(/[\s_\\]+/g, '/');
  r = r.replace(/[^a-z0-9\/-]/g, '');
  r = r.replace(/\/+/, '/');
  return r;
}

export default function DashboardDPAF() {
  const navigate = useNavigate();
  const { loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  
  // États
  const [demandesTransmises, setDemandesTransmises] = useState([]);
  const [demandesAssignees, setDemandesAssignees] = useState([]);
  const [demandesHistorique, setDemandesHistorique] = useState([]);
  const [actesASigner, setActesASigner] = useState([]);
  const [agentsRH, setAgentsRH] = useState([]);
  const [activeTab, setActiveTab] = useState('encours');
  const [hasSignature, setHasSignature] = useState(false);
  const [hasCachet, setHasCachet] = useState(false);
  
  // États pour les attestations
  const [attestationsSoumises, setAttestationsSoumises] = useState([]);
  const [attestationsAssignees, setAttestationsAssignees] = useState([]);
  const [attestationsHistorique, setAttestationsHistorique] = useState([]);
  
  // Modals
  const [showAssignerModal, setShowAssignerModal] = useState(false);
  const [showSuiviModal, setShowSuiviModal] = useState(false);
  const [showSignerModal, setShowSignerModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [selectedActe, setSelectedActe] = useState(null);
  const [selectedAgentRH, setSelectedAgentRH] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [signatureCommentaire, setSignatureCommentaire] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isAttestation, setIsAttestation] = useState(false);
  
  // Stats
  const [stats, setStats] = useState({
    a_assigner: 0,
    assignees: 0,
    en_cours: 0,
    terminees: 0,
    actes_a_signer: 0,
    historique_count: 0,
    attestations_a_assigner: 0
  });

  const matricule = localStorage.getItem('userMatricule');
  const rawRole = localStorage.getItem('userRole');
  const userRole = normalizeRole(rawRole);
  
  const userName = `${localStorage.getItem('userPrenom') || ''} ${localStorage.getItem('userNom') || ''}`.trim();

  const getTypesASigner = () => {
    if (userRole === 'dpaf') {
      return [
        'Attestation de travail',
        'Absence',
        'Reprise de service',
        "Autorisation d'absence exceptionnelle"
      ];
    } else if (userRole === 'dapaf') {
      return [
        'Autorisation de jouissance de congé administratif',
        'Attestation de présence au poste', 
        'Attestation de validité de services', 
        'Certificat de non-jouissance de congé'
      ];
    }
    return [];
  };

  const typesDPAF = ['Absence', 'Reprise de service', 'Attestation de travail'];
  const typesDAPAF = ['Congé', 'Autorisation de jouissance de congé administratif', 'Attestation de présence au poste', 'Attestation de validité de services', 'Certificat de non-jouissance de congé'];

  const getRoleLabel = () => {
    if (userRole === 'dpaf') return 'DPAF - Direction Planification';
    if (userRole === 'dapaf') return 'DAPAF - Direction Affaires Politiques';
    return 'Direction';
  };

  const getInfoMessage = () => {
    if (userRole === 'dpaf') {
      return "ℹ️ Types d'actes signés par le DPAF : Attestation de travail, Absence, Reprise de service";
    } else if (userRole === 'dapaf') {
      return "ℹ️ Types d'actes signés par le DAPAF : Attestation de présence, Attestation de validité de services, Certificat de non-jouissance de congé";
    }
    return "";
  };

  const getDestinataire = (type) => {
    if (typesDPAF.includes(type)) return 'DPAF';
    if (typesDAPAF.includes(type)) return 'DAPAF';
    return 'DPAF';
  };

  const getStatutTransmis = (type) => {
    if (typesDPAF.includes(type)) return 'transmise_dpaf';
    if (typesDAPAF.includes(type)) return 'transmise_dapaf';
    return 'transmise_dpaf';
  };

  const isAttestationType = (type) => {
    const attestationTypes = ['Attestation de travail', 'Attestation de présence au poste', 'Attestation de validité de services', 'Certificat de non-jouissance de congé'];
    return attestationTypes.includes(type);
  };

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchAllData();
    fetchAgentsRH();
    fetchHistorique();
    checkSignatureCachet();
  }, [userRole]);

  const fetchAgentsRH = async () => {
    try {
      let response = await fetch('/api/agents/rh/');
      
      if (!response.ok) {
        response = await fetch('/api/agents/');
        if (response.ok) {
          const allAgents = await response.json();
          const agentsRHFiltered = allAgents.filter(agent => {
            if (agent.role !== 'rh') return false;
            if (agent.matricule === matricule) return false;
            return true;
          });
          setAgentsRH(agentsRHFiltered);
          return;
        }
      } else {
        const agentsRHData = await response.json();
        const agentsRHFiltered = agentsRHData.filter(agent => {
          if (agent.matricule === matricule) return false;
          return true;
        });
        setAgentsRH(agentsRHFiltered);
      }
    } catch (error) {
      console.error('Erreur chargement agents RH:', error);
      setAgentsRH([]);
    }
  };

  const fetchHistorique = async () => {
    try {
      const [demandesRes, attestationsRes] = await Promise.all([
        fetch(`/api/dashboard/demandes-historique/${matricule}/`),
        fetch(`/api/dashboard/attestations-historique/${matricule}/`)
      ]);
      
      let demandesData = [];
      if (demandesRes.ok) {
        demandesData = await demandesRes.json();
        setDemandesHistorique(demandesData);
      }

      let attestationsData = [];
      if (attestationsRes.ok) {
        attestationsData = await attestationsRes.json();
        setAttestationsHistorique(attestationsData);
      }

      const totalHistorique = demandesData.length + attestationsData.length;
      setStats(prev => ({ ...prev, historique_count: totalHistorique }));
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [transmisesRes, attestationsRes, assigneesRes, attestationsAssigneesRes, actesRes] = await Promise.all([
        fetch(`/api/dashboard/demandes-a-assigner/${matricule}/`),
        fetch(`/api/dashboard/attestations-recues/${matricule}/`),
        fetch(`/api/dashboard/demandes-assignees/${matricule}/`),
        fetch(`/api/dashboard/attestations-assignees/${matricule}/`),
        fetch(`/api/dashboard/actes-a-signer/${matricule}/`)
      ]);
      
      // ✅ Demandes à assigner
      let transmisesData = [];
      if (transmisesRes.ok) {
        transmisesData = await transmisesRes.json();
        // Filtrer les attestations (elles sont déjà dans attestationsSoumises)
        const typesAttestation = [
          'Attestation de travail',
          'Attestation de présence au poste',
          'Attestation de validité de services',
          'Certificat de non-jouissance de congé'
        ];
        transmisesData = transmisesData.filter(d => !typesAttestation.includes(d.type_demande));
        setDemandesTransmises(transmisesData);
      }

      // ✅ Attestations à assigner
      let attestationsData = [];
      if (attestationsRes.ok) {
        attestationsData = await attestationsRes.json();
        setAttestationsSoumises(attestationsData);
      }

      // ✅ Demandes assignées
      let assigneesData = [];
      if (assigneesRes.ok) {
        assigneesData = await assigneesRes.json();
        setDemandesAssignees(assigneesData);
      }

      // ✅ Attestations assignées
      let attestationsAssigneesData = [];
      if (attestationsAssigneesRes.ok) {
        attestationsAssigneesData = await attestationsAssigneesRes.json();
        setAttestationsAssignees(attestationsAssigneesData);
      }

      // ✅ Actes à signer
      let actesData = [];
      if (actesRes.ok) {
        actesData = await actesRes.json();
        const typesASigner = getTypesASigner();
        const actesFiltres = actesData.filter(acte => {
          return typesASigner.includes(acte.type_acte);
        });
        setActesASigner(actesFiltres);
      }

      // ✅ Stats - CORRECTION
      const totalAAssigner = transmisesData.length + attestationsData.length;
      const totalAssignees = assigneesData.length + attestationsAssigneesData.length;

      setStats({
        a_assigner: totalAAssigner,
        assignees: totalAssignees,
        en_cours: assigneesData.filter(d => d.statut === 'en_cours_traitement').length + 
                  attestationsAssigneesData.filter(a => a.statut === 'assignee_rh' || a.statut === 'en_cours_traitement').length,
        terminees: assigneesData.filter(d => d.statut === 'termine' || d.statut === 'acte_genere').length +
                  attestationsAssigneesData.filter(a => a.statut === 'termine' || a.statut === 'acte_genere').length,
        actes_a_signer: actesData.filter(a => getTypesASigner().includes(a.type_acte)).length,
        attestations_a_assigner: attestationsData.length  // ← Utilise attestationsData
      });

    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignerItem = async (item, isAttestationItem) => {
    if (!selectedAgentRH) {
      alert('Veuillez sélectionner un agent RH');
      return;
    }
    
    const itemId = item.id;
    const url = isAttestationItem 
      ? `/api/dpaf/assigner-attestation/${itemId}/`
      : `/api/dpaf/assigner-rh/${itemId}/`;
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_rh_matricule: selectedAgentRH,
          commentaire: commentaire,
          dpaf_matricule: matricule
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ ${isAttestationItem ? 'Attestation' : 'Demande'} assignée avec succès`);
        setShowAssignerModal(false);
        setSelectedItem(null);
        setIsAttestation(false);
        setSelectedAgentRH('');
        setCommentaire('');
        fetchAllData();
        fetchHistorique();
      } else {
        alert(data.error || 'Erreur lors de l\'assignation');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleSignerActe = async (reference) => {
    try {
      const url = userRole === 'dpaf' 
        ? `/api/dpaf/signer-acte/${reference}/`
        : `/api/dapaf/signer-acte/${reference}/`;
      
      const body = userRole === 'dpaf'
        ? { dpaf_matricule: matricule, commentaire: signatureCommentaire }
        : { dapaf_matricule: matricule, commentaire: signatureCommentaire };
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const urlBlob = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlBlob;
        // Nom de fichier depuis headers si disponible
        const disposition = response.headers.get('content-disposition');
        const contentType = response.headers.get('content-type') || '';
        let filename = `Acte_Signe_${reference}.pdf`;
        if (disposition && disposition.includes('filename=')) {
          const match = disposition.match(/filename\*=UTF-8''([^\n;]+)|filename=\"?([^\"]+)\"?/);
          if (match) filename = decodeURIComponent(match[1] || match[2]);
        } else if (contentType.includes('wordprocessingml')) {
          filename = `Acte_Signe_${reference}.docx`;
        } else if (contentType.includes('pdf')) {
          filename = `Acte_Signe_${reference}.pdf`;
        }
        document.body.appendChild(a);
        a.download = filename;
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(urlBlob);

        alert('✅ Acte signé avec succès !');
        setShowSignerModal(false);
        setSelectedActe(null);
        setSignatureCommentaire('');
        fetchAllData();
        fetchHistorique();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la signature');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleVoirDetails = (item, isAttestationItem) => {
    setSelectedItem(item);
    setIsAttestation(isAttestationItem);
    setShowAssignerModal(true);
  };

  const handleVoirSuivi = (item) => {
    setSelectedDemande(item);
    setShowSuiviModal(true);
  };

  const handleVoirActe = async (reference, acte) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/actes/${encodeURIComponent(reference)}/download/`);

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'application/pdf';
        const blob = new Blob([arrayBuffer], { type: contentType });
        const url = URL.createObjectURL(blob);

        // Essayer d'ouvrir dans un nouvel onglet (évite les problèmes d'iframe bloqué)
        const opened = window.open(url);
        if (opened) {
          opened.focus();
        } else {
          setPreviewUrl(url);
          setPreviewTitle(`${acte.type_acte} - ${reference}`);
          setShowPreviewModal(true);
        }
      } else {
        alert('Erreur lors du chargement de l\'acte');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleSigner = (acte) => {
    setSelectedActe(acte);
    setShowSignerModal(true);
  };

  const checkSignatureCachet = async () => {
    try {
      const response = await fetch(`/api/agent/signature-cachet/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setHasSignature(!!data.signature);
        setHasCachet(!!data.cachet);
      }
    } catch (error) {
      console.error('Erreur vérification signature:', error);
    }
  };

  const getStatusBadge = (statut) => {
    const badges = {
      'transmise_dpaf': <span className="badge-warning">📤 Transmise au DPAF</span>,
      'transmise_dapaf': <span className="badge-warning">📤 Transmise au DAPAF</span>,
      'assignee_rh': <span className="badge-info">👥 Assignée RH</span>,
      'en_cours_traitement': <span className="badge-info">⚙️ En cours</span>,
      'acte_genere': <span className="badge-success">📄 Acte généré</span>,
      'termine': <span className="badge-success">✅ Terminé</span>,
      'attente_signature_dpaf': <span className="badge-warning">✍️ En attente signature DPAF</span>,
      'attente_signature_dapaf': <span className="badge-warning">✍️ En attente signature DAPAF</span>,
      'signe': <span className="badge-success">✅ Signé</span>,
      'remis': <span className="badge-success">✅ Remis à l'agent</span>,
      'soumise': <span className="badge-info">📝 Soumise</span>,
      'valide': <span className="badge-success">✅ Validée</span>,
    };
    return badges[statut] || <span className="badge-secondary">{statut}</span>;
  };

  // Normalisation du statut en niveau (1-7) pour le timeline
  const getNiveauStatut = (statut) => {
    const niveaux = {
      'soumise': 1, 'en_attente_chef': 1, 'Demande soumise': 1,
      'valide': 2, 'Approuvée': 2,
      'transmise_dpaf': 3, 'transmise_dapaf': 3, 'Transmise au DPAF': 3, 'Transmise au DAPAF': 3,
      'assignee_rh': 4, 'Assignée au RH': 4,
      'en_cours_traitement': 5, 'En traitement': 5,
      'acte_genere': 6, 'Acte généré': 6,
      'remis': 7, 'signe': 7, 'Signé': 7, 'Acte remis': 7, 'Terminé': 7, 'termine': 7
    };
    return niveaux[statut] || 1;
  };


  if (permissionsLoading) {
    return <div className="loading-screen">Chargement des permissions...</div>;
  }

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img 
              src="/logo_MND.png" 
              alt="Logo Ministère du Numérique et de la Digitalisation" 
              className="mnd-official-logo" 
            />
          </a>
        </div>
        <PortalNav />
        <div className="nav-right">
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2> Tableau de bord - {getRoleLabel()}</h2>
            <p>Gestion et assignment des demandes et attestations aux agents RH - Signature des actes</p>
          </div>
        </section>

        {/* STATISTIQUES */}
        <div className="stats-container">
          <div className="stat-card" style={{ borderLeftColor: '#F59E0B' }}>
            <div className="stat-number">{stats.a_assigner}</div>
            <div className="stat-label">📋 À assigner</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#3B82F6' }}>
            <div className="stat-number">{stats.assignees}</div>
            <div className="stat-label">👥 Assignées</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#8B5CF6' }}>
            <div className="stat-number">{stats.en_cours}</div>
            <div className="stat-label">⚙️ En cours</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#10B981' }}>
            <div className="stat-number">{stats.terminees}</div>
            <div className="stat-label">✅ Terminées</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#EF4444' }}>
            <div className="stat-number">{stats.actes_a_signer}</div>
            <div className="stat-label">✍️ Actes à signer</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#6B7280' }}>
            <div className="stat-number">{stats.historique_count}</div>
            <div className="stat-label">📜 Historique</div>
          </div>
        </div>

        {/* SECTION 1: Demandes et attestations à assigner */}
        <div className="admin-section">
          <h3>📋 Demandes et attestations à assigner</h3>
          
          <div style={{ 
            display: 'flex',
            gap: '15px',
            marginBottom: '15px',
            padding: '10px',
            background: '#F8FAFC',
            borderRadius: '8px'
          }}>
            <div style={{ flex: 1, borderLeft: '4px solid #3B82F6', paddingLeft: '10px' }}>
              <strong>📤 DPAF :</strong>
              <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#475569' }}>
                Absences, Reprise, Attestation de travail
              </p>
            </div>
            <div style={{ flex: 1, borderLeft: '4px solid #10B981', paddingLeft: '10px' }}>
              <strong>📤 DAPAF :</strong>
              <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#475569' }}>
                Congés, Attestations présence/validité/certificats
              </p>
            </div>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Matricule</th>
                  <th>Type</th>
                  <th>Destinataire</th>
                  <th>Date transmission</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center">⏳ Chargement...</td></tr>
                ) : (demandesTransmises.length === 0 && attestationsSoumises.length === 0) ? (
                  <tr><td colSpan="6" className="text-center">📭 Aucune demande ou attestation à assigner</td></tr>
                ) : (
                  <>
                    {/* Demandes */}
                    {demandesTransmises.map((d) => (
                      <tr key={d.id}>
                        <td>{d.agent_nom} {d.agent_prenom}</td>
                        <td>{d.agent_matricule}</td>
                        <td>{d.type_demande}</td>
                        <td>
                          <span style={{ 
                            background: getDestinataire(d.type_demande) === 'DPAF' ? '#DBEAFE' : '#D1FAE5',
                            color: getDestinataire(d.type_demande) === 'DPAF' ? '#1E40AF' : '#065F46',
                            padding: '4px 8px',
                            borderRadius: '20px',
                            fontSize: '0.7rem',
                            fontWeight: 'bold'
                          }}>
                            {getDestinataire(d.type_demande)}
                          </span>
                        </td>
                        <td>{d.date_transmission ? new Date(d.date_transmission).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>
                          <button className="btn-assigner" onClick={() => handleVoirDetails(d, false)}>
                            👥 Assigner à un RH
                          </button>
                        </td>
                      </tr>
                    ))}
                    
                    {/* Attestations */}
                    {attestationsSoumises.map((att) => (
                      <tr key={att.id}>
                        <td>{att.agent_nom} {att.agent_prenom}</td>
                        <td>{att.agent_matricule}</td>
                        <td>
                          <span style={{ 
                            background: '#E0E7FF', 
                            padding: '2px 10px', 
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            color: '#4338CA'
                          }}>
                            📄 {att.type_attestation}
                          </span>
                        </td>
                        <td>
                          <span style={{ 
                            background: getDestinataire(att.type_attestation) === 'DPAF' ? '#DBEAFE' : '#D1FAE5',
                            color: getDestinataire(att.type_attestation) === 'DPAF' ? '#1E40AF' : '#065F46',
                            padding: '4px 8px',
                            borderRadius: '20px',
                            fontSize: '0.7rem',
                            fontWeight: 'bold'
                          }}>
                            {getDestinataire(att.type_attestation)}
                          </span>
                        </td>
                        <td>{att.date_soumission ? new Date(att.date_soumission).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>
                          <button className="btn-assigner" onClick={() => handleVoirDetails(att, true)}>
                            👥 Assigner à un RH
                          </button>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Onglets pour les demandes assignées */}
        <div className="filter-tabs" style={{ marginTop: '20px', marginBottom: '10px' }}>
          <button 
            className={`filter-tab ${activeTab === 'encours' ? 'active' : ''}`} 
            onClick={() => setActiveTab('encours')}
          >
            ⚙️ En cours ({stats.assignees})
          </button>
          <button 
            className={`filter-tab ${activeTab === 'historique' ? 'active' : ''}`} 
            onClick={() => setActiveTab('historique')}
          >
            📜 Historique ({stats.historique_count})
          </button>
        </div>

        {/* SECTION 2: Demandes et attestations assignées en cours */}
        {activeTab === 'encours' && (
          <div className="admin-section">
            <h3>📋 Demandes et attestations assignées - Suivi</h3>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Type</th>
                    <th>Agent RH</th>
                    <th>Statut</th>
                    <th>Date assignation</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6" className="text-center">⏳ Chargement...</td></tr>
                  ) : (demandesAssignees.length === 0 && attestationsAssignees.length === 0) ? (
                    <tr><td colSpan="6" className="text-center">📭 Aucune demande en cours</td></tr>
                  ) : (
                    <>
                      {/* Demandes */}
                      {demandesAssignees.map((d) => (
                        <tr key={d.id}>
                          <td>{d.agent_nom} {d.agent_prenom}</td>
                          <td>{d.type_demande}</td>
                          <td>{d.agent_rh_nom} {d.agent_rh_prenom}</td>
                          <td>{getStatusBadge(d.statut)}</td>
                          <td>{d.date_assignation ? new Date(d.date_assignation).toLocaleDateString('fr-FR') : '-'}</td>
                          <td>
                            <button className="btn-view" onClick={() => handleVoirSuivi(d)}>
                              👁️ Voir suivi
                            </button>
                          </td>
                        </tr>
                      ))}
                      
                      {/* Attestations */}
                      {attestationsAssignees.map((att) => (
                        <tr key={att.id}>
                          <td>{att.agent_nom} {att.agent_prenom}</td>
                          <td>
                            <span style={{ 
                              background: '#E0E7FF', 
                              padding: '2px 10px', 
                              borderRadius: '20px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              color: '#4338CA'
                            }}>
                              📄 {att.type_attestation}
                            </span>
                          </td>
                          <td>{att.agent_rh_nom} {att.agent_rh_prenom}</td>
                          <td>{getStatusBadge(att.statut)}</td>
                          <td>{att.date_assignation ? new Date(att.date_assignation).toLocaleDateString('fr-FR') : '-'}</td>
                          <td>
                            <button className="btn-view" onClick={() => handleVoirSuivi(att)}>
                              👁️ Voir suivi
                            </button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 2bis: Historique des demandes traitées */}
        {activeTab === 'historique' && (
          <div className="admin-section">
            <h3>📜 Historique des demandes et attestations traitées</h3>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Type</th>
                    <th>Agent RH</th>
                    <th>Statut final</th>
                    <th>Date soumission</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6" className="text-center">⏳ Chargement...</td></tr>
                  ) : (demandesHistorique.length === 0 && attestationsHistorique.length === 0) ? (
                    <tr><td colSpan="6" className="text-center">📭 Aucune demande dans l'historique</td></tr>
                  ) : (
                    <>
                      {/* Demandes historiques */}
                      {demandesHistorique.map((d) => (
                        <tr key={d.id}>
                          <td>{d.agent_nom} {d.agent_prenom}</td>
                          <td>{d.type_demande}</td>
                          <td>{d.agent_rh_nom || '-'} {d.agent_rh_prenom || ''}</td>
                          <td>{getStatusBadge(d.statut)}</td>
                          <td>{d.date_soumission ? new Date(d.date_soumission).toLocaleDateString('fr-FR') : '-'}</td>
                          <td>
                            <button className="btn-view" onClick={() => handleVoirSuivi(d)}>
                              👁️ Voir suivi
                            </button>
                          </td>
                        </tr>
                      ))}
                      
                      {/* Attestations historiques */}
                      {attestationsHistorique.map((att) => (
                        <tr key={att.id}>
                          <td>{att.agent_nom} {att.agent_prenom}</td>
                          <td>
                            <span style={{ 
                              background: '#E0E7FF', 
                              padding: '2px 10px', 
                              borderRadius: '20px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              color: '#4338CA'
                            }}>
                              📄 {att.type_attestation}
                            </span>
                          </td>
                          <td>{att.agent_rh_nom || '-'} {att.agent_rh_prenom || ''}</td>
                          <td>{getStatusBadge(att.statut)}</td>
                          <td>{att.date_soumission ? new Date(att.date_soumission).toLocaleDateString('fr-FR') : '-'}</td>
                          <td>
                            <button className="btn-view" onClick={() => handleVoirSuivi(att)}>
                              👁️ Voir suivi
                            </button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Message info sur les types d'actes signés selon le rôle */}
        <div style={{ 
          background: '#EFF6FF', 
          padding: '12px 15px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          borderLeft: '4px solid #3B82F6'
        }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            {getInfoMessage()}
          </p>
        </div>

        {(!hasSignature || !hasCachet) && actesASigner.length > 0 && (
          <div style={{ 
            background: '#fff3cd', 
            padding: '15px', 
            borderRadius: '8px', 
            borderLeft: '4px solid #ffc107',
            marginBottom: '20px'
          }}>
            <p>⚠️ <strong>Attention :</strong> Vous devez uploader votre signature et votre cachet dans votre {''}
            <span 
              onClick={() => navigate('/profil')} 
              style={{ fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', color: '#0056b3' }}
            >
              profil
            </span> avant de pouvoir signer des actes.</p>
            {!hasSignature && <p>→ Signature manquante</p>}
            {!hasCachet && <p>→ Cachet manquant</p>}
          </div>
        )}

        {/* SECTION 3: Actes à signer */}
        <div className="admin-section">
          <h3>✍️ Actes à signer par {getRoleLabel()}</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type d'acte</th>
                  <th>Référence</th>
                  <th>Date demande</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="text-center">⏳ Chargement...</td></tr>
                ) : actesASigner.length === 0 ? (
                  <tr><td colSpan="5" className="text-center">📭 Aucun acte à signer</td></tr>
                ) : (
                  actesASigner.map((acte) => (
                    <tr key={acte.reference}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>
                        <span className="badge-info">{acte.type_acte}</span>
                      </td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_demande ? new Date(acte.date_demande).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference, acte)}>
                            👁️ Voir l'acte
                          </button>
                          <button 
                            className="btn-signer" 
                            onClick={() => handleSigner(acte)}
                            disabled={!hasSignature || !hasCachet}
                          >
                            ✍️ Signer l'acte
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
      </main>

      {/* MODAL ASSIGNER */}
      {showAssignerModal && selectedItem && (
        <div className="modal-overlay" onClick={() => setShowAssignerModal(false)}>
          <div className="modal-content assigner-modal-elegant" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-elegant">
              <div className="modal-header-content-elegant">
                <div className="header-icon-circle-elegant">
                  <span className="header-icon-large">{isAttestation ? '📄' : '👥'}</span>
                </div>
                <div className="header-title-section-elegant">
                  <h3 className="modal-title-elegant">
                    {isAttestation ? 'Assigner une attestation' : 'Assigner à un agent RH'}
                  </h3>
                  <p className="modal-subtitle-elegant">
                    {isAttestation 
                      ? 'Choisissez l\'agent responsable de la génération de l\'attestation' 
                      : 'Choisissez l\'agent responsable du traitement de cette demande'}
                  </p>
                </div>
                <button className="modal-close-elegant" onClick={() => setShowAssignerModal(false)}>
                  ✕
                </button>
              </div>
            </div>
            
            <div className="modal-body-elegant">
              {/* Carte de l'élément */}
              <div className="demande-info-card-elegant">
                <div className="demande-card-header-elegant">
                  <span className="card-header-icon">{isAttestation ? '📄' : '📋'}</span>
                  <span className="card-header-title">
                    {isAttestation ? 'Information de l\'attestation' : 'Information de la demande'}
                  </span>
                </div>
                <div className="demande-details-grid-elegant">
                  <div className="demande-detail-item-elegant">
                    <span className="detail-label-elegant">Agent concerné</span>
                    <div className="detail-value-with-icon-elegant">
                      <span className="detail-icon-elegant">👤</span>
                      <strong>{selectedItem.agent_nom} {selectedItem.agent_prenom}</strong>
                    </div>
                  </div>
                  <div className="demande-detail-item-elegant">
                    <span className="detail-label-elegant">Matricule</span>
                    <div className="detail-value-with-icon-elegant">
                      <code className="matricule-code-elegant">{selectedItem.agent_matricule}</code>
                    </div>
                  </div>
                  <div className="demande-detail-item-elegant">
                    <span className="detail-label-elegant">{isAttestation ? 'Type d\'attestation' : 'Type de demande'}</span>
                    <div className="detail-value-with-icon-elegant">
                      <span className="type-badge-elegant" style={{ 
                        background: isAttestation ? '#E0E7FF' : '#DBEAFE',
                        color: isAttestation ? '#4338CA' : '#1E40AF'
                      }}>
                        {isAttestation ? selectedItem.type_attestation : selectedItem.type_demande}
                      </span>
                    </div>
                  </div>
                  <div className="demande-detail-item-elegant">
                    <span className="detail-label-elegant">Destinataire</span>
                    <div className="detail-value-with-icon-elegant">
                      <span className="type-badge-elegant" style={{ 
                        background: getDestinataire(isAttestation ? selectedItem.type_attestation : selectedItem.type_demande) === 'DPAF' ? '#DBEAFE' : '#D1FAE5',
                        color: getDestinataire(isAttestation ? selectedItem.type_attestation : selectedItem.type_demande) === 'DPAF' ? '#1E40AF' : '#065F46'
                      }}>
                        {getDestinataire(isAttestation ? selectedItem.type_attestation : selectedItem.type_demande)}
                      </span>
                    </div>
                  </div>
                </div>
                {selectedItem.commentaire && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#F3F4F6', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>📝 Commentaire:</span>
                    <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem' }}>{selectedItem.commentaire}</p>
                  </div>
                )}
              </div>

              {/* Sélection agent RH */}
              <div className="selection-section-elegant">
                <div className="selection-header-elegant">
                  <span className="selection-header-icon"></span>
                  <span className="selection-header-title">Sélectionner l'agent RH</span>
                </div>
                
                <div className="agents-list-elegant">
                  {agentsRH.length === 0 ? (
                    <div className="no-agents-message-elegant">
                      <span className="no-agents-icon">⚠️</span>
                      <p>Aucun agent RH disponible</p>
                      <small>Veuillez contacter l'administrateur pour ajouter des agents RH</small>
                    </div>
                  ) : (
                    <div className="agents-radio-group-elegant">
                      {agentsRH.map(agent => (
                        <label 
                          key={agent.matricule} 
                          className={`agent-card-radio-elegant ${selectedAgentRH === agent.matricule ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="agentRH"
                            value={agent.matricule}
                            checked={selectedAgentRH === agent.matricule}
                            onChange={(e) => setSelectedAgentRH(e.target.value)}
                            className="agent-radio-input-elegant"
                          />
                          <div className="agent-card-content-elegant">
                            <div className="agent-avatar-elegant">
                              <span>{agent.prenom?.charAt(0)}{agent.nom?.charAt(0)}</span>
                            </div>
                            <div className="agent-info-elegant">
                              <div className="agent-name-elegant">
                                {agent.nom} {agent.prenom}
                              </div>
                              <div className="agent-details-elegant">
                                <span className="agent-matricule-badge-elegant">{agent.matricule}</span>
                                <span className="agent-poste-badge-elegant">{agent.poste || 'Agent RH'}</span>
                              </div>
                            </div>
                            {selectedAgentRH === agent.matricule && (
                              <div className="agent-selected-check-elegant">✓</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div className="instructions-section-elegant">
                <div className="instructions-header-elegant">
                  <span className="instructions-icon"></span>
                  <span className="instructions-title">Instructions pour l'agent RH</span>
                  <span className="optional-badge-elegant">Optionnel</span>
                </div>
                <textarea
                  className="instructions-textarea-elegant"
                  rows="3"
                  placeholder={isAttestation 
                    ? "Ajoutez des instructions spécifiques pour la génération de cette attestation..." 
                    : "Ajoutez des instructions spécifiques pour le traitement de cette demande..."}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </div>
            </div>
            
            <div className="modal-footer-elegant">
              <button className="btn-cancel-elegant" onClick={() => setShowAssignerModal(false)}>
                Annuler
              </button>
              <button 
                className={`btn-assigner-elegant ${!selectedAgentRH ? 'disabled' : ''}`}
                onClick={() => handleAssignerItem(selectedItem, isAttestation)}
                disabled={!selectedAgentRH}
              >
                <span className="btn-icon">✓</span>
                {isAttestation ? 'Assigner l\'attestation' : 'Assigner la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUIVI */}
      {showSuiviModal && selectedDemande && (
        <div className="modal-overlay" onClick={() => setShowSuiviModal(false)}>
          <div className="modal-content suivi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header suivi-modal-header">
              <div className="header-icon-wrapper">
                <span className="header-icon">📊</span>
                <h3>Suivi de la demande</h3>
              </div>
              <button className="modal-close" onClick={() => setShowSuiviModal(false)}>✕</button>
            </div>
            
            <div className="modal-body suivi-modal-body">
              {/* Carte Agent */}
              <div className="suivi-agent-card">
                <div className="agent-avatar">
                  <span>{selectedDemande.agent_prenom?.charAt(0)}{selectedDemande.agent_nom?.charAt(0)}</span>
                </div>
                <div className="agent-info-card">
                  <h4>{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</h4>
                  <p className="agent-matricule">Matricule: {selectedDemande.agent_matricule}</p>
                </div>
              </div>

              {/* Carte Détails */}
              <div className="suivi-details-card">
                <div className="detail-item">
                  <span className="detail-icon">📋</span>
                  <div className="detail-content">
                    <span className="detail-label">Type</span>
                    <strong className="detail-value">
                      {selectedDemande.type_attestation || selectedDemande.type_demande}
                      {selectedDemande.type_attestation && <span style={{ fontSize: '0.7rem', marginLeft: '8px', background: '#E0E7FF', padding: '2px 8px', borderRadius: '12px' }}>📄 Attestation</span>}
                    </strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">📤</span>
                  <div className="detail-content">
                    <span className="detail-label">Destinataire</span>
                    <strong className="detail-value" style={{ 
                      color: getDestinataire(selectedDemande.type_attestation || selectedDemande.type_demande) === 'DPAF' ? '#2563EB' : '#059669' 
                    }}>
                      {getDestinataire(selectedDemande.type_attestation || selectedDemande.type_demande)}
                    </strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">👥</span>
                  <div className="detail-content">
                    <span className="detail-label">Assigné à</span>
                    <strong className="detail-value">{selectedDemande.agent_rh_nom || 'Non assigné'} {selectedDemande.agent_rh_prenom || ''}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">📊</span>
                  <div className="detail-content">
                    <span className="detail-label">Statut</span>
                    <strong className="detail-value">{getStatusBadge(selectedDemande.statut)}</strong>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="suivi-timeline-modern">
                <h4 className="timeline-title">🔄 Chronologie du traitement</h4>
                
                <div className="timeline-modern">
                  <div className="timeline-modern-step completed">
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">📝</span>
                        <span className="step-title">Demande soumise</span>
                        <span className="step-status">Par l'agent</span>
                      </div>
                      <p className="step-description">Soumise le {selectedDemande.date_soumission ? new Date(selectedDemande.date_soumission).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                  </div>

                  <div className="timeline-modern-step completed">
                    <div className="timeline-modern-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-line"></div>
                    </div>
                    <div className="timeline-modern-content">
                      <div className="step-header">
                        <span className="step-icon">📤</span>
                        <span className="step-title">Transmission</span>
                        <span className="step-status">Par la secrétaire</span>
                      </div>
                      <p className="step-description">Transmise au {getDestinataire(selectedDemande.type_attestation || selectedDemande.type_demande)}</p>
                    </div>
                  </div>

                  {(() => {
                    const statutReel = selectedDemande?.statut || selectedDemande?.statutBrut || '';
                    const niveau = getNiveauStatut(statutReel);
                    const estComplete = (niveauRequis) => niveau >= niveauRequis;
                    const estActive = (niveauRequis) => niveau === niveauRequis - 1;

                    return (
                      <>
                        <div className={`timeline-modern-step ${estComplete(4) ? 'completed' : ''}`}>
                          <div className="timeline-modern-marker">
                            <div className="marker-dot"></div>
                            <div className="marker-line"></div>
                          </div>
                          <div className="timeline-modern-content">
                            <div className="step-header">
                              <span className="step-icon">👥</span>
                              <span className="step-title">Assignation RH</span>
                              <span className="step-status">{selectedDemande.agent_rh_nom || 'En attente'}</span>
                            </div>
                            <p className="step-description">Assignée à un agent RH</p>
                          </div>
                        </div>

                        {niveau > 3 && (
                          <div className={`timeline-modern-step ${estComplete(5) ? 'completed' : estActive(5) ? 'active' : ''}`}>
                            <div className="timeline-modern-marker">
                              <div className="marker-dot"></div>
                              <div className="marker-line"></div>
                            </div>
                            <div className="timeline-modern-content">
                              <div className="step-header">
                                <span className="step-icon">⚙️</span>
                                <span className="step-title">Traitement RH</span>
                                <span className="step-status">En cours</span>
                              </div>
                              <p className="step-description">L'agent RH traite la demande</p>
                            </div>
                          </div>
                        )}

                        {niveau >= 6 && (
                          <div className="timeline-modern-step completed">
                            <div className="timeline-modern-marker">
                              <div className="marker-dot"></div>
                              <div className="marker-line"></div>
                            </div>
                            <div className="timeline-modern-content">
                              <div className="step-header">
                                <span className="step-icon">📄</span>
                                <span className="step-title">Acte généré</span>
                                <span className="step-status">Par l'agent RH</span>
                              </div>
                              <p className="step-description">Acte généré et envoyé</p>
                            </div>
                          </div>
                        )}

                        {niveau >= 7 && (
                          <div className="timeline-modern-step completed">
                            <div className="timeline-modern-marker">
                              <div className="marker-dot"></div>
                              <div className="marker-line"></div>
                            </div>
                            <div className="timeline-modern-content">
                              <div className="step-header">
                                <span className="step-icon">✍️</span>
                                <span className="step-title">Signature</span>
                                <span className="step-status">Par le {getDestinataire(selectedDemande.type_attestation || selectedDemande.type_demande)}</span>
                              </div>
                              <p className="step-description">Acte signé avec cachet officiel</p>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {selectedDemande.statut === 'remis' && (
                    <div className="timeline-modern-step completed">
                      <div className="timeline-modern-marker">
                        <div className="marker-dot"></div>
                      </div>
                      <div className="timeline-modern-content">
                        <div className="step-header">
                          <span className="step-icon">✅</span>
                          <span className="step-title">Remis à l'agent</span>
                          <span className="step-status">Par la secrétaire</span>
                        </div>
                        <p className="step-description">Acte remis à l'agent concerné</p>
                      </div>
                    </div>
                  )}
                
                </div>
              </div>

              {selectedDemande.commentaire && (
                <div className="suivi-commentaire-card">
                  <div className="commentaire-header">
                    <span className="commentaire-icon">📝</span>
                    <h4>Commentaire</h4>
                  </div>
                  <div className="commentaire-content">
                    <p>{selectedDemande.commentaire}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer suivi-modal-footer">
              <button className="btn-fermer" onClick={() => setShowSuiviModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SIGNATURE ACTE - VERSION ÉLÉGANTE */}
      {showSignerModal && selectedActe && (
        <div className="modal-signature-overlay" onClick={() => setShowSignerModal(false)}>
          <div className="modal-signature-content" onClick={(e) => e.stopPropagation()}>
            
            {/* HEADER */}
            <div className="modal-signature-header">
              <div className="modal-signature-header-left">
                <div className="modal-signature-icon-wrapper">
                  <span className="icon">✍️</span>
                </div>
                <div className="modal-signature-title">
                  <h3>Signature de l'acte</h3>
                  <span className="subtitle">Apposez votre signature officielle</span>
                </div>
              </div>
              <button className="modal-signature-close" onClick={() => setShowSignerModal(false)}>✕</button>
            </div>

            {/* BODY */}
            <div className="modal-signature-body">
              
              {/* Carte Acte */}
              <div className="modal-signature-info">
                <div className="card-label">📋 Détails de l'acte</div>
                <div className="modal-signature-info-grid">
                  <div className="modal-signature-info-item">
                    <span className="label">Référence</span>
                    <span className="value"><code>{selectedActe.reference}</code></span>
                  </div>
                  <div className="modal-signature-info-item">
                    <span className="label">Type d'acte</span>
                    <span className="value">{selectedActe.type_acte}</span>
                  </div>
                  <div className="modal-signature-info-item full">
                    <span className="label">Agent concerné</span>
                    <span className="value">{selectedActe.agent_nom} {selectedActe.agent_prenom}</span>
                  </div>
                </div>
              </div>

              {/* Carte Signataire */}
              <div className="modal-signature-signataire">
                <div className="card-label">🖋️ Signataire</div>
                <div className="modal-signature-signataire-grid">
                  <div className="modal-signature-signataire-item">
                    <span className="label">Nom</span>
                    <span className="value">{userName}</span>
                  </div>
                  <div className="modal-signature-signataire-item">
                    <span className="label">Fonction</span>
                    <span className="value">
                      {userRole === 'dapaf' 
                        ? 'Directeur des Affaires Politiques, Administratives et Financières' 
                        : 'Directeur de la Planification, de l\'Administration et des Finances'}
                    </span>
                  </div>
                  <div className="modal-signature-signataire-item">
                    <span className="label">Date</span>
                    <span className="value">{new Date().toLocaleDateString('fr-FR')}</span>
                  </div>
                  <div className="modal-signature-signataire-item">
                    <span className="label">Heure</span>
                    <span className="value">{new Date().toLocaleTimeString('fr-FR')}</span>
                  </div>
                </div>
              </div>

              {/* Commentaire */}
              <div className="modal-signature-commentaire">
                <div className="label-row">
                  <span className="label">💬 Commentaire</span>
                  <span className="optional">Optionnel</span>
                </div>
                <textarea
                  rows="2"
                  placeholder="Ajoutez un commentaire (optionnel)..."
                  value={signatureCommentaire}
                  onChange={(e) => setSignatureCommentaire(e.target.value)}
                />
              </div>

              {/* Alerte sécurité */}
              <div className="modal-signature-alerte">
                <span className="icon">⚠️</span>
                <div className="content">
                  <p><strong>Cette action est irréversible.</strong></p>
                  <p>En cliquant sur <strong>"Signer"</strong>, votre signature et votre cachet officiel seront automatiquement apposés sur l'acte.</p>
                  <p>Cette signature engage votre responsabilité en tant que {userRole === 'dapaf' ? 'DAPAF' : 'DPAF'}.</p>
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="modal-signature-footer">
              <button className="btn-signature-cancel" onClick={() => setShowSignerModal(false)}>
                Annuler
              </button>
              <button 
                className={`btn-signature-submit ${userRole === 'dapaf' ? 'dapaf' : ''}`}
                onClick={() => handleSignerActe(selectedActe.reference)}
                disabled={!hasSignature || !hasCachet}
              >
                <span className="icon">✍️</span>
                Signer avec mon cachet officiel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL APERÇU PDF */}
      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => {
          setShowPreviewModal(false);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl('');
        }}>
          <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header preview-modal-header">
              <h3>📄 {previewTitle}</h3>
              <button className="modal-close" onClick={() => {
                setShowPreviewModal(false);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl('');
              }}>✕</button>
            </div>
            <div className="modal-body preview-modal-body">
              {previewUrl ? (
                <iframe 
                  src={previewUrl} 
                  title={previewTitle}
                  className="pdf-preview-iframe"
                  frameBorder="0"
                />
              ) : (
                <div className="loading-preview">⏳ Chargement de l'aperçu...</div>
              )}
            </div>
            <div className="modal-footer preview-modal-footer">
              <button 
                className="btn-download" 
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = previewUrl;
                  link.download = previewTitle;
                  link.click();
                }}
              >
                ⬇️ Télécharger
              </button>
              <button className="btn-close" onClick={() => {
                setShowPreviewModal(false);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl('');
              }}>Fermer</button>
            </div>
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