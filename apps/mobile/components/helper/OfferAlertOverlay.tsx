import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Vibration,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../features/auth/AuthProvider";
import { helperOpsService } from "../../services/helper-ops";
import { supabase } from "../../lib/supabase/client";

const { width } = Dimensions.get("window");

export default function OfferAlertOverlay({
  children,
}: {
  children: any;
}) {
  const { user } = useAuth();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<any | null>(null);
  const [processing, setProcessing] = useState(false);
  const pulseAnim = new Animated.Value(1);

  // 1. Get the helper's active run
  const loadRun = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const runs = await helperOpsService.getHelperRun(user.id, today);
      if (runs && runs.length > 0) {
        setActiveRunId(runs[0].id);
      }
    } catch (err) {
      console.error("Error loading run for alerts:", err);
    }
  }, [user?.id]);

  useEffect(() => {
    loadRun();
  }, [loadRun]);

  // 2. Subscribe to new offers for this run
  useEffect(() => {
    if (!activeRunId) return;

    console.log(`Subscribing to delivery_offers for run_id: ${activeRunId}`);

    const subscription = supabase
      .channel(`run_offers_${activeRunId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "delivery_offers",
          filter: `run_id=eq.${activeRunId}`,
        },
        async (payload) => {
          console.log("New offer received!", payload.new);
          const offer = payload.new;
          if (offer.status === "pending") {
            // Fetch full details (customer name, product, etc)
            try {
              const fullOffers = await helperOpsService.getOffers(activeRunId);
              const matchingOffer = fullOffers?.find((o) => o.id === offer.id);
              if (matchingOffer) {
                triggerAlert(matchingOffer);
              }
            } catch (err) {
              console.error("Failed to fetch full offer details", err);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [activeRunId]);

  // 3. Trigger the UI and vibration
  const triggerAlert = (offer: any) => {
    setIncomingOffer(offer);
    
    // Aggressive vibration pattern (vibrate 1s, pause 0.5s) - repeating
    Vibration.vibrate([0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000], true);

    // Pulse animation for the background
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopAlert = () => {
    Vibration.cancel();
    pulseAnim.stopAnimation();
    setIncomingOffer(null);
  };

  const handleAccept = async () => {
    if (!incomingOffer) return;
    try {
      setProcessing(true);
      await helperOpsService.acceptOffer(incomingOffer.id);
      stopAlert();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to accept offer");
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!incomingOffer) return;
    try {
      setProcessing(true);
      await helperOpsService.declineOffer(incomingOffer.id);
      stopAlert();
    } catch (err: any) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {children}

      <Modal
        visible={!!incomingOffer}
        transparent
        animationType="slide"
        onRequestClose={stopAlert}
      >
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.alertBox,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={styles.headerRow}>
              <Ionicons name="flash" size={32} color="#F59E0B" />
              <Text style={styles.title}>NEW ORDER!</Text>
              <Ionicons name="flash" size={32} color="#F59E0B" />
            </View>

            {incomingOffer && (
              <View style={styles.detailsContainer}>
                <Text style={styles.customerName}>
                  {incomingOffer.order_dispatch_requests?.profiles?.name || "Customer"}
                </Text>
                <Text style={styles.productText}>
                  {incomingOffer.order_dispatch_requests?.quantity}× {incomingOffer.order_dispatch_requests?.products?.name}
                </Text>

                <View style={styles.addressBox}>
                  <Ionicons name="location-outline" size={20} color="#94A3B8" />
                  <Text style={styles.addressText} numberOfLines={2}>
                    {incomingOffer.order_dispatch_requests?.addresses?.street},{" "}
                    {incomingOffer.order_dispatch_requests?.addresses?.city}
                  </Text>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {incomingOffer.distance_km?.toFixed(1)}
                    </Text>
                    <Text style={styles.statLabel}>km away</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: "#F59E0B" }]}>
                      +{incomingOffer.detour_minutes}
                    </Text>
                    <Text style={styles.statLabel}>min detour</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnDecline]}
                onPress={handleDecline}
                disabled={processing}
              >
                <Ionicons name="close-circle-outline" size={24} color="#FFF" />
                <Text style={styles.btnText}>DECLINE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnAccept]}
                onPress={handleAccept}
                disabled={processing}
              >
                <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" />
                <Text style={styles.btnText}>ACCEPT</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  alertBox: {
    backgroundColor: "#1E293B",
    width: width - 40,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#F59E0B",
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFF",
    letterSpacing: 2,
  },
  detailsContainer: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  customerName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#F8FAFC",
    textAlign: "center",
    marginBottom: 4,
  },
  productText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0EA5E9",
    textAlign: "center",
    marginBottom: 16,
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  addressText: {
    flex: 1,
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#334155",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFF",
  },
  statLabel: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    textTransform: "uppercase",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  btnDecline: {
    backgroundColor: "#EF4444",
  },
  btnAccept: {
    backgroundColor: "#22C55E",
  },
  btnText: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
  },
});
