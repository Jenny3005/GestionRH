import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from './PortalNav';
import UserMenu from './UserMenu';
import './App.css';

const CRITERES_PAR_CATEGORIE = {
  A: [
    'Connaissance professionnelle',
    'Culture générale',
    'Efficacité et capacité d\'encadrement et de direction',
    'Disponibilité et sens du service public',
  ],
  B: [
    'Connaissance professionnelle',
    'Sens de l\'organisation et méthode dans le travail',
    'Assiduité et efficacité',
    'Sens du service public',
  ],
  C: [
    'Connaissance professionnelle',
    'Ponctualité et assiduité',
    'Soin et rapidité dans l\'exécution des tâches',
    'Conscience professionnelle',
  ],
  D: [
    'Connaissance professionnelle',
    'Ponctualité et assiduité',
    'Soin et rapidité dans l\'exécution des tâches',
    'Conscience professionnelle',
  ],
};

function getCategorieFromEchelon(echelon) {
  if (!echelon) return 'A';
  return echelon.charAt(0).toUpperCase();
}

function calculerDureeService(datePriseService) {
  if (!datePriseService) return { ans: 0, mois: 0, jours: 0 };
  const debut = new Date(datePriseService);
  const fin = new Date(new Date().getFullYear(), 11, 31);
  let ans = fin.getFullYear() - debut.getFullYear();
  let mois = fin.getMonth() - debut.getMonth();
  let jours = fin.getDate() - debut.getDate();
  if (jours < 0) { mois--; jours += 30; }
  if (mois < 0) { ans--; mois += 12; }
  return { ans, mois, jours };
}

export default function BulletinNotes() {
  const navigate = useNavigate();
  const matricule = localStorage.getItem('userMatricule');
  const anneeActuelle = new Date().getFullYear();

  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Données complémentaires pour le PDF
  const [complementData, setComplementData] = useState({
    diplomes: '',
    profession_avant_service: '',
    situation_militaire: 'Néant',
    distinctions_honorifiques: 'Néant',
    interruption_cause: 'Néant',
    interruption_duree: '',
    proposable_avancement: 'Oui',
  });

  const [enfants, setEnfants] = useState([]);
  const [nouvelEnfant, setNouvelEnfant] = useState({ nom: '', prenom: '', date_naissance: '' });
  const [ajoutEnfant, setAjoutEnfant] = useState(false);

  useEffect(() => {
    if (!matricule) { navigate('/auth'); return; }
    fetchAgent();
    fetchEnfants();
  }, []);

  const fetchAgent = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/agent/${matricule}/bulletin/`);
      if (res.ok) {
        const data = await res.json();
        setAgent(data);
        // Charger les données complémentaires depuis le backend
        setComplementData({
          diplomes: data.diplomes || '',
          profession_avant_service: data.profession_avant_service || '',
          situation_militaire: data.situation_militaire || 'Néant',
          distinctions_honorifiques: data.distinctions_honorifiques || 'Néant',
          interruption_cause: data.interruption_cause || 'Néant',
          interruption_duree: data.interruption_duree || '',
          proposable_avancement: data.proposable_avancement || 'Oui',
        });
      }
    } catch (e) {
      console.error('Erreur chargement agent:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEnfants = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/agent/${matricule}/enfants/`);
      if (res.ok) {
        const data = await res.json();
        setEnfants(data);
      }
    } catch (e) {
      console.error('Erreur chargement enfants:', e);
    }
  };

  const handleComplementChange = (field, value) => {
    setComplementData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveInfos = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      // Sauvegarde de TOUTES les informations (agent + bulletin)
      const response = await fetch(`http://localhost:8000/api/agent/${matricule}/bulletin/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Champs de l'agent
          lieu_naissance: agent?.lieu_naissance || '',
          dialectes: agent?.dialectes || '',
          date_mariage: agent?.date_mariage || '',
          adresse: agent?.adresse || '',
          // Champs de BulletinInfo
          diplomes: complementData.diplomes,
          profession_avant_service: complementData.profession_avant_service,
          situation_militaire: complementData.situation_militaire,
          distinctions_honorifiques: complementData.distinctions_honorifiques,
          interruption_duree: complementData.interruption_duree,
          interruption_cause: complementData.interruption_cause,
          proposable_avancement: complementData.proposable_avancement,
        }),
      });
      
      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const error = await response.json();
        alert('Erreur lors de la sauvegarde: ' + (error.error || 'Inconnue'));
      }
    } catch (e) {
      console.error('Erreur sauvegarde:', e);
      alert('Erreur de connexion');
    } finally {
      setSaving(false);
    }
  };

  const handleAjouterEnfant = async () => {
    if (!nouvelEnfant.nom || !nouvelEnfant.prenom || !nouvelEnfant.date_naissance) {
      alert('Veuillez remplir tous les champs');
      return;
    }
    try {
      const res = await fetch(`http://localhost:8000/api/agent/${matricule}/enfants/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: nouvelEnfant.nom,
          prenom: nouvelEnfant.prenom,
          date_naissance: nouvelEnfant.date_naissance
        }),
      });
      if (res.ok) {
        await fetchEnfants();
        setNouvelEnfant({ nom: '', prenom: '', date_naissance: '' });
        setAjoutEnfant(false);
      } else {
        const error = await res.json();
        alert(error.error || 'Erreur lors de l\'ajout');
      }
    } catch (e) {
      console.error('Erreur ajout enfant:', e);
      alert('Erreur de connexion');
    }
  };

  const handleSupprimerEnfant = async (id) => {
    if (!window.confirm('Supprimer cet enfant ?')) return;
    try {
      await fetch(`http://localhost:8000/api/agent/${matricule}/enfants/${id}/`, { method: 'DELETE' });
      setEnfants(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      console.error('Erreur suppression enfant:', e);
    }
  };

  const handleGenererPDF = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`http://localhost:8000/api/agent/${matricule}/bulletin/generer/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annee: anneeActuelle,
          ...complementData
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bulletin_notes_${matricule}_${anneeActuelle}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Erreur lors de la génération du PDF');
      }
    } catch (e) {
      console.error('Erreur génération PDF:', e);
      alert('Erreur de connexion');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return (
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
      <main className="intranet-main" style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}>
        <p>Chargement de vos informations...</p>
      </main>
    </div>
  );

  if (!agent) return null;

  const categorie = getCategorieFromEchelon(agent.echelon);
  const criteres = CRITERES_PAR_CATEGORIE[categorie] || CRITERES_PAR_CATEGORIE['A'];
  const dureeService = calculerDureeService(agent.date_prise_service);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
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
            <h2>📋 Bulletin Individuel de Notes</h2>
            <p>Vérifiez vos informations et téléchargez votre bulletin — Année {anneeActuelle}</p>
          </div>
        </section>

        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px 40px' }}>

          {/* SECTION 1 — Infos administratives */}
          <div className="agent-card" style={{ marginBottom: '20px' }}>
            <div className="agent-card-header">
              <h3>Informations administratives</h3>
              <span style={{ fontSize: '12px', color: '#10B981', background: '#D1FAE5', padding: '3px 10px', borderRadius: '12px' }}>
                ✓ Récupérées automatiquement
              </span>
            </div>
            <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <InfoRow label="Nom" value={agent.nom} />
              <InfoRow label="Prénom" value={agent.prenom} />
              <InfoRow label="Matricule" value={agent.matricule} />
              <InfoRow label="Date de naissance" value={formatDate(agent.date_naissance)} />
              <InfoRow label="Lieu de naissance" value={agent.lieu_naissance || '-'} />
              <InfoRow label="Dialectes parlés" value={agent.dialectes || '-'} />
              <InfoRow label="Date de mariage" value={formatDate(agent.date_mariage)} />
              <InfoRow label="Adresse" value={agent.adresse || '-'} />
              <InfoRow label="Grade" value={agent.echelon || '-'} />
              <InfoRow label="Catégorie" value={`Catégorie ${categorie}`} />
              <InfoRow label="Direction" value={agent.direction || '-'} />
              <InfoRow label="Poste" value={agent.poste || '-'} />
              <InfoRow label="Date de prise de service" value={formatDate(agent.date_prise_service)} />
            </div>
          </div>

          {/* SECTION 2 — Enfants */}
          <div className="agent-card" style={{ marginBottom: '20px' }}>
            <div className="agent-card-header">
              <h3>Enfants vivants</h3>
              <button className="agent-card-btn" onClick={() => setAjoutEnfant(true)}>+ Ajouter</button>
            </div>
            <div style={{ padding: '0 20px 20px' }}>
              {enfants.length === 0 && !ajoutEnfant && (
                <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                  Aucun enfant renseigné
                </p>
              )}
              {enfants.map((enfant, i) => (
                <div key={enfant.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    <strong>{i + 1}.</strong> {enfant.nom} {enfant.prenom} — {formatDate(enfant.date_naissance)}
                  </span>
                  <button onClick={() => handleSupprimerEnfant(enfant.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '13px' }}>
                    🗑️ Supprimer
                  </button>
                </div>
              ))}

              {ajoutEnfant && (
                <div style={{ marginTop: '16px', padding: '16px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                  <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px' }}>Nouvel enfant</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={labelStyle}>Nom</label>
                      <input style={inputStyle} placeholder="Ex : AGOSSOU" value={nouvelEnfant.nom} onChange={e => setNouvelEnfant(prev => ({ ...prev, nom: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Prénom</label>
                      <input style={inputStyle} placeholder="Ex : Kévin" value={nouvelEnfant.prenom} onChange={e => setNouvelEnfant(prev => ({ ...prev, prenom: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Date de naissance</label>
                      <input type="date" style={inputStyle} value={nouvelEnfant.date_naissance} onChange={e => setNouvelEnfant(prev => ({ ...prev, date_naissance: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleAjouterEnfant} className="btn-demander-conge" style={{ padding: '8px 20px', fontSize: '13px' }}>Confirmer</button>
                    <button onClick={() => setAjoutEnfant(false)} className="btn-close-modal" style={{ padding: '8px 20px', fontSize: '13px' }}>Annuler</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3 — Infos complémentaires pour le PDF (TOUS LES CHAMPS) */}
          <div className="agent-card" style={{ marginBottom: '20px' }}>
            <div className="agent-card-header">
              <h3>Informations complémentaires</h3>
              <span style={{ fontSize: '12px', color: '#F59E0B', background: '#FEF3C7', padding: '3px 10px', borderRadius: '12px' }}>
                ✏️ Ces champs apparaîtront dans le bulletin
              </span>
            </div>
            <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <EditField label="Diplômes" value={complementData.diplomes} onChange={v => handleComplementChange('diplomes', v)} placeholder="Ex : Master en Informatique, Licence en Droit..." />
              <EditField label="Profession avant service" value={complementData.profession_avant_service} onChange={v => handleComplementChange('profession_avant_service', v)} placeholder="Ex : Enseignant, Commerçant..." />
              <EditField label="Situation militaire" value={complementData.situation_militaire} onChange={v => handleComplementChange('situation_militaire', v)} placeholder="Ex : Néant, Service militaire effectué..." />
              <EditField label="Distinctions honorifiques" value={complementData.distinctions_honorifiques} onChange={v => handleComplementChange('distinctions_honorifiques', v)} placeholder="Ex : Médaille du travail, Chevalier de l'Ordre..." />
              <EditField label="Interruption de service (cause)" value={complementData.interruption_cause} onChange={v => handleComplementChange('interruption_cause', v)} placeholder="Ex : Maladie, Formation..." />
              <EditField label="Interruption de service (durée)" value={complementData.interruption_duree} onChange={v => handleComplementChange('interruption_duree', v)} placeholder="Ex : 6 mois, 1 an..." />
              <div>
                <label style={labelStyle}>Proposable pour avancement</label>
                <select value={complementData.proposable_avancement} onChange={e => handleComplementChange('proposable_avancement', e.target.value)} style={inputStyle}>
                  <option value="Oui">Oui</option>
                  <option value="Non">Non</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 4 — Relevé de services */}
          <div className="agent-card" style={{ marginBottom: '20px' }}>
            <div className="agent-card-header">
              <h3>Relevé général des services</h3>
            </div>
            <div style={{ padding: '0 20px 20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead><tr style={{ background: '#F3F4F6' }}>
                  <th style={thStyle}>Indication des services</th><th style={thStyle}>Ans</th><th style={thStyle}>Mois</th><th style={thStyle}>Jours</th>
                </tr></thead>
                <tbody>
                  <tr><td style={tdStyle}>Services militaires constatés</td><td style={{ ...tdStyle, textAlign: 'center' }}>0</td><td style={{ ...tdStyle, textAlign: 'center' }}>0</td><td style={{ ...tdStyle, textAlign: 'center' }}>0</td></tr>
                  <tr><td style={tdStyle}>Services civils donnant droit à la pension</td><td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{dureeService.ans}</td><td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{dureeService.mois}</td><td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{dureeService.jours}</td></tr>
                  <tr><td style={tdStyle}>Services civils ne donnant pas droit à la pension</td><td style={{ ...tdStyle, textAlign: 'center' }}>0</td><td style={{ ...tdStyle, textAlign: 'center' }}>0</td><td style={{ ...tdStyle, textAlign: 'center' }}>0</td></tr>
                  <tr style={{ background: '#EFF6FF', fontWeight: '700' }}><td style={tdStyle}>Total au 31 décembre {anneeActuelle}</td><td style={{ ...tdStyle, textAlign: 'center' }}>{dureeService.ans}</td><td style={{ ...tdStyle, textAlign: 'center' }}>{dureeService.mois}</td><td style={{ ...tdStyle, textAlign: 'center' }}>{dureeService.jours}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 5 — Critères */}
          <div className="agent-card" style={{ marginBottom: '28px' }}>
            <div className="agent-card-header">
              <h3>Critères de notation — Catégorie {categorie}</h3>
            </div>
            <div style={{ padding: '0 20px 20px' }}>
              {criteres.map((critere, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: '8px', background: '#F9FAFB', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                  <span>{critere}</span>
                  <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>.............. / 5</span>
                </div>
              ))}
            </div>
          </div>

          {/* BOUTONS */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {saveSuccess && <span style={{ color: '#10B981', fontSize: '14px' }}>✓ Informations sauvegardées</span>}
            <button onClick={handleSaveInfos} disabled={saving} className="btn-close-modal" style={{ padding: '12px 24px' }}>{saving ? 'Enregistrement...' : '💾 Sauvegarder'}</button>
            <button onClick={handleGenererPDF} disabled={generating} className="btn-demander-conge" style={{ padding: '12px 28px' }}>{generating ? 'Génération...' : '📥 Télécharger mon bulletin'}</button>
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

// Composants utilitaires
function InfoRow({ label, value }) {
  return (
    <div style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: '10px' }}>
      <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '3px' }}>{label}</p>
      <p style={{ fontSize: '14px', color: '#111827', fontWeight: '500' }}>{value || '-'}</p>
    </div>
  );
}

function EditField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px', fontWeight: '500' };
const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' };
const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #E5E7EB' };
const tdStyle = { padding: '10px 14px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #F3F4F6' };