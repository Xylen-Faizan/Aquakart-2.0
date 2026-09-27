import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../constants/theme";
import { useAndroidBack } from "../../hooks/useAndroidBack";

const FAQ_KEYS = [
  ["How do I place an order?","Choose a supplier or product, select quantity and delivery address, then confirm the order."],
  ["How do I track my delivery?","Open an order from Orders to see available delivery status and tracking."],
  ["Can I cancel an order?","Cancellation depends on the current order and delivery state. Use the available option or contact support promptly."],
  ["How are payments recorded?","The app records the payment method and, where applicable, the amount actually collected by the supplier."],
  ["What is Khata?","Khata shows delivery, billing and payment history for supported recurring supplier relationships."],
  ["How do I delete my account?","Open Profile, tap the three-dot menu, open Settings, then choose Delete Account. Confirmation is required before submission."],
] as const;

export default function AccountFaqs() {
  const router = useRouter();
  useAndroidBack();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>FAQs</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {FAQ_KEYS.map(([questionKey, answerKey]) => (
          <View key={questionKey} style={styles.card}>
            <Text style={styles.question}>{questionKey}</Text>
            <Text style={styles.answer}>{answerKey}</Text>
          </View>
        ))}

        <TouchableOpacity
          style={styles.supportCard}
          onPress={() => Linking.openURL("tel:+917488830394")}
          accessibilityRole="button"
        >
          <Ionicons name="call-outline" size={20} color={theme.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>Contact Support</Text>
            <Text style={styles.supportText}>+91 74888 30394</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: { marginRight: theme.spacing.md },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  question: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  answer: {
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
    color: theme.colors.textSecondary,
  },
  supportCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  supportTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  supportText: {
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
  },
});
