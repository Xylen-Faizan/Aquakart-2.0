import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments, ErrorBoundary } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoadingState } from '../components/feedback';

export { ErrorBoundary };

function ProtectedLayout() {
  const { user, role, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inCustomerGroup = segments[0] === '(customer)';
    const inSupplierGroup = segments[0] === '(supplier)';

    if (!user) {
      // If user is not logged in, and they are trying to access protected routes, redirect to welcome
      if (inCustomerGroup || inSupplierGroup || (segments.length as number) === 0) {
        router.replace('/(auth)/welcome');
      }
    } else {
      // User is logged in
      if (role === 'supplier') {
        if (!inSupplierGroup) {
          router.replace('/(supplier)/today' as any);
        }
      } else if (role === 'customer') {
        if (!inCustomerGroup) {
          router.replace('/(customer)/home');
        }
      } else {
        // Unknown or missing role
        if (segments[0] !== '(auth)' || (segments[1] as string) !== 'setup') {
          router.replace('/(auth)/setup' as any);
        }
      }
    }
  }, [user, role, loading, segments]);

  if (loading) {
    return <LoadingState message="Starting AquaKart..." />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(supplier)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <ProtectedLayout />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

