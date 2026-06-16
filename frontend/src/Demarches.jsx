import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import './App.css';

export default function Demarches() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  
  // États pour la modale d'erreur
  const [errorModal, setErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // États pour les formulaires
  const [showCongeForm, setShowCongeForm] = useState(false);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [showSoldeModal, setShowSoldeModal] = useState(false);
  const [congeForm, setCongeForm] = useState({
    date_debut: '',
    date_fin: ''
  });
  const [absenceForm, setAbsenceForm] = useState({
    date_debut: '',
    date_fin: '',
    motif: ''
  });
  const [loading, setLoading] = useState(false);
  const [soldeConge, setSoldeConge] = useState(null);
  const [mesDemandes, setMesDemandes] = useState([]);
  const [totalAbsences, setTotalAbsences] = useState(0);
  
  // États pour le certificat de non-jouissance
  const [showCertificatModal, setShowCertificatModal] = useState(false);
  const [certificatAnnee, setCertificatAnnee] = useState(new Date().getFullYear());
  const [certificatVerification, setCertificatVerification] = useState(null);
  const [certificatLoading, setCertificatLoading] = useState(false);

  const matricule = localStorage.getItem('userMatricule');

  // Vérifier si l'utilisateur est connecté au chargement
  useEffect(() => {
    const savedMatricule = localStorage.getItem('userMatricule');
    const savedNom = localStorage.getItem('userNom');
    const savedPrenom = localStorage.getItem('userPrenom');
    const savedEmail = localStorage.getItem('userEmail');
    
    if (savedMatricule) {
      setIsLoggedIn(true);
      setUserName(`${savedPrenom} ${savedNom}`);
      setUserEmail(savedEmail);
      fetchSoldeConge(savedMatricule);
      fetchMesDemandes(savedMatricule);
      fetchTotalAbsences(savedMatricule);
    }
  }, []);

  // Récupérer le solde de congés
  const fetchSoldeConge = async (matricule) => {
    try {
      const response = await fetch(`/api/conges/solde/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setSoldeConge(data);
      }
    } catch (error) {
      console.error('Erreur solde:', error);
    }
  };

  // Récupérer les demandes de l'agent
  const fetchMesDemandes = async (matricule) => {
    try {
      const response = await fetch(`/api/conges/mes-demandes/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setMesDemandes(data);
      }
    } catch (error) {
      console.error('Erreur demandes:', error);
    }
  };

  // Récupérer le total des absences exceptionnelles
  const fetchTotalAbsences = async (matricule) => {
    try {
      const response = await fetch(`/api/absences/total/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setTotalAbsences(data.total || 0);
      }
    } catch (error) {
      console.error('Erreur absences:', error);
    }
  };

  // Gestionnaires d'actions protégés
  const requireLogin = (actionName, action) => {
    if (!isLoggedIn) {
      alert(`Veuillez vous connecter pour ${actionName}`);
      navigate('/auth');
      return false;
    }
    if (action) action();
    return true;
  };

  const handleCongeChange = (e) => {
    setCongeForm({ ...congeForm, [e.target.name]: e.target.value });
  };

  const handleAbsenceChange = (e) => {
    setAbsenceForm({ ...absenceForm, [e.target.name]: e.target.value });
  };

  const soumettreDemandeConge = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    if (!congeForm.date_debut || !congeForm.date_fin) {
      alert('Veuillez remplir toutes les dates');
      return;
    }
    
    const debut = new Date(congeForm.date_debut);
    const fin = new Date(congeForm.date_fin);
    
    if (debut > fin) {
      alert('La date de début doit être antérieure à la date de fin');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/conges/demander/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: matricule,
          date_debut: congeForm.date_debut,
          date_fin: congeForm.date_fin
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ Demande de congé envoyée !\nNuméro de suivi: ${data.numerosuivi}\nJours restants: ${data.jours_restants_apres || '?'}`);
        setShowCongeForm(false);
        setCongeForm({ date_debut: '', date_fin: '' });
        fetchSoldeConge(matricule);
        fetchMesDemandes(matricule);
      } else {
        if (response.status === 403) {
          setErrorMessage(data.error || 'Vous êtes un chef de service. Veuillez adresser votre demande de congé à la hiérarchie (Ministre).');
          setErrorModal(true);
        } else {
          alert(data.error || 'Erreur lors de la demande');
        }
      }
    } catch (error) {
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const soumettreDemandeAbsence = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    if (!absenceForm.date_debut || !absenceForm.date_fin) {
      alert('Veuillez remplir toutes les dates');
      return;
    }
    
    if (!absenceForm.motif) {
      alert('Veuillez fournir un motif pour l\'absence exceptionnelle');
      return;
    }
    
    const debut = new Date(absenceForm.date_debut);
    const fin = new Date(absenceForm.date_fin);
    
    if (debut > fin) {
      alert('La date de début doit être antérieure à la date de fin');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/absences/demander/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: matricule,
          date_debut: absenceForm.date_debut,
          date_fin: absenceForm.date_fin,
          motif: absenceForm.motif
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ Demande d'absence envoyée !\nNuméro: ${data.numerosuivi}\nJours restants: ${data.jours_restants || '?'}/10`);
        setShowAbsenceForm(false);
        setAbsenceForm({ date_debut: '', date_fin: '', motif: '' });
        fetchTotalAbsences(matricule);
        fetchMesDemandes(matricule);
      } else {
        if (response.status === 403) {
          setErrorMessage(data.error || 'Vous êtes un chef de service. Les absences doivent être autorisées par votre supérieur hiérarchique.');
          setErrorModal(true);
        } else {
          alert(data.error || 'Erreur lors de la demande');
        }
      }
    } catch (error) {
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  // Attestation de présence au poste
  const soumettreAttestationPresence = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/attestations/presence/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricule: matricule })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nom = localStorage.getItem('userNom') || '';
        const prenom = localStorage.getItem('userPrenom') || '';
        const safeNom = (nom + '_' + prenom).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
        a.download = `Attestation_Presence_${safeNom || matricule}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert('✅ Attestation de présence générée avec succès !');
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

  // Attestation de travail
  const soumettreAttestationTravail = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/attestations/travail/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricule: matricule })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nom = localStorage.getItem('userNom') || '';
        const prenom = localStorage.getItem('userPrenom') || '';
        const safeNom = (nom + '_' + prenom).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
        a.download = `Attestation_Travail_${safeNom || matricule}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert('✅ Attestation de travail générée avec succès !');
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

  // Attestation de validité de services
  const soumettreAttestationValiditeServices = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/attestations/validite-services/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricule: matricule })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nom = localStorage.getItem('userNom') || '';
        const prenom = localStorage.getItem('userPrenom') || '';
        const safeNom = (nom + '_' + prenom).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
        a.download = `Attestation_Validite_Services_${safeNom || matricule}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert('✅ Attestation de validité de services générée avec succès !');
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

  // Vérifier si l'agent peut obtenir le certificat (avec anti-cache)
  const verifierNonJouissance = async (annee) => {
    if (!matricule) return;
    
    const anneeAVerifier = annee || certificatAnnee;
    console.log(`🔍 Début vérification pour année ${anneeAVerifier}`);
    setCertificatLoading(true);
    
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/certificats/verifier/${matricule}/${anneeAVerifier}/?t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`📊 Données reçues pour ${anneeAVerifier}:`, data);
        console.log(`  - a_bteneficie: ${data.a_bteneficie}`);
        console.log(`  - jours_pris: ${data.jours_pris}`);
        console.log(`  - peut_obtenir_certificat: ${data.peut_obtenir_certificat}`);
        setCertificatVerification(data);
        console.log(`✅ State mis à jour pour ${anneeAVerifier}`);
      } else {
        const error = await response.json();
        console.error('Erreur vérification:', error);
        alert(error.error || 'Erreur lors de la vérification');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setCertificatLoading(false);
      console.log(`🏁 Fin vérification pour ${anneeAVerifier}`);
    }
  };

  // Générer le certificat de non-jouissance
  const genererCertificatNonJouissance = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    setCertificatLoading(true);
    try {
      const response = await fetch('/api/certificats/non-jouissance/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          matricule: matricule,
          annee: certificatAnnee 
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nom = localStorage.getItem('userNom') || '';
        const prenom = localStorage.getItem('userPrenom') || '';
        const safeNom = (nom + '_' + prenom).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
        a.download = `Certificat_Non_Jouissance_${certificatAnnee}_${safeNom || matricule}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert(`✅ Certificat de non-jouissance pour l'année ${certificatAnnee} généré avec succès !`);
        setShowCertificatModal(false);
        setCertificatVerification(null);
        setCertificatAnnee(new Date().getFullYear());
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setCertificatLoading(false);
    }
  };

  // Ouvrir la modale et vérifier
  const ouvrirModalCertificat = () => {
    setShowCertificatModal(true);
    setCertificatVerification(null);
    verifierNonJouissance(certificatAnnee);
  };

  const handleFaireDemande = (titre) => {
    requireLogin(`faire une ${titre}`, () => {
      if (titre.includes("Demande de congé")) {
        setShowCongeForm(true);
      } else if (titre.includes("Autorisation d'absence")) {
        setShowAbsenceForm(true);
      } else if (titre.includes("Attestation de présence au poste")) {
        soumettreAttestationPresence();
      } else if (titre.includes("Attestation de travail")) {
        soumettreAttestationTravail();
      } else if (titre.includes("Attestation de validité de services")) {
        soumettreAttestationValiditeServices();
      } else if (titre.includes("Certificat de non-jouissance")) {
        ouvrirModalCertificat();
      } else {
        alert(`Demande de ${titre} en cours de développement...`);
      }
    });
  };

  const handleConsulterSolde = () => {
    requireLogin("consulter votre solde de congés", () => {
      fetchSoldeConge(matricule);
      setShowSoldeModal(true);
    });
  };

  const handlePostulerOffre = (titre) => {
    requireLogin(`postuler à l'offre ${titre}`, () => {
      alert(`Candidature à l'offre "${titre}" enregistrée !`);
    });
  };

  const handleVoirOffres = () => {
    requireLogin("consulter les offres de postes internes", () => {
      alert("Voici la liste complète des offres...");
    });
  };

  const handleConsulterDossier = () => {
    requireLogin("consulter votre dossier", () => {
      navigate('/documents');
    });
  };

  const handleDeposerPiece = () => {
    requireLogin("déposer une pièce", () => {
      navigate('/documents');
    });
  };

  const handleVoirAlertes = () => {
    requireLogin("voir les alertes de votre dossier", () => {
      alert("Affichage des alertes...");
    });
  };

  const handleConsulterAvancement = () => {
    requireLogin("consulter votre avancement", () => {
      navigate('/dashboard');
    });
  };

  const handleHistoriqueCarriere = () => {
    requireLogin("consulter votre historique de carrière", () => {
      alert("Affichage de l'historique...");
    });
  };

  // Données des attestations
  const attestations = [
    {
      id: 1,
      titre: "Attestation de travail",
      description: "Certifie que vous êtes en activité au Ministère du Numérique.",
      delai: "Immédiat",
      action: "generer"
    },
    {
      id: 2,
      titre: "Attestation de présence au poste",
      description: "Confirme votre présence effective à votre poste de travail.",
      delai: "Immédiat",
      action: "generer"
    },
    {
      id: 3,
      titre: "Attestation de validité de services",
      description: "Valide vos années de service accomplies au sein du MND.",
      delai: "Immédiat",
      action: "generer"
    },
    {
      id: 4,
      titre: "Certificat de non-jouissance de congé",
      description: "Atteste que vous n'avez pas bénéficié de votre congé annuel.",
      delai: "Immédiat",
      action: "generer"
    }
  ];

  // Données des congés
  const conges = [
    {
      id: 1,
      titre: "📅 Demande de congé administratif",
      description: "Soumettez votre demande de congé annuel en ligne.",
      info: "Validation chef →",
      limite: "Max 30 jours/an"
    },
    {
      id: 2,
      titre: "⏰ Autorisation d'absence",
      description: "Demandez une autorisation pour une absence exceptionnelle.",
      info: "Validation chef →",
      limite: "Max 10 jours/an"
    },
    {
      id: 3,
      titre: "📊 Consulter mon solde de congés",
      description: "Vérifiez vos jours acquis, pris et restants pour l'année.",
      info: "Auto-généré →"
    }
  ];

  // Données carrière
  const carrieres = [
    {
      id: 1,
      titre: "📈 Consulter mon avancement",
      description: "Visualisez votre échelon actuel et la date de votre prochain avancement.",
      info: "Tous les 2 ans"
    },
    {
      id: 2,
      titre: "💼 Postuler à un poste interne",
      description: "Consultez les postes vacants et soumettez votre candidature en ligne.",
      info: "Postes ouverts"
    },
    {
      id: 3,
      titre: "📜 Historique de carrière",
      description: "Consultez l'ensemble de vos nominations, avancements et positions.",
      info: "Depuis prise de service"
    }
  ];

  const userRole = localStorage.getItem('userRole');

  return (
    <div className="intranet-home">
      
      {/* BARRE DE NAVIGATION */}
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
        
        {/* BANDEAU DÉMARCHES */}
        <section className="demarches-hero">
          <div className="demarches-hero-content">
            <h1>Vos démarches RH, sans vous déplacer</h1>
            <p>
              Toutes les requêtes de votre carrière au Ministère, disponibles en ligne.
              Soumettez, suivez et recevez vos documents directement depuis votre espace personnel.
            </p>
            <div className="hero-stats-demarches">
              <div className="stat-item">
                <span className="stat-number">12</span>
                <span>Types de démarches</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">100%</span>
                <span>En ligne</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">0</span>
                <span>Déplacements</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION ATTESTATIONS */}
        <section className="attestations-section">
          <div className="section-header-center">
            <h2>Attestations & Actes administratifs</h2>
            <p>Documents officiels délivrés par le service RH</p>
          </div>
          
          <div className="attestations-grid">
            {attestations.map((item) => (
              <div key={item.id} className="attestation-card">
                <h3>{item.titre}</h3>
                <p>{item.description}</p>
                <div className="delai">{item.delai}</div>
                <button 
                  className="btn-demande" 
                  onClick={() => handleFaireDemande(item.titre)}
                >
                  {item.action === 'generer' ? 'Générer →' : 'Faire la demande →'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION CONGÉS */}
        <section className="conges-section">
          <div className="section-header-center">
            <h2>Congés & Absences</h2>
            <p>Demandes liées à vos droits à l'absence</p>
          </div>
          
          <div className="conges-grid">
            {conges.map((item) => (
              <div key={item.id} className="conges-card">
                <h3>{item.titre}</h3>
                <p>{item.description}</p>
                <div className="info">{item.info}</div>
                {item.limite && <div className="limite">{item.limite}</div>}
                <button 
                  className="btn-demande"
                  onClick={() => {
                    if (item.titre.includes("Consulter")) {
                      handleConsulterSolde();
                    } else {
                      handleFaireDemande(item.titre);
                    }
                  }}
                >
                  {item.titre.includes("Consulter") ? "Consulter →" : "Faire la demande →"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION CARRIÈRE */}
        <section className="carriere-section">
          <div className="section-header-center">
            <h2>Carrière & Avancements</h2>
            <p>Suivi de votre progression au sein du MND</p>
          </div>
          
          <div className="carriere-grid">
            {carrieres.map((item) => (
              <div key={item.id} className="carriere-card">
                <h3>{item.titre}</h3>
                <p>{item.description}</p>
                <div className="frequence">{item.info}</div>
                <button 
                  className="btn-demande"
                  onClick={() => {
                    if (item.titre.includes("Postuler")) {
                      handleVoirOffres();
                    } else if (item.titre.includes("Consulter mon avancement")) {
                      handleConsulterAvancement();
                    } else if (item.titre.includes("Historique")) {
                      handleHistoriqueCarriere();
                    } else {
                      handleFaireDemande(item.titre);
                    }
                  }}
                >
                  {item.titre.includes("Postuler") ? "Voir les offres →" : 
                   item.titre.includes("Consulter") ? "Consulter →" : "Faire la demande →"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION MON DOSSIER INDIVIDUEL */}
        <section className="dossier-complet-section">
          <div className="dossier-header">
            <h2>Mon dossier individuel</h2>
            <p>Gestion de vos pièces administratives</p>
          </div>
          
          <div className="dossier-cards-grid">
            <div className="dossier-card">
              <div className="dossier-card-icon">📂</div>
              <h3>Consulter mon dossier</h3>
              <p>Accédez à toutes vos pièces administratives enregistrées.</p>
              <div className="dossier-badge">Accès immédiat</div>
              <button className="btn-dossier-card" onClick={handleConsulterDossier}>Consulter →</button>
            </div>
            
            <div className="dossier-card">
              <div className="dossier-card-icon">📤</div>
              <h3>Déposer une pièce</h3>
              <p>Ajoutez un document manquant à votre dossier administratif.</p>
              <div className="dossier-badge">PDF, JPG acceptés</div>
              <button className="btn-dossier-card" onClick={handleDeposerPiece}>Déposer →</button>
            </div>
            
            <div className="dossier-card alert">
              <div className="dossier-card-icon">⚠️</div>
              <h3>Alertes de mon dossier</h3>
              <p>Consultez les pièces manquantes ou arrivant à expiration.</p>
              <div className="dossier-badge">Notifications auto</div>
              <button className="btn-dossier-card" onClick={handleVoirAlertes}>Voir les alertes →</button>
            </div>
          </div>
        </section>
      </main>

      {/* MODAL SOLDE CONGÉS */}
      {showSoldeModal && (
        <div className="modal-overlay" onClick={() => setShowSoldeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🌴 Détail du solde de congés</h3>
              <button className="modal-close" onClick={() => setShowSoldeModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="solde-info-annee">
                <span className="label">Année</span>
                <span className="value">{soldeConge?.annee || new Date().getFullYear()}</span>
              </div>
              
              <div className="solde-detail-card">
                <div className="solde-detail-item">
                  <div className="solde-detail-icon">📅</div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours acquis</span>
                    <span className="solde-detail-value">{soldeConge?.jours_acquis || 30} jours</span>
                    <span className="solde-detail-sub">Base légale</span>
                  </div>
                </div>
                
                <div className="solde-detail-item">
                  <div className="solde-detail-icon">✅</div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours pris</span>
                    <span className="solde-detail-value">{soldeConge?.jours_pris || 0} jours</span>
                    <span className="solde-detail-sub">Congés déjà consommés</span>
                  </div>
                </div>
                
                <div className="solde-detail-item highlight">
                  <div className="solde-detail-icon">🌟</div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours restants</span>
                    <span className="solde-detail-value large">{soldeConge?.jours_restants || 30} jours</span>
                    <span className="solde-detail-sub">Encore disponible</span>
                  </div>
                </div>
              </div>
              
              <div className="solde-progress-detail">
                <div className="progress-label-detail">
                  <span>Taux d'utilisation</span>
                  <span>{Math.round(((soldeConge?.jours_pris || 0) / (soldeConge?.jours_acquis || 30)) * 100)}%</span>
                </div>
                <div className="progress-bar-detail">
                  <div className="progress-fill-detail" style={{ 
                    width: `${((soldeConge?.jours_pris || 0) / (soldeConge?.jours_acquis || 30)) * 100}%` 
                  }}></div>
                </div>
              </div>
              
              <div className="solde-historique">
                <h4> Informations</h4>
                <ul>
                  <li>✓ 30 jours de congés par an</li>
                  <li>✓ Les congés non pris sont perdus en fin d'année</li>
                  <li>✓ Maximum 2 demandes de congé par an</li>
                  <li>✓ Maximum 30 jours consécutifs</li>
                </ul>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-demander-conge" onClick={() => {
                setShowSoldeModal(false);
                setShowCongeForm(true);
              }}>
                 Demander un congé
              </button>
              <button className="btn-close-modal" onClick={() => setShowSoldeModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL DEMANDE DE CONGÉ (ÉLÉGANT) ==================== */}
      {showCongeForm && (
        <div className="modal-overlay" onClick={() => setShowCongeForm(false)}>
          <div className="modal-content modal-conge" onClick={(e) => e.stopPropagation()}>
            
            {/* En-tête */}
            <div className="modal-conge-header">
              <div className="modal-conge-header-content">
                <div className="modal-conge-icon-wrapper">
                  <span className="icon">📅</span>
                </div>
                <div className="modal-conge-title-section">
                  <h3 className="modal-conge-title">Demande de congé</h3>
                  <p className="modal-conge-subtitle">Soumettez votre demande de congé annuel</p>
                </div>
                <button className="modal-conge-close" onClick={() => setShowCongeForm(false)}>✕</button>
              </div>
            </div>

            {/* Corps */}
            <div className="modal-body" style={{ padding: '24px 30px' }}>
              
              {/* Solde */}
              {soldeConge && (
                <div className="modal-conge-solde">
                  <span className="modal-conge-solde-icon">🌴</span>
                  <div className="modal-conge-solde-text">
                    Solde disponible : <strong>{soldeConge.jours_restants}</strong> jours
                    <small>Congés restants pour l'année en cours</small>
                  </div>
                </div>
              )}

              {/* Formulaire */}
              <div className="modal-conge-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Date de début <span className="required">*</span></label>
                    <input 
                      type="date" 
                      name="date_debut" 
                      value={congeForm.date_debut} 
                      onChange={handleCongeChange} 
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Date de fin <span className="required">*</span></label>
                    <input 
                      type="date" 
                      name="date_fin" 
                      value={congeForm.date_fin} 
                      onChange={handleCongeChange} 
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-conge-footer">
              <button className="btn-conge-cancel" onClick={() => setShowCongeForm(false)}>
                Annuler
              </button>
              <button className="btn-conge-submit" onClick={soumettreDemandeConge} disabled={loading}>
                {loading ? '⏳ Envoi...' : '📤 Envoyer la demande'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ==================== MODAL ABSENCE EXCEPTIONNELLE (ÉLÉGANT) ==================== */}
      {showAbsenceForm && (
        <div className="modal-overlay" onClick={() => setShowAbsenceForm(false)}>
          <div className="modal-content modal-absence" onClick={(e) => e.stopPropagation()}>
            
            {/* En-tête */}
            <div className="modal-absence-header">
              <div className="modal-absence-header-content">
                <div className="modal-absence-icon-wrapper">
                  <span className="icon">⏰</span>
                </div>
                <div className="modal-absence-title-section">
                  <h3 className="modal-absence-title">Demande d'absence exceptionnelle</h3>
                  <p className="modal-absence-subtitle">Motif exceptionnel nécessitant une autorisation</p>
                </div>
                <button className="modal-absence-close" onClick={() => setShowAbsenceForm(false)}>✕</button>
              </div>
            </div>

            {/* Corps */}
            <div className="modal-absence-body">
              
              {/* Réglementation */}
              <div className="modal-absence-reglement">
                <span className="modal-absence-reglement-icon">📋</span>
                <div className="modal-absence-reglement-text">
                  <strong>RÈGLEMENTATION</strong>
                  <span>Maximum 10 jours par an par agent</span>
                </div>
              </div>

              {/* Progression */}
              <div className="modal-absence-progress">
                <div className="modal-absence-progress-labels">
                  <span>Consommé : {totalAbsences} jours</span>
                  <span>Restant : {10 - totalAbsences} jours</span>
                </div>
                <div className="modal-absence-progress-track">
                  <div 
                    className="modal-absence-progress-fill" 
                    style={{ width: `${(totalAbsences / 10) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Stats */}
              <div className="modal-absence-stats">
                <div className="modal-absence-stat">
                  <span className="stat-number consumed">{totalAbsences}</span>
                  <span className="stat-label">Consommés</span>
                  <span className="stat-unit">jours</span>
                </div>
                <div className="modal-absence-stat">
                  <span className="stat-number remaining">{10 - totalAbsences}</span>
                  <span className="stat-label">Restants</span>
                  <span className="stat-unit">jours</span>
                </div>
                <div className="modal-absence-stat">
                  <span className="stat-number">10</span>
                  <span className="stat-label">Maximum</span>
                  <span className="stat-unit">jours/an</span>
                </div>
              </div>

              {/* Alerte si proche de la limite */}
              {totalAbsences >= 8 && (
                <div className="modal-absence-alert">
                  <span className="icon">⚠️</span>
                  <span>Vous avez consommé {totalAbsences} jours sur 10. Il vous reste {10 - totalAbsences} jour(s).</span>
                </div>
              )}

              {/* Formulaire */}
              <div className="modal-absence-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Date de début <span className="required">*</span></label>
                    <input 
                      type="date" 
                      name="date_debut" 
                      value={absenceForm.date_debut} 
                      onChange={handleAbsenceChange} 
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Date de fin <span className="required">*</span></label>
                    <input 
                      type="date" 
                      name="date_fin" 
                      value={absenceForm.date_fin} 
                      onChange={handleAbsenceChange} 
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Motif de l'absence <span className="required">*</span></label>
                  <textarea 
                    name="motif" 
                    rows="3" 
                    value={absenceForm.motif} 
                    onChange={handleAbsenceChange} 
                    placeholder="Ex: Rendez-vous médical, obligation familiale, formation, etc."
                    required
                  ></textarea>
                </div>

                <div className="modal-absence-info">
                  <span className="icon">ℹ️</span>
                  <span>Cette demande sera soumise à la validation de votre supérieur hiérarchique. Vous serez notifié de la décision.</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-absence-footer">
              <button className="btn-absence-cancel" onClick={() => setShowAbsenceForm(false)}>
                Annuler
              </button>
              <button className="btn-absence-submit" onClick={soumettreDemandeAbsence} disabled={loading}>
                {loading ? '⏳ Envoi...' : '📤 Envoyer la demande'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL CERTIFICAT NON-JOUISSANCE */}
      {showCertificatModal && (
        <div className="modal-overlay" onClick={() => setShowCertificatModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3> Certificat de non-jouissance de congé</h3>
              <button className="modal-close" onClick={() => setShowCertificatModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Choisissez l'année *</label>
                <select 
                  value={certificatAnnee} 
                  onChange={(e) => {
                    const nouvelleAnnee = parseInt(e.target.value);
                    console.log(`🔄 Changement d'année: ${certificatAnnee} → ${nouvelleAnnee}`);
                    setCertificatAnnee(nouvelleAnnee);
                    setCertificatVerification(null);
                    verifierNonJouissance(nouvelleAnnee);
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                >
                  {[...Array(6)].map((_, i) => {
                    const annee = new Date().getFullYear() - i;
                    return <option key={annee} value={annee}>{annee}</option>;
                  })}
                </select>
              </div>
              
              {certificatLoading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>⏳ Vérification en cours...</div>
              ) : certificatVerification ? (
                <>
                  {certificatVerification.a_bteneficie ? (
                    <div style={{ 
                      background: '#FEE2E2', 
                      padding: '15px', 
                      borderRadius: '10px',
                      borderLeft: '4px solid #EF4444',
                      marginTop: '15px'
                    }}>
                      <strong style={{ color: '#DC2626' }}>❌ Impossible de générer le certificat</strong>
                      <p style={{ marginTop: '10px', color: '#991B1B' }}>
                        Vous avez bénéficié d'un congé de <strong>{certificatVerification.jours_pris} jours</strong> en {certificatAnnee}.
                      </p>
                      <p style={{ marginTop: '5px', color: '#991B1B', fontSize: '13px' }}>
                        Le certificat de non-jouissance ne peut être délivré que si vous n'avez pris aucun congé pendant l'année concernée.
                      </p>
                    </div>
                  ) : (
                    <div style={{ 
                      background: '#D1FAE5', 
                      padding: '15px', 
                      borderRadius: '10px',
                      borderLeft: '4px solid #10B981',
                      marginTop: '15px'
                    }}>
                      <strong style={{ color: '#059669' }}>✅ Éligible</strong>
                      <p style={{ marginTop: '10px', color: '#065F46' }}>
                        Aucun congé pris en {certificatAnnee}. Vous pouvez générer le certificat.
                      </p>
                    </div>
                  )}
                </>
              ) : null}
              
              <div style={{ 
                background: '#F1F5F9', 
                padding: '12px', 
                borderRadius: '8px', 
                marginTop: '15px',
                fontSize: '13px',
                color: '#475569'
              }}>
                <span>ℹ️</span>
                <span style={{ marginLeft: '8px' }}>
                  Ce certificat atteste que vous n'avez pas bénéficié de votre congé administratif pour l'année sélectionnée.
                </span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowCertificatModal(false)}>Annuler</button>
              <button 
                className="btn-generer" 
                onClick={genererCertificatNonJouissance} 
                disabled={certificatLoading || (certificatVerification && certificatVerification.a_bteneficie)}
                style={{
                  background: (certificatVerification && certificatVerification.a_bteneficie) ? '#9CA3AF' : '#10B981',
                  color: 'white',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  cursor: (certificatVerification && certificatVerification.a_bteneficie) ? 'not-allowed' : 'pointer'
                }}
              >
                {certificatLoading ? 'Génération...' : 'Générer le certificat →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ERREUR CHEF */}
      {errorModal && (
        <div className="modal-overlay" onClick={() => setErrorModal(false)}>
          <div className="modal-content" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: 'none' }}>
              <h3 style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>⛔</span> Accès refusé
              </h3>
              <button className="modal-close" onClick={() => setErrorModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '20px 20px 10px' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>🚫</div>
              <p style={{ fontSize: '16px', color: '#374151', lineHeight: '1.7' }}>
                {errorMessage}
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button 
                className="btn-close-modal" 
                onClick={() => setErrorModal(false)}
                style={{ background: '#DC2626', color: 'white', border: 'none', padding: '10px 30px', borderRadius: '8px', cursor: 'pointer' }}
              >
                J'ai compris
              </button>
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