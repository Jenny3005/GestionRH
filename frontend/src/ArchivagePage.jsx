import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UserMenu from './UserMenu';
import './App.css';

export default function ArchivagePage() {
  const navigate = useNavigate();
  const [actes, setActes] = useState([]);
  const [actesArchives, setActesArchives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedActes, setSelectedActes] = useState([]);
  const [filtreType, setFiltreType] = useState('');
  const [filtreDirection, setFiltreDirection] = useState('');
  const [filtreAnnee, setFiltreAnnee] = useState(new Date().getFullYear().toString());
  const [filtreMois, setFiltreMois] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const matricule = localStorage.getItem('userMatricule');

  useEffect(() => {
    if (!matricule) {
      navigate('/auth');
      return;
    }
    fetchActes();
  }, []);

  const fetchActes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/actes/archives/');
      if (res.ok) {
        const data = await res.json();
        setActes(data.filter(a => a.statut !== 'archive'));
        setActesArchives(data.filter(a => a.statut === 'archive'));
      }
    } catch (error) {
      console.error('Erreur chargement actes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiverUn = async (reference) => {
    if (!window.confirm(`Archiver l'acte ${reference} ?`)) return;
    try {
      const res = await fetch(`/api/actes/${encodeURIComponent(reference)}/archiver/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        fetchActes();
        setSelectedActes([]);
      } else {
        alert('❌ Erreur lors de l\'archivage');
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleArchiverSelection = async () => {
    if (selectedActes.length === 0) {
      alert('Aucun acte sélectionné');
      return;
    }
    if (!window.confirm(`Archiver ${selectedActes.length} acte(s) ?`)) return;
    
    for (const ref of selectedActes) {
      await fetch(`/api/actes/${encodeURIComponent(ref)}/archiver/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });
    }
    fetchActes();
    setSelectedActes([]);
  };

  const handleToutArchiver = async () => {
    if (!window.confirm(`Archiver tous les actes (${actes.length}) ?`)) return;
    
    for (const acte of actes) {
      await fetch(`/api/actes/${encodeURIComponent(acte.reference)}/archiver/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });
    }
    fetchActes();
    setSelectedActes([]);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedActes(actes.map(a => a.reference));
    } else {
      setSelectedActes([]);
    }
  };

  const handleSelectOne = (reference) => {
    setSelectedActes(prev =>
      prev.includes(reference)
        ? prev.filter(r => r !== reference)
        : [...prev, reference]
    );
  };

  const handleVoirActe = async (reference) => {
    try {
      const res = await fetch(`/api/actes/${encodeURIComponent(reference)}/download/`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setShowPreviewModal(true);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  // ✅ Filtrage par date UNIQUEMENT pour les actes archivés
  const actesArchivesFiltres = actesArchives.filter(a => {
    if (!a.date_generation) return false;

    const dateActe = new Date(a.date_generation);
    const anneeActe = dateActe.getFullYear().toString();
    const moisActe = (dateActe.getMonth() + 1).toString();

    // Filtre année
    if (filtreAnnee && anneeActe !== filtreAnnee) return false;

    // Filtre mois
    if (filtreMois && moisActe !== filtreMois) return false;

    return true;
  });

  // Actes à archiver : pas de filtre par date, seulement type et direction
  const actesFiltres = actes.filter(a => {
    if (filtreType && a.type_acte !== filtreType) return false;
    if (filtreDirection && a.agent_direction !== filtreDirection) return false;
    return true;
  });

  const typesUniques = [...new Set([...actes, ...actesArchives].map(a => a.type_acte))];
  const directionsUniques = [...new Set([...actes, ...actesArchives].map(a => a.agent_direction))];

  if (loading) {
    return (
      <div className="intranet-home">
        <header className="intranet-navbar">
          <div className="nav-left-zone">
            <img src="/static/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
          </div>
          <div className="nav-right"><UserMenu /></div>
        </header>
        <main className="intranet-main"><div className="loading-screen">Chargement...</div></main>
      </div>
    );
  }

  return (
    <div className="intranet-home">
      <header className="intranet-navbar">
        <div className="nav-left-zone">
          <img src="/logo_MND.png" alt="Logo MND" className="mnd-official-logo" />
        </div>
        <button 
            className="btn-retour"
            onClick={() => navigate(-1)}
            style={{
                background: '#f0f0f0',
                border: '1px solid #ddd',
                borderRadius: '6px',
                padding: '8px 15px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
            }}
            >
            ← Retour
        </button>
        <div className="nav-right">
          <UserMenu />
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2> Archivage</h2>
            <p>Gérez l'archivage des actes administratifs terminés</p>
          </div>
        </section>

        {/* Statistiques */}
        <div className="stats-container" style={{ marginBottom: '20px' }}>
          <div className="stat-card" style={{ borderLeftColor: '#F59E0B' }}>
            <div className="stat-number">{actes.length}</div>
            <div className="stat-label"> Actes à archiver</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#10B981' }}>
            <div className="stat-number">{actesArchives.length}</div>
            <div className="stat-label">✅ Actes archivés</div>
          </div>
        </div>

        {/* Tableau des actes à archiver (sans filtre date) */}
        <div className="admin-section">
          <h3> Actes à archiver ({actesFiltres.length})</h3>
          
          {actesFiltres.length > 0 && (
            <div style={{ marginBottom: '10px', display: 'flex', gap: '10px' }}>
              <button className="btn-rh-primary" onClick={handleArchiverSelection} disabled={selectedActes.length === 0}>
                 Archiver la sélection ({selectedActes.length})
              </button>
              <button className="btn-rh-secondary" onClick={handleToutArchiver}>
                📥 Tout archiver
              </button>
            </div>
          )}

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selectedActes.length === actesFiltres.length && actesFiltres.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>Référence</th>
                  <th>Type d'acte</th>
                  <th>Agent</th>
                  <th>Direction</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {actesFiltres.length === 0 ? (
                  <tr><td colSpan="7" className="text-center">Aucun acte à archiver</td></tr>
                ) : (
                  actesFiltres.map((acte) => (
                    <tr key={acte.reference}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedActes.includes(acte.reference)}
                          onChange={() => handleSelectOne(acte.reference)}
                        />
                      </td>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.type_acte}</td>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.agent_direction}</td>
                      <td>{acte.date_generation ? new Date(acte.date_generation).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button className="btn-view" onClick={() => handleVoirActe(acte.reference)}>
                            👁️ Voir
                          </button>
                          <button className="btn-view" onClick={() => handleArchiverUn(acte.reference)} style={{ background: '#F59E0B', color: '#fff' }}>
                            🗄️ Archiver
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

        {/* ✅ Tableau des actes archivés AVEC filtres année/mois */}
        <div className="admin-section" style={{ marginTop: '30px' }}>
          <h3> Actes archivés ({actesArchivesFiltres.length})</h3>
          
          {/* Filtres année/mois pour les actes archivés */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="number"
              placeholder="Année"
              value={filtreAnnee}
              onChange={(e) => setFiltreAnnee(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', width: '100px' }}
            />
            <select
              value={filtreMois}
              onChange={(e) => setFiltreMois(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
            >
              <option value="">Tous les mois</option>
              <option value="1">Janvier</option>
              <option value="2">Février</option>
              <option value="3">Mars</option>
              <option value="4">Avril</option>
              <option value="5">Mai</option>
              <option value="6">Juin</option>
              <option value="7">Juillet</option>
              <option value="8">Août</option>
              <option value="9">Septembre</option>
              <option value="10">Octobre</option>
              <option value="11">Novembre</option>
              <option value="12">Décembre</option>
            </select>
            <button
              className="btn-rh-secondary"
              onClick={() => {
                setFiltreAnnee(new Date().getFullYear().toString());
                setFiltreMois('');
              }}
              style={{ padding: '8px 15px' }}
            >
              🔄 Réinitialiser
            </button>
          </div>

          {actesArchivesFiltres.length > 0 ? (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Type d'acte</th>
                    <th>Agent</th>
                    <th>Direction</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {actesArchivesFiltres.map((acte) => (
                    <tr key={acte.reference}>
                      <td><code>{acte.reference}</code></td>
                      <td>{acte.type_acte}</td>
                      <td>{acte.agent_nom} {acte.agent_prenom}</td>
                      <td>{acte.agent_direction}</td>
                      <td>{acte.date_generation ? new Date(acte.date_generation).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <button className="btn-view" onClick={() => handleVoirActe(acte.reference)}>
                          👁️ Voir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Aucun acte archivé pour cette période</p>
          )}
        </div>
      </main>

      {/* Modal aperçu PDF */}
      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => { setShowPreviewModal(false); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }}>
          <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header preview-modal-header">
              <h3> Aperçu de l'acte</h3>
              <button className="modal-close" onClick={() => { setShowPreviewModal(false); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }}>✕</button>
            </div>
            <div className="modal-body preview-modal-body">
              {previewUrl ? (
                <iframe src={previewUrl} className="pdf-preview-iframe" frameBorder="0" />
              ) : (
                <div className="loading-preview">Chargement...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}