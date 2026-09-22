import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../../constants/theme";
import { Card, Button } from "../../../components/ui";
import { useAuth } from "../../../features/auth/AuthProvider";
import { supabase } from "../../../lib/supabase/client";

export default function VehiclesScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState<string | null>(null);

  // New vehicle form state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newVehicleNumber, setNewVehicleNumber] = useState("");
  const [newVehicleType, setNewVehicleType] = useState("auto");

  useEffect(() => {
    fetchVehicles();
  }, [profile]);

  const fetchVehicles = async () => {
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
        Alert.alert("Error", "Please complete your Business Profile first.");
        router.back();
        return;
      }

      setSupplierId(supData.id);

      // Fetch vehicles
      const { data: vData, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("supplier_id", supData.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (vData) setVehicles(vData);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to load vehicles.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddVehicle = async () => {
    if (!supplierId) return;
    if (!newVehicleNumber.trim()) {
      Alert.alert("Error", "Please enter a vehicle number (e.g., JH-01-AB-1234)");
      return;
    }

    try {
      setAdding(true);
      const { error } = await supabase.from("vehicles").insert({
        supplier_id: supplierId,
        vehicle_number: newVehicleNumber.trim().toUpperCase(),
        vehicle_type: newVehicleType,
        is_active: true,
      });

      if (error) throw error;

      Alert.alert("Success", "Vehicle added successfully!");
      setNewVehicleNumber("");
      setIsAddingNew(false);
      fetchVehicles(); // Refresh the list
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message || "Failed to add vehicle.");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.safeArea, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fleet Vehicles</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {isAddingNew ? (
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Add New Vehicle</Text>
            
            <Text style={styles.label}>Registration Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. MH-01-AB-1234"
              value={newVehicleNumber}
              onChangeText={setNewVehicleNumber}
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Vehicle Type</Text>
            <View style={styles.typeSelector}>
              {["auto", "pickup", "truck", "bike"].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeChip,
                    newVehicleType === type && styles.typeChipActive,
                  ]}
                  onPress={() => setNewVehicleType(type)}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      newVehicleType === type && styles.typeChipTextActive,
                    ]}
                  >
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setIsAddingNew(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={adding ? "Saving..." : "Save Vehicle"}
                onPress={handleAddVehicle}
                disabled={adding}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </Card>
        ) : (
          <Button
            title="+ Add New Vehicle"
            onPress={() => setIsAddingNew(true)}
            style={{ marginBottom: 16 }}
          />
        )}

        <Text style={styles.sectionTitle}>Your Vehicles ({vehicles.length})</Text>

        {vehicles.length === 0 && !isAddingNew ? (
          <View style={styles.emptyState}>
            <Ionicons name="car-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyStateText}>No vehicles added yet.</Text>
          </View>
        ) : (
          vehicles.map((v) => (
            <Card key={v.id} style={styles.vehicleCard}>
              <View style={styles.vehicleIcon}>
                <Ionicons
                  name={
                    v.vehicle_type === "bike"
                      ? "bicycle-outline"
                      : "car-outline"
                  }
                  size={24}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.vehicleInfo}>
                <Text style={styles.vehicleNumber}>{v.vehicle_number}</Text>
                <Text style={styles.vehicleType}>
                  {v.vehicle_type?.toUpperCase() || "UNKNOWN"}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: v.is_active
                      ? theme.colors.success + "20"
                      : theme.colors.error + "20",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: v.is_active ? theme.colors.success : theme.colors.error },
                  ]}
                >
                  {v.is_active ? "Active" : "Inactive"}
                </Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  formCard: {
    padding: 16,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: 16,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  },
  typeSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  typeChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  typeChipTextActive: {
    color: theme.colors.surface,
  },
  formActions: {
    flexDirection: "row",
    marginTop: 24,
  },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 12,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleNumber: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  vehicleType: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
});
