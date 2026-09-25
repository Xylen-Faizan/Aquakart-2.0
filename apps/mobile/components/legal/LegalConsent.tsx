import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "../../constants/theme";
import { LEGAL_VERSION } from "@aquakart/config";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function LegalConsent({ checked, onChange }: Props) {
  const router = useRouter();

  const openDocument = (document: "terms" | "privacy") => {
    router.push({ pathname: "/(auth)/legal", params: { document } } as any);
  };

  return (
    <Pressable
      style={styles.row}
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel="Agree to AquaKart Terms of Service and acknowledge the Privacy Policy"
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.text}>
        I agree to the{" "}
        <Text style={styles.link} onPress={() => openDocument("terms")}>
          Terms of Service
        </Text>{" "}
        and acknowledge the{" "}
        <Text style={styles.link} onPress={() => openDocument("privacy")}>
          Privacy Policy
        </Text>
        .
      </Text>
    </Pressable>
  );
}

export const LEGAL_CONSENT_VERSION = LEGAL_VERSION;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  checkboxChecked: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  tick: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 16,
  },
  text: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  link: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
});
