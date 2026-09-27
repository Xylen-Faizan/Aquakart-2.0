import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../constants/theme";
import { useLanguage } from "../../features/i18n/LanguageProvider";

type Props = {
  visible: boolean;
  onClose: () => void;
  settingsRoute: string;
  faqsRoute: string;
};

export default function ProfileOverflowMenu({
  visible,
  onClose,
  settingsRoute,
  faqsRoute,
}: Props) {
  const router = useRouter();
  const { t } = useLanguage();

  const open = (route: string) => {
    onClose();
    router.push(route as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.menu} onPress={(event) => event.stopPropagation()}>
          <Pressable style={styles.item} onPress={() => open(settingsRoute)}>
            <Ionicons name="settings-outline" size={21} color={theme.colors.textPrimary} />
            <Text style={styles.itemText}>{t("account.settings")}</Text>
          </Pressable>

          <Pressable style={styles.item} onPress={() => open(faqsRoute)}>
            <Ionicons name="help-circle-outline" size={21} color={theme.colors.textPrimary} />
            <Text style={styles.itemText}>{t("account.faqs")}</Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable style={styles.cancelItem} onPress={onClose}>
            <Text style={styles.cancelText}>{t("common.cancel")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.22)",
    alignItems: "flex-end",
    paddingTop: 72,
    paddingRight: 16,
  },
  menu: {
    width: 190,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  item: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  cancelItem: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
});
