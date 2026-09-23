import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { routeOpsService } from "../../services/route-ops";
import { fleetOpsService } from "../../services/fleet-ops";
import { useAuth } from "../../features/auth/AuthProvider";
import { supabase } from "../../lib/supabase/client";
import { Button } from "../../components/ui";
import { useLanguage } from "../../features/i18n/LanguageProvider";
import { useAndroidBack } from "../../hooks/useAndroidBack";

export default function SupplierRoutesScreen() {
  const { session } = useAuth();
  const { t } = useLanguage();
  useAndroidBack();
  const [runs, setRuns] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [supplierId, setSupplierId] = useState<string | null>(null);

  // Create Run State
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [creating, setCreating] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [helpers, setHelpers] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedHelper, setSelectedHelper] = useState("");

  const fetchData = useCallback(async () => {
    try {
      if (!session?.user?.id) return;

      const { data: supplierData } = await supabase
        .from("suppliers")
        .select("id")
        .eq("profile_id", session.user.id)
        .single();

      if (!supplierData?.id) return;
      setSupplierId(supplierData.id);

      // Fetch fleet live state (includes vehicles, drivers, helpers, live positions)
      const fleetData = await fleetOpsService.getFleetLiveState(
        supplierData.id,
      );
      setRuns(fleetData || []);

      // Fetch pending opportunity offers
      const offerData = await fleetOpsService.getSupplierOffers(
        supplierData.id,
      );
      setOffers(offerData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds for live state
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleGenerateHelperInvite = async () => {
    if (!supplierId) return;
    try {
      const code = await fleetOpsService.generateHelperInvite(supplierId);
      Alert.alert(
        t('routes.helperInviteTitle'),
        `${t('routes.shareHelperCode')}:\n\n${code}\n\n${t('routes.validFor24Hours')}`,
        [
          {
            text: t('routes.share'),
            onPress: () =>
              Share.share({
                message: `${t('routes.joinHelperMessage')} ${code}`,
              }),
          },
          { text: t('routes.ok') },
        ],
      );
    } catch (err: any) {
      Alert.alert(t('routes.error'), err.message);
    }
  };

  const handleGenerateDriverInvite = async () => {
    if (!supplierId) return;
    try {
      const code = await fleetOpsService.generateDriverInvite(supplierId);
      Alert.alert(
        t('routes.driverInviteTitle'),
        `${t('routes.shareDriverCode')}:\n\n${code}\n\n${t('routes.validFor24Hours')}`,
        [
          {
            text: t('routes.share'),
            onPress: () =>
              Share.share({
                message: `${t('routes.joinDriverMessage')} ${code}`,
              }),
          },
          { text: t('routes.ok') },
        ],
      );
    } catch (err: any) {
      Alert.alert(t('routes.error'), err.message);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    try {
      await fleetOpsService.acceptOffer(offerId);
      Alert.alert(t('routes.accepted'), t('routes.opportunityAdded'));
      await fetchData();
    } catch (err: any) {
      Alert.alert(t('routes.error'), err.message || t('routes.couldNotAcceptOffer'));
    }
  };

  const handleDeclineOffer = async (offerId: string) => {
    try {
      await fleetOpsService.declineOffer(offerId);
      Alert.alert(t('routes.success'), t('routes.offerDeclined'));
      fetchData();
    } catch (err: any) {
      Alert.alert(t('routes.error'), err.message);
    }
  };

  const openCreateRunModal = async () => {
    if (!supplierId) return;
    try {
      setIsCreatingRun(true);
      const [v, d, h] = await Promise.all([
        fleetOpsService.getVehicles(supplierId),
        fleetOpsService.getDrivers(supplierId),
        fleetOpsService.getHelpers(supplierId),
      ]);
      setVehicles(v || []);
      setDrivers(d || []);
      setHelpers(h || []);
      if (v?.length) setSelectedVehicle(v[0].id);
      if (d?.length) setSelectedDriver(d[0].id);
      if (h?.length) setSelectedHelper(h[0].id);
    } catch (err) {
      console.error(err);
      Alert.alert(t('routes.error'), t('routes.failedToLoadFleet'));
    }
  };

  const handleCreateRun = async () => {
    if (!supplierId || !selectedVehicle || !selectedDriver || !selectedHelper) {
      Alert.alert(t('routes.error'), t('routes.pleaseSelectVehicleDriverHelper'));
      return;
    }
    try {
      setCreating(true);
      // Create empty run
      await fleetOpsService.createEmptyRun(
        supplierId,
        selectedVehicle,
        selectedDriver,
        selectedHelper
      );
      Alert.alert(t('routes.success'), t('routes.runCreatedSuccessfully'));
      setIsCreatingRun(false);
      fetchData();
    } catch (err: any) {
      Alert.alert(t('routes.error'), err.message || t('routes.failedToCreateRun'));
    } finally {
      setCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "planned":
        return "#F59E0B";
      case "loading":
        return "#3B82F6";
      case "in_progress":
        return "#22C55E";
      case "completed":
        return "#64748B";
      case "cancelled":
        return "#EF4444";
      default:
        return "#64748B";
    }
  };

  const getGpsFreshness = (capturedAt: string | null) => {
    if (!capturedAt) return { fresh: false, label: t('routes.noGps') };
    const ageSeconds = (Date.now() - new Date(capturedAt).getTime()) / 1000;
    if (ageSeconds < 60)
      return { fresh: true, label: `${Math.round(ageSeconds)}${t('routes.secondsAgo')}` };
    if (ageSeconds < 300)
      return { fresh: false, label: `${Math.round(ageSeconds / 60)}${t('routes.minutesAgo')}` };
    return { fresh: false, label: t('routes.stale') };
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0EA5E9" />
      </View>
    );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#0EA5E9"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>{t('routes.title')}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.createBtn} onPress={openCreateRunModal}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.createBtnText}>{t('routes.run')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inviteBtn}
            onPress={handleGenerateDriverInvite}
          >
            <Ionicons name="person-add-outline" size={16} color="#0EA5E9" />
            <Text style={styles.inviteBtnText}>{t('routes.driver')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inviteBtn}
            onPress={handleGenerateHelperInvite}
          >
            <Ionicons name="person-add-outline" size={16} color="#F59E0B" />
            <Text style={[styles.inviteBtnText, { color: "#F59E0B" }]}>
              {t('routes.helper')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Create Run Modal */}
      <Modal visible={isCreatingRun} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('routes.createDailyRun')}</Text>
            
            <Text style={styles.modalLabel}>{t('routes.selectVehicle')}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedVehicle}
                onValueChange={setSelectedVehicle}
              >
                {vehicles.map((v) => (
                  <Picker.Item key={v.id} label={v.vehicle_number} value={v.id} />
                ))}
              </Picker>
            </View>

            <Text style={styles.modalLabel}>{t('routes.selectDriver')}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedDriver}
                onValueChange={setSelectedDriver}
              >
                {drivers.map((d) => (
                  <Picker.Item key={d.id} label={d.profiles?.name || d.id} value={d.id} />
                ))}
              </Picker>
            </View>

            <Text style={styles.modalLabel}>{t('routes.selectHelper')}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedHelper}
                onValueChange={setSelectedHelper}
              >
                {helpers.map((h) => (
                  <Picker.Item key={h.id} label={h.profiles?.name || h.id} value={h.id} />
                ))}
              </Picker>
            </View>

            <View style={styles.modalActions}>
              <Button
                title={t('routes.cancel')}
                variant="outline"
                onPress={() => setIsCreatingRun(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={creating ? t('routes.starting') : t('routes.startRun')}
                onPress={handleCreateRun}
                disabled={creating || !selectedVehicle || !selectedDriver || !selectedHelper}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Opportunity Offers */}
      {offers.length > 0 && (
        <View style={styles.offersSection}>
          <Text style={styles.sectionTitle}>
            ⚡ {t('routes.opportunityOrders')} ({offers.length})
          </Text>
          {offers.map((offer) => {
            const req = offer.order_dispatch_requests;
            return (
              <View key={offer.id} style={styles.offerCard}>
                <View style={styles.offerTop}>
                  <Text style={styles.offerCustomer}>
                    {req?.profiles?.name || t('routes.customer')}
                  </Text>
                  <Text style={styles.offerVehicle}>
                    → {offer.vehicles?.vehicle_number}
                  </Text>
                </View>
                <Text style={styles.offerProduct}>
                  {req?.quantity}× {req?.products?.name} •{" "}
                  {req?.addresses?.street}
                </Text>
                <View style={styles.offerStats}>
                  <Text style={styles.offerStat}>
                    {offer.distance_km?.toFixed(1)} km
                  </Text>
                  <Text style={styles.offerStat}>~{offer.eta_minutes} min</Text>
                  <Text
                    style={[
                      styles.offerStat,
                      {
                        color:
                          offer.detour_minutes <= 5 ? "#22C55E" : "#F59E0B",
                      },
                    ]}
                  >
                    +{offer.detour_minutes} {t('routes.minDetour')}
                  </Text>
                </View>
                <View style={styles.offerActions}>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => handleAcceptOffer(offer.id)}
                  >
                    <Text style={styles.acceptBtnText}>{t('routes.accept')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => handleDeclineOffer(offer.id)}
                  >
                    <Text style={styles.declineBtnText}>{t('routes.decline')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Vehicle Fleet */}
      <Text style={styles.sectionTitle}>{t('routes.todaysVehicles')} ({runs.length})</Text>

      {runs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="car-outline" size={48} color="#64748B" />
          <Text style={styles.emptyText}>{t('routes.noRoutesGenerated')}</Text>
        </View>
      ) : (
        runs.map((run) => {
          const liveState = run.delivery_run_live_state?.[0];
          const gps = getGpsFreshness(liveState?.captured_at);
          const totalStops = run.delivery_run_stops?.length || 0;
          const deliveredStops =
            run.delivery_run_stops?.filter((s: any) => s.status === "delivered")
              .length || 0;
          const oppStops =
            run.delivery_run_stops?.filter(
              (s: any) => s.stop_type === "opportunistic",
            ).length || 0;

          return (
            <View key={run.id} style={styles.card}>
              {/* Vehicle + Status */}
              <View style={styles.cardHeader}>
                <View style={styles.vehicleInfo}>
                  <Ionicons name="car" size={18} color="#0EA5E9" />
                  <Text style={styles.vehicleNumber}>
                    {run.vehicles?.vehicle_number || t('routes.unassigned')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: getStatusColor(run.status) },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {t(`routes.status_${run.status}`)}
                  </Text>
                </View>
              </View>

              {/* Crew */}
              <View style={styles.crewSection}>
                <View style={styles.crewItem}>
                  <Ionicons name="person-outline" size={14} color="#94A3B8" />
                  <Text style={styles.crewText}>
                    {t('routes.driverLabel')}: {run.drivers?.profiles?.name || "—"}
                  </Text>
                </View>
                <View style={styles.crewItem}>
                  <Ionicons name="people-outline" size={14} color="#94A3B8" />
                  <Text style={styles.crewText}>
                    {t('routes.helperLabel')}: {run.helpers?.profiles?.name || "—"}
                  </Text>
                </View>
              </View>

              {/* Live State (if in_progress) */}
              {run.status === "in_progress" && (
                <View style={styles.liveSection}>
                  <View style={styles.liveRow}>
                    <View
                      style={[
                        styles.gpsDot,
                        { backgroundColor: gps.fresh ? "#22C55E" : "#F59E0B" },
                      ]}
                    />
                    <Text style={styles.gpsText}>GPS: {gps.label}</Text>
                  </View>
                  {liveState?.eta_minutes != null && (
                    <Text style={styles.etaText}>
                      {t('routes.etaToNextStop')}: ~{liveState.eta_minutes} {t('routes.min')}
                    </Text>
                  )}
                </View>
              )}

              {/* Stops summary */}
              <View style={styles.stopsRow}>
                <Text style={styles.stopsText}>
                  {deliveredStops}/{totalStops} {t('routes.delivered')}
                </Text>
                {oppStops > 0 && (
                  <View style={styles.oppBadge}>
                    <Ionicons name="flash" size={10} color="#F59E0B" />
                    <Text style={styles.oppBadgeText}>{oppStops} {t('routes.onDemand')}</Text>
                  </View>
                )}
              </View>

              {/* Progress bar */}
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${totalStops > 0 ? (deliveredStops / totalStops) * 100 : 0}%`,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
  container: { flex: 1, backgroundColor: "#0F172A", padding: 16 },
  header: {
    flexDirection: "column",
    marginBottom: 20,
    paddingTop: 8,
  },
  headerTitleRow: {
    marginBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#F8FAFC" },
  createBtn: {
    backgroundColor: "#0EA5E9",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
    flex: 1,
    justifyContent: "center",
  },
  createBtnText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  headerActions: { 
    flexDirection: "row", 
    gap: 8,
    justifyContent: "space-between",
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#1E293B",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  inviteBtnText: { fontSize: 12, fontWeight: "700", color: "#0EA5E9" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  emptyText: { color: "#64748B", fontSize: 14 },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  vehicleInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  vehicleNumber: { fontSize: 18, fontWeight: "700", color: "#F8FAFC" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  crewSection: { flexDirection: "row", gap: 16, marginBottom: 10 },
  crewItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  crewText: { fontSize: 13, color: "#94A3B8" },
  liveSection: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsText: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  etaText: { fontSize: 12, color: "#94A3B8" },
  stopsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  stopsText: { fontSize: 13, fontWeight: "600", color: "#F8FAFC" },
  oppBadge: {
    backgroundColor: "#F59E0B20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  oppBadgeText: { fontSize: 11, fontWeight: "700", color: "#F59E0B" },
  progressBar: {
    height: 4,
    backgroundColor: "#334155",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#22C55E", borderRadius: 2 },
  offersSection: { marginBottom: 20 },
  offerCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  offerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  offerCustomer: { fontSize: 15, fontWeight: "700", color: "#F8FAFC" },
  offerVehicle: { fontSize: 12, color: "#0EA5E9", fontWeight: "600" },
  offerProduct: { fontSize: 12, color: "#94A3B8", marginBottom: 8 },
  offerStats: { flexDirection: "row", gap: 12, marginBottom: 10 },
  offerStat: { fontSize: 12, color: "#CBD5E1", fontWeight: "600" },
  offerActions: { flexDirection: "row", gap: 8 },
  acceptBtn: {
    flex: 1,
    backgroundColor: "#22C55E",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  acceptBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  declineBtn: {
    backgroundColor: "#EF444420",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  declineBtnText: { color: "#EF4444", fontWeight: "700", fontSize: 13 },
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
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#F8FAFC", marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: "600", color: "#94A3B8", marginBottom: 8 },
  pickerContainer: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  modalActions: {
    flexDirection: "row",
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
});
