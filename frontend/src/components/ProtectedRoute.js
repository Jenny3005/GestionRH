import React from 'react';
import { Navigate } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';

export default function ProtectedRoute({ 
  children, 
  requiredPermission,
  fallbackPath = '/auth' 
}) {
  const { hasPermission, loading, matricule } = usePermissions();

  if (loading) {
    return <div className="loading-spinner">Chargement...</div>;
  }

  if (!matricule) {
    return <Navigate to={fallbackPath} />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/dashboard" />;
  }

  return children;
}