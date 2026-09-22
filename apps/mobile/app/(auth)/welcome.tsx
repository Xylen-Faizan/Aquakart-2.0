import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { theme } from "../../constants/theme";
import { InteractiveWaterBackground } from "../../components/ui/InteractiveWaterBackground";
import { useLanguage } from "../../features/i18n/LanguageProvider";

export default function WelcomeScreen() {
  const { t, language } = useLanguage();
  return (
    <InteractiveWaterBackground>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.headerRow}>
          <TouchableOpacity 
            style={styles.langToggle}
            onPress={() => router.push("/(auth)/language" as any)}
          >
            <Ionicons name="language" size={20} color={theme.colors?.primary || "#FFFFFF"} />
            <Text style={styles.langToggleText}>
              {language === "hi" ? "हिंदी" : "English"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.container}>
          <View style={styles.heroSection}>
            <Image
              source={require("../../assets/images/logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.title}>AQUAKART</Text>
            <Text style={styles.subtitle}>{t("welcome.subtitle")}</Text>
          </View>

          <View style={styles.actionsContainer}>
            <Text style={styles.questionText}>{t("welcome.question")}</Text>

            <Pressable
              style={({ pressed }) => [
                styles.roleCard,
                pressed && styles.roleCardPressed,
              ]}
              onPress={() => router.push("/(auth)/customer-auth" as any)}
            >
              <Text style={styles.cardIcon}>👤</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{t("welcome.customer")}</Text>
                <Text style={styles.cardDescription}>
                  {t("welcome.customer_desc")}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.roleCard,
                pressed && styles.roleCardPressed,
              ]}
              onPress={() => router.push("/(auth)/supplier-auth" as any)}
            >
              <Text style={styles.cardIcon}>🚰</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{t("welcome.supplier")}</Text>
                <Text style={styles.cardDescription}>
                  {t("welcome.supplier_desc")}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.roleCard,
                pressed && styles.roleCardPressed,
              ]}
              onPress={() => router.push("/(auth)/staff-login" as any)}
            >
              <Text style={styles.cardIcon}>🚚</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{t("welcome.staff")}</Text>
                <Text style={styles.cardDescription}>
                  {t("welcome.staff_desc")}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </InteractiveWaterBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    justifyContent: "space-between",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingRight: 24,
    paddingTop: 16,
    zIndex: 999,
    elevation: 10,
  },
  langToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  langToggleText: {
    color: "#FFFFFF",
    marginLeft: 6,
    fontWeight: "bold",
  },
  heroSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: theme.spacing.xxl,
  },
  logoImage: {
    width: 100,
    height: 100,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 36,
    fontWeight: theme.fontWeight.bold as any,
    color: "#FFFFFF",
    letterSpacing: 3,
    marginBottom: theme.spacing.lg,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: theme.fontSize.xl,
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    lineHeight: 34,
    fontWeight: theme.fontWeight.medium as any,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionsContainer: {
    width: "100%",
    paddingBottom: theme.spacing.xl,
  },
  questionText: {
    fontSize: theme.fontSize.lg,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: theme.spacing.xl,
    fontWeight: theme.fontWeight.medium as any,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  roleCardPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  cardIcon: {
    fontSize: 32,
    marginRight: theme.spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: theme.fontSize.sm,
    color: "rgba(255, 255, 255, 0.7)",
  },
});
