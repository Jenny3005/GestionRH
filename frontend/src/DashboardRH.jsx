import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

export default function DashboardAgentRH() {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, dossiers, annonces, rapports
  const [userInfo, setUserInfo] = useState({
    nom: localStorage.getItem('userNom') || '',
    prenom: localStorage.getItem('userPrenom') || '',
    matricule: localStorage.getItem('userMatricule') || '',
    email: localStorage.getItem('userEmail') || '',
    role: 'Agent RH'
  });

  // Données statiques pour la démo
  const [stats] = useState({
    totalAgents: 245,
    demandesEnAttente: 18,
    documentsExpires: 7,
    annoncesActives: 4,
    dossiersIncomplets: 12,
    facturesATraiter: 5
  });

  const [demandesRecentes] = useState([
    { id: 1, agent: 'Jean KOUASSI', type: 'Demande de congé', date: '2026-05-20', statut: 'En attente' },
    { id: 2, agent: 'Marie ADJOVI', type: 'Attestation de travail', date: '2026-05-19', statut: 'En cours' },
    { id: 3, agent: 'Paul DOSSOU', type: 'Demande de formation', date: '2026-05-18', statut: 'Validé' },
    { id: 4, agent: 'Sylvie HOUNDO', type: 'Renouvellement contrat', date: '2026-05-17', statut: 'En attente' }
  ]);

  const [agentsRecents] = useState([
    { id: 1, matricule: 'AG001', nom: 'KOUASSI Jean', poste: 'Assistant RH', direction: 'DRH', statut: 'Actif' },
    { id: 2, matricule: 'AG002', nom: 'ADJOVI Marie', poste: 'Comptable', direction: 'DAF', statut: 'Actif' },
    { id: 3, matricule: 'AG003', nom: 'DOSSOU Paul', poste: 'Chef de service', direction: 'DSI', statut: 'En congé' }
  ]);

  const [annonces] = useState([
    { id: 1, titre: 'Recrutement Assistant RH', datePublication: '2026-05-15', dateCloture: '2026-06-15', statut: 'Active', candidatures: 12 },
    { id: 2, titre: 'Appel à candidature - Chef projet', datePublication: '2026-05-10', dateCloture: '2026-05-30', statut: 'Active', candidatures: 8 },
    { id: 3, titre: 'Formation Excel avancé', datePublication: '2026-05-01', dateCloture: '2026-05-20', statut: 'Clôturée', candidatures: 25 }
  ]);

  const [documentsExpirant] = useState([
    { id: 1, agent: 'KOUASSI Jean', document: 'CNI', dateExpiration: '2026-05-30', statut: 'Urgent' },
    { id: 2, agent: 'ADJOVI Marie', document: 'Diplôme', dateExpiration: '2026-06-15', statut: 'Attention' },
    { id: 3, agent: 'DOSSOU Paul', document: 'Visite médicale', dateExpiration: '2026-05-25', statut: 'Urgent' }
  ]);

  const userName = `${userInfo.prenom} ${userInfo.nom}`.trim();

  useEffect(() => {
    const matricule = localStorage.getItem('userMatricule');
    if (!matricule) {
      navigate('/auth');
      return;
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.user-menu-container')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const getStatutBadge = (statut) => {
    const statusMap = {
      'En attente': { class: 'status-pending', text: 'En attente' },
      'En cours': { class: 'status-progress', text: 'En cours' },
      'Validé': { class: 'status-approved', text: 'Validé' },
      'Actif': { class: 'status-active', text: 'Actif' },
      'En congé': { class: 'status-away', text: 'En congé' },
      'Active': { class: 'status-active', text: 'Active' },
      'Clôturée': { class: 'status-closed', text: 'Clôturée' },
      'Urgent': { class: 'status-urgent', text: '⚠️ Urgent' },
      'Attention': { class: 'status-warning', text: '⚠️ Attention' }
    };
    const status = statusMap[statut] || { class: 'status-pending', text: statut };
    return <span className={`status-badge ${status.class}`}>{status.text}</span>;
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
          <a href="#" className={`nav-tab-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Tableau de bord</a>
          <a href="#" className={`nav-tab-item ${activeTab === 'dossiers' ? 'active' : ''}`} onClick={() => setActiveTab('dossiers')}>Gestion des dossiers</a>
          <a href="#" className={`nav-tab-item ${activeTab === 'annonces' ? 'active' : ''}`} onClick={() => setActiveTab('annonces')}>Annonces & candidatures</a>
          <a href="#" className={`nav-tab-item ${activeTab === 'rapports' ? 'active' : ''}`} onClick={() => setActiveTab('rapports')}>Rapports & export</a>
        </nav>
        <div className="nav-right">
          <div className="user-menu-container">
            <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="avatar-circle">{userInfo.prenom?.charAt(0) || 'A'}</div>
              <div className="user-meta">
                <span className="user-name">{userName || 'Agent RH'}</span>
                <span className="user-role">Agent RH</span>
              </div>
              <span className="dropdown-arrow">▼</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <strong>{userName}</strong>
                  <small>{userInfo.email}</small>
                </div>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item" onClick={() => navigate('/dashboard-rh')}>📊 Tableau de bord RH</button>
                <button className="dropdown-item" onClick={() => navigate('/profil')}>👤 Mon profil</button>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item logout" onClick={handleLogout}>🔓 Se déconnecter</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="intranet-main">
        <section className="hero-banner-intranet">
          <div className="banner-content">
            <h2>Gestion des Ressources Humaines</h2>
            <p>Bienvenue {userInfo.prenom} ! Gérez les dossiers, traitez les demandes et pilotez les ressources humaines.</p>
          </div>
        </section>

        {/* Contenu selon l'onglet sélectionné */}
        {activeTab === 'dashboard' && (
          <>
            {/* Statistiques */}
            <div className="rh-stats-grid">
              <div className="rh-stat-card">
                <div className="rh-stat-icon">👥</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.totalAgents}</span>
                  <span className="rh-stat-label">Agents actifs</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📋</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.demandesEnAttente}</span>
                  <span className="rh-stat-label">Demandes en attente</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">⚠️</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.documentsExpires}</span>
                  <span className="rh-stat-label">Documents expirés</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📢</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.annoncesActives}</span>
                  <span className="rh-stat-label">Annonces actives</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">📁</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.dossiersIncomplets}</span>
                  <span className="rh-stat-label">Dossiers incomplets</span>
                </div>
              </div>
              <div className="rh-stat-card">
                <div className="rh-stat-icon">💰</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">{stats.facturesATraiter}</span>
                  <span className="rh-stat-label">Factures à traiter</span>
                </div>
              </div>
            </div>

            {/* Demandes récentes et documents expirants */}
            <div className="rh-dashboard-grid">
              <div className="rh-card">
                <div className="rh-card-header">
                  <h3>📝 Demandes récentes</h3>
                  <button className="rh-card-btn" onClick={() => setActiveTab('dossiers')}>Voir tout →</button>
                </div>
                <div className="rh-table-container">
                  <table className="rh-table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Type</th>
                        <th>Date</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demandesRecentes.map((demande) => (
                        <tr key={demande.id}>
                          <td>{demande.agent}</td>
                          <td>{demande.type}</td>
                          <td>{demande.date}</td>
                          <td>{getStatutBadge(demande.statut)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rh-card">
                <div className="rh-card-header">
                  <h3>⚠️ Documents expirant bientôt</h3>
                  <button className="rh-card-btn" onClick={() => setActiveTab('dossiers')}>Gérer →</button>
                </div>
                <div className="rh-list">
                  {documentsExpirant.map((doc) => (
                    <div key={doc.id} className="rh-list-item">
                      <div className="rh-list-info">
                        <strong>{doc.agent}</strong>
                        <span>{doc.document}</span>
                        <small>Expire le {doc.dateExpiration}</small>
                      </div>
                      <div className="rh-list-action">
                        {getStatutBadge(doc.statut)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Agents récents */}
            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>👥 Derniers agents inscrits</h3>
                <button className="rh-card-btn" onClick={() => setActiveTab('dossiers')}>Voir tous les agents →</button>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom complet</th>
                      <th>Poste</th>
                      <th>Direction</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentsRecents.map((agent) => (
                      <tr key={agent.id}>
                        <td>{agent.matricule}</td>
                        <td>{agent.nom}</td>
                        <td>{agent.poste}</td>
                        <td>{agent.direction}</td>
                        <td>{getStatutBadge(agent.statut)}</td>
                        <td>
                          <button className="btn-icon" title="Voir dossier">👁️</button>
                          <button className="btn-icon" title="Modifier">✏️</button>
                          <button className="btn-icon" title="Documents">📄</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'dossiers' && (
          <div className="rh-section">
            {/* Actions rapides */}
            <div className="rh-actions-bar">
              <div className="rh-search-box">
                <input type="text" placeholder="Rechercher un agent (matricule, nom, prénom)..." className="rh-search-input" />
              </div>
              <div className="rh-actions-buttons">
                <button className="btn-rh-primary">➕ Nouvel agent</button>
                <button className="btn-rh-secondary">📤 Importer liste</button>
                <button className="btn-rh-secondary">📊 Statistiques</button>
              </div>
            </div>

            {/* Filtres */}
            <div className="rh-filters">
              <button className="filter-btn active">Tous</button>
              <button className="filter-btn">Dossiers complets</button>
              <button className="filter-btn">Dossiers incomplets</button>
              <button className="filter-btn">Documents expirés</button>
              <button className="filter-btn">En congé</button>
            </div>

            {/* Tableau des agents */}
            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📋 Gestion des dossiers agents</h3>
                <button className="rh-card-btn">Exporter la liste →</button>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th><input type="checkbox" /></th>
                      <th>Matricule</th>
                      <th>Nom & Prénom</th>
                      <th>Poste</th>
                      <th>Direction</th>
                      <th>Documents</th>
                      <th>Dernière mise à jour</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><input type="checkbox" /></td>
                      <td>AG001</td>
                      <td>KOUASSI Jean</td>
                      <td>Assistant RH</td>
                      <td>DRH</td>
                      <td>
                        <div className="document-progress">
                          <div className="progress-bar" style={{ width: '85%' }}></div>
                          <span>85%</span>
                        </div>
                      </td>
                      <td>2026-05-15</td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Consulter">👁️</button>
                        <button className="btn-icon" title="Ajouter pièce">📎</button>
                        <button className="btn-icon" title="Modifier">✏️</button>
                      </td>
                    </tr>
                    <tr>
                      <td><input type="checkbox" /></td>
                      <td>AG002</td>
                      <td>ADJOVI Marie</td>
                      <td>Comptable</td>
                      <td>DAF</td>
                      <td>
                        <div className="document-progress">
                          <div className="progress-bar warning" style={{ width: '45%' }}></div>
                          <span>45%</span>
                        </div>
                      </td>
                      <td>2026-05-10</td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Consulter">👁️</button>
                        <button className="btn-icon" title="Ajouter pièce">📎</button>
                        <button className="btn-icon" title="Modifier">✏️</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'annonces' && (
          <div className="rh-section">
            <div className="rh-actions-bar">
              <div className="rh-actions-buttons">
                <button className="btn-rh-primary">➕ Nouvelle annonce</button>
                <button className="btn-rh-primary">📢 Appel à candidature</button>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📢 Annonces et appels à candidature</h3>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th>Date publication</th>
                      <th>Date clôture</th>
                      <th>Statut</th>
                      <th>Candidatures</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annonces.map((annonce) => (
                      <tr key={annonce.id}>
                        <td>{annonce.titre}</td>
                        <td>{annonce.datePublication}</td>
                        <td>{annonce.dateCloture}</td>
                        <td>{getStatutBadge(annonce.statut)}</td>
                        <td>{annonce.candidatures}</td>
                        <td className="rh-actions-cell">
                          <button className="btn-icon" title="Voir candidatures">👥</button>
                          <button className="btn-icon" title="Modifier">✏️</button>
                          <button className="btn-icon" title="Clôturer">🔒</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📝 Candidatures reçues</h3>
              </div>
              <div className="rh-table-container">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th>Candidat</th>
                      <th>Poste</th>
                      <th>Date candidature</th>
                      <th>Statut</th>
                      <th>CV</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Amadou TRAORE</td>
                      <td>Assistant RH</td>
                      <td>2026-05-18</td>
                      <td>{getStatutBadge('En attente')}</td>
                      <td><button className="btn-link">📄 Télécharger</button></td>
                      <td className="rh-actions-cell">
                        <button className="btn-icon" title="Accepter">✅</button>
                        <button className="btn-icon" title="Rejeter">❌</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rapports' && (
          <div className="rh-section">
            <div className="rh-stats-grid">
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">📊</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Rapport mensuel</span>
                  <span className="rh-stat-label">Mai 2026</span>
                </div>
              </div>
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">👥</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Effectifs par direction</span>
                  <span className="rh-stat-label">Analyse</span>
                </div>
              </div>
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">🌴</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Congés pris</span>
                  <span className="rh-stat-label">Statistiques</span>
                </div>
              </div>
              <div className="rh-stat-card clickable">
                <div className="rh-stat-icon">📈</div>
                <div className="rh-stat-info">
                  <span className="rh-stat-value">Turnover</span>
                  <span className="rh-stat-label">Taux de rotation</span>
                </div>
              </div>
            </div>

            <div className="rh-card full-width">
              <div className="rh-card-header">
                <h3>📑 Exporter des rapports</h3>
              </div>
              <div className="rh-export-options">
                <div className="export-option">
                  <h4>Liste des agents</h4>
                  <p>Export complet des agents avec leurs informations</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel">📊 Excel</button>
                    <button className="btn-export-pdf">📄 PDF</button>
                    <button className="btn-export-csv">📝 CSV</button>
                  </div>
                </div>
                <div className="export-option">
                  <h4>Statistiques RH</h4>
                  <p>Effectifs, recrutements, départs, congés</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel">📊 Excel</button>
                    <button className="btn-export-pdf">📄 PDF</button>
                  </div>
                </div>
                <div className="export-option">
                  <h4>Dossiers agents</h4>
                  <p>État des dossiers et documents manquants</p>
                  <div className="export-buttons">
                    <button className="btn-export-excel">📊 Excel</button>
                    <button className="btn-export-pdf">📄 PDF</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
                <li><a href="https://www.numerique.gouv.bj" target="_blank">Portail du Ministère</a></li>
                <li><a href="https://eservices.travail.gouv.bj" target="_blank">E-Services SIGRH</a></li>
                <li><a href="https://sgg.gouv.bj/doc/loi-2015-18/" target="_blank">Statut de l'Agent (SGG)</a></li>
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