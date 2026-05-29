import React from 'react';
import usePermissions from '../hooks/usePermissions';

export default function Can({ children, permission, anyPermission, allPermissions, fallback = null }) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = usePermissions();

  if (loading) {
    return null; // ou un spinner de chargement
  }

  if (permission && hasPermission(permission)) {
    return children;
  }

  if (anyPermission && hasAnyPermission(anyPermission)) {
    return children;
  }

  if (allPermissions && hasAllPermissions(allPermissions)) {
    return children;
  }

  return fallback;
}