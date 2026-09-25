import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../../constants/theme";
import { Card, Button } from "../../../components/ui";
import { useAuth } from "../../../features/auth/AuthProvider";
import { useLanguage } from "../../../features/i18n/LanguageProvider";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../../lib/supabase/client";
import { Image } from "expo-image";
import { Alert } from "react-native";

export default function MoreScreen() {
  const { profile, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const menuItems = [
    {
      icon: "business-outline",
      title: t('more.businessProfile'),
      subtitle: t('more.businessProfileSubtitle'),
      route: "/(supplier)/more/business",
    },
    {
      icon: "pricetag-outline",
      title: t('more.pricingCatalog'),
      subtitle: t('more.pricingCatalogSubtitle'),
      route: "/(supplier)/more/pricing",
    },
    {
      icon: "cart-outline",
      title: "Marketplace History",
      subtitle: "Past opportunistic orders",
      route: "/(supplier)/more/marketplace-history",
    },
    {
      icon: "people-outline",
      title: t('more.teamCrew'),
      subtitle: t('more.teamCrewSubtitle'),
      route: "/(supplier)/more/team",
    },
    {
      icon: "car-outline",
      title: t('more.fleetVehicles'),
      subtitle: t('more.fleetVehiclesSubtitle'),
      route: "/(supplier)/more/vehicles",
    },
    {
      icon: "document-text-outline",
      title: t('more.ledgerReports'),
      subtitle: t('more.ledgerReportsSubtitle'),
      route: "/(supplier)/more/ledger",
    },
    {
      icon: "settings-outline",
      title: t('more.appSettings'),
      subtitle: t('more.appSettingsSubtitle'),
      route: "/(supplier)/more/settings",
    },
    {
      icon: "help-circle-outline",
      title: t('more.helpSupport'),
      subtitle: t('more.helpSupportSubtitle'),
      route: "support",
    },
  ];

  const handlePress = (route: string) => {
    if (route === "support") {
      Linking.openURL("tel:+917488830394");
    } else {
      router.push(route as any);
    }
  };

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (
        !result.canceled &&
        result.assets &&
        result.assets.length > 0 &&
        result.assets[0].base64 &&
        profile
      ) {
        const fileName = `${profile.id}/${Date.now()}.jpg`;
        const base64Data = result.assets[0].base64;
        
        // Convert base64 to byte array for Supabase storage
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, byteArray, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(fileName);

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl })
          .eq("id", profile.id);

        if (updateError) throw updateError;

        Alert.alert(
          t('more.success'),
          t('more.businessLogoUpdated'),
        );
      }
    } catch (error) {
      console.error(error);
      Alert.alert(t('more.error'), t('more.failedToUploadLogo'));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('more.title')}</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Profile Summary */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <TouchableOpacity style={styles.avatar} onPress={handlePickAvatar}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={{ width: "100%", height: "100%", borderRadius: 30 }}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarText}>
                  {profile?.name?.charAt(0) || "S"}
                </Text>
              )}
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={styles.businessName}>
                {profile?.name || t('more.waterSupplier')}
              </Text>
              <Text style={styles.phoneText}>{profile?.phone}</Text>
              <Text style={styles.badgeText}>Supplier account</Text>
            </View>
          </View>
        </Card>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={() => handlePress(item.route)}
            >
              <View style={styles.menuIconWrapper}>
                <Ionicons
                  name={item.icon as any}
                  size={24}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.border}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title={t('more.logOut')}
          variant="outline"
          style={styles.signOutBtn}
          onPress={signOut}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  profileCard: {
    padding: 20,
    marginBottom: 24,
    backgroundColor: theme.colors.primary,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
  profileInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  phoneText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  menuContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.background,
  },
  menuIconWrapper: {
    padding: 10,
    backgroundColor: theme.colors.primary + "10",
    borderRadius: 12,
    marginRight: 16,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  signOutBtn: {
    borderColor: theme.colors.error,
  },
});
