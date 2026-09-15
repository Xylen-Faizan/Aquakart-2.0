import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, Image, Platform } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { WaterRipple } from '../../components/ui';
import { supabase } from '../../lib/supabase/client';
import { LoadingState } from '../../components/feedback';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

export default function CustomerAuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);

      if (__DEV__) {
        // Mock seamless Google Login for local development to test DB flow without deep link headaches
        const mockEmail = 'google_demo@gmail.com';
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: mockEmail,
          password: 'password123'
        });
        
        if (signInError) {
          // User doesn't exist yet, simulate first-time Google signup
          const { error: signUpError } = await supabase.auth.signUp({
            email: mockEmail,
            password: 'password123',
            options: { data: { name: 'Google Demo User' } }
          });
          if (signUpError) throw signUpError;
        }
        
        router.replace('/');
        return;
      }

      // Production Supabase OAuth flow
      const redirectUrl = makeRedirectUri({
        scheme: 'aquakart',
        path: '(customer)/home',
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        }
      });
      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
          // Parse URL to get session tokens or authorization code
          const parsedUrl = Linking.parse(result.url);
          const params = parsedUrl.queryParams || {};
          
          // 1. Native PKCE flow (Recommended for mobile)
          const code = params.code as string;
          if (code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
            if (sessionError) throw sessionError;
            return; // Success handled by AuthProvider listener
          }
          
          // 2. Fallback Implicit flow (Legacy)
          // OAuth tokens can be in the hash or query string depending on provider config
          // Sometimes fragment is not parsed into queryParams depending on expo-linking version
          const urlObj = new URL(result.url.replace('#', '?'));
          const accessToken = params.access_token as string || urlObj.searchParams.get('access_token');
          const refreshToken = params.refresh_token as string || urlObj.searchParams.get('refresh_token');
          
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            if (sessionError) throw sessionError;
          } else {
             throw new Error('Authentication failed: No valid session tokens returned from provider.');
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = () => {
    // For V1, if phone auth isn't fully set up with OTP, we can just route to a fallback or traditional register.
    // Given the prompt, we are keeping standard email/phone signup fallback for customers.
    router.push('/(auth)/register');
  };

  if (loading) {
    return <LoadingState message="Connecting to Google..." />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.backgroundContainer}>
        <WaterRipple color={theme.colors.primaryLight} maxScale={4} duration={3000} style={styles.ripple1} />
      </View>

      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/welcome')} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
        </View>

        <View style={styles.heroSection}>
          <Image source={require('../../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.title}>Welcome to{'\n'}AquaKart</Text>
          <Text style={styles.subtitle}>Get pure water delivered{'\n'}to your door</Text>
        </View>

        <View style={styles.actionsContainer}>
          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable style={styles.googleButton} onPress={handleGoogleLogin}>
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <Pressable style={styles.phoneButton} onPress={handlePhoneLogin}>
            <Text style={styles.phoneIcon}>📱</Text>
            <Text style={styles.phoneButtonText}>Continue with Email / Phone</Text>
          </Pressable>
          
          <Text style={styles.termsText}>
            By continuing, you agree to our Terms & Privacy Policy
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
  },
  ripple1: {
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.3,
  },
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: theme.spacing.md,
  },
  backButton: {
    paddingVertical: theme.spacing.sm,
  },
  backText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium as any,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 64,
    height: 64,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  actionsContainer: {
    width: '100%',
    paddingBottom: theme.spacing.xl,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: theme.spacing.lg,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#DB4437', // Google red
    marginRight: theme.spacing.sm,
  },
  googleButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold as any,
    color: theme.colors.textPrimary,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    marginHorizontal: theme.spacing.md,
    color: theme.colors.textTertiary,
    fontSize: theme.fontSize.sm,
  },
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xl,
  },
  phoneIcon: {
    fontSize: 18,
    marginRight: theme.spacing.sm,
  },
  phoneButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textSecondary,
  },
  errorText: {
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  termsText: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
});
