import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';
import { MapPin, Phone, Mail, FileText, Send,Inbox } from 'lucide-react';
import './App.css';

export default function DashboardSecretaire() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  
  // États pour la secrétaire
  const [demandesValidees, setDemandesValidees] = useState([]);
  const [demandesTransmisesDPAF, setDemandesTransmisesDPAF] = useState([]);
  const [demandesTransmisesDAPAF, setDemandesTransmisesDAPAF] = useState([]);
  const [actesATransmettreDPAF, setActesATransmettreDPAF] = useState([]);
  const [actesATransmettreDAPAF, setActesATransmettreDAPAF] = useState([]);
  const [actesARemettre, setActesARemettre] = useState([]);
  
  // États pour les attestations
  const [attestationsSoumises, setAttestationsSoumises] = useState([]);
  const [attestationsTransmises, setAttestationsTransmises] = useState([]);
  
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  // Modals
  const [showTransmettreModal, setShowTransmettreModal] = useState(false);
  const [showTransmettreActeModal, setShowTransmettreActeModal] = useState(false);
  const [showTransmettreAttestationModal, setShowTransmettreAttestationModal] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [selectedActe, setSelectedActe] = useState(null);
  const [selectedAttestation, setSelectedAttestation] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [destinataireType, setDestinataireType] = useState(''); // 'DPAF' ou 'DAPAF'
  
  // Stats
  const [stats, setStats] = useState({
    a_transmettre_dpaf: 0,
    a_transmettre_dapaf: 0,
    transmises_dpaf: 0,
    transmises_dapaf: 0,
    actes_a_transmettre_dpaf: 0,
    actes_a_transmettre_dapaf: 0,
    actes_a_remettre: 0,
    attestations_a_transmettre: 0
  });

  // Types d'actes selon destinataire
  const typesPourDPAF = ['Absence', 'Reprise de service'];
  const typesPourDAPAF = ['Congé', 'Autorisation de jouissance de congé administratif'];
  
  //  Types d'attestations selon destinataire
  const typesAttestationDPAF = ['Attestation de travail'];
  const typesAttestationDAPAF = [
    'Attestation de présence au poste',
    'Attestation de validité de services',
    'Certificat de non-jouissance de congé'
  ];

  const matricule = localStorage.getItem('userMatricule');
  const userName = `${localStorage.getItem('userPrenom') || ''} ${localStorage.getItem('userNom') || ''}`.trim();
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchData();
  }, []);

  //  Fonction pour déterminer le destinataire d'une attestation (avec gestion de l'année)
  const getDestinataireAttestation = (typeAttestation) => {
    if (!typeAttestation) return null;
    
    // Vérifier DPAF (exact)
    if (typesAttestationDPAF.includes(typeAttestation)) return 'DPAF';
    
    // Vérifier DAPAF (exact ou avec année)
    for (const type of typesAttestationDAPAF) {
      if (typeAttestation === type) return 'DAPAF';
      //  Pour "Certificat de non-jouissance de congé - 2025"
      if (typeAttestation.startsWith(type + ' - ')) return 'DAPAF';
    }
    
    return null;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Demandes validées par le chef (statut = 'valide')
      const valideesRes = await fetch(`/api/secretaire/demandes-validees/${matricule}/`);
      let valideesData = [];
      if (valideesRes.ok) {
        valideesData = await valideesRes.json();
        console.log(' Demandes validées:', valideesData);
        setDemandesValidees(valideesData);
      }

      // 2. Demandes déjà transmises au DPAF
      const transmisesDPAFRes = await fetch(`/api/secretaire/demandes-transmises-dpaf/${matricule}/`);
      let transmisesDPAFData = [];
      if (transmisesDPAFRes.ok) {
        transmisesDPAFData = await transmisesDPAFRes.json();
        console.log(' Demandes transmises au DPAF:', transmisesDPAFData);
        setDemandesTransmisesDPAF(transmisesDPAFData);
      }

      // 3. Demandes déjà transmises au DAPAF
      const transmisesDAPAFRes = await fetch(`/api/secretaire/demandes-transmises-dapaf/${matricule}/`);
      let transmisesDAPAFData = [];
      if (transmisesDAPAFRes.ok) {
        transmisesDAPAFData = await transmisesDAPAFRes.json();
        console.log(' Demandes transmises au DAPAF:', transmisesDAPAFData);
        setDemandesTransmisesDAPAF(transmisesDAPAFData);
      }

      // 4. Actes à transmettre au DPAF (statut = 'envoye_secretaire' + type absence)
      const actesDPAFRes = await fetch(`/api/secretaire/actes-a-transmettre-dpaf/${matricule}/`);
      let actesDPAFData = [];
      if (actesDPAFRes.ok) {
        actesDPAFData = await actesDPAFRes.json();
        console.log(' Actes à transmettre au DPAF:', actesDPAFData);
        setActesATransmettreDPAF(actesDPAFData);
      }

      // 5. Actes à transmettre au DAPAF (statut = 'envoye_secretaire' + type conge)
      const actesDAPAFRes = await fetch(`/api/secretaire/actes-a-transmettre-dapaf/${matricule}/`);
      let actesDAPAFData = [];
      if (actesDAPAFRes.ok) {
        actesDAPAFData = await actesDAPAFRes.json();
        console.log(' Actes à transmettre au DAPAF:', actesDAPAFData);
        setActesATransmettreDAPAF(actesDAPAFData);
      }

      // 6. Actes signés à remettre aux agents (statut = 'signe')
      const actesARemettreRes = await fetch(`/api/secretaire/actes-a-remettre/${matricule}/`);
      let actesARemettreData = [];
      if (actesARemettreRes.ok) {
        actesARemettreData = await actesARemettreRes.json();
        console.log(' Actes à remettre aux agents:', actesARemettreData);
        setActesARemettre(actesARemettreData);
      }

      // 7.  Attestations soumises par les agents (statut = 'soumise')
      const attestationsRes = await fetch(`/api/secretaire/demandes-attestations/${matricule}/`);
      let attestationsData = [];
      if (attestationsRes.ok) {
        attestationsData = await attestationsRes.json();
        console.log(' Attestations soumises:', attestationsData);
        setAttestationsSoumises(attestationsData);
      }

      // 8.  Attestations déjà transmises
      const attestationsTransmisesRes = await fetch(`/api/secretaire/attestations-transmises/${matricule}/`);
      let attestationsTransmisesData = [];
      if (attestationsTransmisesRes.ok) {
        attestationsTransmisesData = await attestationsTransmisesRes.json();
        console.log(' Attestations transmises:', attestationsTransmisesData);
        setAttestationsTransmises(attestationsTransmisesData);
      }

      // Calcul des stats
      const aTransmettreDPAF = valideesData.filter(d => typesPourDPAF.includes(d.type_demande)).length;
      const aTransmettreDAPAF = valideesData.filter(d => typesPourDAPAF.includes(d.type_demande)).length;

      setStats({
        a_transmettre_dpaf: aTransmettreDPAF,
        a_transmettre_dapaf: aTransmettreDAPAF,
        transmises_dpaf: transmisesDPAFData.length,
        transmises_dapaf: transmisesDAPAFData.length,
        actes_a_transmettre_dpaf: actesDPAFData.length,
        actes_a_transmettre_dapaf: actesDAPAFData.length,
        actes_a_remettre: actesARemettreData.length,
        attestations_a_transmettre: attestationsData.length
      });

    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransmettreDemande = async (demandeId, destinataire) => {
    try {
      const response = await fetch(`/api/secretaire/transmettre-demande/${demandeId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretaire_matricule: matricule,
          commentaire: commentaire,
          destinataire: destinataire
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(` Demande transmise au ${result.destinataire} avec succès`);
        setShowTransmettreModal(false);
        setSelectedDemande(null);
        setCommentaire('');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la transmission');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleTransmettreActe = async (reference, destinataire) => {
    try {
      const response = await fetch(`/api/secretaire/transmettre-acte/${encodeURIComponent(reference)}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretaire_matricule: matricule,
          commentaire: commentaire,
          destinataire: destinataire
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(` Acte transmis au ${result.destinataire} pour signature`);
        setShowTransmettreActeModal(false);
        setSelectedActe(null);
        setCommentaire('');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la transmission');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  // Fonction pour transmettre une attestation
  const handleTransmettreAttestation = async (demandeId, destinataire) => {
    try {
      const response = await fetch(`/api/secretaire/attestations/transmettre/${demandeId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretaire_matricule: matricule,
          commentaire: commentaire,
          destinataire: destinataire
        })
      });
      
      if (response.ok) {
        alert(` Attestation transmise au ${destinataire} avec succès`);
        setShowTransmettreAttestationModal(false);
        setSelectedAttestation(null);
        setCommentaire('');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la transmission');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  const handleRemettreActe = async (reference) => {
    try {
      const response = await fetch(`/api/secretaire/remettre-acte/${reference}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretaire_matricule: matricule
        })
      });
      
      if (response.ok) {
        alert(' Acte remis à l\'agent avec succès');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la remise');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
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

        const opened = window.open(url);
        if (opened) opened.focus();
        else {
          setPreviewUrl(url);
          setPreviewTitle(`Acte ${reference}`);
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

  const getStatusBadge = (statut) => {
    const badges = {
      'valide': <span className="badge-success"> Validée par le chef</span>,
      'transmise_dpaf': <span className="badge-warning"> Transmise au DPAF</span>,
      'transmise_dapaf': <span className="badge-warning"> Transmise au DAPAF</span>,
      'acte_genere': <span className="badge-info"> Acte généré</span>,
      'envoye_secretaire': <span className="badge-warning"> Reçu du RH</span>,
      'signe': <span className="badge-success"> Signé</span>,
      'soumise': <span className="badge-info"> Soumise par l'agent</span>
    };
    return badges[statut] || <span className="badge-secondary">{statut}</span>;
  };

  // Déterminer le destinataire selon le type de demande
  const getDestinataire = (typeDemande) => {
    if (typesPourDPAF.includes(typeDemande)) return 'DPAF';
    if (typesPourDAPAF.includes(typeDemande)) return 'DAPAF';
    return null;
  };

  const openTransmettreModal = (demande) => {
    const destinataire = getDestinataire(demande.type_demande);
    if (destinataire) {
      setSelectedDemande(demande);
      setDestinataireType(destinataire);
      setShowTransmettreModal(true);
    }
  };

  const openTransmettreActeModal = (acte, type) => {
    setSelectedActe(acte);
    setDestinataireType(type);
    setShowTransmettreActeModal(true);
  };

  // Ouvrir modal pour transmettre une attestation
  const openTransmettreAttestationModal = (attestation) => {
    const destinataire = getDestinataireAttestation(attestation.type_attestation);
    if (destinataire) {
      setSelectedAttestation(attestation);
      setDestinataireType(destinataire);
      setShowTransmettreAttestationModal(true);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
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
            <h2>Tableau de bord - Secrétariat</h2>
            <p>Transmission des demandes au DPAF (absences) ou DAPAF (congés), suivi des actes et attestations</p>
          </div>
        </section>

        {/* STATISTIQUES */}
        <div className="stats-container">
          <div className="stat-card" style={{ borderLeftColor: '#3B82F6' }}>
            <div className="stat-number">{stats.a_transmettre_dpaf}</div>
            <div className="stat-label"> Demandes à transmettre au DPAF</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#10B981' }}>
            <div className="stat-number">{stats.a_transmettre_dapaf}</div>
            <div className="stat-label"> Demandes à transmettre au DAPAF</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#8B5CF6' }}>
            <div className="stat-number">{stats.actes_a_transmettre_dpaf + stats.actes_a_transmettre_dapaf}</div>
            <div className="stat-label"> Actes à transmettre</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#10B981' }}>
            <div className="stat-number">{stats.actes_a_remettre}</div>
            <div className="stat-label"> Actes à remettre</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#F59E0B' }}>
            <div className="stat-number">{stats.attestations_a_transmettre}</div>
            <div className="stat-label"> Attestations à transmettre</div>
          </div>
        </div>

        {/* SECTION 1: Demandes validées à transmettre */}
        <div className="admin-section">
          <h3>Demandes validées par le chef - À transmettre</h3>
          
          <div style={{ 
            display: 'flex',
            gap: '15px',
            marginBottom: '15px',
            padding: '10px',
            background: '#F8FAFC',
            borderRadius: '8px'
          }}>
            <div style={{ flex: 1, borderLeft: '4px solid #3B82F6', paddingLeft: '10px' }}>
              <strong> Transmission au DPAF :</strong>
              <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#475569' }}>
                Absences, Reprise de service
              </p>
            </div>
            <div style={{ flex: 1, borderLeft: '4px solid #10B981', paddingLeft: '10px' }}>
              <strong> Transmission au DAPAF :</strong>
              <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#475569' }}>
                Congés, Autorisations de congé
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
                  <th>Période</th>
                  <th>Date validation</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-center"> Chargement...</td>
                  </tr>
                ) : demandesValidees.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center"> Aucune demande validée à transmettre</td>
                  </tr>
                ) : (
                  demandesValidees.map((d) => {
                    const destinataire = getDestinataire(d.type_demande);
                    if (!destinataire) return null;
                    
                    return (
                      <tr key={d.id}>
                        <td>{d.agent_nom} {d.agent_prenom}</td>
                        <td>{d.agent_matricule}</td>
                        <td>
                          {d.type_demande}
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '0.7rem', 
                            color: destinataire === 'DPAF' ? '#3B82F6' : '#10B981',
                            fontWeight: 'bold'
                          }}>
                            ({destinataire})
                          </span>
                        </td>
                        <td>{d.date_debut ? `${d.date_debut} - ${d.date_fin}` : '-'}</td>
                        <td>{d.date_validation ? new Date(d.date_validation).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>{getStatusBadge(d.statut)}</td>
                        <td className="rh-actions-cell">
                          <button 
                            className="btn-transmettre"
                            onClick={() => openTransmettreModal(d)}
                          >
                             Transmettre au {destinataire}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: Actes à transmettre au DPAF */}
        <div className="admin-section">
          <h3> Actes reçus des RH - À transmettre au DPAF</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type d'acte</th>
                  <th>Référence</th>
                  <th>Date réception</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {actesATransmettreDPAF.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center"><div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}><Inbox size={24} style={{ color: '#D4AF37' }} /></div>Aucun acte à transmettre au DPAF</td>
                  </tr>
                ) : (
                  actesATransmettreDPAF.map((acte) => (
                    <tr key={acte.reference}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_reception ? new Date(acte.date_reception).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference, acte)}>
                             Voir
                          </button>
                          <button 
                            className="btn-transmettre btn-transmettre-dpaf"
                            onClick={() => openTransmettreActeModal(acte, 'DPAF')}
                          >
                            <span className="icon"><FileText size={16} /></span>
                            Transmettre au DPAF
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

        {/* SECTION 3: Actes à transmettre au DAPAF */}
        <div className="admin-section">
          <h3> Actes reçus des RH - À transmettre au DAPAF</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type d'acte</th>
                  <th>Référence</th>
                  <th>Date réception</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {actesATransmettreDAPAF.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center"><div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}><Inbox size={24} style={{ color: '#D4AF37' }} /></div>Aucun acte à transmettre au DAPAF</td>
                  </tr>
                ) : (
                  actesATransmettreDAPAF.map((acte) => (
                    <tr key={acte.reference}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_reception ? new Date(acte.date_reception).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference, acte)}>
                             Voir
                          </button>
                          <button 
                            className="btn-transmettre btn-transmettre-dapaf"
                            onClick={() => openTransmettreActeModal(acte, 'DAPAF')}
                          >
                            Transmettre au DAPAF
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

        {/* SECTION 4: Attestations à transmettre */}
        <div className="admin-section">
          <h3> Attestations demandées par les agents - À transmettre</h3>
          
          <div style={{ 
            display: 'flex',
            gap: '15px',
            marginBottom: '15px',
            padding: '10px',
            background: '#F8FAFC',
            borderRadius: '8px'
          }}>
            <div style={{ flex: 1, borderLeft: '4px solid #3B82F6', paddingLeft: '10px' }}>
              <strong> Transmission au DPAF :</strong>
              <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#475569' }}>
                Attestation de travail
              </p>
            </div>
            <div style={{ flex: 1, borderLeft: '4px solid #10B981', paddingLeft: '10px' }}>
              <strong> Transmission au DAPAF :</strong>
              <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#475569' }}>
                Attestation de présence, validité de services, certificat
              </p>
            </div>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Matricule</th>
                  <th>Type d'attestation</th>
                  <th>Date demande</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="text-center"> Chargement...</td>
                  </tr>
                ) : attestationsSoumises.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center"> Aucune attestation à transmettre</td>
                  </tr>
                ) : (
                  attestationsSoumises.map((att) => {
                    const destinataire = getDestinataireAttestation(att.type_attestation);
                    if (!destinataire) return null;
                    
                    return (
                      <tr key={att.id}>
                        <td>{att.agent_nom} {att.agent_prenom}</td>
                        <td>{att.agent_matricule}</td>
                        <td>
                          {att.type_attestation}
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '0.7rem', 
                            color: destinataire === 'DPAF' ? '#3B82F6' : '#10B981',
                            fontWeight: 'bold'
                          }}>
                            ({destinataire})
                          </span>
                        </td>
                        <td>{att.date_soumission ? new Date(att.date_soumission).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>{getStatusBadge(att.statut)}</td>
                        <td>
                          <button 
                            className="btn-transmettre"
                            onClick={() => openTransmettreAttestationModal(att)}
                          >
                             Transmettre au {destinataire}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 5: Actes signés à remettre aux agents */}
        <div className="admin-section">
          <h3> Actes signés - À remettre aux agents</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type d'acte</th>
                  <th>Référence</th>
                  <th>Date signature</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {actesARemettre.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center"> Aucun acte à remettre</td>
                  </tr>
                ) : (
                  actesARemettre.map((acte) => (
                    <tr key={acte.reference}>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.type_acte}</td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.date_signature ? new Date(acte.date_signature).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div className="action-buttons-cell">
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference, acte)}>
                             Voir
                          </button>
                          <button 
                            className="btn-remettre"
                            onClick={() => handleRemettreActe(acte.reference)}
                          >
                           Remettre à l'agent
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

        {/* MODAL APERÇU PDF */}
        {showPreviewModal && (
          <div className="modal-overlay" onClick={() => {
            setShowPreviewModal(false);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl('');
          }}>
            <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header preview-modal-header">
                <h3> {previewTitle}</h3>
                <button className="modal-close" onClick={() => {
                  setShowPreviewModal(false);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl('');
                }}><X size={18} /></button>
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
                  <div className="loading-preview"> Chargement de l'aperçu...</div>
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
                   Télécharger
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
      </main>

      {/* MODAL TRANSMETTRE DEMANDE */}
      {showTransmettreModal && selectedDemande && (
        <div className="transmettre-modal-overlay" onClick={() => setShowTransmettreModal(false)}>
          <div className="transmettre-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="transmettre-modal-header">
              <div className="transmettre-modal-header-left">
                <div className="transmettre-modal-icon-wrapper">
                  <span className="icon"><Send size={16} /></span>
                </div>
                <div className="transmettre-modal-title-section">
                  <h3>Transmettre au {destinataireType}</h3>
                  <span className="subtitle">Confirmez la transmission de cette demande</span>
                </div>
              </div>
              <button className="transmettre-modal-close" onClick={() => setShowTransmettreModal(false)}><X size={18} /></button>
            </div>

            <div className="transmettre-modal-body">
              <div className="transmettre-info-card">
                <div className="card-title"> Détails de la demande</div>
                <div className="transmettre-info-grid">
                  <div className="transmettre-info-item">
                    <span className="label">Agent</span>
                    <span className="value">{selectedDemande.agent_nom} {selectedDemande.agent_prenom}</span>
                  </div>
                  <div className="transmettre-info-item">
                    <span className="label">Matricule</span>
                    <span className="value"><code>{selectedDemande.agent_matricule}</code></span>
                  </div>
                  <div className="transmettre-info-item full-width">
                    <span className="label">Type de demande</span>
                    <span className="value">{selectedDemande.type_demande}</span>
                  </div>
                  <div className="transmettre-info-item">
                    <span className="label">Période</span>
                    <span className="value">{selectedDemande.date_debut} → {selectedDemande.date_fin}</span>
                  </div>
                  <div className="transmettre-info-item">
                    <span className="label">Destinataire</span>
                    <span className={`destinataire-badge ${destinataireType === 'DPAF' ? 'dpaf' : 'dapaf'}`}>
                      {destinataireType === 'DPAF' ? ' DPAF' : ' DAPAF'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="transmettre-commentaire-section">
                <div className="label-with-optional">
                  <span className="label"> Instructions pour le {destinataireType}</span>
                  <span className="optional-badge">Optionnel</span>
                </div>
                <textarea
                  rows="3"
                  placeholder={`Ajoutez des instructions pour le ${destinataireType}...`}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </div>
            </div>

            <div className="transmettre-modal-footer">
              <button className="btn-transmettre-cancel" onClick={() => setShowTransmettreModal(false)}>
                Annuler
              </button>
              <button 
                className={`btn-transmettre-submit ${destinataireType === 'DPAF' ? 'dpaf' : 'dapaf'}`}
                onClick={() => handleTransmettreDemande(selectedDemande.id, destinataireType)}
              >
                <span className="icon"><Send size={16} /></span>
                Transmettre au {destinataireType}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TRANSMETTRE ACTE */}
      {(showTransmettreActeModal && selectedActe) && (
        <div className="modal-transmettre-overlay" onClick={() => setShowTransmettreActeModal(false)}>
          <div className="modal-transmettre-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-transmettre-header">
              <div className="modal-transmettre-header-left">
                <div className="modal-transmettre-icon-wrapper">
                  <span className="icon"><Send size={16} /></span>
                </div>
                <div className="modal-transmettre-title">
                  <h3>Transmettre l'acte</h3>
                  <span className="subtitle">Envoyer au {destinataireType} pour signature</span>
                </div>
              </div>
              <button className="modal-transmettre-close" onClick={() => setShowTransmettreActeModal(false)}><X size={18} /></button>
            </div>

            <div className="modal-transmettre-body">
              <div className="modal-transmettre-info">
                <div className="card-label"> Détails de l'acte</div>
                <div className="modal-transmettre-info-grid">
                  <div className="modal-transmettre-info-item">
                    <span className="label">Agent</span>
                    <span className="value">{selectedActe.agent_nom} {selectedActe.agent_prenom}</span>
                  </div>
                  <div className="modal-transmettre-info-item">
                    <span className="label">Type d'acte</span>
                    <span className="value">{selectedActe.type_acte}</span>
                  </div>
                  <div className="modal-transmettre-info-item">
                    <span className="label">Référence</span>
                    <span className="value"><code>{selectedActe.reference}</code></span>
                  </div>
                  <div className="modal-transmettre-info-item">
                    <span className="label">Destinataire</span>
                    <span className={`dest-badge ${destinataireType === 'DPAF' ? 'dpaf' : 'dapaf'}`}>
                      {destinataireType === 'DPAF' ? ' DPAF' : ' DAPAF'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="modal-transmettre-commentaire">
                <div className="label-row">
                  <span className="label"> Instructions</span>
                  <span className="optional">Optionnel</span>
                </div>
                <textarea
                  rows="3"
                  placeholder={`Ajoutez des instructions pour le ${destinataireType}...`}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-transmettre-footer">
              <button className="btn-modal-cancel" onClick={() => setShowTransmettreActeModal(false)}>
                Annuler
              </button>
              <button 
                className={`btn-modal-submit ${destinataireType === 'DPAF' ? 'dpaf' : 'dapaf'}`}
                onClick={() => handleTransmettreActe(selectedActe.reference, destinataireType)}
              >
                <span className="icon"><Send size={16} /></span>
                Transmettre au {destinataireType}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TRANSMETTRE ATTESTATION */}
      {showTransmettreAttestationModal && selectedAttestation && (
        <div className="modal-transmettre-attestation-overlay" onClick={() => setShowTransmettreAttestationModal(false)}>
          <div className="modal-transmettre-attestation-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-transmettre-attestation-header">
              <div className="modal-transmettre-attestation-header-left">
                <div className="modal-transmettre-attestation-icon-wrapper">
                  <span className="icon"><FileText size={16} /></span>
                </div>
                <div className="modal-transmettre-attestation-title">
                  <h3>Transmettre l'attestation</h3>
                  <span className="subtitle">Envoyer au {destinataireType} pour traitement</span>
                </div>
              </div>
              <button className="modal-transmettre-attestation-close" onClick={() => setShowTransmettreAttestationModal(false)}><X size={18} /></button>
            </div>

            <div className="modal-transmettre-attestation-body">
              <div className="modal-transmettre-attestation-info">
                <div className="card-label"> Détails de l'attestation</div>
                <div className="modal-transmettre-attestation-info-grid">
                  <div className="modal-transmettre-attestation-info-item">
                    <span className="label">Agent</span>
                    <span className="value">{selectedAttestation.agent_nom} {selectedAttestation.agent_prenom}</span>
                  </div>
                  <div className="modal-transmettre-attestation-info-item">
                    <span className="label">Matricule</span>
                    <span className="value"><code>{selectedAttestation.agent_matricule}</code></span>
                  </div>
                  <div className="modal-transmettre-attestation-info-item full">
                    <span className="label">Type d'attestation</span>
                    <span className="value">
                      <span className="attestation-type-badge">
                         {selectedAttestation.type_attestation}
                      </span>
                    </span>
                  </div>
                  <div className="modal-transmettre-attestation-info-item">
                    <span className="label">Date demande</span>
                    <span className="value">
                      {selectedAttestation.date_soumission 
                        ? new Date(selectedAttestation.date_soumission).toLocaleDateString('fr-FR') 
                        : '-'}
                    </span>
                  </div>
                  <div className="modal-transmettre-attestation-info-item">
                    <span className="label">Destinataire</span>
                    <span className={`dest-badge ${destinataireType === 'DPAF' ? 'dpaf' : 'dapaf'}`}>
                      {destinataireType === 'DPAF' ? ' DPAF' : ' DAPAF'}
                    </span>
                  </div>
                </div>
                
                {selectedAttestation.commentaire && (
                  <div className="agent-commentaire">
                    <div className="label"> Commentaire de l'agent</div>
                    <div className="value">{selectedAttestation.commentaire}</div>
                  </div>
                )}
              </div>

              <div className="modal-transmettre-attestation-commentaire">
                <div className="label-row">
                  <span className="label"> Instructions pour le {destinataireType}</span>
                  <span className="optional">Optionnel</span>
                </div>
                <textarea
                  rows="3"
                  placeholder={`Ajoutez des instructions pour le ${destinataireType}...`}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-transmettre-attestation-footer">
              <button className="btn-modal-cancel" onClick={() => setShowTransmettreAttestationModal(false)}>
                Annuler
              </button>
              <button 
                className={`btn-modal-submit ${destinataireType === 'DPAF' ? 'dpaf' : 'dapaf'}`}
                onClick={() => handleTransmettreAttestation(selectedAttestation.id, destinataireType)}
              >
                <span className="icon"><Send size={16} /></span>
                Transmettre au {destinataireType}
              </button>
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
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><MapPin size={16} style={{ color: '#D4AF37' }} /> Avenue Jean-Paul II, Cotonou, Bénin</p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><Phone size={16} style={{ color: '#D4AF37' }} /> +229 21 30 70 13</p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}><Mail size={16} style={{ color: '#D4AF37' }} /> numerique@gouv.bj</p>
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