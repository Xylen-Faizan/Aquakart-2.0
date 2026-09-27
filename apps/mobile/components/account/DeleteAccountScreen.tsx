import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../features/auth/AuthProvider";
import { useLanguage } from "../../features/i18n/LanguageProvider";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import { accountService } from "../../services/account";
import { theme } from "../../constants/theme";

type Props = {
  source?: string;
};

export default function DeleteAccountScreen({ source = "mobile" }: Props) {
  const router = useRouter();
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useAndroidBack();

  const submit = async () => {
    if (confirmation.trim().toUpperCase() !== "DELETE") {
      Alert.alert(t("account.delete.title"), t("account.delete.typeDelete"));
      return;
    }

    if (submitting) return;

    try {
      setSubmitting(true);
      await accountService.requestDeletion(source);
      Alert.alert(
        t("account.delete.requestedTitle"),
        t("account.delete.requestedMessage"),
        [{ text: t("common.ok"), onPress: () => signOut() }],
      );
    } catch (error: any) {
      Alert.alert(
        t("account.delete.errorTitle"),
        error?.message || t("account.delete.errorMessage"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t("account.delete.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={30} color={theme.colors.error} />
          <Text style={styles.warningTitle}>{t("account.delete.warningTitle")}</Text>
          <Text style={styles.warningText}>{t("account.delete.warningText")}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>{t("account.delete.whatHappensTitle")}</Text>
          <Text style={styles.body}>{t("account.delete.whatHappensText")}</Text>
          <Text style={styles.body}>{t("account.delete.retentionText")}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>{t("account.delete.confirmTitle")}</Text>
          <Text style={styles.body}>{t("account.delete.confirmInstruction")}</Text>
          <TextInput
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor={theme.colors.textTertiary}
            style={styles.input}
            accessibilityLabel={t("account.delete.confirmInputLabel")}
          />
        </View>

        <TouchableOpacity
          style={[styles.deleteButton, submitting && styles.disabledButton]}
          onPress={submit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={t("account.delete.requestButton")}
        >
          <Text style={styles.deleteButtonText}>
            {submitting ? t("account.delete.submitting") : t("account.delete.requestButton")}
          </Text>
        </TouchableOpacity>

        <Text style={styles.supportNote}>{t("account.delete.supportNote")}</Text>
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
  content: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 40 },
  warningCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
  },
  warningTitle: {
    marginTop: 10,
    fontSize: theme.fontSize.lg,
    fontWeight: "800",
    color: theme.colors.error,
  },
  warningText: {
    marginTop: 8,
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
    color: theme.colors.textPrimary,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
  },
  deleteButton: {
    backgroundColor: theme.colors.error,
    minHeight: 50,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  disabledButton: { opacity: 0.6 },
  deleteButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  supportNote: {
    textAlign: "center",
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
});
