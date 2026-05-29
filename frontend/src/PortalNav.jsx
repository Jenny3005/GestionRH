import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function getDashboardPath(role = localStorage.getItem('userRole')) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'chef') return '/chef/dashboard';
  if (role === 'rh') return '/rh/dashboard';
  if (role === 'secretaire') return '/secretaire/dashboard';
  if (role === 'rh/secretaire') return '/secretaire/dashboard';
  if (role === 'dpaf') return '/dpaf/dashboard';  // ← AJOUTÉ
  return '/dashboard';
}

export function getRoleLabel(role = localStorage.getItem('userRole')) {
  switch(role) {
    case 'admin': return '👑 Administrateur';
    case 'rh': return '📋 Ressources Humaines';
    case 'chef': return '⭐ Chef de service';
    case 'secretaire': return '📝 Secrétaire DPAF';
    case 'rh/secretaire': return '📋📝 RH / Secrétaire DPAF';
    case 'dpaf': return '🏢 DPAF';  // ← AJOUTÉ
    default: return '👤 Agent';
  }
}

export default function PortalNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    setIsLoggedIn(Boolean(localStorage.getItem('userMatricule')));
    setUserRole(localStorage.getItem('userRole'));
  }, []);

  const dashboardPath = getDashboardPath();

  const getVisibleLinks = () => {
    const links = [];
    
    if (isLoggedIn) {
      links.push({ href: dashboardPath, label: '📊 Tableau de bord' });
    }
    
    links.push({ href: '/demarches', label: '📝 Démarches RH' });
    links.push({ href: '/documents', label: '📄 Documents' });
    
    return links;
  };

  const links = getVisibleLinks();

  const handleNavigation = (e, href) => {
    e.preventDefault();
    navigate(href);
  };

  return (
    <nav className="nav-central-links">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={`nav-tab-item ${location.pathname === link.href ? 'active' : ''}`}
          onClick={(e) => handleNavigation(e, link.href)}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}