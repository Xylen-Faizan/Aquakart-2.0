import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import { theme } from "../../constants/theme";
import { supabase } from "../../lib/supabase/client";
import { LoadingState } from "../../components/feedback";
import { Button } from "../../components/ui";
import { useLanguage } from "../../features/i18n/LanguageProvider";

export default function CatalogScreen() {
  const router = useRouter();
  useAndroidBack();
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("active", true)
          .order("name");

        if (error) {
          console.error("Supabase Error:", error);
          Alert.alert("Supabase Error", error.message);
          throw error;
        }
        setProducts(data || []);
      } catch (err: any) {
        console.error("Catalog Error:", err);
        Alert.alert("Catalog Error", err.message || "Failed to load products");
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const handleCheckout = () => {
    if (!selectedProduct) return;

    router.push({
      pathname: "/(customer)/checkout",
      params: {
        product_id: selectedProduct.id,
        quantity: quantity.toString(),
        price: "80", // Base fallback price, could be made dynamic later
        business_name: "AquaKart Assured", // For generic dispatch
      },
    } as any);
  };

  const renderProduct = (product: any) => {
    const isSelected = selectedProduct?.id === product.id;

    return (
      <TouchableOpacity
        key={product.id}
        style={[styles.productCard, isSelected && styles.productCardSelected]}
        onPress={() => {
          setSelectedProduct(product);
          setQuantity(1);
        }}
      >
        <View style={styles.productImageContainer}>
          {product.image_url &&
          product.image_url !== "https://via.placeholder.com/150" ? (
            <Image
              source={{ uri: product.image_url }}
              style={styles.productImage}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ fontSize: 32 }}>💧</Text>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.productDesc} numberOfLines={2}>
            {product.description}
          </Text>
          <Text style={styles.productPrice}>{t('catalog.expressDelivery')}</Text>
        </View>

        <View style={styles.radioContainer}>
          <View style={[styles.radio, isSelected && styles.radioSelected]}>
            {isSelected && <View style={styles.radioInner} />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) return <LoadingState message={t('catalog.loading')} />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('catalog.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.pageSubtitle}>
          {t('catalog.subtitle')}
        </Text>

        <View style={styles.list}>{products.map(renderProduct)}</View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {selectedProduct && (
        <View style={styles.footer}>
          <View style={styles.quantityRow}>
            <Text style={styles.quantityLabel}>{t('common.quantity')}</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Ionicons
                  name="remove"
                  size={20}
                  color={theme.colors.textPrimary}
                />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setQuantity(quantity + 1)}
              >
                <Ionicons
                  name="add"
                  size={20}
                  color={theme.colors.textPrimary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <Button
            title={`Continue to Checkout (${quantity} item${quantity > 1 ? "s" : ""})`}
            onPress={handleCheckout}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  container: { flex: 1 },
  content: { padding: theme.spacing.md },
  pageSubtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 20,
  },
  list: { gap: 12 },
  productCard: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  productCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight + "20",
  },
  productImageContainer: {
    width: 60,
    height: 60,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
  },
  productImage: { width: 40, height: 40 },
  productInfo: { flex: 1 },
  productName: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  productDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  productPrice: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  radioContainer: { paddingLeft: 12 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: theme.colors.primary },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },

  footer: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  quantityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepBtn: { padding: 10 },
  quantityText: {
    fontSize: 16,
    fontWeight: "bold",
    minWidth: 32,
    textAlign: "center",
  },
});
