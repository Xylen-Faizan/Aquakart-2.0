import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../../constants/theme";
import { Card, Button } from "../../../components/ui";
import { useAuth } from "../../../features/auth/AuthProvider";
import { supabase } from "../../../lib/supabase/client";

export default function TeamScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [helpers, setHelpers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState<string | null>(null);

  const [generatedCode, setGeneratedCode] = useState<{
    role: string;
    code: string;
  } | null>(null);

  useEffect(() => {
    fetchTeam();
  }, [profile]);

  const fetchTeam = async () => {
    if (!profile) return;
    try {
      setLoading(true);
      // Get supplier ID
      const { data: supData } = await supabase
        .from("suppliers")
        .select("id")
        .eq("profile_id", profile.id)
        .single();

      if (!supData) {
        setLoading(false);
        return;
      }

      setSupplierId(supData.id);

      // Fetch drivers
      const { data: dData } = await supabase
        .from("drivers")
        .select(
          `
          id, is_active,
          profile:profiles (name, phone)
        `,
        )
        .eq("supplier_id", supData.id);

      if (dData) setDrivers(dData);

      // Fetch helpers
      const { data: hData } = await supabase
        .from("helpers")
        .select(
          `
          id, is_active,
          profile:profiles (name, phone)
        `,
        )
        .eq("supplier_id", supData.id);

      if (hData) setHelpers(hData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateInvite = async (role: "driver" | "helper") => {
    if (!supplierId) return;
    try {
      const rpcName =
        role === "driver" ? "generate_driver_invite" : "generate_helper_invite";
      const { data, error } = await supabase.rpc(rpcName, {
        p_supplier_id: supplierId,
      });

      if (error) throw error;

      setGeneratedCode({ role, code: data });
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message || "Failed to generate invite");
    }
  };

  const renderCrewMember = (member: any, role: string) => (
    <View style={styles.memberCard} key={member.id}>
      <View style={styles.memberIcon}>
        <Ionicons
          name={role === "driver" ? "car-outline" : "person-outline"}
          size={24}
          color={theme.colors.primary}
        />
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {member.profile?.name || "Unnamed"}
        </Text>
        <Text style={styles.memberPhone}>{member.profile?.phone}</Text>
      </View>
      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor: member.is_active
              ? theme.colors.success + "20"
              : theme.colors.error + "20",
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            {
              color: member.is_active
                ? theme.colors.success
                : theme.colors.error,
            },
          ]}
        >
          {member.is_active ? "Active" : "Inactive"}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Ionicons
          name="arrow-back"
          size={24}
          color={theme.colors.textPrimary}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>Team & Crew</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {generatedCode && (
          <Card style={styles.codeCard}>
            <Text style={styles.codeTitle}>
              New {generatedCode.role} Invite Code
            </Text>
            <Text style={styles.codeSubtitle}>
              Share this 6-character code with your new {generatedCode.role}.
              They will enter it when they open the app.
            </Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{generatedCode.code}</Text>
            </View>
            <Button
              title="Done"
              onPress={() => setGeneratedCode(null)}
              variant="outline"
              style={{ marginTop: 12 }}
            />
          </Card>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Drivers</Text>
          <Button
            title="+ Add Driver"
            onPress={() => generateInvite("driver")}
            size="sm"
            disabled={!!generatedCode}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ margin: 20 }} />
        ) : drivers.length > 0 ? (
          <Card style={styles.listCard}>
            {drivers.map((d) => renderCrewMember(d, "driver"))}
          </Card>
        ) : (
          <Text style={styles.emptyText}>No drivers added yet.</Text>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Helpers</Text>
          <Button
            title="+ Add Helper"
            onPress={() => generateInvite("helper")}
            size="sm"
            disabled={!!generatedCode}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ margin: 20 }} />
        ) : helpers.length > 0 ? (
          <Card style={styles.listCard}>
            {helpers.map((h) => renderCrewMember(h, "helper"))}
          </Card>
        ) : (
          <Text style={styles.emptyText}>No helpers added yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  container: { flex: 1 },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  listCard: { padding: 0, overflow: "hidden" },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  memberIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  memberPhone: { fontSize: 14, color: theme.colors.textSecondary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: "bold" },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    fontStyle: "italic",
    marginBottom: 16,
  },

  codeCard: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  codeTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.primary,
    marginBottom: 8,
  },
  codeSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  codeBox: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: "dashed",
  },
  codeText: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.colors.textPrimary,
    letterSpacing: 4,
  },
});
