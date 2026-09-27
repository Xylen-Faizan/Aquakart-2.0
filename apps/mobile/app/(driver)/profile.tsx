import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../features/auth/AuthProvider";
import { supabase } from "../../lib/supabase/client";
import { theme } from "../../constants/theme";
import { Card, Button } from "../../components/ui";

export default function DriverProfileScreen() {
  const { profile, signOut } = useAuth();
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      fetchSupplier();
    }
  }, [profile?.id]);

  const fetchSupplier = async () => {
    try {
      const { data: driverData, error: driverError } = await supabase
        .from("drivers")
        .select("supplier_id")
        .eq("profile_id", profile?.id)
        .single();

      if (driverError || !driverData) throw driverError;

      const { data: supplierData, error: supplierError } = await supabase
        .from("suppliers")
        .select("business_name")
        .eq("id", driverData.supplier_id)
        .single();

      if (supplierError) throw supplierError;

      setSupplierName(supplierData?.business_name || "Unknown Supplier");
    } catch (e) {
      console.log("Error fetching supplier", e);
      setSupplierName("Could not load supplier");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={40} color={theme.colors.primary} />
          </View>
          <Text style={styles.name}>{profile?.name || "Driver"}</Text>
          <Text style={styles.role}>Aquakart Driver</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Identity Details</Text>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.infoText}>{profile?.phone || "No phone added"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.infoText}>{profile?.email || "No email added"}</Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Work Profile</Text>
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <View style={styles.infoRow}>
              <Ionicons name="business-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.infoText}>Assigned to: {supplierName}</Text>
            </View>
          )}
        </Card>
      </View>

      <View style={styles.footer}>
        <Button
          variant="outline"
          title="Log Out"
          onPress={() => signOut()}
          style={styles.logoutButton}
          textStyle={{ color: theme.colors.error }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  name: {
    fontSize: 24,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  role: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  card: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  infoText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.md,
  },
  footer: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  logoutButton: {
    borderColor: theme.colors.error,
  },
});
