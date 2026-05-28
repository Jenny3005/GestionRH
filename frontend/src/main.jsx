import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import App from './App';
import Auth from './Auth';
import Demarches from './Demarches';
import Documents from './Documents';
import DashboardAdmin from './DashboardAdmin';
import AdminAgents from './AdminAgents';
import AdminRoles from './AdminRoles';
import ActivateAccount from './ActivateAccount';
import DashboardAgent from './DashboardAgent';
import DashboardChef from './DashboardChef';
import AdminTypesDemande from './AdminTypesDemande';
import DashboardSecretaireDPAF from './DashboardSecretaireDPAF';
import AdminTypesPiece from './AdminTypesPiece';
import AdminPermissions from './AdminPermissions';
import Profil from './Profil';

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
      <Route path="/admin/dashboard" element={<DashboardAdmin />} />
      <Route path="/admin/agents" element={<AdminAgents />} />
      <Route path="/admin/roles" element={<AdminRoles />} />
      <Route path="/activate" element={<ActivateAccount />} />
      <Route path="/dashboard" element={<DashboardAgent />} />
      <Route path="/profil" element={<Profil />} />
      <Route path="/chef/dashboard" element={<DashboardChef />} />
      <Route path="/admin/types-demande" element={<AdminTypesDemande />} />
      <Route path="/admin/types-piece" element={<AdminTypesPiece />} />
      <Route path="/admin/permissions" element={<AdminPermissions />} />
      <Route path="/secretaire/dashboard" element={<DashboardSecretaireDPAF />} />
    </Routes>
  </BrowserRouter>
);
