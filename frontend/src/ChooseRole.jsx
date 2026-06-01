import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardPath, getRoleLabel, normalizeRole } from './PortalNav';
import './App.css';

export default function ChooseRole() {
  const navigate = useNavigate();

  const roles = useMemo(() => {
    const savedRoles = localStorage.getItem('userRoles');
    try {
      const parsed = JSON.parse(savedRoles || '[]');
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeRole).filter(Boolean);
      }
    } catch (error) {
      return [];
    }
    return [];
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('userMatricule')) {
      navigate('/auth');
      return;
    }

    if (roles.length === 0) {
      navigate('/auth');
    } else if (roles.length === 1) {
      const role = roles[0];
      localStorage.setItem('userRole', role);
      navigate(getDashboardPath(role));
    }
  }, [navigate, roles]);

  const handleRoleSelection = (role) => {
    const normalized = normalizeRole(role);
    localStorage.setItem('userRole', normalized);
    navigate(getDashboardPath(normalized));
  };

  if (roles.length === 0) {
    return null;
  }

  return (
    <div className="choice-container">
      <div className="choice-card">
        <h1>Choisissez votre rôle</h1>
        <p>Vous avez plusieurs rôles. Sélectionnez celui que vous souhaitez utiliser pour accéder au tableau de bord.</p>
        <div className="choice-list">
          {roles.map((role) => (
            <button key={role} className="choice-button" onClick={() => handleRoleSelection(role)}>
              {getRoleLabel(role)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
