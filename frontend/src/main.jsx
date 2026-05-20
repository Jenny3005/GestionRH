import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import App from './App';
import Auth from './Auth';
import Demarches from './Demarches';
import Documents from './Documents';

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
    </Routes>
  </BrowserRouter>
);