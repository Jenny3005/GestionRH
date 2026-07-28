import { useEffect, useState } from 'react';

export default function usePermissions() {
  const [userRole, setUserRole] = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matricule, setMatricule] = useState(null);

  useEffect(() => {
    const fetchUserPermissions = async () => {
      const storedMatricule = localStorage.getItem('userMatricule');
      const storedRole = localStorage.getItem('userRole');
      
      if (!storedMatricule) {
        setLoading(false);
        return;
      }
      
      setMatricule(storedMatricule);
      setUserRole(storedRole);
      
      try {
        const response = await fetch(`/api/user-permissions/${storedMatricule}/`);
        if (response.ok) {
          const data = await response.json();
          setUserPermissions(data.permissions || []);
          console.log('Permissions chargées:', data.permissions);
        } else {
          console.error('Erreur chargement permissions');
          setUserPermissions([]);
        }
      } catch (error) {
        console.error('Erreur:', error);
        setUserPermissions([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserPermissions();
  }, []);
  useEffect(() => {
    if (userPermissions.length > 0) {
      console.log('Permissions disponibles:', userPermissions);
      console.log('A-t-il SUPPRIMER_PERMISSION ?', userPermissions.includes('SUPPRIMER_PERMISSION'));
    }
  }, [userPermissions]);

  const getPermissionAliases = (permission) => {
    const aliases = {
      MODIFIER_ROLE: ['MODIFIER_ROLE', 'ATTRIBUER_ROLE', 'GERER_ROLES'],
      ATTRIBUER_ROLE: ['ATTRIBUER_ROLE', 'MODIFIER_ROLE', 'GERER_ROLES'],
      GERER_ROLES: ['GERER_ROLES', 'ATTRIBUER_ROLE', 'MODIFIER_ROLE'],
      GERER_PERMISSIONS: ['GERER_PERMISSIONS', 'GERER_PERMISSION', 'GERER_PERM'],
      AJOUTER_PERMISSION: ['AJOUTER_PERMISSION', 'AJOUTER_PERMISSIONS', 'AJOUTER_PERM'],
      SUPPRIMER_PERMISSION: ['SUPPRIMER_PERMISSION', 'SUPPRIMER_PERMISSIONS', 'SUPPRIMER_PERM'],
      ATTRIBUER_PERMISSION: ['ATTRIBUER_PERMISSION', 'ATTRIBUER_PERMISSIONS', 'ATTRIBUER_PERM'],
      VOIR_AGENTS: ['VOIR_AGENTS', 'CONSULTER_AGENTS'],
    };

    return aliases[permission] || [permission];
  };

  // Vérifier si l'utilisateur a une permission spécifique
  const hasPermission = (permission) => {
    const candidates = getPermissionAliases(permission);
    return candidates.some(code => userPermissions.includes(code));
  };

  // Vérifier si l'utilisateur a au moins une des permissions
  const hasAnyPermission = (permissions) => {
    return permissions.some(p => hasPermission(p));
  };

  // Vérifier si l'utilisateur a toutes les permissions
  const hasAllPermissions = (permissions) => {
    return permissions.every(p => hasPermission(p));
  };

  // Vérifier le rôle
  const isAdmin = () => userRole === 'admin';
  const isRH = () => userRole === 'rh';
  const isChef = () => userRole === 'chef';
  const isAgent = () => userRole === 'agent';

  return {
    matricule,
    userRole,
    userPermissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    isRH,
    isChef,
    isAgent
  };
}