import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../../constants/theme";
import { Card, Button } from "../../../components/ui";
import { useAuth } from "../../../features/auth/AuthProvider";
import { supabase } from "../../../lib/supabase/client";
import * as Location from "expo-location";
import { useAndroidBack } from "../../../hooks/useAndroidBack";
import { useLanguage } from "../../../features/i18n/LanguageProvider";

export default function BusinessProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  useAndroidBack();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("profile_id", user.id)
        .single();

      if (error) {
        if (error.code !== "PGRST116") {
          console.error(error);
        }
      } else if (data) {
        setBusinessName(data.business_name || "");
        setPhone(data.phone || "");
        setAddress(data.address || "");
        if (data.lat && data.lng) {
          setLocation({ lat: data.lat, lng: data.lng });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLocation = async () => {
    try {
      setSaving(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t('business.permissionDenied'),
          t('business.allowLocation'),
        );
        return;
      }
      const locationData = await Location.getCurrentPositionAsync({});
      const lat = locationData.coords.latitude;
      const lng = locationData.coords.longitude;
      
      setLocation({ lat, lng });
      
      const reverseGeo = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });

      if (reverseGeo && reverseGeo.length > 0) {
        const place = reverseGeo[0];
        const formattedAddress = [
          place.name,
          place.street,
          place.subregion,
          place.city,
        ]
          .filter(Boolean)
          .join(", ");
        setAddress(formattedAddress);
      }
      
      Alert.alert(t('business.success'), t('business.locationUpdated'));
    } catch (error) {
      Alert.alert(t('business.error'), t('business.failedLocation'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!businessName || !phone) {
      Alert.alert(t('business.validationError'), t('business.namePhoneRequired'));
      return;
    }

    try {
      setSaving(true);

      const { data: existing } = await supabase
        .from("suppliers")
        .select("id")
        .eq("profile_id", user!.id)
        .single();

      if (existing) {
        const updateData: any = {
          business_name: businessName,
          phone: phone,
          address: address,
          lat: location?.lat || null,
          lng: location?.lng || null,
        };

        const { error } = await supabase
          .from("suppliers")
          .update(updateData)
          .eq("profile_id", user!.id);

        if (error) throw error;

        // Update location via RPC if changed
        if (location && location.lat !== 0) {
          await supabase.rpc("update_supplier_location", {
            p_supplier_id: existing.id,
            p_lng: location.lng,
            p_lat: location.lat,
          });
        }
      } else {
        // Insert new supplier
        const { data: newSupplier, error } = await supabase
          .from("suppliers")
          .insert({
            profile_id: user!.id,
            business_name: businessName,
            phone: phone,
            address: address,
            lat: location?.lat || null,
            lng: location?.lng || null,
            is_active: true,
          })
          .select("id")
          .single();

        if (error) throw error;

        if (location && location.lat !== 0 && newSupplier) {
          await supabase.rpc("update_supplier_location", {
            p_supplier_id: newSupplier.id,
            p_lng: location.lng,
            p_lat: location.lat,
          });
        }
      }

      Alert.alert(t('business.success'), t('business.profileUpdated'));
      router.back();
    } catch (err: any) {
      console.error(err);
      Alert.alert(t('business.error'), err.message || t('business.failedSave'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.safeArea,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('business.title')}</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Card style={styles.card}>
          <Text style={styles.label}>{t('business.nameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder={t('business.namePlaceholder')}
          />

          <Text style={styles.label}>{t('business.addressLabel')}</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            value={address}
            onChangeText={setAddress}
            placeholder={t('business.addressPlaceholder')}
            multiline
          />

          <Text style={styles.label}>{t('business.phoneLabel')}</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('business.phonePlaceholder')}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>{t('business.serviceLocation')}</Text>
          <View style={styles.locationContainer}>
            <Text style={styles.locationText}>
              {location ? t('business.gpsSet') : t('business.locationNotSet')}
            </Text>
            <Button
              title={t('business.updateGps')}
              variant="outline"
              size="sm"
              onPress={handleUpdateLocation}
            />
          </View>
          <Text style={styles.hintText}>
            {t('business.gpsHint')}
          </Text>
        </Card>

        <Button
          title={saving ? t('business.saving') : t('business.saveProfile')}
          onPress={handleSave}
          disabled={saving}
          style={styles.saveBtn}
        />
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
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  card: {
    padding: theme.spacing.lg,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: theme.colors.surface,
  },
  locationContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.background,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  locationText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  hintText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  saveBtn: {
    marginTop: 8,
  },
});
