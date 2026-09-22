import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { dispatchService } from "../../services/dispatch";
import { supabase } from "../../lib/supabase/client";
import MapView, { Marker } from "react-native-maps";

export default function TrackOrderScreen() {
  const { order_id } = useLocalSearchParams<{ order_id: string }>();
  const router = useRouter();
  const [tracking, setTracking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTracking = useCallback(async () => {
    if (!order_id) return;
    try {
      const data = await dispatchService.getTrackingState(order_id);
      if (data && data.length > 0) {
        setTracking(data[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [order_id]);

  useEffect(() => {
    loadTracking();
  }, [loadTracking]);

  // Realtime tracking updates
  useEffect(() => {
    if (!tracking?.run_id) return;

    const channel = dispatchService.subscribeToLiveState(
      tracking.run_id,
      () => {
        loadTracking();
      },
    );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tracking?.run_id, loadTracking]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(loadTracking, 15000);
    return () => clearInterval(interval);
  }, [loadTracking]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0EA5E9" />
        </View>
      </SafeAreaView>
    );
  }

  const isDelivered = tracking?.order_status === "delivered";
  const isFresh = tracking?.gps_fresh;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Delivery</Text>
      </View>

      <View style={styles.content}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <Ionicons
            name={isDelivered ? "checkmark-circle" : "navigate-circle"}
            size={48}
            color={isDelivered ? "#22C55E" : "#0EA5E9"}
          />
          <Text style={styles.statusTitle}>
            {isDelivered
              ? "Delivered!"
              : tracking?.order_status === "out_for_delivery"
                ? "On the Way"
                : tracking?.order_status?.toUpperCase() || "Tracking"}
          </Text>
          {tracking?.vehicle_number && (
            <Text style={styles.vehicleInfo}>
              Vehicle: {tracking.vehicle_number}
            </Text>
          )}
        </View>

        {/* ETA Card */}
        {!isDelivered && tracking?.eta_minutes != null && (
          <View style={styles.etaCard}>
            <View style={styles.etaRow}>
              <Ionicons name="time-outline" size={24} color="#F59E0B" />
              <View>
                <Text style={styles.etaValue}>~{tracking.eta_minutes} min</Text>
                <Text style={styles.etaLabel}>Estimated arrival</Text>
              </View>
            </View>
          </View>
        )}

        {/* GPS Freshness */}
        {!isDelivered && tracking?.last_updated && (
          <View
            style={[
              styles.freshnessCard,
              { borderLeftColor: isFresh ? "#22C55E" : "#F59E0B" },
            ]}
          >
            <Ionicons
              name={isFresh ? "radio-button-on" : "alert-circle"}
              size={16}
              color={isFresh ? "#22C55E" : "#F59E0B"}
            />
            <Text style={styles.freshnessText}>
              {isFresh
                ? "Live tracking active"
                : "Location data may be delayed"}
            </Text>
            <Text style={styles.lastUpdated}>
              Updated:{" "}
              {new Date(tracking.last_updated).toLocaleTimeString("en-IN")}
            </Text>
          </View>
        )}

        {/* Stop Status */}
        {tracking?.stop_status && (
          <View style={styles.stopStatusCard}>
            <Text style={styles.stopStatusLabel}>Delivery Status</Text>
            <View style={styles.timeline}>
              {["planned", "en_route", "delivered"].map((step, i) => {
                const isActive = step === tracking.stop_status;
                const isPast =
                  ["planned", "en_route", "delivered"].indexOf(
                    tracking.stop_status,
                  ) >= i;
                return (
                  <View key={step} style={styles.timelineItem}>
                    <View
                      style={[
                        styles.dot,
                        isPast && styles.dotActive,
                        isActive && styles.dotCurrent,
                      ]}
                    >
                      {isPast && (
                        <Ionicons name="checkmark" size={12} color="#FFF" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.timelineText,
                        isPast && styles.timelineTextActive,
                      ]}
                    >
                      {step === "planned"
                        ? "Confirmed"
                        : step === "en_route"
                          ? "Nearby"
                          : "Delivered"}
                    </Text>
                    {i < 2 && (
                      <View
                        style={[
                          styles.timelineLine,
                          isPast && styles.timelineLineActive,
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {isDelivered && (
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.replace("/(customer)/home")}
          >
            <Text style={styles.doneBtnText}>Back to Home</Text>
          </TouchableOpacity>
        )}

        {/* Map Visualization */}
        {!isDelivered && tracking?.vehicle_lat && tracking?.vehicle_lng && (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: tracking.vehicle_lat,
                longitude: tracking.vehicle_lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              region={{
                latitude: tracking.vehicle_lat,
                longitude: tracking.vehicle_lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker
                coordinate={{
                  latitude: tracking.vehicle_lat,
                  longitude: tracking.vehicle_lng,
                }}
                title={tracking.vehicle_number || "Delivery Vehicle"}
                description={
                  tracking.eta_minutes
                    ? `ETA: ${tracking.eta_minutes} min`
                    : undefined
                }
              >
                <View style={styles.markerContainer}>
                  <Ionicons name="car" size={24} color="#0EA5E9" />
                </View>
              </Marker>
            </MapView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#F8FAFC" },
  content: { flex: 1, padding: 16 },
  statusCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  statusTitle: { fontSize: 22, fontWeight: "800", color: "#F8FAFC" },
  vehicleInfo: { fontSize: 14, color: "#64748B" },
  etaCard: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  etaRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  etaValue: { fontSize: 28, fontWeight: "800", color: "#F8FAFC" },
  etaLabel: { fontSize: 12, color: "#64748B" },
  freshnessCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    marginBottom: 16,
  },
  freshnessText: {
    color: "#F8FAFC",
    fontSize: 14,
    marginLeft: 8,
    fontWeight: "500",
    flex: 1,
  },
  lastUpdated: { color: "#94A3B8", fontSize: 12 },
  stopStatusCard: { backgroundColor: "#1E293B", borderRadius: 14, padding: 16 },
  stopStatusLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineItem: { alignItems: "center", flex: 1 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  dotActive: { backgroundColor: "#0EA5E9" },
  dotCurrent: {
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#22C55E40",
  },
  timelineText: { fontSize: 11, color: "#64748B", fontWeight: "600" },
  timelineTextActive: { color: "#F8FAFC" },
  timelineLine: {
    position: "absolute",
    top: 14,
    left: "60%",
    width: "80%",
    height: 2,
    backgroundColor: "#334155",
  },
  timelineLineActive: { backgroundColor: "#0EA5E9" },
  doneBtn: {
    backgroundColor: "#0EA5E9",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },
  doneBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  mapContainer: {
    height: 200,
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  map: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  markerContainer: {
    backgroundColor: "#1E293B",
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#0EA5E9",
  },
});
