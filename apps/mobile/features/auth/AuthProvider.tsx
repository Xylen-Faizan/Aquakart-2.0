import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase/client';
import { notificationService } from '../../services/notifications';
import { LEGAL_VERSION } from '@aquakart/config';
import { legalService } from '../../services/legal';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: any | null;
  role: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: () => Promise<{ data: any, error: any }>;
  signInWithPhone: (phone: string) => Promise<{ data: any, error: any }>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ data: any, error: any }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (!error && data) {
        setProfile(data);
        setRole(data.role);
        return data;
      }
      return null;
    } catch (e) {
      console.error('fetchProfile error:', e);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    async function initializeSession() {
      try {
        console.log('[AuthProvider] Boot: restoring persisted Supabase session...');
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (error) {
          console.error('[AuthProvider] getSession error:', error);
          setLoading(false);
          return;
        }

        if (initialSession?.user) {
          console.log('[AuthProvider] Boot: persisted session', initialSession.user.email);
          setSession(initialSession);
          setUser(initialSession.user);
          // Wait for profile so role is ready for navigation guard
          await fetchProfile(initialSession.user.id);
        } else {
          console.log('[AuthProvider] Boot: persisted session (none)');
        }
      } catch (err) {
        console.error('[AuthProvider] Initialization crash:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    // Run deterministic initialization
    initializeSession();

    // Listen for ongoing auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;
        
        console.log('[AuthProvider] onAuthStateChange:', event, !!currentSession);

        if (event === 'SIGNED_IN') {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          if (currentSession?.user) {
            await fetchProfile(currentSession.user.id);
            if (currentSession.user.user_metadata?.legal_terms_version === LEGAL_VERSION) {
              try { await legalService.recordConsent("mobile-auth-state"); } catch (e) { console.error("Legal consent record failed:", e); }
            }
            // Sync push token when user signs in
            notificationService.syncPushToken(currentSession.user.id);
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setRole(null);
        } else if (event === 'TOKEN_REFRESHED') {
          // Token refreshed, ensure session object is updated but don't wipe active profile state
          if (currentSession?.user) {
             setSession(currentSession);
             setUser(currentSession.user);
          }
        } else if (event === 'USER_UPDATED') {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
        }
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async (name: string, email: string, password: string) => {
    return supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          name,
          legal_terms_version: LEGAL_VERSION,
          legal_privacy_version: LEGAL_VERSION,
        }
      }
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const signInWithGoogle = async () => {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'aquakart://auth/callback',
      },
    });
  };

  const signInWithPhone = async (phone: string) => {
    return supabase.auth.signInWithOtp({
      phone,
    });
  };

  const verifyPhoneOtp = async (phone: string, token: string) => {
    return supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, role, loading, signIn, signUp, signOut, refreshProfile, signInWithGoogle, signInWithPhone, verifyPhoneOtp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
