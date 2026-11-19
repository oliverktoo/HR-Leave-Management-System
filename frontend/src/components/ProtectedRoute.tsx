import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute = ({ children, allowedRoles = [] }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  const userRoles = [profile?.role, profile?.secondary_role].filter(Boolean) as UserRole[];

  // Debug logging
  console.log('🔐 ProtectedRoute Check:', {
    path: location.pathname,
    loading,
    hasUser: !!user,
    profileRole: profile?.role,
    secondaryRole: profile?.secondary_role,
    allowedRoles,
    isAllowed: allowedRoles.length === 0 || userRoles.some(r => allowedRoles.includes(r))
  });

  if (loading) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if user must change password (after admin reset)
  // Allow access to change-password page itself
  if (profile?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles.length > 0 && !userRoles.some(r => allowedRoles.includes(r))) {
    console.error('❌ Access Denied:', {
      path: location.pathname,
      userRole: profile?.role,
      secondaryRole: profile?.secondary_role,
      allowedRoles,
    });
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
