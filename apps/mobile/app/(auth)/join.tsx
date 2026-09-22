import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../constants/theme";
import { Input, Button } from "../../components/ui";
import { supabase } from "../../lib/supabase/client";
import { useAuth } from "../../features/auth/AuthProvider";

export default function JoinScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!code || code.trim().length !== 6) {
      Alert.alert(
        "Invalid Code",
        "Please enter a valid 6-character invitation code.",
      );
      return;
    }

    setLoading(true);
    const upperCode = code.trim().toUpperCase();

    try {
      // 1. Try Helper Invite first
      const { data: helperData, error: helperError } = await supabase.rpc(
        "accept_helper_invite",
        {
          p_invite_code: upperCode,
        },
      );

      if (!helperError && helperData) {
        // Success as helper
        await refreshProfile();
        router.replace("/(helper)/dashboard" as any);
        return;
      }

      // 2. If it fails, try Driver Invite
      const { data: driverData, error: driverError } = await supabase.rpc(
        "accept_driver_invite",
        {
          p_invite_code: upperCode,
        },
      );

      if (!driverError && driverData) {
        // Success as driver
        await refreshProfile();
        router.replace("/(driver)/route" as any);
        return;
      }

      // If both fail
      throw new Error("Invalid or expired invitation code.");
    } catch (err: any) {
      console.error("Join Error:", err);
      Alert.alert(
        "Join Failed",
        err.message || "Invalid or expired invitation code.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Ionicons
              name="close"
              size={28}
              color={theme.colors.textPrimary}
              onPress={() => router.back()}
              style={styles.backBtn}
            />
          </View>

          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="people" size={48} color={theme.colors.primary} />
            </View>
            <Text style={styles.title}>Join a Crew</Text>
            <Text style={styles.subtitle}>
              Enter the 6-character code provided by your Supplier to join their
              delivery team.
            </Text>

            <View style={styles.inputContainer}>
              <Input
                placeholder="e.g. A8K4P2"
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                maxLength={6}
                style={styles.codeInput}
              />
            </View>

            <Button
              title="Join Team"
              onPress={handleJoin}
              loading={loading}
              disabled={code.length < 6 || loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  keyboardView: { flex: 1 },
  scroll: { flexGrow: 1, padding: theme.spacing.xl },
  header: { alignItems: "flex-end", marginBottom: theme.spacing.xl },
  backBtn: { padding: 4 },
  content: { flex: 1, justifyContent: "center" },
  iconContainer: {
    alignSelf: "center",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 24,
  },
  inputContainer: { marginBottom: 30 },
  codeInput: {
    fontSize: 24,
    textAlign: "center",
    letterSpacing: 4,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
});
