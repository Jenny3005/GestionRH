import React from 'react';
import { useLocation } from 'react-router-dom';

export default function AdminNav() {
  const location = useLocation();

  const links = [
    { href: '/admin/dashboard', label: 'Tableau' },
    { href: '/admin/agents', label: 'Agents' },
    { href: '/admin/roles', label: 'Rôles' },
    { href: '/admin/types-demande', label: 'Types demande' },
    { href: '/admin/types-piece', label: 'Types pièce' }
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
