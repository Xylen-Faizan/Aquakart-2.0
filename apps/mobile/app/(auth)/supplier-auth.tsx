import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "../../features/auth/AuthProvider";
import { Button } from "../../components/ui";
import { theme } from "../../constants/theme";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase/client";

// Complete auth session if returning from web browser auth
WebBrowser.maybeCompleteAuthSession();

export default function SupplierAuthScreen() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);

      const redirectUrl = makeRedirectUri({
        scheme: "aquakart",
        path: "(supplier)/today",
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl,
        );
        if (result.type === "success" && result.url) {
          const parsedUrl = Linking.parse(result.url);
          const params = parsedUrl.queryParams || {};

          const code = params.code as string;
          if (code) {
            const { error: sessionError } =
              await supabase.auth.exchangeCodeForSession(code);
            if (sessionError) throw sessionError;
            return;
          }

          const urlObj = new URL(result.url.replace("#", "?"));
          const accessToken =
            (params.access_token as string) ||
            urlObj.searchParams.get("access_token");
          const refreshToken =
            (params.refresh_token as string) ||
            urlObj.searchParams.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
          } else {
            throw new Error(
              "Authentication failed: No valid session tokens returned from provider.",
            );
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSignIn = () => {
    router.push("/(auth)/phone-auth" as any);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Bar with Back Button */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(auth)/welcome" as any)
            }
            style={styles.backButton}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={{ width: 120, height: 120, marginBottom: theme.spacing.lg }}
            resizeMode="contain"
          />
          <Text style={styles.title}>Supplier Login</Text>
          <Text style={styles.subtitle}>
            Login to manage your AquaKart business.
          </Text>
        </View>

        <View style={styles.form}>
          <Button
            title="Continue with Phone Number"
            onPress={handlePhoneSignIn}
            style={styles.phoneButton}
            size="lg"
            leftElement={
              <Ionicons
                name="call"
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
            }
          />

          <Button
            title="Continue with Google"
            onPress={handleGoogleSignIn}
            loading={loading}
            style={styles.googleButton}
            textStyle={{ color: "#000" }}
            size="lg"
            leftElement={
              <Ionicons
                name="logo-google"
                size={20}
                color="#db4437"
                style={{ marginRight: 8 }}
              />
            }
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.line} />
          </View>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/supplier-email-auth" as any)}
            style={styles.forgotPassword}
          >
            <Text style={styles.forgotPasswordText}>
              Login with Email & Password
            </Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Want to join our network? </Text>
            <TouchableOpacity
              onPress={() => alert("Partner onboarding request sent!")}
            >
              <Text style={styles.linkText}>Partner with AquaKart</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flexGrow: 1, padding: theme.spacing.xl },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.xl,
    marginTop: Platform.OS === "ios" ? theme.spacing.xl : theme.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: { marginBottom: theme.spacing.xl, alignItems: "flex-start" },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: { fontSize: 16, color: theme.colors.textSecondary, lineHeight: 24 },
  form: { width: "100%", marginTop: 20 },
  phoneButton: {
    marginBottom: 16,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  googleButton: {
    marginBottom: 24,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  divider: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  line: { flex: 1, height: 1, backgroundColor: "#eee" },
  dividerText: { marginHorizontal: 16, color: "#999", fontWeight: "bold" },
  forgotPassword: { alignItems: "center", marginBottom: 32 },
  forgotPasswordText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: "500",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  footerText: { color: theme.colors.textSecondary, fontSize: 16 },
  linkText: { color: theme.colors.primary, fontSize: 16, fontWeight: "bold" },
});
