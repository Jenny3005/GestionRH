import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import './App.css';

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

export default function Profil() {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [signaturePreview, setSignaturePreview] = useState(null);
  const [cachetPreview, setCachetPreview] = useState(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [cachetLoading, setCachetLoading] = useState(false);

  const signatureInputRef = useRef(null);
  const cachetInputRef = useRef(null);

  const [userInfo, setUserInfo] = useState({
    matricule: localStorage.getItem('userMatricule') || '',
    nom: localStorage.getItem('userNom') || '',
    prenom: localStorage.getItem('userPrenom') || '',
    email: localStorage.getItem('userEmail') || '',
    telephone: '',
    poste: '',
    direction: '',
    typecontrat: '',
    date_prise_service: '',
    date_naissance: '',
    adresse: '',
    corps: '',
    echelon: '',
    // Nouveaux champs complémentaires
    lieu_naissance: '',
    dialectes: '',
    date_mariage: '',
  });

  const matricule = localStorage.getItem('userMatricule');
  const rawRole = localStorage.getItem('userRole');
  const userRole = normalizeRole(rawRole);

  const canManageSignatureCachet = userRole === 'dpaf' || userRole === 'dapaf';

  const getRoleLabel = () => {
    if (userRole === 'dpaf') return "Directeur de la Planification, de l'Administration et des Finances";
    if (userRole === 'dapaf') return "Directeur des Affaires Politiques, Administratives et Financières";
    return '';
  };

  useEffect(() => {
    if (!matricule) { navigate('/auth'); return; }
    fetchUserInfo();
    if (canManageSignatureCachet) fetchSignatureCachet();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const response = await fetch(`/api/agent/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        setUserInfo({
          matricule: data.matricule || '',
          nom: data.nom || '',
          prenom: data.prenom || '',
          email: data.email || '',
          telephone: data.telephone || '',
          poste: data.poste || 'Agent',
          direction: data.direction || 'À renseigner',
          typecontrat: data.typecontrat || 'APE',
          date_prise_service: data.date_prise_service || '',
          date_naissance: data.date_naissance || '',
          adresse: data.adresse || '',
          corps: data.corps || '',
          echelon: data.echelon || '',
          // Nouveaux champs
          lieu_naissance: data.lieu_naissance || '',
          dialectes: data.dialectes || '',
          date_mariage: data.date_mariage || '',
        });
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const fetchSignatureCachet = async () => {
    try {
      const response = await fetch(`/api/agent/signature-cachet/${matricule}/`);
      if (response.ok) {
        const data = await response.json();
        if (data.signature) setSignaturePreview(data.signature);
        if (data.cachet) setCachetPreview(data.cachet);
      }
    } catch (error) {
      console.error('Erreur chargement signature:', error);
    }
  };

  const handleSignatureUpload = async (e) => {
    if (!canManageSignatureCachet) return;
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.match('image.*')) { alert('Veuillez sélectionner une image (PNG, JPEG)'); return; }
    if (file.size > 2 * 1024 * 1024) { alert("L'image ne doit pas dépasser 2MB"); return; }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      setSignaturePreview(base64);
      setSignatureLoading(true);
      try {
        const response = await fetch(`/api/agent/upload-signature/${matricule}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature: base64 })
        });
        if (response.ok) {
          setSuccessMessage('✅ Signature enregistrée avec succès');
          setTimeout(() => setSuccessMessage(''), 3000);
        } else {
          const error = await response.json();
          alert(error.error || "Erreur lors de l'enregistrement");
        }
      } catch (error) {
        alert('Erreur de connexion');
      } finally {
        setSignatureLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCachetUpload = async (e) => {
    if (!canManageSignatureCachet) return;
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.match('image.*')) { alert('Veuillez sélectionner une image (PNG, JPEG)'); return; }
    if (file.size > 2 * 1024 * 1024) { alert("L'image ne doit pas dépasser 2MB"); return; }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      setCachetPreview(base64);
      setCachetLoading(true);
      try {
        const response = await fetch(`/api/agent/upload-cachet/${matricule}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cachet: base64 })
        });
        if (response.ok) {
          setSuccessMessage('✅ Cachet officiel enregistré avec succès');
          setTimeout(() => setSuccessMessage(''), 3000);
        } else {
          const error = await response.json();
          alert(error.error || "Erreur lors de l'enregistrement");
        }
      } catch (error) {
        alert('Erreur de connexion');
      } finally {
        setCachetLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSignature = async () => {
    if (!canManageSignatureCachet) return;
    if (window.confirm('Voulez-vous vraiment supprimer votre signature ?')) {
      try {
        const response = await fetch(`/api/agent/delete-signature/${matricule}/`, { method: 'DELETE' });
        if (response.ok) {
          setSignaturePreview(null);
          setSuccessMessage('✅ Signature supprimée');
          setTimeout(() => setSuccessMessage(''), 3000);
        }
      } catch (error) { alert('Erreur de connexion'); }
    }
  };

  const handleDeleteCachet = async () => {
    if (!canManageSignatureCachet) return;
    if (window.confirm('Voulez-vous vraiment supprimer votre cachet ?')) {
      try {
        const response = await fetch(`/api/agent/delete-cachet/${matricule}/`, { method: 'DELETE' });
        if (response.ok) {
          setCachetPreview(null);
          setSuccessMessage('✅ Cachet supprimé');
          setTimeout(() => setSuccessMessage(''), 3000);
        }
      } catch (error) { alert('Erreur de connexion'); }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserInfo(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');
    try {
      const response = await fetch(`/api/agent/${matricule}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userInfo)
      });
      if (response.ok) {
        setSuccessMessage('Informations mises à jour avec succès !');
        localStorage.setItem('userNom', userInfo.nom);
        localStorage.setItem('userPrenom', userInfo.prenom);
        localStorage.setItem('userEmail', userInfo.email);
        setIsEditing(false);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const data = await response.json();
        setErrorMessage(data.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      setErrorMessage('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleDateString('fr-FR'); }
    catch { return dateStr; }
  };

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
        </div>
        <PortalNav />
        <div className="nav-right"><UserMenu /></div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Mon profil</h2>
            <p>Consultez et modifiez vos informations personnelles et administratives.</p>
          </div>
        </section>

        {/* Boutons action */}
        <div className="profil-actions-top">
          {!isEditing ? (
            <button className="btn-edit-profil-top" onClick={() => setIsEditing(true)}>
              ✏️ Modifier mon profil
            </button>
          ) : (
            <div className="edit-actions-top">
              <button className="btn-save-top" onClick={handleSave} disabled={loading}>
                {loading ? 'Enregistrement...' : '💾 Enregistrer'}
              </button>
              <button className="btn-cancel-top" onClick={() => { setIsEditing(false); fetchUserInfo(); }}>
                ❌ Annuler
              </button>
            </div>
          )}
        </div>

        {successMessage && (
          <div className="alert-success">
            <span className="alert-icon">✅</span>
            <span>{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="alert-error">
            <span className="alert-icon">❌</span>
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="agent-profile-section">
          <div className="agent-info-grid">

            {/* Carte 1 : Informations personnelles */}
            <div className="agent-card">
              <div className="agent-card-header">
                <h3>📋 Informations personnelles</h3>
              </div>
              <div className="agent-card-content">
                <div className="info-row">
                  <label>Matricule</label>
                  <span className="readonly-value">{userInfo.matricule}</span>
                </div>
                <div className="info-row">
                  <label>Nom *</label>
                  {isEditing ? <input type="text" name="nom" value={userInfo.nom} onChange={handleInputChange} required />
                    : <span>{userInfo.nom || '-'}</span>}
                </div>
                <div className="info-row">
                  <label>Prénom *</label>
                  {isEditing ? <input type="text" name="prenom" value={userInfo.prenom} onChange={handleInputChange} required />
                    : <span>{userInfo.prenom || '-'}</span>}
                </div>
                <div className="info-row">
                  <label>Date de naissance</label>
                  {isEditing ? <input type="date" name="date_naissance" value={userInfo.date_naissance} onChange={handleInputChange} />
                    : <span>{formatDate(userInfo.date_naissance)}</span>}
                </div>
                <div className="info-row">
                  <label>Lieu de naissance</label>
                  {isEditing ? (
                    <input type="text" name="lieu_naissance" value={userInfo.lieu_naissance} onChange={handleInputChange} placeholder="Ex : Cotonou" />
                  ) : <span>{userInfo.lieu_naissance || 'Non renseigné'}</span>}
                </div>
                <div className="info-row">
                  <label>Téléphone</label>
                  {isEditing ? <input type="tel" name="telephone" value={userInfo.telephone} onChange={handleInputChange} />
                    : <span>{userInfo.telephone || 'Non renseigné'}</span>}
                </div>
                <div className="info-row">
                  <label>Email professionnel</label>
                  {isEditing ? <input type="email" name="email" value={userInfo.email} onChange={handleInputChange} required />
                    : <span>{userInfo.email}</span>}
                </div>
                <div className="info-row">
                  <label>Adresse personnelle</label>
                  {isEditing ? <textarea name="adresse" value={userInfo.adresse} onChange={handleInputChange} rows="2" placeholder="Ex : Quartier, Ville, Code postal" />
                    : <span>{userInfo.adresse || 'Non renseignée'}</span>}
                </div>
              </div>
            </div>

            {/* Carte 2 : Informations professionnelles */}
            <div className="agent-card">
              <div className="agent-card-header">
                <h3>💼 Informations professionnelles</h3>
              </div>
              <div className="agent-card-content">
                <div className="info-row">
                  <label>Poste occupé</label>
                  {isEditing ? <input type="text" name="poste" value={userInfo.poste} onChange={handleInputChange} />
                    : <span>{userInfo.poste || 'Agent'}</span>}
                </div>
                <div className="info-row">
                  <label>Direction / Service</label>
                  {isEditing ? <input type="text" name="direction" value={userInfo.direction} onChange={handleInputChange} />
                    : <span>{userInfo.direction || 'À renseigner'}</span>}
                </div>
                <div className="info-row">
                  <label>Type de contrat</label>
                  {isEditing ? (
                    <select name="typecontrat" value={userInfo.typecontrat} onChange={handleInputChange}>
                      <option value="APE">APE</option>
                      <option value="ACDPE">ACDPE</option>
                      <option value="ACE">ACE</option>
                      <option value="AAE">AAE</option>
                    </select>
                  ) : <span>{userInfo.typecontrat || 'APE'}</span>}
                </div>
                <div className="info-row">
                  <label>Date de prise de service</label>
                  {isEditing ? <input type="date" name="date_prise_service" value={userInfo.date_prise_service} onChange={handleInputChange} />
                    : <span>{formatDate(userInfo.date_prise_service)}</span>}
                </div>
              </div>
            </div>

            {/* Carte 3 : Informations de carrière */}
            <div className="agent-card">
              <div className="agent-card-header">
                <h3>📈 Informations de carrière</h3>
              </div>
              <div className="agent-card-content">
                <div className="info-row">
                  <label>Corps</label>
                  {isEditing ? <input type="text" name="corps" value={userInfo.corps} onChange={handleInputChange} placeholder="Ex: Ingénieur des Travaux Informatiques" />
                    : <span>{userInfo.corps || 'Non renseigné'}</span>}
                </div>
                <div className="info-row">
                  <label>Échelon</label>
                  {isEditing ? <input type="text" name="echelon" value={userInfo.echelon} onChange={handleInputChange} placeholder="Ex: A1-6" />
                    : <span>{userInfo.echelon || 'Non renseigné'}</span>}
                </div>
                <div className="info-row">
                  <label>Ancienneté</label>
                  <span>
                    {userInfo.date_prise_service ? (() => {
                      const start = new Date(userInfo.date_prise_service);
                      const now = new Date();
                      let years = now.getFullYear() - start.getFullYear();
                      if (now.getMonth() < start.getMonth()) years--;
                      return `${years} an${years > 1 ? 's' : ''}`;
                    })() : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Carte 4 : Informations complémentaires */}
            <div className="agent-card">
              <div className="agent-card-header">
                <h3>📝 Informations complémentaires</h3>
                <span style={{ fontSize: '11px', color: '#6b7280', background: '#F3F4F6', padding: '3px 8px', borderRadius: '10px' }}>
                  Utilisées pour votre bulletin de notes
                </span>
              </div>
              <div className="agent-card-content">
                <div className="info-row">
                  <label>Dialectes parlés</label>
                  {isEditing ? (
                    <input type="text" name="dialectes" value={userInfo.dialectes}
                      onChange={handleInputChange} placeholder="Ex : Fon, Yoruba" />
                  ) : <span>{userInfo.dialectes || 'Non renseigné'}</span>}
                </div>
                <div className="info-row">
                  <label>Date de mariage</label>
                  {isEditing ? (
                    <input type="date" name="date_mariage" value={userInfo.date_mariage}
                      onChange={handleInputChange} />
                  ) : <span>{userInfo.date_mariage ? formatDate(userInfo.date_mariage) : 'Non renseigné'}</span>}
                </div>
              </div>
            </div>

          </div>

          {/* Section Signature & Cachet — DPAF / DAPAF uniquement */}
          {canManageSignatureCachet && (
            <div className="signature-cachet-card">
              <div className="card-header">
                <h3>✍️ Signature & Cachet officiel</h3>
                <p className="card-subtitle">Espace réservé au {getRoleLabel()}</p>
              </div>
              <div className="signature-cachet-grid">

                {/* Signature */}
                <div className="signature-box">
                  <h4>📝 Ma signature</h4>
                  <div className="preview-area">
                    {signaturePreview ? (
                      <div className="preview-container">
                        <img src={signaturePreview} alt="Signature" className="signature-img" />
                        <button className="btn-delete" onClick={handleDeleteSignature} disabled={signatureLoading} title="Supprimer">🗑️</button>
                      </div>
                    ) : (
                      <div className="empty-preview">
                        <span>✍️</span>
                        <p>Aucune signature</p>
                      </div>
                    )}
                  </div>
                  <button className="btn-upload" onClick={() => signatureInputRef.current.click()} disabled={signatureLoading}>
                    {signatureLoading ? 'Chargement...' : (signaturePreview ? '📤 Changer' : '📤 Télécharger')}
                  </button>
                  <input type="file" ref={signatureInputRef} accept="image/png,image/jpeg,image/jpg"
                    onChange={handleSignatureUpload} style={{ display: 'none' }} />
                  <p className="help-text">PNG/JPEG, max 2MB (fond transparent recommandé)</p>
                </div>

                {/* Cachet */}
                <div className="cachet-box">
                  <h4>🏛️ Mon cachet officiel</h4>
                  <div className="preview-area">
                    {cachetPreview ? (
                      <div className="preview-container">
                        <img src={cachetPreview} alt="Cachet" className="cachet-img" />
                        <button className="btn-delete" onClick={handleDeleteCachet} disabled={cachetLoading} title="Supprimer">🗑️</button>
                      </div>
                    ) : (
                      <div className="empty-preview">
                        <span>🏛️</span>
                        <p>Aucun cachet</p>
                      </div>
                    )}
                  </div>
                  <button className="btn-upload" onClick={() => cachetInputRef.current.click()} disabled={cachetLoading}>
                    {cachetLoading ? 'Chargement...' : (cachetPreview ? '📤 Changer' : '📤 Télécharger')}
                  </button>
                  <input type="file" ref={cachetInputRef} accept="image/png,image/jpeg,image/jpg"
                    onChange={handleCachetUpload} style={{ display: 'none' }} />
                  <p className="help-text warning">⚠️ Le cachet engage officiellement votre service</p>
                </div>

              </div>
            </div>
          )}
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