import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function normalizeRole(role) {
  if (!role || typeof role !== 'string') return '';
  // trim and lowercase
  let r = role.trim().toLowerCase();
  try {
    // remove accents (é -> e)
    r = r.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  } catch (e) {
    // ignore if normalize is not supported
  }
  // convert spaces, underscores or backslashes to slash for consistent delim
  r = r.replace(/[\s_\\]+/g, '/');
  // remove any non-alphanumeric, non-slash, non-hyphen characters
  r = r.replace(/[^a-z0-9\/-]/g, '');
  // collapse multiple slashes
  r = r.replace(/\/+/, '/');
  // canonicalize common combined role names
  if (r.includes('rh') && r.includes('secretaire')) return 'rh/secretaire';
  if (r === 'dpaf') return 'dpaf';
  if (r === 'dapaf') return 'dapaf';
  // fallback: return cleaned role
  return r;
}

export function getDashboardPath(role = localStorage.getItem('userRole')) {
  role = normalizeRole(role);
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'chef') return '/chef/dashboard';
  if (role === 'rh') return '/rh/dashboard';
  if (role === 'secretaire') return '/secretaire/dashboard';
  if (role === 'rh/secretaire') return '/secretaire/dashboard';
  if (role === 'dpaf') return '/dpaf/dashboard';
  if (role === 'dapaf') return '/dpaf/dashboard';  // ← même dashboard
  return '/dashboard';
}

export function getRoleLabel(role = localStorage.getItem('userRole')) {
  role = normalizeRole(role);
  switch(role) {
    case 'admin': return '👑 Administrateur';
    case 'rh': return '📋 Ressources Humaines';
    case 'chef': return '⭐ Chef de service';
    case 'secretaire': return '📝 Secrétaire DPAF';
    case 'rh/secretaire': return '📋📝 RH / Secrétaire DPAF';
    case 'dpaf': return '🏢 DPAF - Direction Planification';
    case 'dapaf': return '🏢 DAPAF - Direction Affaires Politiques';
    default: return '👤 Agent';
  }
}

export default function PortalNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userRoles, setUserRoles] = useState([]);

  useEffect(() => {
    setIsLoggedIn(Boolean(localStorage.getItem('userMatricule')));
    setUserRole(normalizeRole(localStorage.getItem('userRole')));

    const savedRoles = localStorage.getItem('userRoles');
    let parsedRoles = [];
    try {
      const raw = JSON.parse(savedRoles || '[]');
      if (Array.isArray(raw)) {
        parsedRoles = raw.map(normalizeRole).filter(Boolean);
      }
    } catch (error) {
      parsedRoles = [];
    }
    setUserRoles(parsedRoles);
  }, []);

  const dashboardPath = userRoles.length > 1 ? '/dashboard' : getDashboardPath(userRole);

  const getVisibleLinks = () => {
    const links = [];
    
    if (isLoggedIn) {
      links.push({ href: dashboardPath, label: '📊 Tableau de bord' });
    }
    
    
    links.push({ href: '/demarches', label: '📝 Démarches RH' });
    links.push({ href: '/documents', label: '📄 Documents' });

    // ✅ Candidatures - UNIQUEMENT pour les agents (même avec plusieurs rôles)
    if (userRole === 'agent' || userRoles.includes('agent')) {
      links.push({ href: '/postes', label: '🎯 Candidatures' });
    }
    
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