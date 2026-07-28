import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import UserMenu from './UserMenu';
import { LayoutDashboard, Settings2, Users, ShieldCheck, FileText, FilePlus2, UserCircle2, LogOut, ChevronDown, ChevronRight, MapPin, Phone, Mail, UserRound, Paperclip } from 'lucide-react';
import './App.css';

export default function Postuler() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState({
    nom: localStorage.getItem('userNom') || '',
    prenom: localStorage.getItem('userPrenom') || '',
    matricule: localStorage.getItem('userMatricule') || '',
    email: localStorage.getItem('userEmail') || '',
  });
  
  const [poste, setPoste] = useState(null);
  const [posteId, setPosteId] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [piecesRequises, setPiecesRequises] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    const matricule = localStorage.getItem('userMatricule');
    if (!matricule) {
      navigate('/auth');
      return;
    }

    const selectedPosteId = localStorage.getItem('selectedPosteId');
    const selectedPosteIntitule = localStorage.getItem('selectedPosteIntitule');
    
    if (!selectedPosteId) {
      navigate('/');
      return;
    }

    setPosteId(selectedPosteId);
    setPoste({ intitule: selectedPosteIntitule, id: selectedPosteId });
    
    fetchPosteDetails(selectedPosteId);

    return () => { isMounted.current = false; };
  }, [navigate]);

  const fetchPosteDetails = async (id) => {
    try {
      const res = await fetch(`/api/postes-vacants/`);
      if (res.ok) {
        const data = await res.json();
        const posteTrouve = data.find(p => p.id == id);
        if (posteTrouve) {
          setPoste(posteTrouve);
          setPiecesRequises(posteTrouve.pieces_requises || ['CV', 'LM']);
        }
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  // Fonction pour valider et encoder un fichier
  const handleFileUpload = (type, file) => {
    if (!file) return;
    
    //  Vérifications du fichier
    console.log(` Fichier ${type}:`, {
      name: file.name,
      size: `${(file.size / 1024).toFixed(2)} KB`,
      type: file.type
    });
    
    // Vérifier que le fichier n'est pas vide
    if (file.size === 0) {
      alert(` Le fichier ${file.name} est vide. Veuillez choisir un fichier valide.`);
      return;
    }
    
    // Vérifier la taille minimale (1 KB pour éviter les fichiers vides)
    if (file.size < 1024) {
      console.warn(` Attention: ${file.name} est très petit (${file.size} octets)`);
    }
    
    // Vérifier la taille maximale (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      alert(` Le fichier ${file.name} dépasse 10 MB. Veuillez le compresser.`);
      return;
    }
    
    // Vérifier le type de fichier
    const allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      alert(` Format non supporté pour ${file.name}. Formats acceptés: PDF, DOC, DOCX, JPG, PNG`);
      return;
    }
    
    // Mettre à jour la progression
    setUploadProgress(prev => ({ ...prev, [type]: 0 }));
    
    const reader = new FileReader();
    
    reader.onloadstart = () => {
      console.log(` Encodage de ${type}...`);
      setUploadProgress(prev => ({ ...prev, [type]: 50 }));
    };
    
    reader.onloadend = () => {
      const base64String = reader.result;
      const base64Length = base64String.length;
      
      console.log(`${type} encodé - Longueur Base64: ${(base64Length / 1024).toFixed(2)} KB`);
      
      // Vérifier que le Base64 a une taille raisonnable
      if (base64Length < 200) {
        console.error(` ERREUR: Base64 trop court (${base64Length}) pour ${file.name}`);
        alert(` Erreur: Le fichier ${file.name} n'a pas pu être encodé correctement.`);
        setUploadProgress(prev => ({ ...prev, [type]: 0 }));
        return;
      }
      
      setUploadedFiles(prev => ({
        ...prev,
        [type]: {
          name: file.name,
          base64: base64String,
          size: file.size,
          type: file.type
        }
      }));
      
      setUploadProgress(prev => ({ ...prev, [type]: 100 }));
      
      // Effacer la progression après 1 seconde
      setTimeout(() => {
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[type];
          return newProgress;
        });
      }, 1000);
    };
    
    reader.onerror = (error) => {
      console.error(' Erreur lecture fichier:', error);
      alert(` Impossible de lire le fichier ${file.name}`);
      setUploadProgress(prev => ({ ...prev, [type]: 0 }));
    };
    
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      // Vérifier que tous les fichiers sont uploadés
      const missingFiles = piecesRequises.filter(p => !uploadedFiles[p]);
      if (missingFiles.length > 0) {
        setMessage({ 
          type: 'error', 
          text: `Veuillez joindre: ${missingFiles.join(', ')}` 
        });
        setSubmitting(false);
        return;
      }

      // 1. Créer la candidature
      console.log(' Création de la candidature...');
      const candidatureRes = await fetch('/api/candidatures/postuler/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: userInfo.matricule,
          poste_id: parseInt(posteId)
        })
      });

      const candidatureData = await candidatureRes.json();
      
      if (!candidatureRes.ok) {
        setMessage({ type: 'error', text: candidatureData.error || 'Erreur lors du dépôt' });
        setSubmitting(false);
        return;
      }

      const candidatureId = candidatureData.candidature_id;
      console.log(` Candidature créée avec ID: ${candidatureId}`);
      
      // 2. Uploader tous les fichiers un par un
      let uploadErrors = [];
      
      for (const [type, fileData] of Object.entries(uploadedFiles)) {
        console.log(` Upload ${type} - Taille: ${(fileData.base64.length / 1024).toFixed(2)} KB`);
        
        try {
          const uploadRes = await fetch(`/api/candidatures/${candidatureId}/upload-piece/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type_document: type,
              file_base64: fileData.base64,
              file_name: fileData.name
            })
          });
          
          const uploadData = await uploadRes.json();
          console.log(` Réponse upload ${type}:`, uploadData);
          
          if (!uploadRes.ok) {
            uploadErrors.push(`${type}: ${uploadData.error}`);
          } else {
            console.log(` ${type} uploadé avec succès`);
          }
        } catch (error) {
          console.error(` Erreur upload ${type}:`, error);
          uploadErrors.push(`${type}: ${error.message}`);
        }
      }
      
      if (uploadErrors.length > 0) {
        setMessage({ 
          type: 'error', 
          text: `Erreurs d'upload: ${uploadErrors.join('; ')}` 
        });
        setSubmitting(false);
        return;
      }

      
      // L'analyse se fait automatiquement en arrière-plan
      
      setMessage({ 
        type: 'success', 
        text: 'Candidature envoyée avec succès ! L\'analyse IA est en cours en arrière-plan.' 
      });
      setIsPolling(true);
      pollCandidatureStatus(candidatureId);

      // Nettoyer et rediriger après 10 secondes si l'utilisateur n'est pas déjà parti
      setTimeout(() => {
        if (isMounted.current) {
          localStorage.removeItem('selectedPosteId');
          localStorage.removeItem('selectedPosteIntitule');
          navigate('/');
        }
      }, 10000);

    } catch (error) {
      console.error(' Erreur globale:', error);
      setMessage({ type: 'error', text: 'Erreur de connexion au serveur: ' + error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const pollCandidatureStatus = async (candidatureId, attempt = 1) => {
    const MAX_ATTEMPTS = 15;
    try {
      const response = await fetch(`/api/candidatures/${candidatureId}/status/`);
      if (!response.ok) {
        throw new Error(`Statut indisponible (${response.status})`);
      }
      const statusData = await response.json();
      const analyseComplete = statusData.analyse_terminee;
      const score = statusData.score;
      if (analyseComplete) {
        if (!isMounted.current) return;
        setIsPolling(false);
        setMessage({
          type: 'success',
          text: ` Analyse IA terminée. Score: ${score}/100. Vous pouvez consulter votre dossier.`
        });
        return;
      }
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => pollCandidatureStatus(candidatureId, attempt + 1), 2000);
      } else {
        if (!isMounted.current) return;
        setIsPolling(false);
        setMessage({
          type: 'info',
          text: ' Analyse IA toujours en cours. Vous serez notifié lorsque le résultat sera prêt.'
        });
      }
    } catch (error) {
      if (!isMounted.current) return;
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => pollCandidatureStatus(candidatureId, attempt + 1), 2000);
      } else {
        setIsPolling(false);
        setMessage({
          type: 'info',
          text: ' Impossible de vérifier le statut de l\'analyse pour le moment. L\'analyse se poursuivra en arrière-plan.'
        });
      }
    }
  };

  const getFileIcon = (type) => {
    const icons = {
      'CV': '',
      'LM': '',
      'DIPLOME': '',
      'ATTESTATION': '',
      'CNI': ''
    };
    return icons[type] || '';
  };

  const getFileLabel = (type) => {
    const labels = {
      'CV': 'Curriculum Vitae',
      'LM': 'Lettre de motivation',
      'DIPLOME': 'Copie du diplôme',
      'ATTESTATION': 'Attestation de travail',
      'CNI': 'Carte d\'identité'
    };
    return labels[type] || type;
  };

  // Formater la taille du fichier
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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
          <a href="/" className="nav-tab-item">Accueil</a>
        </nav>
        <div className="nav-right">
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="demarches-hero" style={{ padding: '3rem 2rem' }}>
          <div className="demarches-hero-content">
            <h1> Candidature interne</h1>
            <p>Postulez pour une opportunité de carrière au sein du Ministère</p>
          </div>
        </section>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: '2rem',
          background: '#F8FAFC'
        }}>
          <div style={{ 
            maxWidth: '750px', 
            width: '100%',
            background: 'white',
            borderRadius: '24px',
            boxShadow: '0 20px 35px -10px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            marginBottom: '3rem'
          }}>
            
            {message && (
              <div style={{
                padding: '16px 24px',
                margin: '20px 24px 0 24px',
                borderRadius: '12px',
                background: message.type === 'success' ? '#D1FAE5' : '#FEE2E2',
                color: message.type === 'success' ? '#059669' : '#DC2626',
                borderLeft: `4px solid ${message.type === 'success' ? '#10B981' : '#EF4444'}`
              }}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ padding: '2rem' }}>
                
                <div style={{
                  background: 'linear-gradient(135deg, #0B192C 0%, #1E2E44 100%)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  marginBottom: '2rem',
                  color: 'white'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '2rem' }}></span>
                    <div>
                      <h3 style={{ margin: 0, color: '#D4AF37' }}>{userInfo.prenom} {userInfo.nom}</h3>
                      <p style={{ margin: '4px 0 0 0', opacity: 0.8, fontSize: '0.85rem' }}>Matricule: {userInfo.matricule}</p>
                    </div>
                  </div>
                </div>

                <div style={{
                  background: '#F8FAFC',
                  borderRadius: '16px',
                  padding: '1.2rem 1.5rem',
                  marginBottom: '2rem',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.8rem' }}></span>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Poste convoité</p>
                      <h3 style={{ margin: '4px 0 0 0', color: '#0B192C' }}>{poste?.intitule || 'Chargement...'}</h3>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.2rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}><Paperclip size={18} style={{ color: '#D4AF37' }} /></span>
                    <h3 style={{ margin: 0, color: '#0B192C', fontSize: '1.1rem' }}>Documents à fournir</h3>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {piecesRequises.map((piece) => (
                      <div key={piece} style={{
                        border: uploadedFiles[piece] ? '2px solid #10B981' : '1px solid #E2E8F0',
                        borderRadius: '14px',
                        padding: '1rem',
                        background: uploadedFiles[piece] ? '#F0FDF4' : '#FFFFFF',
                        transition: 'all 0.2s'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '1.8rem' }}>{getFileIcon(piece)}</span>
                            <div>
                              <strong style={{ color: '#0B192C', fontSize: '1rem' }}>{getFileLabel(piece)}</strong>
                              <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#64748B' }}>
                                Formats: PDF, DOC, DOCX, JPG, PNG
                              </p>
                            </div>
                          </div>
                          {uploadedFiles[piece] ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ color: '#059669', fontSize: '0.85rem' }}>
                                 {uploadedFiles[piece].name} ({formatFileSize(uploadedFiles[piece].size)})
                              </span>
                              <button
                                type="button"
                                onClick={() => setUploadedFiles(prev => {
                                  const newFiles = { ...prev };
                                  delete newFiles[piece];
                                  return newFiles;
                                })}
                                style={{
                                  background: '#FEE2E2',
                                  border: 'none',
                                  borderRadius: '8px',
                                  padding: '6px 12px',
                                  fontSize: '0.7rem',
                                  color: '#DC2626',
                                  cursor: 'pointer'
                                }}
                              >
                                Supprimer
                              </button>
                            </div>
                          ) : (
                            <label style={{
                              background: uploadProgress[piece] ? '#94A3B8' : '#0B192C',
                              color: 'white',
                              padding: '8px 18px',
                              borderRadius: '10px',
                              cursor: uploadProgress[piece] ? 'wait' : 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: '500',
                              transition: 'all 0.2s',
                              display: 'inline-block'
                            }}>
                              {uploadProgress[piece] ? ` ${uploadProgress[piece]}%` : ' Choisir un fichier'}
                              <input
                                type="file"
                                accept=".pdf,.doc,.docx,.jpg,.png,.jpeg"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFileUpload(piece, e.target.files[0])}
                                disabled={!!uploadProgress[piece]}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '15px',
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #E2E8F0'
                }}>
                  <button 
                    type="button" 
                    onClick={() => navigate('/')}
                    style={{
                      background: '#F1F5F9',
                      border: '1px solid #E2E8F0',
                      padding: '12px 28px',
                      borderRadius: '12px',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      color: '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.target.style.background = '#E2E8F0'; }}
                    onMouseLeave={(e) => { e.target.style.background = '#F1F5F9'; }}
                  >
                    ← Retour à l'accueil
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting || piecesRequises.some(p => !uploadedFiles[p])}
                    style={{
                      background: piecesRequises.some(p => !uploadedFiles[p]) ? '#94A3B8' : '#0B192C',
                      border: 'none',
                      padding: '12px 32px',
                      borderRadius: '12px',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      color: 'white',
                      cursor: piecesRequises.some(p => !uploadedFiles[p]) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {submitting ? ' Envoi en cours...' : ' Soumettre ma candidature'}
                  </button>
                </div>

                {piecesRequises.some(p => !uploadedFiles[p]) && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '10px',
                    background: '#FFFBEB',
                    borderRadius: '10px',
                    textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '0.8rem', color: '#D97706' }}>
                       Veuillez joindre toutes les pièces requises avant de soumettre
                    </span>
                  </div>
                )}

                {poste?.diplomeRequis && (
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '12px',
                    background: '#EFF6FF',
                    borderRadius: '10px',
                    textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '0.75rem', color: '#2563EB' }}>
                       Diplôme requis: {poste.diplomeRequis}
                    </span>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
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