import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, BUSINESS_DETAILS } from "@aquakart/config";
import { theme } from "../../constants/theme";

const keys = ["privacy", "terms", "cookies", "refunds"] as const;

export default function LegalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ document?: string }>();
  const requested = params.document as (typeof keys)[number] | undefined;
  const active = keys.includes(requested as any) ? (requested as (typeof keys)[number]) : "privacy";
  const doc = LEGAL_DOCUMENTS[active];

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Legal & Privacy</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.meta}>Version {LEGAL_VERSION} · Effective {LEGAL_EFFECTIVE_DATE}</Text>
        <Text style={styles.h1}>{doc.title}</Text>
        <Text style={styles.summary}>{doc.summary}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Business details</Text>
          <Text style={styles.body}>Operator name used in the service: {BUSINESS_DETAILS.displayName}</Text>
          <Text style={styles.body}>Service area: {BUSINESS_DETAILS.serviceArea}</Text>
          <Text style={styles.body}>Support: {BUSINESS_DETAILS.supportPhone}</Text>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {keys.map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => router.replace({ pathname: "/(auth)/legal", params: { document: key } } as any)}
              style={[styles.tab, active === key && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active === key }}
              accessibilityLabel={LEGAL_DOCUMENTS[key].title}
            >
              <Text style={[styles.tabText, active === key && styles.tabTextActive]}>
                {key === "privacy" ? "Privacy" : key === "terms" ? "Terms" : key === "cookies" ? "Cookies" : "Refunds"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.h2}>{section.heading}</Text>
            {section.paragraphs?.map((paragraph) => <Text key={paragraph} style={styles.body}>{paragraph}</Text>)}
            {section.bullets?.map((bullet) => <Text key={bullet} style={styles.bullet}>• {bullet}</Text>)}
          </View>
        ))}

        <TouchableOpacity
          onPress={() => Linking.openURL(`tel:${BUSINESS_DETAILS.supportPhone.replace(/\s/g, "")}`)}
          style={styles.contact}
          accessibilityRole="button"
          accessibilityLabel="Call AquaKart legal and privacy support"
        >
          <Text style={styles.contactText}>Call legal/privacy support</Text>
        </TouchableOpacity>
        <Text style={styles.deletionNote}>
          To request account deletion, contact AquaKart support using the number above. A public account-deletion web resource should also be configured before Google Play submission.
        </Text>
      </ScrollView>
    </View>
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
  back: { paddingVertical: 8, marginRight: 12, minWidth: 70 },
  backText: { color: theme.colors.primary, fontSize: 16, fontWeight: "700" },
  title: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: "800" },
  content: { padding: theme.spacing.lg, paddingBottom: 48 },
  meta: { color: theme.colors.textSecondary, fontSize: 12, marginBottom: 6 },
  h1: { color: theme.colors.primary, fontSize: 28, fontWeight: "800", lineHeight: 34, marginBottom: 8 },
  h2: { color: theme.colors.primaryDark, fontSize: 18, fontWeight: "800", lineHeight: 24, marginTop: 14, marginBottom: 6 },
  summary: { color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  body: { color: theme.colors.textPrimary, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  bullet: { color: theme.colors.textPrimary, fontSize: 14, lineHeight: 21, marginBottom: 7 },
  section: { marginBottom: 8 },
  card: { backgroundColor: theme.colors.primaryLight, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: theme.colors.primary, padding: 14, marginBottom: 16 },
  cardTitle: { color: theme.colors.primaryDark, fontSize: 15, fontWeight: "800", marginBottom: 6 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  tab: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, justifyContent: "center" },
  tabActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  tabText: { color: theme.colors.textSecondary, fontWeight: "700" },
  tabTextActive: { color: theme.colors.primary },
  contact: { marginTop: 18, minHeight: 48, paddingHorizontal: 16, borderRadius: 10, backgroundColor: theme.colors.primary, justifyContent: "center", alignItems: "center" },
  contactText: { color: theme.colors.white, fontWeight: "800" },
  deletionNote: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: "center" },
});
