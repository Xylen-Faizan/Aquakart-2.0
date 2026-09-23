import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import { supabase } from "../../lib/supabase/client";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../features/i18n/LanguageProvider";

export default function ArrivalAlertScreen() {
  const { stop_id, eta_minutes, supplier_name, quantity, product_name } =
    useLocalSearchParams();
  const router = useRouter();
  useAndroidBack();
  const { t } = useLanguage();
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipReason, setSkipReason] = useState("Not at home");
  const [customReason, setCustomReason] = useState("");

  const handleReady = async () => {
    // In MVP, we might not strictly need to send this back immediately unless we want a "Customer Confirmed" state.
    // For now, we'll just log it or dismiss.
    Alert.alert("Great!", "Your supplier is on the way.");
    router.back();
  };

  const handleSkip = async () => {
    const finalReason = skipReason === "Other" ? customReason : skipReason;
    try {
      const { error } = await supabase.rpc("update_stop_status", {
        p_stop_id: stop_id,
        p_status: "skipped",
        p_skip_reason: finalReason,
      });

      if (error) throw error;

      Alert.alert(
        "Delivery Skipped",
        "Your supplier has been notified. Your next scheduled delivery is unchanged.",
      );
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  const skipOptions = [
    "Not at home",
    "Don't need water today",
    "Already arranged water",
    "Other",
  ];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="water" size={48} color="#3b82f6" />
        </View>

        <Text style={styles.title}>
          {supplier_name || "Your supplier"} is arriving
        </Text>

        <Text style={styles.etaText}>
          Approx. {eta_minutes || "~10"} minutes
        </Text>

        <View style={styles.orderDetails}>
          <Text style={styles.orderText}>Order:</Text>
          <Text style={styles.orderValue}>
            {quantity || 1} × {product_name || "20L Jar"}
          </Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleReady}>
          <Text style={styles.btnText}>{t("I'M READY")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setShowSkipModal(true)}
        >
          <Text style={styles.secondaryBtnText}>{t("CAN'T RECEIVE TODAY")}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showSkipModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Can't receive today?</Text>
            <Text style={styles.modalSubtitle}>Please select a reason:</Text>

            {skipOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.radioRow}
                onPress={() => setSkipReason(option)}
              >
                <View style={styles.radioOuter}>
                  {skipReason === option && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.radioText}>{t(option)}</Text>
              </TouchableOpacity>
            ))}

            {skipReason === "Other" && (
              <TextInput
                style={styles.input}
                placeholder="Type your reason..."
                value={customReason}
                onChangeText={setCustomReason}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowSkipModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmSkipBtn}
                onPress={handleSkip}
              >
                <Text style={styles.btnText}>Skip Today's Delivery</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  iconContainer: {
    backgroundColor: "#eff6ff",
    padding: 16,
    borderRadius: 50,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
    textAlign: "center",
  },
  etaText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#2563eb",
    marginVertical: 16,
  },
  orderDetails: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 8,
    width: "100%",
    marginBottom: 24,
    justifyContent: "center",
  },
  orderText: { color: "#6b7280", marginRight: 8 },
  orderValue: { fontWeight: "bold", fontSize: 16, color: "#111827" },
  primaryBtn: {
    backgroundColor: "#2563eb",
    width: "100%",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  secondaryBtn: {
    width: "100%",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  secondaryBtnText: { color: "#4b5563", fontWeight: "bold", fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  modalSubtitle: { color: "#6b7280", marginBottom: 16 },
  radioRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563eb",
  },
  radioText: { fontSize: 16, color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
  },
  modalActions: { flexDirection: "row", marginTop: 24, gap: 12 },
  cancelBtn: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  cancelBtnText: { fontWeight: "bold", color: "#4b5563" },
  confirmSkipBtn: {
    flex: 2,
    backgroundColor: "#ef4444",
    padding: 16,
    alignItems: "center",
    borderRadius: 8,
  },
});
