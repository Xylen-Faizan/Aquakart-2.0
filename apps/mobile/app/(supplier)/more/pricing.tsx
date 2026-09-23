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
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../../constants/theme";
import { Card, Button } from "../../../components/ui";
import { useAuth } from "../../../features/auth/AuthProvider";
import { supabase } from "../../../lib/supabase/client";
import { useAndroidBack } from "../../../hooks/useAndroidBack";
import { useLanguage } from "../../../features/i18n/LanguageProvider";

export default function PricingCatalogScreen() {
  const { user } = useAuth();
  const router = useRouter();
  useAndroidBack();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<any[]>([]);

  useEffect(() => {
    fetchCatalog();
  }, [user?.id]);

  const fetchCatalog = async () => {
    try {
      if (!user?.id) return;
      // 1. Get supplier ID
      const { data: supplierData } = await supabase
        .from("suppliers")
        .select("id")
        .eq("profile_id", user.id)
        .single();

      if (!supplierData) {
        Alert.alert(t('pricing.error'), t('pricing.completeProfileFirst'));
        router.back();
        return;
      }

      setSupplierId(supplierData.id);

      // 2. Get all global products
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("active", true);

      // 3. Get supplier's specific products
      const { data: supplierProducts } = await supabase
        .from("supplier_products")
        .select("*")
        .eq("supplier_id", supplierData.id);

      // 4. Merge
      if (products) {
        const merged = products.map((p: any) => {
          const sp = supplierProducts?.find(
            (sp: any) => sp.product_id === p.id,
          );
          return {
            product_id: p.id,
            name: p.name,
            available: sp ? sp.available : false,
            custom_price: sp
              ? sp.price?.toString()
              : "",
            sp_id: sp ? sp.id : null,
          };
        });
        setCatalog(merged);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (productId: string, value: boolean) => {
    setCatalog((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, available: value } : item,
      ),
    );
  };

  const handlePriceChange = (productId: string, text: string) => {
    setCatalog((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, custom_price: text } : item,
      ),
    );
  };

  const handleSave = async () => {
    if (!supplierId) return;
    try {
      setSaving(true);

      for (const item of catalog) {
        const payload = {
          supplier_id: supplierId,
          product_id: item.product_id,
          available: item.available,
          price: parseFloat(item.custom_price) || 0,
        };

        if (item.sp_id) {
          // Update existing
          const { error } = await supabase
            .from("supplier_products")
            .update(payload)
            .eq("id", item.sp_id);
          if (error) throw error;
        } else if (item.available) {
          // Insert new if made available
          const { error } = await supabase.from("supplier_products").insert(payload);
          if (error) throw error;
        }
      }

      Alert.alert(t('pricing.success'), t('pricing.catalogUpdated'));
      router.back();
    } catch (err: any) {
      console.error(err);
      Alert.alert(t('pricing.error'), t('pricing.failedUpdate'));
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
        <Text style={styles.headerTitle}>{t('pricing.title')}</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.description}>
          {t('pricing.description')}
        </Text>

        {catalog.map((item, index) => (
          <Card key={index} style={styles.card}>
            <View style={styles.productHeader}>
              <Text style={styles.productName}>{item.name}</Text>
              <Switch
                value={item.available}
                onValueChange={(val) => handleToggle(item.product_id, val)}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primary,
                }}
              />
            </View>

            {item.available && (
              <View style={styles.priceContainer}>
                <Text style={styles.label}>{t('pricing.pricePerUnit')}</Text>
                <TextInput
                  style={styles.input}
                  value={item.custom_price}
                  onChangeText={(text) =>
                    handlePriceChange(item.product_id, text)
                  }
                  keyboardType="numeric"
                />
              </View>
            )}
          </Card>
        ))}

        <Button
          title={saving ? t('pricing.saving') : t('pricing.save')}
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
  description: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 20,
  },
  card: {
    padding: 16,
    marginBottom: 16,
  },
  productHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  priceContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.background,
    paddingTop: 16,
  },
  label: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: theme.colors.surface,
  },
  saveBtn: {
    marginTop: 16,
    marginBottom: 40,
  },
});
