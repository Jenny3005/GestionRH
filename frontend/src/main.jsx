import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import App from './App';
import Auth from './Auth';
import Demarches from './Demarches';
import Documents from './Documents';
import DashboardAdmin from './DashboardAdmin';
import DashboardRH from './DashboardRH';
import RHDocuments from './RHDocuments';
import AdminAgents from './AdminAgents';
import AdminRoles from './AdminRoles';
import ActivateAccount from './ActivateAccount';
import DashboardAgent from './DashboardAgent';
import DashboardChef from './DashboardChef';
import DashboardDPAF from './DashboardDPAF';
import AdminTypesDemande from './AdminTypesDemande';
import DashboardSecretaireDPAF from './DashboardSecretaireDPAF';
import AdminTypesPiece from './AdminTypesPiece';
import AdminPermissions from './AdminPermissions';
import Profil from './Profil';
import ChooseRole from './ChooseRole';
import Postuler from './Postuler';
import ArchivagePage from './ArchivagePage';
import CandidaturesPage from './CandidaturesPage';
import BulletinNotes from './Bulletinnotes';
import ResetPassword from './ResetPassword';

const originalFetch = window.fetch.bind(window);

window.fetch = (input, init) => {
  let url = typeof input === 'string' ? input : input instanceof Request ? input.url : input?.url;

  if (typeof url === 'string') {
    const rewrittenUrl = url
      .replace(/^http:\/\/localhost:8000\/api\//, '/api/')
      .replace(/^http:\/\/localhost:3001\/api/, '/api')
      .replace(/^http:\/\/localhost:8000\//, '/');

    if (rewrittenUrl !== url) {
      if (typeof input === 'string') {
        input = rewrittenUrl;
      } else if (input instanceof Request) {
        input = new Request(rewrittenUrl, input);
      } else {
        input = { ...input, url: rewrittenUrl };
      }
    }
  }

  return originalFetch(input, init);
};

const rewriteAssetUrl = (url) => {
  if (!url || /^https?:\/\//i.test(url) || /^data:/i.test(url) || url.startsWith('blob:')) {
    return url;
  }

  if (['/logo_MND.png', '/logo2.png', '/favicon.svg', '/icons.svg'].includes(url)) {
    return `/static${url}`;
  }

  return url;
};

const patchStaticAssets = () => {
  document.querySelectorAll('img').forEach((img) => {
    const currentSrc = img.getAttribute('src');
    if (currentSrc) {
      const rewrittenSrc = rewriteAssetUrl(currentSrc);
      if (rewrittenSrc !== currentSrc) {
        img.setAttribute('src', rewrittenSrc);
      }
    }
  });
};

patchStaticAssets();

const observer = new MutationObserver(() => patchStaticAssets());
observer.observe(document.body, { childList: true, subtree: true });

// Pas besoin d'état isAuthenticated ici car c'est géré dans chaque composant
// ou bien on le gère avec un contexte

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      {/* Page d'accueil publique - visible par tous */}
      <Route path="/" element={<App />} />
      
      {/* Page de connexion/inscription */}
      <Route path="/auth" element={<Auth />} />
      
      {/* Pages protégées (vérifient la connexion à l'intérieur) */}
      <Route path="/demarches" element={<Demarches />} />
      <Route path="/documents" element={<Documents />} />
      <Route path="/app-admin/dashboard" element={<DashboardAdmin />} />
      <Route path="/app-admin/agents" element={<AdminAgents />} />
      <Route path="/app-admin/roles" element={<AdminRoles />} />
      <Route path="/activate" element={<ActivateAccount />} />
      <Route path="/dashboard" element={<DashboardAgent />} />
      <Route path="/choose-role" element={<ChooseRole />} />
      <Route path="/profil" element={<Profil />} />
      <Route path="/chef/dashboard" element={<DashboardChef />} />
      <Route path="/app-admin/types-demande" element={<AdminTypesDemande />} />
      <Route path="/app-admin/types-piece" element={<AdminTypesPiece />} />
      <Route path="/app-admin/permissions" element={<AdminPermissions />} />
      <Route path="/secretaire/dashboard" element={<DashboardSecretaireDPAF />} />
      <Route path="/rh/dashboard" element={<DashboardRH />} />
      <Route path="/dpaf/dashboard" element={<DashboardDPAF />} />
      <Route path="/rh/documents/:matricule" element={<RHDocuments />} />
      <Route path="/postuler" element={<Postuler />} />
      <Route path="/archivage" element={<ArchivagePage />} />
      <Route path="/postes" element={<CandidaturesPage />} />
      <Route path="/bulletin-notes" element={<BulletinNotes />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  </BrowserRouter>
);
