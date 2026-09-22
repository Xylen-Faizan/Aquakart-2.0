import React, { useEffect } from "react";
import { Stack, useRouter, useSegments, ErrorBoundary } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider";
import {
  LanguageProvider,
  useLanguage,
} from "../features/i18n/LanguageProvider";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoadingState } from "../components/feedback";

import * as Network from "expo-network";
import { View, Text } from "react-native";

export { ErrorBoundary };

function OfflineBanner() {
  const [isConnected, setIsConnected] = React.useState(true);

  React.useEffect(() => {
    const checkNetwork = async () => {
      const networkState = await Network.getNetworkStateAsync();
      setIsConnected(networkState.isConnected ?? true);
    };
    checkNetwork();
    const interval = setInterval(checkNetwork, 3000);
    return () => clearInterval(interval);
  }, []);

  if (isConnected) return null;

  return (
    <View
      style={{
        backgroundColor: "#ef4444",
        padding: 10,
        paddingTop: 40,
        alignItems: "center",
        zIndex: 999,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "bold" }}>
        No Internet Connection
      </Text>
    </View>
  );
}

function ProtectedLayout() {
  const { user, role, loading: authLoading } = useAuth();
  const { language, loading: langLoading } = useLanguage();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || langLoading) return;

    // Force language selection if not set
    if (!language && (segments[1] as any) !== "language") {
      router.replace("/(auth)/language" as any);
      return;
    }

    const inAuthGroup = segments[0] === "(auth)";
    const inCustomerGroup = segments[0] === "(customer)";
    const inSupplierGroup = segments[0] === "(supplier)";

    if (!user) {
      // Allow unauthenticated users to stay on auth screens (welcome, language, login, etc.)
      if (inAuthGroup) {
        // User is on an auth screen — allow it, no redirect needed
        return;
      }
      // If user is on a protected route or has no segment, send to welcome
      if (
        inCustomerGroup ||
        inSupplierGroup ||
        (segments.length as number) === 0
      ) {
        router.replace("/(auth)/welcome" as any);
      }
    } else {
      // User is logged in
      const inDriverGroup = (segments[0] as string) === "(driver)";
      const inHelperGroup = (segments[0] as string) === "(helper)";

      if (role === "supplier") {
        if (!inSupplierGroup) {
          router.replace("/(supplier)/today" as any);
        }
      } else if (role === "customer") {
        if (!inCustomerGroup) {
          router.replace("/(customer)/home" as any);
        }
      } else if (role === "driver") {
        if (!inDriverGroup) {
          router.replace("/(driver)/route" as any);
        }
      } else if (role === "helper") {
        if (!inHelperGroup) {
          router.replace("/(helper)/dashboard" as any);
        }
      } else {
        // Unknown or missing role
        if (segments[0] !== "(auth)" || (segments[1] as string) !== "setup") {
          router.replace("/(auth)/setup" as any);
        }
      }
    }
  }, [user, role, authLoading, langLoading, language, segments]);

  if (authLoading || langLoading) {
    return <LoadingState message="Starting AquaKart..." />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(supplier)" />
      <Stack.Screen name="(driver)" />
      <Stack.Screen name="(helper)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <OfflineBanner />
        <LanguageProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <ProtectedLayout />
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
