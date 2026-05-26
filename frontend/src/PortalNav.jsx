import React from 'react';
import { useLocation } from 'react-router-dom';

export function getDashboardPath(role = localStorage.getItem('userRole')) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'chef') return '/chef/dashboard';
  return '/dashboard';
}

export function getRoleLabel(role = localStorage.getItem('userRole')) {
  if (role === 'admin') return 'Administrateur';
  if (role === 'rh') return 'Ressources Humaines';
  if (role === 'chef') return 'Chef de service';
  return 'Agent';
}

export default function PortalNav() {
  const location = useLocation();
  const isLoggedIn = Boolean(localStorage.getItem('userMatricule'));
  const dashboardPath = getDashboardPath();

  const links = [
    ...(isLoggedIn ? [{ href: dashboardPath, label: 'Tableau de bord' }] : []),
    { href: '/demarches', label: 'Démarches RH' },
    { href: '/documents', label: 'Documents' }
  ];

  return (
    <nav className="nav-central-links">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={`nav-tab-item ${location.pathname === link.href ? 'active' : ''}`}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
