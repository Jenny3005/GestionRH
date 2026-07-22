import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import { AlertCircle, CheckCircle, AlertTriangle, MapPin, Phone, Mail, X, Clipboard, CalendarDays, Info } from 'lucide-react';
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
  const [showDemandeModal, setShowDemandeModal] = useState(false);
  const [demandeEnCours, setDemandeEnCours] = useState('');
  const [commentaireDemande, setCommentaireDemande] = useState('');
  
  // ✅ MODIFICATION : congeForm avec nombre_jours au lieu de date_fin
  const [congeForm, setCongeForm] = useState({
    date_debut: '',
    nombre_jours: 1
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

  // ✅ Fonction pour calculer la date de fin à partir du nombre de jours
  const calculerDateFin = (dateDebut, nombreJours) => {
    if (!dateDebut || !nombreJours) return null;
    const debut = new Date(dateDebut);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + nombreJours - 1);
    return fin;
  };

  // ✅ Fonction pour formater une date en français
  const formaterDateFr = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
  };

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

  //  Gestionnaire de changement pour le formulaire de congé
  const handleCongeChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'nombre_jours') {
      // S'assurer que le nombre est valide
      let jours = parseInt(value) || 1;
      jours = Math.max(1, Math.min(30, jours));
      
      // Si le solde est connu, limiter au solde restant
      if (soldeConge && jours > soldeConge.jours_restants) {
        jours = soldeConge.jours_restants;
      }
      
      setCongeForm({ ...congeForm, nombre_jours: jours });
    } else {
      setCongeForm({ ...congeForm, [name]: value });
    }
  };

  const handleAbsenceChange = (e) => {
    setAbsenceForm({ ...absenceForm, [e.target.name]: e.target.value });
  };

  //  Calcul de la date de fin pour l'affichage
  const dateFinCalculee = congeForm.date_debut && congeForm.nombre_jours 
    ? calculerDateFin(congeForm.date_debut, congeForm.nombre_jours)
    : null;

  //  Soumission de la demande de congé
  const soumettreDemandeConge = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    if (!congeForm.date_debut || !congeForm.nombre_jours) {
      alert('Veuillez remplir tous les champs');
      return;
    }
    
    // Vérifier que le nombre de jours ne dépasse pas le solde
    if (soldeConge && congeForm.nombre_jours > soldeConge.jours_restants) {
      alert(`Solde insuffisant. Il vous reste ${soldeConge.jours_restants} jours.`);
      return;
    }
    
    // Calculer la date de fin
    const dateFin = calculerDateFin(congeForm.date_debut, congeForm.nombre_jours);
    
    if (!dateFin) {
      alert('Erreur de calcul des dates');
      return;
    }
    
    // Vérifier que la date de début n'est pas dans le passé
    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);
    const debut = new Date(congeForm.date_debut);
    
    if (debut < aujourdHui) {
      alert('La date de début ne peut pas être dans le passé');
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
          nombre_jours: congeForm.nombre_jours
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(` Demande de congé envoyée !\n\n Période : ${formaterDateFr(debut)} au ${formaterDateFr(dateFin)}\n📆 ${congeForm.nombre_jours} jour${congeForm.nombre_jours > 1 ? 's' : ''}\n🔢 Numéro de suivi: ${data.numerosuivi}\n🌟 Jours restants: ${data.jours_restants_apres || '?'}`);
        setShowCongeForm(false);
        setCongeForm({ date_debut: '', nombre_jours: 1 });
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
        alert(` Demande d'absence envoyée !\nNuméro: ${data.numerosuivi}\nJours restants: ${data.jours_restants || '?'}/10`);
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

  // Demande d'attestation - Envoi au service RH
  const soumettreDemandeAttestation = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/attestations/demander/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: matricule,
          type_attestation: demandeEnCours,
          commentaire: commentaireDemande
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(` Demande d'attestation "${demandeEnCours}" envoyée avec succès !\n\nNuméro de suivi: ${data.numerosuivi || 'N/A'}\nVous serez notifié(e) lorsque votre attestation sera prête.`);
        setShowDemandeModal(false);
        setDemandeEnCours('');
        setCommentaireDemande('');
        fetchMesDemandes(matricule);
      } else {
        alert(data.error || 'Erreur lors de la demande');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  // Vérifier si l'agent peut obtenir le certificat
  const verifierNonJouissance = async (annee) => {
    if (!matricule) return;
    
    const anneeAVerifier = annee || certificatAnnee || new Date().getFullYear() - 1;
    setCertificatLoading(true);
    setCertificatVerification(null);
    
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
        setCertificatVerification(data);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la vérification');
        setCertificatVerification(null);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
      setCertificatVerification(null);
    } finally {
      setCertificatLoading(false);
    }
  };

  const genererCertificatNonJouissance = async () => {
    if (!matricule) {
      alert('Veuillez vous connecter');
      return;
    }
    
    setCertificatLoading(true);
    try {
      const response = await fetch('/api/attestations/demander/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: matricule,
          type_attestation: `Certificat de non-jouissance de congé - ${certificatAnnee}`,
          commentaire: `Année concernée : ${certificatAnnee}`
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(` Demande de certificat de non-jouissance pour l'année ${certificatAnnee} envoyée avec succès !\n\nNuméro de suivi: ${data.numerosuivi || 'N/A'}\nVous serez notifié(e) lorsque votre certificat sera prêt.`);
        setShowCertificatModal(false);
        setCertificatVerification(null);
        setCertificatAnnee(new Date().getFullYear() - 1);
        fetchMesDemandes(matricule);
      } else {
        alert(data.error || 'Erreur lors de la demande');
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
    const anneeActuelle = new Date().getFullYear();
    const anneeParDefaut = anneeActuelle - 1;
    
    setShowCertificatModal(true);
    setCertificatAnnee(anneeParDefaut);
    setCertificatVerification(null);
    setCertificatLoading(true);
    verifierNonJouissance(anneeParDefaut);
  };

  // Nouvelle fonction pour les attestations
  const handleDemandeAttestation = (titre) => {
    requireLogin(`faire une demande d'attestation`, () => {
      setDemandeEnCours(titre);
      setCommentaireDemande('');
      setShowDemandeModal(true);
    });
  };

  const handleFaireDemande = (titre) => {
    requireLogin(`faire une ${titre}`, () => {
      if (titre.includes("Demande de congé")) {
        setShowCongeForm(true);
      } else if (titre.includes("Autorisation d'absence")) {
        setShowAbsenceForm(true);
      } else if (titre.includes("Certificat de non-jouissance")) {
        ouvrirModalCertificat();
      } else {
        handleDemandeAttestation(titre);
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
      navigate('/postes');
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
      navigate('/documents');
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
    },
    {
      id: 2,
      titre: "Attestation de présence au poste",
      description: "Confirme votre présence effective à votre poste de travail.",
    },
    {
      id: 3,
      titre: "Attestation de validité de services",
      description: "Valide vos années de service accomplies au sein du MND.",
    },
    {
      id: 4,
      titre: "Certificat de non-jouissance de congé",
      description: "Atteste que vous n'avez pas bénéficié de votre congé annuel.",
    }
  ];

  // Données des congés
  const conges = [
    {
      id: 1,
      titre: " Demande de congé administratif",
      description: "Soumettez votre demande de congé annuel en ligne.",
    },
    {
      id: 2,
      titre: " Autorisation d'absence exceptionnelle",
      description: "Demandez une autorisation pour une absence exceptionnelle.",
    },
    {
      id: 3,
      titre: " Consulter mon solde de congés",
      description: "Vérifiez vos jours acquis, pris et restants pour l'année.",
    }
  ];

  // Données carrière
  const carrieres = [
    {
      id: 1,
      titre: " Consulter mon avancement",
      description: "Visualisez votre échelon actuel et la date de votre prochain avancement.",
    },
    {
      id: 2,
      titre: " Postuler à un poste interne",
      description: "Consultez les postes vacants et soumettez votre candidature en ligne.",
    },
    {
      id: 3,
      titre: " Historique de carrière",
      description: "Consultez l'ensemble de vos nominations, avancements et positions.",
    }
  ];

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
                <button 
                  className="btn-demande" 
                  onClick={() => handleFaireDemande(item.titre)}
                >
                  Faire une demande →
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
              <div className="dossier-card-icon"></div>
              <h3>Consulter mon dossier</h3>
              <p>Accédez à toutes vos pièces administratives enregistrées.</p>
              <div className="dossier-badge">Accès immédiat</div>
              <button className="btn-dossier-card" onClick={handleConsulterDossier}>Consulter →</button>
            </div>
            
            <div className="dossier-card">
              <div className="dossier-card-icon"></div>
              <h3>Déposer une pièce</h3>
              <p>Ajoutez un document manquant à votre dossier administratif.</p>
              <div className="dossier-badge">PDF, JPG acceptés</div>
              <button className="btn-dossier-card" onClick={handleDeposerPiece}>Déposer →</button>
            </div>
            
            <div className="dossier-card alert">
              <div className="dossier-card-icon"></div>
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
              <h3> Détail du solde de congés</h3>
              <button className="modal-close" onClick={() => setShowSoldeModal(false)}><X size={18} /></button>
            </div>
            
            <div className="modal-body">
              <div className="solde-info-annee">
                <span className="label">Année</span>
                <span className="value">{soldeConge?.annee || new Date().getFullYear()}</span>
              </div>
              
              <div className="solde-detail-card">
                <div className="solde-detail-item">
                  <div className="solde-detail-icon"></div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours acquis</span>
                    <span className="solde-detail-value">{soldeConge?.jours_acquis || 30} jours</span>
                    <span className="solde-detail-sub">Base légale</span>
                  </div>
                </div>
                
                <div className="solde-detail-item">
                  <div className="solde-detail-icon"></div>
                  <div className="solde-detail-content">
                    <span className="solde-detail-label">Jours pris</span>
                    <span className="solde-detail-value">{soldeConge?.jours_pris || 0} jours</span>
                    <span className="solde-detail-sub">Congés déjà consommés</span>
                  </div>
                </div>
                
                <div className="solde-detail-item highlight">
                  <div className="solde-detail-icon"></div>
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
                  <li> 30 jours de congés par an</li>
                  <li> Les congés non pris sont perdus en fin d'année</li>
                  <li> Maximum 2 demandes de congé par an</li>
                  <li> Maximum 30 jours consécutifs</li>
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

      {/*  MODAL DEMANDE DE CONGÉ - VERSION MODIFIÉE AVEC NOMBRE DE JOURS */}
      {showCongeForm && (
        <div className="modal-overlay" onClick={() => setShowCongeForm(false)}>
          <div className="modal-content modal-conge" onClick={(e) => e.stopPropagation()}>
            <div className="modal-conge-header">
              <div className="modal-conge-header-content">
                <div className="modal-conge-icon-wrapper">
                  <span className="icon"><CalendarDays size={18} /></span>
                </div>
                <div className="modal-conge-title-section">
                  <h3 className="modal-conge-title">Demande de congé</h3>
                  <p className="modal-conge-subtitle">Soumettez votre demande de congé annuel</p>
                </div>
                <button className="modal-conge-close" onClick={() => setShowCongeForm(false)}><X size={18} /></button>
              </div>
            </div>

            <div className="modal-body" style={{ padding: '24px 30px' }}>
              {soldeConge && (
                <div className="modal-conge-solde">
                  <span className="modal-conge-solde-icon"><CalendarDays size={18} /></span>
                  <div className="modal-conge-solde-text">
                    Solde disponible : <strong>{soldeConge.jours_restants}</strong> jours
                    <small>Congés restants pour l'année en cours</small>
                  </div>
                </div>
              )}

              <div className="modal-conge-form">
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Date de début <span className="required">*</span></label>
                    <input 
                      type="date" 
                      name="date_debut" 
                      value={congeForm.date_debut} 
                      onChange={handleCongeChange}
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  
                  <div className="form-group" style={{ flex: 0.7 }}>
                    <label>Nombre de jours <span className="required">*</span></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button 
                        onClick={() => {
                          const newVal = Math.max(1, (congeForm.nombre_jours || 1) - 1);
                          setCongeForm({ ...congeForm, nombre_jours: newVal });
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          border: '1px solid #ddd',
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        -
                      </button>
                      <input 
                        type="number" 
                        name="nombre_jours" 
                        value={congeForm.nombre_jours} 
                        onChange={handleCongeChange}
                        min="1"
                        max={soldeConge?.jours_restants || 30}
                        style={{
                          width: '70px',
                          textAlign: 'center',
                          fontSize: '18px',
                          fontWeight: '600',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '8px'
                        }}
                        required
                      />
                      <button 
                        onClick={() => {
                          const maxJours = soldeConge?.jours_restants || 30;
                          const newVal = Math.min(maxJours, (congeForm.nombre_jours || 1) + 1);
                          setCongeForm({ ...congeForm, nombre_jours: newVal });
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          border: '1px solid #ddd',
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        +
                      </button>
                    </div>
                    <small style={{ display: 'block', marginTop: '4px', color: '#64748B' }}>
                      {soldeConge && `Max: ${soldeConge.jours_restants} jours`}
                    </small>
                  </div>
                </div>
                
                {/*  Affichage de la date de fin calculée */}
                {dateFinCalculee && (
                  <div style={{ 
                    marginTop: '15px', 
                    padding: '12px 16px', 
                    background: '#F0F7FF', 
                    borderRadius: '8px',
                    border: '1px solid #BBDEFB',
                    animation: 'fadeInDown 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#1565C0' }}>
                         Date de fin calculée :
                      </span>
                      <span style={{ fontWeight: '600', color: '#0D47A1' }}>
                        {formaterDateFr(dateFinCalculee)}
                      </span>
                    </div>
                    <div style={{ 
                      marginTop: '8px', 
                      fontSize: '13px', 
                      color: '#1565C0',
                      opacity: 0.8
                    }}>
                      Période du {formaterDateFr(new Date(congeForm.date_debut))} au {formaterDateFr(dateFinCalculee)} 
                      ({congeForm.nombre_jours} jour{congeForm.nombre_jours > 1 ? 's' : ''})
                    </div>
                  </div>
                )}
                
                {/*  Indicateur de dépassement du solde */}
                {soldeConge && congeForm.nombre_jours > soldeConge.jours_restants && (
                  <div style={{ 
                    marginTop: '10px', 
                    padding: '8px 12px', 
                    background: '#FFEBEE', 
                    borderRadius: '6px',
                    color: '#C62828',
                    fontSize: '14px'
                  }}>
                     Vous demandez {congeForm.nombre_jours} jours mais il vous reste {soldeConge.jours_restants} jours.
                  </div>
                )}
                
                {/*  Indicateur de dépassement de 30 jours */}
                {congeForm.nombre_jours > 30 && (
                  <div style={{ 
                    marginTop: '10px', 
                    padding: '8px 12px', 
                    background: '#FFF3E0', 
                    borderRadius: '6px',
                    color: '#E65100',
                    fontSize: '14px'
                  }}>
                     La durée maximale d'un congé est de 30 jours consécutifs.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-conge-footer">
              <button className="btn-conge-cancel" onClick={() => setShowCongeForm(false)}>
                Annuler
              </button>
              <button 
                className="btn-conge-submit" 
                onClick={soumettreDemandeConge} 
                disabled={
                  loading || 
                  !congeForm.date_debut || 
                  !congeForm.nombre_jours || 
                  (soldeConge && congeForm.nombre_jours > soldeConge.jours_restants) ||
                  congeForm.nombre_jours > 30 ||
                  congeForm.nombre_jours < 1
                }
                style={{
                  opacity: (
                    loading || 
                    !congeForm.date_debut || 
                    !congeForm.nombre_jours || 
                    (soldeConge && congeForm.nombre_jours > soldeConge.jours_restants) ||
                    congeForm.nombre_jours > 30 ||
                    congeForm.nombre_jours < 1
                  ) ? 0.6 : 1
                }}
              >
                {loading ? ' Envoi...' : ' Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ABSENCE EXCEPTIONNELLE */}
      {showAbsenceForm && (
        <div className="modal-overlay" onClick={() => setShowAbsenceForm(false)}>
          <div className="modal-content modal-absence" onClick={(e) => e.stopPropagation()}>
            <div className="modal-absence-header">
              <div className="modal-absence-header-content">
                <div className="modal-absence-icon-wrapper">
                  <span className="icon"><AlertTriangle size={18} /></span>
                </div>
                <div className="modal-absence-title-section">
                  <h3 className="modal-absence-title">Demande d'absence exceptionnelle</h3>
                  <p className="modal-absence-subtitle">Motif exceptionnel nécessitant une autorisation</p>
                </div>
                <button className="modal-absence-close" onClick={() => setShowAbsenceForm(false)}><X size={18} /></button>
              </div>
            </div>

            <div className="modal-absence-body">
              <div className="modal-absence-reglement">
                <span className="modal-absence-reglement-icon"><AlertTriangle size={18} /></span>
                <div className="modal-absence-reglement-text">
                  <strong>RÈGLEMENTATION</strong>
                  <span>Maximum 10 jours par an par agent</span>
                </div>
              </div>

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

              {totalAbsences >= 8 && (
                <div className="modal-absence-alert">
                  <span className="icon"><AlertCircle size={16} /></span>
                  <span>Vous avez consommé {totalAbsences} jours sur 10. Il vous reste {10 - totalAbsences} jour(s).</span>
                </div>
              )}

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
                  <span className="icon"><Info size={16} /></span>
                  <span>Cette demande sera soumise à la validation de votre supérieur hiérarchique. Vous serez notifié de la décision.</span>
                </div>
              </div>
            </div>

            <div className="modal-absence-footer">
              <button className="btn-absence-cancel" onClick={() => setShowAbsenceForm(false)}>
                Annuler
              </button>
              <button className="btn-absence-submit" onClick={soumettreDemandeAbsence} disabled={loading}>
                {loading ? ' Envoi...' : ' Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEMANDE D'ATTESTATION */}
      {showDemandeModal && (
        <div className="modal-overlay" onClick={() => setShowDemandeModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3> Demande d'attestation</h3>
              <button className="modal-close" onClick={() => setShowDemandeModal(false)}><X size={18} /></button>
            </div>
            
            <div className="modal-body">
              <div style={{ 
                background: '#F1F5F9', 
                padding: '12px 15px', 
                borderRadius: '10px',
                marginBottom: '20px'
              }}>
                <p style={{ margin: 0, fontWeight: '600' }}>
                  Type : <span style={{ color: '#0B192C' }}>{demandeEnCours}</span>
                </p>
              </div>
              
              <p style={{ color: '#64748B', fontSize: '0.9rem', lineHeight: '1.6' }}>
                Votre demande sera transmise au service RH qui traitera votre attestation. 
                Vous recevrez une notification lorsque votre document sera prêt.
              </p>
              
              <div className="form-group" style={{ marginTop: '20px' }}>
                <label>Commentaire (optionnel)</label>
                <textarea
                  rows="3"
                  placeholder="Ajoutez des précisions si nécessaire..."
                  value={commentaireDemande}
                  onChange={(e) => setCommentaireDemande(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}
                />
              </div>

              <div style={{ 
                background: '#FFFBEB', 
                padding: '10px 15px', 
                borderRadius: '8px',
                marginTop: '15px',
                borderLeft: '4px solid #F59E0B'
              }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400E' }}>
                   Le délai de traitement est généralement de 2 à 3 jours ouvrés.
                </p>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowDemandeModal(false)}>Annuler</button>
              <button 
                className="btn-generer" 
                onClick={soumettreDemandeAttestation}
                disabled={loading}
                style={{
                  background: '#D4AF37',
                  color: '#0B192C',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? ' Envoi...' : ' Envoyer la demande →'}
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
              <button className="modal-close" onClick={() => setShowCertificatModal(false)}><X size={18} /></button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Choisissez l'année *</label>
                <select 
                  value={certificatAnnee} 
                  onChange={(e) => {
                    const nouvelleAnnee = parseInt(e.target.value);
                    setCertificatAnnee(nouvelleAnnee);
                    setCertificatVerification(null);
                    setCertificatLoading(true);
                    verifierNonJouissance(nouvelleAnnee);
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                >
                  {(() => {
                    const anneeActuelle = new Date().getFullYear();
                    const annees = [];
                    for (let annee = anneeActuelle - 1; annee >= 2020; annee--) {
                      annees.push(annee);
                    }
                    return annees.map((annee) => (
                      <option key={annee} value={annee}>{annee}</option>
                    ));
                  })()}
                </select>
                <small style={{ display: 'block', marginTop: '5px', color: '#64748B' }}>
                   Seules les années terminées sont disponibles (année en cours exclue)
                </small>
              </div>
              
              {certificatLoading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <span> Vérification en cours pour l'année {certificatAnnee}...</span>
                </div>
              ) : certificatVerification ? (
                <>
                  {certificatVerification.a_bteneficie ? (
                    <div style={{ 
                      background: '#FEE2E2', 
                      padding: '15px', 
                      borderRadius: '10px',
                      borderLeft: '4px solid #EF4444',
                      marginTop: '15px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}>
                      <AlertTriangle size={24} style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ color: '#DC2626' }}>Impossible de faire la demande</strong>
                        <p style={{ marginTop: '10px', color: '#991B1B' }}>
                          Vous avez bénéficié d'un congé de <strong>{certificatVerification.jours_pris} jours</strong> en {certificatAnnee}.
                        </p>
                        <p style={{ marginTop: '5px', color: '#991B1B', fontSize: '13px' }}>
                          Le certificat de non-jouissance ne peut être délivré que si vous n'avez pris aucun congé pendant l'année concernée.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ 
                      background: '#D1FAE5', 
                      padding: '15px', 
                      borderRadius: '10px',
                      borderLeft: '4px solid #10B981',
                      marginTop: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <CheckCircle size={24} style={{ color: '#059669', flexShrink: 0 }} />
                      <strong style={{ color: '#059669' }}>Éligible</strong>
                      <p style={{ marginTop: '10px', color: '#065F46' }}>
                        Aucun congé pris en {certificatAnnee}. Vous pouvez faire la demande.
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
                <span></span>
                <span style={{ marginLeft: '8px' }}>
                  Votre demande sera transmise au service RH qui vérifiera votre éligibilité et générera le certificat pour l'année <strong>{certificatAnnee}</strong>.
                </span>
              </div>
              
              <div style={{ 
                background: '#FFFBEB', 
                padding: '10px 15px', 
                borderRadius: '8px',
                marginTop: '10px',
                borderLeft: '4px solid #F59E0B'
              }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400E' }}>
                   Le délai de traitement est généralement de 2 à 3 jours ouvrés.
                </p>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowCertificatModal(false)}>Annuler</button>
              <button 
                className="btn-generer" 
                onClick={genererCertificatNonJouissance} 
                disabled={certificatLoading || (certificatVerification && certificatVerification.a_bteneficie)}
                style={{
                  background: (certificatVerification && certificatVerification.a_bteneficie) ? '#9CA3AF' : '#D4AF37',
                  color: (certificatVerification && certificatVerification.a_bteneficie) ? '#FFFFFF' : '#0B192C',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  cursor: (certificatVerification && certificatVerification.a_bteneficie) ? 'not-allowed' : 'pointer'
                }}
              >
                {certificatLoading ? '⏳ Vérification...' : '📤 Faire la demande →'}
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
                <span style={{ fontSize: '24px' }}></span> Accès refusé
              </h3>
              <button className="modal-close" onClick={() => setErrorModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '20px 20px 10px' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}></div>
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