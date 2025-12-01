import { createContext, useContext, useEffect, useState, useMemo, useCallback, ReactNode } from 'react';
import { onAuthStateChange, getUserProfile, signOut as authSignOut } from '../services/authService';
import type { User, Session } from '@supabase/supabase-js';
import type { UserProfile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | undefined;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes
    const { data: { subscription } } = onAuthStateChange(async (event: string, session: Session | null) => {
      // Handle token refresh errors
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        if (!session) {
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
      }

      if (session?.user) {
        setUser(session.user);
        // Fetch user profile
        try {
          const { data: profileData, error } = await getUserProfile(session.user.id);
          if (!error && profileData) {
            setProfile(profileData);
          } else {
            console.error('Profile fetch error:', error);
            setProfile(null);
          }
        } catch (error) {
          console.error('Profile fetch error:', error);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    profile,
    role: profile?.role,
    loading,
    signOut,
  }), [user, profile, loading, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
