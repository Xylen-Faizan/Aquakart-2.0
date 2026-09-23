import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import { useLanguage } from "../../features/i18n/LanguageProvider";
import { theme } from "../../constants/theme";
import { SupplierService } from "../../services/supplier";
import { supabase } from "../../lib/supabase/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LoadingState } from "../../components/feedback";
import { getProductImage } from "../../utils/images";

export default function BulkOrdersScreen() {
  const router = useRouter();
  useAndroidBack();
  const { t } = useLanguage();
  const [supplier, setSupplier] = useState<any>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const addrId = await AsyncStorage.getItem("selectedAddressId");
      setAddressId(addrId);

      const suppliers = await SupplierService.getAvailableSuppliers();
      if (suppliers && suppliers.length > 0) {
        setSupplier(suppliers[0]);

        const { data: prods } = await supabase
          .from("supplier_products")
          .select(
            "product_id, price, products(name, description, unit, image_url)",
          )
          .eq("supplier_id", suppliers[0].id)
          .eq("available", true);

        if (prods) {
          const validProds = prods.filter((p) => p.products !== null);
          setProducts(validProds);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  const totalQty = Object.values(quantities).reduce((a, b) => a + b, 0);
  const baseAmount = products.reduce(
    (acc, p) => acc + (quantities[p.product_id] || 0) * p.price,
    0,
  );
  const subtotal = baseAmount;

  // 10% discount on 100+ items
  const discount = totalQty >= 100 ? baseAmount * 0.1 : 0;
  const finalAmount = baseAmount - discount;
  const totalAmount = finalAmount;

  const handlePlaceOrder = async () => {
    if (totalQty < 100) {
      Alert.alert(
        t('bulk.minAlertTitle'),
        t('bulk.minAlertMessage'),
      );
      return;
    }
    if (!supplier || !addressId) {
      Alert.alert(t('error'), t('bulk.addressAlert'));
      return;
    }

    try {
      setProcessing(true);

      const selected = products.filter(
        (p) => (quantities[p.product_id] || 0) > 0,
      );

      for (const p of selected) {
        const { error } = await supabase.rpc("place_order", {
          p_supplier_id: supplier.id,
          p_address_id: addressId,
          p_product_id: p.product_id,
          p_quantity: quantities[p.product_id],
          p_payment_method: "cash",
        });
        if (error) throw error;
      }

      Alert.alert(t('success'), t('bulk.successMessage'), [
        { text: "OK", onPress: () => router.push("/(customer)/orders") },
      ]);
    } catch (error: any) {
      Alert.alert(t('bulk.failedAlertTitle'), error.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </Pressable>
        <Text style={styles.headerTitle}>{t('bulk.title')}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {t('bulk.promo')}
          </Text>
        </View>

        <Text style={styles.label}>{t('bulk.selectProducts')}</Text>

        {products.map((p) => {
          const qty = quantities[p.product_id] || 0;
          const imageSource = getProductImage(p.products.image_url);

          return (
            <View key={p.product_id} style={styles.productCard}>
              <View style={styles.imageContainer}>
                {imageSource ? (
                  <Image
                    source={imageSource}
                    style={styles.productImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={{ fontSize: 24 }}>💧</Text>
                  </View>
                )}
              </View>
              <View style={styles.prodInfo}>
                <Text style={styles.prodName}>{p.products.name}</Text>
                <Text style={styles.prodPrice}>
                  ₹{p.price} / {p.products.unit}
                </Text>
              </View>
              <View style={styles.qtyControls}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => updateQty(p.product_id, -1)}
                >
                  <Ionicons name="remove" size={20} color="#333" />
                </Pressable>
                <Text style={styles.qtyText}>{qty}</Text>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => updateQty(p.product_id, 1)}
                >
                  <Ionicons name="add" size={20} color="#333" />
                </Pressable>
                <Pressable
                  style={styles.qtyBtnPlus}
                  onPress={() => updateQty(p.product_id, 10)}
                >
                  <Text style={{ fontWeight: "bold" }}>+10</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('checkout.orderSummary')}</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('bulk.totalItems')}</Text>
            <Text style={[styles.rowValue, totalQty < 100 && { color: "red" }]}>
              {totalQty}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('bulk.subtotal')}</Text>
            <Text style={styles.rowValue}>₹{subtotal}</Text>
          </View>
          {totalQty >= 100 && (
            <View style={styles.row}>
              <Text style={styles.rowLabelDiscount}>{t('bulk.discountLabel')}</Text>
              <Text style={styles.rowValueDiscount}>
                -₹{discount.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>{t('bulk.total')}</Text>
            <Text style={styles.totalValue}>₹{totalAmount.toFixed(2)}</Text>
          </View>
        </View>

        <Pressable
          style={[
            styles.btn,
            (totalQty < 100 || processing) && styles.btnDisabled,
          ]}
          onPress={handlePlaceOrder}
          disabled={totalQty < 100 || processing}
        >
          <Text style={styles.btnText}>
            {processing ? t('bulk.processing') : t('bulk.placeOrder')}
          </Text>
        </Pressable>
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
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: "bold" },
  content: { padding: 16 },
  banner: {
    backgroundColor: "#e8f5e9",
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  bannerText: {
    color: "#2e7d32",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
  },
  label: { fontSize: 16, fontWeight: "bold", marginBottom: 12 },
  productCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  imageContainer: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
    overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  productImage: { width: "100%", height: "100%" },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  prodInfo: { flex: 1 },
  prodName: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  prodPrice: { fontSize: 14, color: "#666" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: {
    backgroundColor: "#f0f0f0",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnPlus: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 16,
    fontWeight: "bold",
    minWidth: 24,
    textAlign: "center",
  },
  summaryCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 24,
    marginTop: 12,
  },
  summaryTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  rowLabel: { fontSize: 16, color: "#666" },
  rowValue: { fontSize: 16, fontWeight: "bold" },
  rowLabelDiscount: { fontSize: 16, color: "#2e7d32" },
  rowValueDiscount: { fontSize: 16, fontWeight: "bold", color: "#2e7d32" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 12 },
  totalLabel: { fontSize: 18, fontWeight: "bold" },
  totalValue: { fontSize: 20, fontWeight: "bold", color: theme.colors.primary },
  btn: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
});
