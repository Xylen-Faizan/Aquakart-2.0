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
import { useAndroidBack } from "../../../hooks/useAndroidBack";
import { useLanguage } from "../../../features/i18n/LanguageProvider";

export default function VehiclesScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  useAndroidBack();
  const { t } = useLanguage();

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
        Alert.alert(t('error'), t('vehicles.complete_profile'));
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
      Alert.alert(t('error'), t('vehicles.failed_load'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddVehicle = async () => {
    if (!supplierId) return;
    if (!newVehicleNumber.trim()) {
      Alert.alert(t('error'), t('vehicles.enter_number'));
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

      Alert.alert(t('success'), t('vehicles.added_success'));
      setNewVehicleNumber("");
      setIsAddingNew(false);
      fetchVehicles(); // Refresh the list
    } catch (err: any) {
      console.error(err);
      Alert.alert(t('error'), err.message || t('vehicles.failed_add'));
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
        <Text style={styles.headerTitle}>{t('vehicles.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {isAddingNew ? (
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>{t('vehicles.add_new')}</Text>
            
            <Text style={styles.label}>{t('vehicles.reg_number')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('vehicles.reg_placeholder')}
              value={newVehicleNumber}
              onChangeText={setNewVehicleNumber}
              autoCapitalize="characters"
            />

            <Text style={styles.label}>{t('vehicles.type')}</Text>
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
                title={t('cancel')}
                variant="outline"
                onPress={() => setIsAddingNew(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={adding ? t('vehicles.saving') : t('vehicles.save')}
                onPress={handleAddVehicle}
                disabled={adding}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </Card>
        ) : (
          <Button
            title={t('vehicles.btn_add_new')}
            onPress={() => setIsAddingNew(true)}
            style={{ marginBottom: 16 }}
          />
        )}

        <Text style={styles.sectionTitle}>{t('vehicles.your_vehicles')} ({vehicles.length})</Text>

        {vehicles.length === 0 && !isAddingNew ? (
          <View style={styles.emptyState}>
            <Ionicons name="car-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyStateText}>{t('vehicles.no_vehicles')}</Text>
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
                  {v.vehicle_type?.toUpperCase() || t('vehicles.unknown')}
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
                  {v.is_active ? t('vehicles.active') : t('vehicles.inactive')}
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
