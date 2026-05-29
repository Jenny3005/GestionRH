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
        const response = await fetch(`http://localhost:8000/api/user-permissions/${storedMatricule}/`);
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

  // Vérifier si l'utilisateur a une permission spécifique
  const hasPermission = (permission) => {
    return userPermissions.includes(permission);
  };

  // Vérifier si l'utilisateur a au moins une des permissions
  const hasAnyPermission = (permissions) => {
    return permissions.some(p => userPermissions.includes(p));
  };

  // Vérifier si l'utilisateur a toutes les permissions
  const hasAllPermissions = (permissions) => {
    return permissions.every(p => userPermissions.includes(p));
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