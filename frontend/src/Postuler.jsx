import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UserMenu from './UserMenu';
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
  const [piecesRequises, setPiecesRequises] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

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
  }, [navigate]);

  const fetchPosteDetails = async (id) => {
    try {
      const res = await fetch(`http://localhost:8000/api/postes-vacants/`);
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

  const handleFileUpload = (type, file) => {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedFiles(prev => ({
        ...prev,
        [type]: {
          name: file.name,
          base64: reader.result
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      // 1. Créer la candidature
      const candidatureRes = await fetch('http://localhost:8000/api/candidatures/postuler/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: userInfo.matricule,
          poste_id: posteId
        })
      });

      const candidatureData = await candidatureRes.json();
      
      if (!candidatureRes.ok) {
        setMessage({ type: 'error', text: candidatureData.error || 'Erreur lors du dépôt' });
        setSubmitting(false);
        return;
      }

      const candidatureId = candidatureData.candidature_id;
      
      // 2. Uploader tous les fichiers
      for (const [type, fileData] of Object.entries(uploadedFiles)) {
        await fetch(`http://localhost:8000/api/candidatures/${candidatureId}/upload-piece/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type_document: type,
            file_base64: fileData.base64,
            file_name: fileData.name
          })
        });
      }

      // 3. LANCER L'ANALYSE IA APRÈS L'UPLOAD
      const analyseRes = await fetch(`http://localhost:8000/api/candidatures/${candidatureId}/analyser/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const analyseData = await analyseRes.json();

      setMessage({ 
        type: 'success', 
        text: `✅ Candidature envoyée avec succès ! Score IA: ${analyseData.score || candidatureData.score}/100` 
      });
      
      setTimeout(() => {
        localStorage.removeItem('selectedPosteId');
        localStorage.removeItem('selectedPosteIntitule');
        navigate('/');
      }, 3000);

    } catch (error) {
      console.error('Erreur:', error);
      setMessage({ type: 'error', text: 'Erreur de connexion au serveur' });
    } finally {
      setSubmitting(false);
    }
  };

  const getFileIcon = (type) => {
    const icons = {
      'CV': '📄',
      'LM': '📝',
      'DIPLOME': '🎓',
      'ATTESTATION': '📑',
      'CNI': '🪪'
    };
    return icons[type] || '📎';
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
        {/* Hero section plus petite pour ce formulaire */}
        <section className="demarches-hero" style={{ padding: '3rem 2rem' }}>
          <div className="demarches-hero-content">
            <h1>📝 Candidature interne</h1>
            <p>Postulez pour une opportunité de carrière au sein du Ministère</p>
          </div>
        </section>

        {/* Formulaire centré */}
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
            
            {/* Message de succès/erreur */}
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
                
                {/* Carte d'information du candidat */}
                <div style={{
                  background: 'linear-gradient(135deg, #0B192C 0%, #1E2E44 100%)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  marginBottom: '2rem',
                  color: 'white'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '2rem' }}>👤</span>
                    <div>
                      <h3 style={{ margin: 0, color: '#D4AF37' }}>{userInfo.prenom} {userInfo.nom}</h3>
                      <p style={{ margin: '4px 0 0 0', opacity: 0.8, fontSize: '0.85rem' }}>Matricule: {userInfo.matricule}</p>
                    </div>
                  </div>
                </div>

                {/* Carte du poste */}
                <div style={{
                  background: '#F8FAFC',
                  borderRadius: '16px',
                  padding: '1.2rem 1.5rem',
                  marginBottom: '2rem',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.8rem' }}>📌</span>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Poste convoité</p>
                      <h3 style={{ margin: '4px 0 0 0', color: '#0B192C' }}>{poste?.intitule || 'Chargement...'}</h3>
                    </div>
                  </div>
                </div>

                {/* Pièces jointes */}
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.2rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>📎</span>
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
                                Format acceptés: PDF, DOC, JPG, PNG
                              </p>
                            </div>
                          </div>
                          {uploadedFiles[piece] ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ color: '#059669', fontSize: '0.85rem' }}>✅ {uploadedFiles[piece].name}</span>
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
                              background: '#0B192C',
                              color: 'white',
                              padding: '8px 18px',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: '500',
                              transition: 'all 0.2s',
                              display: 'inline-block'
                            }}>
                              📂 Choisir un fichier
                              <input
                                type="file"
                                accept=".pdf,.doc,.docx,.jpg,.png,.jpeg"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFileUpload(piece, e.target.files[0])}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Boutons */}
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
                    {submitting ? '⏳ Envoi en cours...' : '📤 Soumettre ma candidature'}
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
                      ⚠️ Veuillez joindre toutes les pièces requises avant de soumettre
                    </span>
                  </div>
                )}

                {/* Score d'éligibilité (si déjà calculé) */}
                {poste?.diplomeRequis && (
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '12px',
                    background: '#EFF6FF',
                    borderRadius: '10px',
                    textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '0.75rem', color: '#2563EB' }}>
                      💡 Diplôme requis: {poste.diplomeRequis}
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
        </div>
        <div className="footer-bottom-bar">
          <p>© 2026 Ministère du Numérique et de la Digitalisation — République du Bénin.</p>
        </div>
      </footer>
    </div>
  );
}