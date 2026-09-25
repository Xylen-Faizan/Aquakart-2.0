import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Image,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../features/auth/AuthProvider";
import { supabase } from "../../lib/supabase/client";
import { theme } from "../../constants/theme";
import { Card, Button } from "../../components/ui";
import { useLanguage } from "../../features/i18n/LanguageProvider";

export default function ProfileScreen() {
  const { profile, user, session, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  useAndroidBack();

  // Derive a reliable user ID from multiple sources
  // profile.id === user.id === session.user.id (all the same UUID in Supabase)
  const userId = user?.id || profile?.id || session?.user?.id;

  const [name, setName] = useState(profile?.name || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile?.avatar_url || null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep local state in sync when profile loads/updates
  useEffect(() => {
    if (profile?.name && !name) {
      setName(profile.name);
    }
    if (profile?.avatar_url && !avatarUrl) {
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const pickImage = async () => {
    if (!userId) {
      setError("Not logged in. Please go back and log in again.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setSaving(true);
      setError(null);

      try {
        const fileName = `${userId}/${Date.now()}.jpg`;

        const base64Data = result.assets[0].base64;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, byteArray, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(fileName);

        // Update profile in database
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl })
          .eq("id", userId);

        if (updateError) throw updateError;

        setAvatarUrl(publicUrl);
        await refreshProfile();
      } catch (err: any) {
        console.error("Upload Error:", err);
        const msg = err?.message || "";
        if (msg.includes("Bucket not found") || msg.includes("not found")) {
          setError(
            'Avatar storage is not set up yet. Please create an "avatars" bucket in Supabase Storage.',
          );
        } else {
          setError("Failed to upload image: " + msg);
        }
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === profile?.name) {
      setIsEditingName(false);
      setName(profile?.name || "");
      return;
    }

    if (!userId) {
      setError("Not logged in. Please go back and log in again.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ name: name.trim() })
        .eq("id", userId);

      if (updateError) throw updateError;

      await supabase.auth.updateUser({
        data: { name: name.trim() },
      });

      await refreshProfile();
      setIsEditingName(false);
    } catch (err: any) {
      setError(err.message || "Failed to save name");
    } finally {
      setSaving(false);
    }
  };

  // Use local name state for the avatar initial (more responsive than profile?.name)
  const displayInitial =
    (name || profile?.name || "?")[0]?.toUpperCase() || "U";
  const displayName = profile?.name || name || "AquaKart User";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </Pressable>
        <Text style={styles.title}>{t('profile.title')}</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: theme.spacing.lg }}
      >
        {/* User Info Card */}
        <Card style={styles.profileCard}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={pickImage}
            style={styles.avatarContainer}
            disabled={saving}
          >
            {saving ? (
              <View
                style={[styles.avatarLarge, { backgroundColor: "#e2e8f0" }]}
              >
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarLargeImage}
              />
            ) : (
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarTextLarge}>{displayInitial}</Text>
              </View>
            )}
            <View style={styles.editAvatarIcon}>
              <Ionicons name="camera" size={14} color="white" />
            </View>
          </Pressable>

          {isEditingName ? (
            <View style={styles.nameEditContainer}>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                autoFocus
                placeholder={t('profile.enterName')}
                placeholderTextColor={theme.colors.textTertiary}
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
              />
              <Pressable
                style={styles.saveNameBtn}
                onPress={handleSaveName}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="checkmark" size={18} color="white" />
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.nameContainer}
              onPress={() => setIsEditingName(true)}
            >
              <Text style={styles.userName}>{displayName}</Text>
              <Ionicons
                name="pencil"
                size={14}
                color={theme.colors.textTertiary}
                style={{ marginLeft: 6, marginTop: 4 }}
              />
            </Pressable>
          )}

          <Text style={styles.userEmail}>
            {user?.email || session?.user?.email || ""}
          </Text>
        </Card>

        {/* Settings Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.accountSettings')}</Text>

          <Pressable
            style={styles.settingItem}
            onPress={() => router.push("/(customer)/addresses")}
          >
            <View style={styles.settingItemLeft}>
              <View style={styles.settingIconWrapper}>
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.settingText}>{t('profile.savedAddresses')}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.colors.textTertiary}
            />
          </Pressable>

          <Pressable
            style={styles.settingItem}
            onPress={() => router.push("/(customer)/orders")}
          >
            <View style={styles.settingItemLeft}>
              <View style={styles.settingIconWrapper}>
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.settingText}>{t('profile.orderHistory')}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.colors.textTertiary}
            />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal & Privacy</Text>
          <Pressable style={styles.settingItem} onPress={() => router.push({ pathname: "/(auth)/legal", params: { document: "privacy" } } as any)} accessibilityRole="button" accessibilityLabel="Open Privacy Policy">
            <View style={styles.settingItemLeft}><Text style={styles.settingText}>Privacy Policy</Text></View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </Pressable>
          <Pressable style={styles.settingItem} onPress={() => router.push({ pathname: "/(auth)/legal", params: { document: "terms" } } as any)} accessibilityRole="button" accessibilityLabel="Open Terms of Service">
            <View style={styles.settingItemLeft}><Text style={styles.settingText}>Terms of Service</Text></View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </Pressable>
          <Pressable style={styles.settingItem} onPress={() => router.push({ pathname: "/(auth)/legal", params: { document: "refunds" } } as any)} accessibilityRole="button" accessibilityLabel="Open Refund and Cancellation Policy">
            <View style={styles.settingItemLeft}><Text style={styles.settingText}>Refund & Cancellation</Text></View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </Pressable>
          <Pressable style={styles.settingItem} onPress={() => router.push({ pathname: "/(auth)/legal", params: { document: "cookies" } } as any)} accessibilityRole="button" accessibilityLabel="Open Cookie Policy">
            <View style={styles.settingItemLeft}><Text style={styles.settingText}>Cookie Policy</Text></View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.support')}</Text>

          <Pressable
            style={styles.settingItem}
            onPress={() =>
              Alert.alert(
                t('profile.helpCenter'),
                "Our customer support team is available at support@aquakart.com",
              )
            }
          >
            <View style={styles.settingItemLeft}>
              <View style={styles.settingIconWrapper}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.settingText}>{t('profile.helpCenter')}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.colors.textTertiary}
            />
          </Pressable>
        </View>

        <View style={{ height: 40 }} />

        {/* Logout Button */}
        <Button title={t('profile.logOut')} variant="danger" onPress={() => signOut()} />
        <View style={{ height: 40 }} />
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
  backBtn: { marginRight: theme.spacing.md },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  container: { flex: 1 },
  profileCard: {
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
    width: "100%",
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  avatarContainer: {
    position: "relative",
    marginBottom: theme.spacing.md,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLargeImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarTextLarge: {
    fontSize: 32,
    fontWeight: "bold",
    color: theme.colors.primary,
  },
  editAvatarIcon: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  userName: {
    fontSize: theme.fontSize.xl,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  nameEditContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    width: "80%",
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: theme.fontSize.md,
    backgroundColor: theme.colors.background,
    color: theme.colors.textPrimary,
  },
  saveNameBtn: {
    backgroundColor: theme.colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  userEmail: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "bold",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  settingItemLeft: { flexDirection: "row", alignItems: "center" },
  settingIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  settingText: {
    fontSize: theme.fontSize.md,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
});
