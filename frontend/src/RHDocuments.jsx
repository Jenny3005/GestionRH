import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './App.css';

export default function RHDocuments() {
  const { matricule } = useParams();
  const navigate = useNavigate();
  const [agentInfo, setAgentInfo] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [missingDocs, setMissingDocs] = useState([]);
  const [dossierData, setDossierData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const rhMatricule = localStorage.getItem('userMatricule');

  useEffect(() => {
    if (!matricule) return;
    loadDocuments();
  }, [matricule]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/rh/documents/${matricule}/`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Matricule': rhMatricule
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAgentInfo(data.agent);
        setDocuments(data.documents || []);
        setMissingDocs(data.missing_documents || []);
        setDossierData(data.dossier);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Upload de document pour le compte de l'agent
  const handleUpload = async (typePieceId, file) => {
    if (!file) return;
    
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      showNotification('Format non supporté (PDF, JPG, PNG uniquement)', 'error');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      showNotification('Fichier trop volumineux (max 5MB)', 'error');
      return;
    }
    
    showNotification('Upload en cours...', 'info');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const formData = new FormData();
      formData.append('matricule', matricule);  // ✅ Matricule de l'agent cible
      formData.append('type_piece_id', typePieceId);
      formData.append('file_base64', e.target.result);
      formData.append('file_name', file.name);
      
      try {
        const response = await fetch('/api/documents/upload/', {
          method: 'POST',
          headers: { 'X-User-Matricule': rhMatricule },
          body: formData
        });
        
        if (response.ok) {
          showNotification(`✅ Document importé avec succès`, 'success');
          loadDocuments();
        } else {
          const data = await response.json();
          showNotification(`Erreur: ${data.error}`, 'error');
        }
      } catch (error) {
        showNotification('Erreur lors de l\'upload', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = async (pieceId) => {
    try {
      const response = await fetch(`/api/documents/download/${pieceId}/?matricule=${matricule}`, {
        headers: { 'X-User-Matricule': rhMatricule }
      });
      if (response.ok) {
        const data = await response.json();
        const link = document.createElement('a');
        link.href = `data:${data.mime_type || 'application/pdf'};base64,${data.file_base64}`;
        link.download = data.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Erreur téléchargement:', error);
    }
  };

  const handleReplace = (typePieceId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = (e) => handleUpload(typePieceId, e.target.files[0]);
    input.click();
  };

  const handleDelete = async (pieceId) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce document ?')) return;
    
    try {
        const response = await fetch(`/api/documents/delete/${pieceId}/`, {
        method: 'DELETE',
        headers: { 'X-User-Matricule': rhMatricule }
        });
        
        if (response.ok) {
        showNotification('✅ Document supprimé', 'success');
        loadDocuments();
        } else {
        const data = await response.json();
        showNotification(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
    };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '100px' }}>Chargement du dossier...</div>;

  return (
    <div className="intranet-home">
      {notification && (
        <div className={`notification-toast ${notification.type}`}>{notification.message}</div>
      )}
      
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <a href="/" className="logo-nav-link">
            <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </a>
        </div>
        <div className="nav-right" style={{ padding: '15px' }}>
          <button className="btn-rh-secondary" onClick={() => navigate('/rh/dashboard')}>
            ← Retour
          </button>
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>📁 Dossier de {agentInfo?.prenom} {agentInfo?.nom}</h2>
            <p>Matricule : {agentInfo?.matricule} | Complétude : {dossierData?.taux_completude || 0}%</p>
          </div>
        </section>

        {/* ✅ Documents manquants avec bouton d'ajout */}
        {missingDocs.length > 0 && (
          <section className="missing-reminder-section">
            <div className="missing-reminder-card">
              <div className="missing-reminder-header">
                <span>⚠️</span>
                <strong>Documents obligatoires manquants ({missingDocs.length})</strong>
              </div>
              <div className="missing-docs-list">
                {missingDocs.map(doc => (
                  <div key={doc.id} className="missing-doc-row">
                    <span>📄 {doc.libelle}</span>
                    <label className="missing-doc-upload">
                      📤 Importer
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleUpload(doc.id, e.target.files[0])}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ✅ Documents importés avec actions */}
        <div className="rh-card full-width" style={{ margin: '20px' }}>
          <div className="rh-card-header">
            <h3>📄 Documents importés ({documents.length})</h3>
          </div>
          <div className="rh-table-container">
            <table className="rh-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Date d'import</th>
                  <th>Expiration</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center' }}>Aucun document</td></tr>
                ) : (
                  documents.map(doc => (
                    <tr key={doc.id}>
                      <td>📄 {doc.type_piece_libelle}</td>
                      <td>{new Date(doc.date_upload).toLocaleDateString('fr-FR')}</td>
                      <td>{doc.date_expiration ? new Date(doc.date_expiration).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <span className={`status-badge ${doc.est_expire ? 'status-rejected' : 'status-approved'}`}>
                          {doc.est_expire ? 'Expiré' : 'Valide'}
                        </span>
                      </td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" onClick={() => handleDownload(doc.id)} title="Télécharger">📥</button>
                        <button className="btn-icon" onClick={() => handleReplace(doc.type_piece_id)} title="Remplacer">📝</button>
                        <button className="btn-icon" onClick={() => handleDelete(doc.id)} title="Supprimer">🗑️</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ✅ Ajouter un document (tous types) */}
        <div className="rh-card full-width" style={{ margin: '20px' }}>
        <div className="rh-card-header">
            <h3>➕ Ajouter un document</h3>
        </div>
        <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="form-group">
                <label>Type de document</label>
                <select id="typePieceSelect" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd', minWidth: '250px' }}>
                <option value="">Sélectionner un type...</option>
                <option value="1">🆔 Carte Nationale d'Identité</option>
                <option value="2">📄 Acte de naissance sécurisé ANIP</option>
                <option value="3">📄 Certificat de nationalité</option>
                <option value="4">🎓 Diplômes et attestations de formation</option>
                <option value="5">📜 Décision de nomination</option>
                <option value="6">📋 Certificat de prise de service</option>
                <option value="7">⭐ Acte d'avancement</option>
                <option value="8">🏥 Certificat médical</option>
                <option value="9">✈️ Autorisation d'absence</option>
                <option value="10">🏖️ Titre de congé</option>
                <option value="11">📑 Attestation de travail</option>
                <option value="12">📑 Attestation de présence au poste</option>
                </select>
            </div>
            <label className="btn-rh-primary" style={{ cursor: 'pointer', padding: '10px 20px' }}>
                📤 Importer le document
                <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                    const typeId = document.getElementById('typePieceSelect').value;
                    if (!typeId) {
                    alert('Veuillez sélectionner un type de document');
                    return;
                    }
                    handleUpload(parseInt(typeId), e.target.files[0]);
                }}
                style={{ display: 'none' }}
                />
            </label>
            </div>
        </div>
        </div>
      </main>
    </div>
  );
}