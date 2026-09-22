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
import { Button, Input } from "../../components/ui";
import { theme } from "../../constants/theme";
import { supabase } from "../../lib/supabase/client";

export default function InviteCodeScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError("Please enter an invite code.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc(
        "accept_staff_invite",
        {
          p_invite_code: code.trim(),
        },
      );

      if (rpcError) throw rpcError;

      // Update the auth context to reflect the new role
      await refreshProfile();
      
      const role = data?.role;
      if (role === "helper") {
        router.replace("/(helper)/dashboard" as any);
      } else if (role === "driver") {
        router.replace("/(driver)/route" as any);
      } else {
        router.replace("/(auth)/welcome" as any);
      }
    } catch (err: any) {
      setError(err.message || "Invalid or expired invitation code");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/(auth)/welcome" as any);
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
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={{ width: 100, height: 100, marginBottom: theme.spacing.lg }}
            resizeMode="contain"
          />
          <Text style={styles.title}>Join Supplier Team</Text>
          <Text style={styles.subtitle}>
            Enter the invitation code provided by your supplier to access your dashboard.
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            placeholder="Enter invite code (e.g. S-XYZ-123)"
            value={code}
            onChangeText={(text) => {
              setCode(text);
              setError(null);
            }}
            autoCapitalize="characters"
            style={styles.input}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            title="Submit Code"
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitButton}
            size="lg"
          />
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
    justifyContent: "flex-end",
    marginBottom: theme.spacing.xl,
    marginTop: Platform.OS === "ios" ? theme.spacing.xl : theme.spacing.md,
  },
  signOutButton: {
    padding: theme.spacing.sm,
  },
  signOutText: {
    color: theme.colors.primary,
    fontWeight: "bold",
  },
  header: { marginBottom: theme.spacing.xl, alignItems: "center" },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    lineHeight: 24,
    textAlign: "center",
    paddingHorizontal: theme.spacing.md,
  },
  form: { width: "100%", marginTop: 20 },
  input: {
    marginBottom: 16,
  },
  submitButton: {
    marginTop: 8,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
});
