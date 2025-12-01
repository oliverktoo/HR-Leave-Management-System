import { supabase } from '../lib/supabaseClient';
import type { UserProfile, ServiceResponse, SignUpFormData } from '../types';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

/**
 * Authentication Service
 * Handles all authentication operations with Supabase
 */

interface AuthData {
  user: User;
  session: Session;
}

// Sign up new user
export const signUp = async (
  email: string,
  password: string,
  userData: SignUpFormData
): Promise<ServiceResponse<AuthData>> => {
  try {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;
    if (!authData.user || !authData.session) throw new Error('No user data returned');

    // Create user profile
    const { error: profileError } = await supabase
      .from('users_profile')
      .insert({
        id: authData.user.id,
        email: email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        employee_id: userData.employee_id,
        department_id: userData.department_id,
        role: 'employee',
        phone: userData.phone,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileError) throw profileError;

    return { 
      data: { user: authData.user, session: authData.session }, 
      error: null 
    };
  } catch (error) {
    console.error('Sign up error:', error);
    return { data: null, error: error as Error };
  }
};

// Sign in user
export const signIn = async (
  email: string,
  password: string
): Promise<ServiceResponse<AuthData>> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user || !data.session) throw new Error('No user data returned');
    
    return { 
      data: { user: data.user, session: data.session }, 
      error: null 
    };
  } catch (error) {
    console.error('Sign in error:', error);
    return { data: null, error: error as Error };
  }
};

// Sign out user
export const signOut = async (): Promise<{ error: Error | null }> => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Sign out error:', error);
    return { error: error as Error };
  }
};

// Get current user
export const getCurrentUser = async (): Promise<{ user: User | null; error: Error | null }> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return { user, error: null };
  } catch (error) {
    console.error('Get current user error:', error);
    return { user: null, error: error as Error };
  }
};

// Get user profile
export const getUserProfile = async (
  userId: string
): Promise<ServiceResponse<UserProfile>> => {
  try {
    const { data, error } = await supabase
      .from('users_profile')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return { data: data as UserProfile, error: null };
  } catch (error) {
    console.error('Get user profile error:', error);
    return { data: null, error: error as Error };
  }
};

// Reset password
export const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
  try {
    // Use environment variable for app URL, fallback to current origin for development
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/reset-password`,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Reset password error:', error);
    return { error: error as Error };
  }
};

// Update password
export const updatePassword = async (newPassword: string): Promise<{ error: Error | null }> => {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Update password error:', error);
    return { error: error as Error };
  }
};

// Subscribe to auth state changes
export const onAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void
) => {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
};
