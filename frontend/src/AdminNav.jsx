import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import usePermissions from './hooks/usePermissions';
import Can from './components/Can';

export default function AdminNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission, isAdmin, loading } = usePermissions();
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const role = localStorage.getItem('userRole');
    setUserRole(role);
  }, []);

  // Configuration des liens avec les permissions requises
  const links = [
    { href: '/admin/dashboard', label: '📊 Tableau', permission: null }, // Visible par tous les admins
    { href: '/admin/agents', label: '👥 Agents', permission: 'VOIR_AGENTS' },
    { href: '/admin/roles', label: '⚙️ Rôles', permission: 'GERER_ROLES' },
    { href: '/admin/permissions', label: '🔐 Permissions', permission: 'GERER_PERMISSIONS' },
    { href: '/admin/types-demande', label: '📝 Types demande', permission: 'GERER_TYPES_DEMANDE' },
    { href: '/admin/types-piece', label: '📄 Types pièce', permission: 'GERER_TYPES_PIECE' }
  ];

  // Filtrer les liens selon les permissions
  const visibleLinks = links.filter(link => {
    if (link.permission === null) return true;
    if (isAdmin()) return true;
    return hasPermission(link.permission);
  });

  // Si chargement des permissions, afficher une version simplifiée
  if (loading) {
    return (
      <nav className="nav-central-links">
        {links.slice(0, 2).map((link) => (
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

  return (
    <nav className="nav-central-links">
      {visibleLinks.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={`nav-tab-item ${location.pathname === link.href ? 'active' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(link.href);
          }}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}