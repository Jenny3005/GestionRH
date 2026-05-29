import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AdminNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // Garder seulement le tableau de bord dans la navbar
  const links = [
    { href: '/admin/dashboard', label: '📊 Tableau de bord' }
  ];

  return (
    <nav className="nav-central-links">
      {links.map((link) => (
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