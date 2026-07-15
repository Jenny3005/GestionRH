import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDashboardPath, getRoleLabel, normalizeRole } from './PortalNav';
import './App.css';

export default function UserMenu({ showDocuments = true, additionalLinks = [], onLogout }) {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dashboardSubmenuOpen, setDashboardSubmenuOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userRoles, setUserRoles] = useState([]);

  useEffect(() => {
    const savedNom = localStorage.getItem('userNom') || '';
    const savedPrenom = localStorage.getItem('userPrenom') || '';
    setUserName(`${savedPrenom} ${savedNom}`.trim());
    setUserEmail(localStorage.getItem('userEmail') || '');

    const currentRole = localStorage.getItem('userRole');
    const savedRoles = localStorage.getItem('userRoles');

    let parsedRoles = [];
    try {
      const raw = JSON.parse(savedRoles || '[]');
      if (Array.isArray(raw)) {
        parsedRoles = raw.map(normalizeRole).filter(Boolean);
        // remove duplicates while preserving order
        parsedRoles = Array.from(new Set(parsedRoles));
      }
    } catch (error) {
      console.error('Error parsing roles:', error);
      parsedRoles = [];
    }

    // If no parsed roles but a currentRole exists, use it (normalized)
    const normalizedCurrent = normalizeRole(currentRole) || '';
    if (parsedRoles.length > 0) {
      setUserRoles(parsedRoles);
      setUserRole(normalizedCurrent || parsedRoles[0]);
    } else if (normalizedCurrent) {
      setUserRoles([normalizedCurrent]);
      setUserRole(normalizedCurrent);
    } else {
      setUserRoles(['agent']);
      setUserRole('agent');
    }
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.user-menu-container')) {
        setDropdownOpen(false);
        setDashboardSubmenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  const handleLogout = () => {
    localStorage.clear();
    if (onLogout) {
      onLogout();
      return;
    }
    window.location.href = '/';
  };

  const handleRoleChange = (role) => {
    localStorage.setItem('userRole', role);
    setDropdownOpen(false);
    setDashboardSubmenuOpen(false);
    navigate(getDashboardPath(role));
  };

  const toggleDashboardSubmenu = () => {
    setDashboardSubmenuOpen(!dashboardSubmenuOpen);
  };

  return (
    <div className="user-menu-container">
      <div className="user-badge" onClick={() => setDropdownOpen(!dropdownOpen)}>
        <div className="avatar-circle">{userName.charAt(0) || 'U'}</div>
        <div className="user-meta">
          <span className="user-name">{userName || 'Utilisateur'}</span>
          <span className="user-role">{getRoleLabel(userRole)}</span>
        </div>
        <span className="dropdown-arrow">▼</span>
      </div>

      {dropdownOpen && (
        <div className="dropdown-menu">
          <div className="dropdown-header">
            <strong>{userName || 'Utilisateur'}</strong>
            <small>{userEmail}</small>
          </div>
          <div className="dropdown-divider"></div>
          
          {/* Tableau de bord avec sous-menu */}
          <div className="dropdown-submenu">
            <button 
              className="dropdown-item dropdown-parent"
              onClick={toggleDashboardSubmenu}
            >
               Tableau de bord <span className="submenu-arrow">{dashboardSubmenuOpen ? '▼' : '▶'}</span>
            </button>
            {dashboardSubmenuOpen && (
              <div className="dropdown-submenu-content">
                {userRoles.map((role) => (
                  <button
                    key={role}
                    className={`dropdown-subitem ${role === userRole ? 'active' : ''}`}
                    onClick={() => handleRoleChange(role)}
                  >
                    {role === userRole ? '✅ ' : '🔄 '}{getRoleLabel(role)}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="dropdown-divider"></div>
          
          {/* Liens personnels */}
          <button className="dropdown-item" onClick={() => { setDropdownOpen(false); navigate('/profil'); }}>
            👤 Mon profil
          </button>
          {showDocuments && (
            <button className="dropdown-item" onClick={() => { setDropdownOpen(false); navigate('/documents'); }}>
              📁 Mes documents
            </button>
          )}
          {(userRole === 'rh' || userRole === 'rh/secretaire') && (
            <button className="dropdown-item" onClick={() => { setDropdownOpen(false); navigate('/archivage'); }}>
              🗄️ Archivage
            </button>
          )}
          
          {/* Liens supplémentaires */}
          {additionalLinks.length > 0 && <div className="dropdown-divider"></div>}
          {additionalLinks.map((link) => (
            <button key={link.href} className="dropdown-item" onClick={() => { setDropdownOpen(false); navigate(link.href); }}>
              {link.label}
            </button>
          ))}
          
          <div className="dropdown-divider"></div>
          <button className="dropdown-item logout" onClick={() => { setDropdownOpen(false); handleLogout(); }}>
             Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}