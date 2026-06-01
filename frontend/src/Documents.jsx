import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav, { getDashboardPath, getRoleLabel } from './PortalNav';
import './App.css';

export default function Documents() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userMatricule, setUserMatricule] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [documents, setDocuments] = useState({});
  const [dossierData, setDossierData] = useState(null);
  const [missingDocs, setMissingDocs] = useState([]);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ✅ Types de pièces chargés dynamiquement
  const [documentTypes, setDocumentTypes] = useState({});
  const [categoryNames, setCategoryNames] = useState({});

  // ✅ Icônes par défaut par catégorie
  const categoryIcons = {
    identity: '🆔',
    academic: '🎓',
    career: '💼',
    medical: '🏥',
    leave: '✈️',
    attestations: '📑'
  };

  // Vérifier connexion
  useEffect(() => {
    const savedMatricule = localStorage.getItem('userMatricule');
    const savedNom = localStorage.getItem('userNom');
    const savedPrenom = localStorage.getItem('userPrenom');
    const savedEmail = localStorage.getItem('userEmail');
    const savedRole = localStorage.getItem('userRole');
    
    if (savedMatricule) {
      setIsLoggedIn(true);
      setUserName(`${savedPrenom} ${savedNom}`);
      setUserEmail(savedEmail);
      setUserRole(savedRole);
      setUserMatricule(savedMatricule);
      loadDocumentTypes(); // ✅ Charger les types d'abord
      loadDocumentsFromAPI(savedMatricule);
    } else {
      navigate('/auth');
    }
  }, [navigate]);

  // ✅ Charger les types de pièces depuis la base de données
  const loadDocumentTypes = async () => {
    try {
      const response = await fetch('/api/types-piece/');
      if (response.ok) {
        const types = await response.json();
        
        const typesMap = {};
        const categoriesMap = {};
        
        types.forEach(type => {
          // Déterminer la catégorie et l'icône selon le libellé
          let category = 'identity';
          let icon = '📄';
          const libelle = type.libelle.toLowerCase();
          
          if (libelle.includes('identité') || libelle.includes('identite')) {
            category = 'identity'; icon = '🆔';
          } else if (libelle.includes('naissance')) {
            category = 'identity'; icon = '📄';
          } else if (libelle.includes('nationalité') || libelle.includes('nationalite')) {
            category = 'identity'; icon = '📄';
          } else if (libelle.includes('diplôme') || libelle.includes('diplome') || libelle.includes('formation')) {
            category = 'academic'; icon = '🎓';
          } else if (libelle.includes('nomination')) {
            category = 'career'; icon = '📜';
          } else if (libelle.includes('prise de service')) {
            category = 'career'; icon = '📋';
          } else if (libelle.includes('avancement')) {
            category = 'career'; icon = '⭐';
          } else if (libelle.includes('médical') || libelle.includes('medical')) {
            category = 'medical'; icon = '🏥';
          } else if (libelle.includes('absence')) {
            category = 'leave'; icon = '✈️';
          } else if (libelle.includes('congé') || libelle.includes('conge')) {
            category = 'leave'; icon = '🏖️';
          } else if (libelle.includes('travail')) {
            category = 'attestations'; icon = '📑';
          } else if (libelle.includes('présence') || libelle.includes('presence')) {
            category = 'attestations'; icon = '📑';
          }
          
          typesMap[type.id] = {
            id: type.id,
            label: type.libelle,
            category: category,
            required: type.obligatoire === 1,
            hasExpiry: type.duree_validite ? true : false,
            icon: icon
          };
          
          // Construire les catégories
          if (!categoriesMap[category]) {
            categoriesMap[category] = { title: '', description: '', docs: [] };
          }
          categoriesMap[category].docs.push(type.id);
        });
        
        // Nommer les catégories
        if (categoriesMap['identity']) {
          categoriesMap['identity'].title = "Pièces d'identité & État civil";
          categoriesMap['identity'].description = "Documents officiels prouvant votre identité";
        }
        if (categoriesMap['academic']) {
          categoriesMap['academic'].title = "Diplômes & Formation";
          categoriesMap['academic'].description = "Diplômes et attestations de formation";
        }
        if (categoriesMap['career']) {
          categoriesMap['career'].title = "Documents de carrière";
          categoriesMap['career'].description = "Nominations, prises de service et avancements";
        }
        if (categoriesMap['medical']) {
          categoriesMap['medical'].title = "Documents médicaux";
          categoriesMap['medical'].description = "Certificats et justificatifs médicaux";
        }
        if (categoriesMap['leave']) {
          categoriesMap['leave'].title = "Congés & Absences";
          categoriesMap['leave'].description = "Autorisations d'absence et titres de congé";
        }
        if (categoriesMap['attestations']) {
          categoriesMap['attestations'].title = "Attestations";
          categoriesMap['attestations'].description = "Attestations diverses";
        }
        
        setDocumentTypes(typesMap);
        setCategoryNames(categoriesMap);
      }
    } catch (error) {
      console.error('Erreur chargement types:', error);
    }
  };

  // Charger les documents depuis l'API
  const loadDocumentsFromAPI = async (matricule) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/?matricule=${matricule}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Matricule': matricule
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        const docsMap = {};
        if (data.documents) {
          data.documents.forEach(doc => {
            docsMap[doc.type_piece_id] = {
              id: doc.id,
              fileName: doc.nom_fichier,
              uploadDate: doc.date_upload,
              expiryDate: doc.date_expiration,
              status: doc.est_expire ? 'expired' : 
                     (doc.jours_avant_expiration !== null && doc.jours_avant_expiration <= 30 ? 'warning' : 'valid')
            };
          });
        }
        
        setDocuments(docsMap);
        if (data.dossier) setDossierData(data.dossier);
        if (data.missing_documents) setMissingDocs(data.missing_documents);
      }
    } catch (error) {
      showNotification('Erreur de connexion au serveur', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Upload de document
  const uploadDocumentToAPI = async (typePieceId, fileBase64, fileName) => {
    const formData = new FormData();
    formData.append('matricule', userMatricule);
    formData.append('type_piece_id', typePieceId);
    formData.append('file_base64', fileBase64);
    formData.append('file_name', fileName);
    
    try {
      const response = await fetch('/api/documents/upload/', {
        method: 'POST',
        headers: { 'X-User-Matricule': userMatricule },
        body: formData
      });
      const data = await response.json();
      if (response.ok) return { success: true, data };
      else return { success: false, message: data.error || data.message || 'Erreur inconnue' };
    } catch (error) {
      return { success: false, message: error.message || 'Erreur de connexion' };
    }
  };

  // Gérer l'upload de fichier
  const handleFileUpload = async (documentKey, file) => {
    if (!file) return;
    const docDef = documentTypes[documentKey];
    if (!docDef) { showNotification('Type de document invalide', 'error'); return; }
    
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) { showNotification('Format non supporté (PDF, JPG, PNG uniquement)', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showNotification('Fichier trop volumineux (max 5MB)', 'error'); return; }
    
    showNotification('Upload en cours...', 'info');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = await uploadDocumentToAPI(documentKey, e.target.result, file.name);
        if (result.success) { showNotification(`"${file.name}" importé avec succès`, 'success'); await loadDocumentsFromAPI(userMatricule); }
        else { showNotification(`Erreur: ${result.message}`, 'error'); }
      } catch (error) { showNotification('Erreur lors de l\'upload', 'error'); }
    };
    reader.onerror = () => showNotification('Erreur de lecture du fichier', 'error');
    reader.readAsDataURL(file);
  };

  // Télécharger un document
  const downloadDocument = async (documentKey) => {
    const doc = documents[documentKey];
    if (!doc || !doc.fileName) { showNotification('Document non disponible', 'error'); return; }
    
    try {
      const response = await fetch(`/api/documents/download/${doc.id}/?matricule=${userMatricule}`, {
        method: 'GET', headers: { 'X-User-Matricule': userMatricule }
      });
      if (response.ok) {
        const data = await response.json();
        if (!data.file_base64 || data.file_base64.length === 0) { showNotification('Document vide ou corrompu', 'error'); return; }
        const link = document.createElement('a');
        const mimeType = data.mime_type || 'application/pdf';
        const base64Data = data.file_base64.startsWith('data:') ? data.file_base64 : `data:${mimeType};base64,${data.file_base64}`;
        link.href = base64Data;
        link.download = data.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification(`"${doc.fileName}" téléchargé`, 'success');
      } else {
        const error = await response.json();
        showNotification(`Erreur: ${error.error}`, 'error');
      }
    } catch (error) { showNotification('Erreur lors du téléchargement', 'error'); }
  };

  // Supprimer un document
  const handleDelete = async (pieceId) => {
    const doc = documents[pieceId];
    if (!doc || !doc.id) return;
    const docType = documentTypes[pieceId];
    const docLabel = docType?.label || doc.fileName;
    if (!window.confirm(`Voulez-vous vraiment supprimer "${docLabel}" ?`)) return;
    
    try {
      const response = await fetch(`/api/documents/delete/${doc.id}/`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-User-Matricule': userMatricule }
      });
      if (response.ok) await loadDocumentsFromAPI(userMatricule);
    } catch (error) {}
  };

  // Notification
  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.user-menu-container')) setDropdownOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  const handleLogout = () => { localStorage.clear(); navigate('/'); };
  const isRH = userRole === 'RH' || userRole === 'ADMIN' || userRole === 'rh' || userRole === 'admin';
  // ✅ Rendu des cartes dynamique
  const renderDocumentCards = (category) => {
    const catInfo = categoryNames[category];
    if (!catInfo || !catInfo.docs || catInfo.docs.length === 0) return null;
    
    return (
      <section className="docs-section">
        <div className="section-header-with-icon">
          <div className="header-icon">{categoryIcons[category] || '📄'}</div>
          <div>
            <h2>{catInfo.title}</h2>
            <p>{catInfo.description}</p>
          </div>
        </div>
        
        <div className="docs-grid">
          {catInfo.docs.map((typeId) => {
            const docDef = documentTypes[typeId];
            if (!docDef) return null;
            
            const doc = documents[typeId];
            const isUploaded = doc && doc.fileName;
            const isExpired = doc?.expiryDate && new Date(doc.expiryDate) < new Date();
            const isExpiringSoon = doc?.expiryDate && !isExpired && (new Date(doc.expiryDate) - new Date()) / (1000 * 60 * 60 * 24) <= 30;
            
            let status = 'missing';
            if (isUploaded) {
              if (isExpired) status = 'expired';
              else if (isExpiringSoon) status = 'warning';
              else status = 'valid';
            }
            
            return (
              <div key={typeId} className={`doc-card ${status === 'expired' ? 'expired' : ''} ${status === 'warning' ? 'warning' : ''}`}>
                <div className="doc-card-header">
                  <span className="doc-icon">{docDef.icon}</span>
                  {isUploaded && (
                    <span className={`doc-status-badge ${status}`}>
                      {status === 'expired' ? 'Expiré' : status === 'warning' ? 'Expire bientôt' : 'Validé'}
                    </span>
                  )}
                  {!isUploaded && docDef.required && (
                    <span className="doc-status-badge missing">Manquant</span>
                  )}
                  {!isUploaded && !docDef.required && (
                    <span className="doc-status-badge optional">Optionnel</span>
                  )}
                </div>
                
                <div className="doc-card-title">{docDef.label}</div>
                
                {isUploaded ? (
                  <>
                    <div className="doc-card-date">
                      {doc.expiryDate 
                        ? `Expire le ${new Date(doc.expiryDate).toLocaleDateString('fr-FR')}`
                        : `Importé le ${new Date(doc.uploadDate).toLocaleDateString('fr-FR')}`
                      }
                    </div>
                    <div className="doc-card-actions">
                      <button className="doc-card-btn" onClick={() => downloadDocument(typeId)}>
                        📄 Télécharger
                      </button>
                      <label className="doc-card-btn">
                        🔄 Remplacer
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFileUpload(typeId, e.target.files[0])} style={{ display: 'none' }} />
                      </label>
                      <button className="doc-card-btn" onClick={() => handleDelete(typeId)}>
                        🗑️ Supprimer
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="doc-card-missing">
                      {docDef.required ? 'Document obligatoire' : 'Document optionnel'}
                    </div>
                    <div className="doc-card-actions">
                      <label className="doc-card-btn">
                        📤 Importer
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFileUpload(typeId, e.target.files[0])} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  // ✅ Stats dynamiques
  const getUploadedCount = () => Object.keys(documents).length;
  
  const getRequiredUploadedCount = () => {
    return Object.entries(documentTypes)
      .filter(([, doc]) => doc.required && documents[doc.id])
      .length;
  };

  const getTotalRequired = () => {
    return Object.values(documentTypes).filter(doc => doc.required).length;
  };

  const completenessScore = dossierData?.taux_completude || 
    (getTotalRequired() > 0 ? Math.round((getRequiredUploadedCount() / getTotalRequired()) * 100) : 100);

  const missingDocumentsCount = missingDocs.length;

  // ✅ Documents expirés (utilise documentTypes dynamique)
  const getExpiredDocuments = () => {
    const expired = [];
    const today = new Date();
    Object.entries(documents).forEach(([key, doc]) => {
      if (doc && doc.expiryDate) {
        const expiryDate = new Date(doc.expiryDate);
        if (expiryDate < today) {
          expired.push({ docDef: documentTypes[key], doc });
        }
      }
    });
    return expired;
  };

  const getExpiringSoon = () => {
    const expiring = [];
    const today = new Date();
    Object.entries(documents).forEach(([key, doc]) => {
      if (doc && doc.expiryDate) {
        const expiryDate = new Date(doc.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
          expiring.push({ docDef: documentTypes[key], doc, daysUntilExpiry });
        }
      }
    });
    return expiring;
  };

  const expiredDocuments = getExpiredDocuments();
  const expiringSoon = getExpiringSoon();


  if (!isLoggedIn) {
    return null;
  }

  if (loading) {
    return (
      <div className="intranet-home">
        <header className="intranet-navbar">
          <div className="nav-left-zone">
            <a href="/" className="logo-nav-link">
              <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
            </a>
          </div>
          <PortalNav />
          <div className="nav-right"></div>
        </header>
        <main className="intranet-main" style={{ textAlign: 'center', padding: '100px' }}>
          <div>Chargement de vos documents...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="intranet-home">
      {/* Notification */}
      {notification && (
        <div className={`notification-toast ${notification.type}`}>
          {notification.message}
        </div>
      )}
      
      {/* BARRE DE NAVIGATION */}
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
        </div>

        <PortalNav />

        <div className="nav-right">
          <div className="user-menu-container">
            <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="avatar-circle">{userName.charAt(0) || 'U'}</div>
              <div className="user-meta">
                <span className="user-name">{userName}</span>
                <span className="user-role">{getRoleLabel(userRole)}</span>
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
                <button className="dropdown-item" onClick={() => navigate(getDashboardPath())}>
                  📊 Tableau de bord
                </button>
                <button className="dropdown-item" onClick={() => navigate('/profil')}>
                  👤 Mon profil
                </button>
                <button className="dropdown-item" onClick={() => navigate('/documents')}>
                  📁 Mes documents
                </button>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item logout" onClick={handleLogout}>
                  🔓 Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="intranet-main">
        
        {/* BANDEAU */}
        <section className="documents-hero">
          <div className="documents-hero-content">
            <h1>Mes Documents administratifs</h1>
            <p>Toutes vos pièces officielles, sécurisées et accessibles en ligne.</p>
            <div className="documents-stats">
              <div className="stat-card">
                <div className="stat-icon">📄</div>
                <span className="stat-number">{getUploadedCount()}</span>
                <span className="stat-label">Documents importés</span>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⚠️</div>
                <span className="stat-number">{missingDocumentsCount + expiredDocuments.length}</span>
                <span className="stat-label">Manquants ou expirés</span>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <span className="stat-number">{completenessScore}%</span>
                <span className="stat-label">Dossier complété</span>
              </div>
            </div>
          </div>
        </section>

        {/* ALERTES D'EXPIRATION */}
        {(expiredDocuments.length > 0 || expiringSoon.length > 0) && (
          <section className="alertes-section">
            <div className="alertes-header">
              <span className="alertes-icon">🔔</span>
              <h3>Alertes d'expiration</h3>
            </div>
            <div className="alertes-list">
              {expiredDocuments.map(({ docDef, doc }) => (
                <div key={docDef.id} className="alerte-card urgent">
                  <div className="alerte-icon">⚠️</div>
                  <div className="alerte-content">
                    <div className="alerte-title">
                      {docDef.label} expiré depuis le {new Date(doc.expiryDate).toLocaleDateString('fr-FR')}
                    </div>
                    <label className="alerte-action">
                      📤 Remplacer
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(docDef.id, e.target.files[0])}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>
              ))}
              
              {expiringSoon.map(({ docDef, doc, daysUntilExpiry }) => (
                <div key={docDef.id} className="alerte-card warning">
                  <div className="alerte-icon">⏰</div>
                  <div className="alerte-content">
                    <div className="alerte-title">
                      {docDef.label} expire dans {daysUntilExpiry} jours ({new Date(doc.expiryDate).toLocaleDateString('fr-FR')})
                    </div>
                    <label className="alerte-action secondary">
                      📤 Remplacer
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(docDef.id, e.target.files[0])}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RAPPEL DOCUMENTS MANQUANTS */}
        {missingDocs.length > 0 && (
          <section className="missing-reminder-section">
            <div className="missing-reminder-card">
              <div className="missing-reminder-header">
                <span className="missing-icon">⚠️</span>
                <div>
                  <strong>Documents obligatoires manquants</strong>
                  <span className="missing-count">{missingDocs.length} document{missingDocs.length > 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="missing-docs-list">
                {missingDocs.map(doc => (
                  <div key={doc.id} className="missing-doc-row">
                    <span className="missing-doc-icon">{documentTypes[doc.id]?.icon || '📄'}</span>
                    <span className="missing-doc-name">{doc.libelle}</span>
                    <label className="missing-doc-upload">
                      📤 Importer
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(doc.id, e.target.files[0])}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* TOUTES LES SECTIONS DE DOCUMENTS */}
        {renderDocumentCards('identity')}
        {renderDocumentCards('academic')}
        {renderDocumentCards('career')}
        {renderDocumentCards('medical')}
        {renderDocumentCards('leave')}
        {renderDocumentCards('attestations')}

        {/* SECTION RH */}
        {isRH && (
          <section className="docs-section rh-section">
            <div className="section-header-with-icon">
              <div className="header-icon">🔧</div>
              <div>
                <h2>Interface RH — Supervision</h2>
                <p>Accès superviseur : visualisation des dossiers agents</p>
              </div>
            </div>
            <div className="rh-info-card">
              <p>👑 <strong>Mode superviseur actif</strong></p>
              <p>✓ Consultation des dossiers agents</p>
              <p>✓ Actions tracées et horodatées</p>
            </div>
          </section>
        )}

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