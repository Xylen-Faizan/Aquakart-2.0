import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../features/auth/AuthProvider";
import { helperOpsService } from "../../services/helper-ops";
import { Button } from "../../components/ui";

export default function HelperDashboard() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [capacity, setCapacity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load Confirmation State
  const [isConfirmingLoad, setIsConfirmingLoad] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [loadQuantities, setLoadQuantities] = useState<Record<string, string>>({});

  const today = new Date().toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const runs = await helperOpsService.getHelperRun(user.id, today);
      const activeRun = runs?.[0] || null;
      setRun(activeRun);

      if (activeRun) {
        const cap = await helperOpsService.getCapacityState(activeRun.id);
        setCapacity(cap || []);
      }
    } catch (err: any) {
      console.error("Error loading helper data:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getCapacityColor = (opp: number) => {
    if (opp >= 5) return "#22C55E";
    if (opp >= 1) return "#F59E0B";
    return "#EF4444";
  };

  const getCapacityLabel = (opp: number) => {
    if (opp >= 5) return "🟢 Available";
    if (opp >= 1) return "🟡 Limited";
    return "🔴 Full";
  };

  const openConfirmLoadModal = async () => {
    if (!run?.supplier_id) return;
    try {
      setIsConfirmingLoad(true);
      const prods = await helperOpsService.getSupplierProducts(run.supplier_id);
      setSupplierProducts(prods || []);
      // Initialize quantities to "0"
      const initQs: Record<string, string> = {};
      prods?.forEach((p) => {
        initQs[p.id] = "0";
      });
      setLoadQuantities(initQs);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to load supplier products.");
    }
  };

  const updateQuantity = (id: string, val: string) => {
    setLoadQuantities(prev => ({ ...prev, [id]: val }));
  };

  const handleConfirmLoad = async () => {
    if (!run?.id) return;
    
    // Parse loads
    const productLoads = Object.entries(loadQuantities)
      .map(([id, qtyStr]) => ({
        supplier_product_id: id,
        quantity: parseInt(qtyStr) || 0,
      }))
      .filter((p) => p.quantity > 0);

    if (productLoads.length === 0) {
      Alert.alert("Error", "Please enter at least one product quantity.");
      return;
    }

    try {
      setConfirming(true);
      await helperOpsService.confirmLoad(run.id, productLoads);
      Alert.alert("Success", "Load confirmed successfully!");
      setIsConfirmingLoad(false);
      loadData();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to confirm load.");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0EA5E9"
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Helper Dashboard</Text>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
        </View>

        {!run ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={48} color="#64748B" />
            <Text style={styles.emptyTitle}>No Run Assigned Today</Text>
            <Text style={styles.emptySubtitle}>
              You don't have a delivery run assigned for today.
            </Text>
          </View>
        ) : (
          <>
            {/* Vehicle Info Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="car-outline" size={20} color="#0EA5E9" />
                <Text style={styles.cardTitle}>Vehicle</Text>
              </View>
              <Text style={styles.vehicleNumber}>
                {run.vehicles?.vehicle_number || "N/A"}
              </Text>
              <View style={styles.crewRow}>
                <View style={styles.crewItem}>
                  <Ionicons name="person-outline" size={14} color="#94A3B8" />
                  <Text style={styles.crewLabel}>
                    Driver: {run.drivers?.profiles?.name || "N/A"}
                  </Text>
                </View>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {run.status?.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Capacity Card */}
            {capacity.map((cap: any, i: number) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="cube-outline" size={20} color="#0EA5E9" />
                  <Text style={styles.cardTitle}>Load Status</Text>
                </View>

                <View style={styles.capacityGrid}>
                  <View style={styles.capItem}>
                    <Text style={styles.capValue}>{cap.loaded_quantity}</Text>
                    <Text style={styles.capLabel}>Loaded</Text>
                  </View>
                  <View style={styles.capItem}>
                    <Text style={styles.capValue}>
                      {cap.delivered_quantity}
                    </Text>
                    <Text style={styles.capLabel}>Delivered</Text>
                  </View>
                  <View style={styles.capItem}>
                    <Text style={styles.capValue}>
                      {cap.physical_remaining}
                    </Text>
                    <Text style={styles.capLabel}>Remaining</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.capacityGrid}>
                  <View style={styles.capItem}>
                    <Text style={styles.capValue}>
                      {cap.scheduled_remaining}
                    </Text>
                    <Text style={styles.capLabel}>Scheduled</Text>
                  </View>
                  <View style={styles.capItem}>
                    <Text style={styles.capValue}>
                      {cap.opportunity_reserved}
                    </Text>
                    <Text style={styles.capLabel}>Reserved</Text>
                  </View>
                  <View
                    style={[
                      styles.capItem,
                      {
                        backgroundColor:
                          getCapacityColor(cap.opportunity_capacity) + "20",
                        borderRadius: 8,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.capValue,
                        { color: getCapacityColor(cap.opportunity_capacity) },
                      ]}
                    >
                      {cap.opportunity_capacity}
                    </Text>
                    <Text style={styles.capLabel}>
                      {getCapacityLabel(cap.opportunity_capacity)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            {capacity.length === 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="warning-outline" size={20} color="#F59E0B" />
                  <Text style={styles.cardTitle}>Load Not Confirmed</Text>
                </View>
                <Text style={styles.emptySubtitle}>
                  Confirm the vehicle load before starting the route.
                </Text>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={openConfirmLoadModal}
                >
                  <Text style={styles.confirmBtnText}>Confirm Load Now</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Confirm Load Modal */}
            <Modal visible={isConfirmingLoad} animationType="slide" transparent>
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Confirm Vehicle Load</Text>
                  <Text style={styles.modalSubtitle}>
                    Enter the total physical quantities loaded into vehicle {run?.vehicles?.vehicle_number}.
                  </Text>
                  
                  <ScrollView style={styles.productsList}>
                    {supplierProducts.map((p) => (
                      <View key={p.id} style={styles.productRow}>
                        <View style={styles.productInfo}>
                          <Text style={styles.productName}>{p.products?.name}</Text>
                          <Text style={styles.productDetail}>
                            {p.products?.size} {p.products?.unit}
                          </Text>
                        </View>
                        <TextInput
                          style={styles.qtyInput}
                          keyboardType="number-pad"
                          value={loadQuantities[p.id]}
                          onChangeText={(val) => updateQuantity(p.id, val)}
                          maxLength={4}
                        />
                      </View>
                    ))}
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <Button
                      title="Cancel"
                      variant="outline"
                      onPress={() => setIsConfirmingLoad(false)}
                      style={{ flex: 1, marginRight: 8 }}
                    />
                    <Button
                      title={confirming ? "Saving..." : "Confirm"}
                      onPress={handleConfirmLoad}
                      disabled={confirming}
                      style={{ flex: 1, marginLeft: 8 }}
                    />
                  </View>
                </View>
              </View>
            </Modal>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#94A3B8", fontSize: 16 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#F8FAFC" },
  headerDate: { fontSize: 14, color: "#64748B", marginTop: 4 },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  vehicleNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#F8FAFC",
    marginBottom: 8,
  },
  crewRow: { flexDirection: "row", gap: 16 },
  crewItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  crewLabel: { fontSize: 13, color: "#94A3B8" },
  statusBadge: {
    backgroundColor: "#0EA5E920",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0EA5E9",
    letterSpacing: 1,
  },
  capacityGrid: { flexDirection: "row", justifyContent: "space-around" },
  capItem: { alignItems: "center", padding: 8, flex: 1 },
  capValue: { fontSize: 24, fontWeight: "800", color: "#F8FAFC" },
  capLabel: { fontSize: 11, color: "#64748B", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#334155", marginVertical: 12 },
  emptyCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#F8FAFC" },
  emptySubtitle: { fontSize: 14, color: "#64748B", textAlign: "center" },
  confirmBtn: {
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  confirmBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1E293B",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#F8FAFC", marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: "#94A3B8", marginBottom: 20 },
  productsList: {
    maxHeight: 400,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F172A",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  productInfo: { flex: 1 },
  productName: { fontSize: 16, fontWeight: "700", color: "#F8FAFC", marginBottom: 4 },
  productDetail: { fontSize: 13, color: "#64748B" },
  qtyInput: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    width: 80,
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
});
