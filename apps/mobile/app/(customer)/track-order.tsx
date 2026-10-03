import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import { dispatchService } from "../../services/dispatch";
import { supabase } from "../../lib/supabase/client";
import MapView, { Marker } from "react-native-maps";
import { useLanguage } from "../../features/i18n/LanguageProvider";
import { formatISTTime } from "../../lib/date";

export default function TrackOrderScreen() {
  const { order_id } = useLocalSearchParams<{ order_id: string }>();
  const router = useRouter();
  useAndroidBack();
  const { t } = useLanguage();
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
  
  // Compute step
  let currentStepIndex = 0; // Confirmed
  if (tracking?.stop_status === "planned" || tracking?.order_status === "preparing") currentStepIndex = 1;
  if (tracking?.stop_status === "en_route" || tracking?.order_status === "out_for_delivery") currentStepIndex = 2;
  if (isDelivered || tracking?.stop_status === "delivered") currentStepIndex = 3;

  const steps = [
    { label: "Confirmed", icon: "checkmark-done" },
    { label: "Preparing", icon: "receipt-outline" },
    { label: "Out for Delivery", icon: "bicycle" },
    { label: "Delivered", icon: "cube-outline" }
  ];

  const handleCall = () => {
    if (tracking?.driver_phone) {
      Linking.openURL(`tel:${tracking.driver_phone}`);
    }
  };

  // Format order date nicely
  let formattedDate = "";
  if (tracking?.order_created_at) {
    const dateObj = new Date(tracking.order_created_at);
    formattedDate = dateObj.toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('Track Order')}</Text>
      </View>

      <View style={styles.content}>
        {/* Order Details */}
        <View style={styles.orderDetails}>
          <Text style={styles.orderIdText}>Order #{order_id?.slice(0,8).toUpperCase()}</Text>
          {formattedDate ? (
            <Text style={styles.placedOnText}>Placed on {formattedDate}</Text>
          ) : null}
        </View>

        {/* Stepper */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepperLineBackground} />
          <View style={[styles.stepperLineActive, { width: `${(currentStepIndex / 3) * 100}%` }]} />
          
          <View style={styles.stepsRow}>
            {steps.map((step, index) => {
              const isPast = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isFuture = index > currentStepIndex;

              return (
                <View key={step.label} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepIconContainer,
                      isPast && styles.stepIconPast,
                      isCurrent && styles.stepIconCurrent,
                      isFuture && styles.stepIconFuture,
                    ]}
                  >
                    {isPast ? (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    ) : (
                      <Ionicons 
                        name={step.icon as any} 
                        size={16} 
                        color={isCurrent ? "#FFFFFF" : "#94A3B8"} 
                      />
                    )}
                  </View>
                  <Text style={[
                    styles.stepLabel,
                    isCurrent && styles.stepLabelCurrent,
                    isFuture && styles.stepLabelFuture
                  ]}>
                    {t(step.label)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Map Visualization */}
        <View style={styles.mapContainer}>
          {tracking?.vehicle_lat && tracking?.vehicle_lng ? (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: tracking.vehicle_lat,
                longitude: tracking.vehicle_lng,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              }}
              region={{
                latitude: tracking.vehicle_lat,
                longitude: tracking.vehicle_lng,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              }}
            >
              <Marker
                coordinate={{
                  latitude: tracking.vehicle_lat,
                  longitude: tracking.vehicle_lng,
                }}
              >
                <View style={styles.markerContainer}>
                  <Ionicons name="bicycle" size={20} color="#FFFFFF" />
                </View>
              </Marker>
            </MapView>
          ) : (
             <View style={styles.mapPlaceholder}>
               <ActivityIndicator size="small" color="#0EA5E9" />
               <Text style={styles.mapPlaceholderText}>Locating vehicle...</Text>
             </View>
          )}
        </View>

        {/* Delivery Partner */}
        <View style={styles.deliveryPartnerCard}>
          <Text style={styles.deliveryPartnerTitle}>{t('Your delivery partner')}</Text>
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Ionicons name="person" size={24} color="#64748B" />
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{tracking?.driver_name || "Delivery Partner"}</Text>
              <Text style={styles.driverPhone}>{tracking?.driver_phone || "+91 ••••••••••"}</Text>
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={handleCall}>
              <Ionicons name="call" size={20} color="#0EA5E9" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ETA */}
        {!isDelivered && tracking?.eta_minutes != null && (
          <View style={styles.etaContainer}>
            <Text style={styles.etaLabel}>{t('Estimated Delivery')}</Text>
            <Text style={styles.etaValue}>~{tracking.eta_minutes} min</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#0F172A" },
  content: { flex: 1, padding: 20 },
  
  orderDetails: {
    marginBottom: 24,
    alignItems: "center"
  },
  orderIdText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4
  },
  placedOnText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500"
  },

  stepperContainer: {
    marginBottom: 32,
    position: 'relative'
  },
  stepperLineBackground: {
    position: 'absolute',
    top: 14,
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: "#E2E8F0",
    zIndex: 1
  },
  stepperLineActive: {
    position: 'absolute',
    top: 14,
    left: 20,
    height: 2,
    backgroundColor: "#0EA5E9",
    zIndex: 2
  },
  stepsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 3
  },
  stepItem: {
    alignItems: "center",
    width: 70
  },
  stepIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
  },
  stepIconPast: {
    backgroundColor: "#0EA5E9",
    borderColor: "#0EA5E9"
  },
  stepIconCurrent: {
    backgroundColor: "#0EA5E9",
    borderColor: "#0EA5E9"
  },
  stepIconFuture: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0"
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center"
  },
  stepLabelCurrent: {
    color: "#0EA5E9"
  },
  stepLabelFuture: {
    color: "#94A3B8"
  },

  mapContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 24,
    backgroundColor: "#F8FAFC"
  },
  map: { 
    position: "absolute", top: 0, bottom: 0, left: 0, right: 0 
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  mapPlaceholderText: {
    marginTop: 8,
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500"
  },
  markerContainer: {
    backgroundColor: "#0EA5E9",
    padding: 6,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },

  deliveryPartnerCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20
  },
  deliveryPartnerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 16
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16
  },
  driverInfo: {
    flex: 1
  },
  driverName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2
  },
  driverPhone: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500"
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center"
  },

  etaContainer: {
    alignItems: "center",
    marginBottom: 12
  },
  etaLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
    marginBottom: 4
  },
  etaValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A"
  }
});
