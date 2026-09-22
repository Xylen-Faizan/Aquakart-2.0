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
import { useRouter, useLocalSearchParams } from "expo-router";
import { theme } from "../../../constants/theme";
import { supabase } from "../../../lib/supabase/client";
import { LoadingState } from "../../../components/feedback";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SupplierService } from "../../../services/supplier";

import { getProductImage } from "../../../utils/images";

export default function BrandScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams();
  const brandName = Array.isArray(name) ? name[0] : name;

  const [supplier, setSupplier] = useState<any>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, [brandName]);

  const loadData = async () => {
    try {
      setLoading(true);
      const addrId = await AsyncStorage.getItem("selectedAddressId");
      setAddressId(addrId);

      const suppliers = await SupplierService.getAvailableSuppliers();
      if (suppliers && suppliers.length > 0) {
        setSupplier(suppliers[0]);

        // Fetch products matching the brand name
        const { data: prods } = await supabase
          .from("supplier_products")
          .select(
            "product_id, price, products(name, description, unit, image_url)",
          )
          .eq("supplier_id", suppliers[0].id)
          .eq("available", true)
          .ilike("products.name", `%${brandName}%`);

        if (prods) {
          // Filter out nulls from inner join issue on ilike
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
  const totalAmount = products.reduce(
    (acc, p) => acc + (quantities[p.product_id] || 0) * p.price,
    0,
  );

  const handlePlaceOrder = () => {
    if (totalQty === 0) {
      Alert.alert("Empty Order", "Please select at least one product.");
      return;
    }

    // We only support single-product opportunistic dispatches for now
    const selected = products.filter(
      (p) => (quantities[p.product_id] || 0) > 0,
    );
    const primaryProduct = selected[0];

    router.push({
      pathname: "/(customer)/checkout",
      params: {
        product_id: primaryProduct.product_id,
        quantity: quantities[primaryProduct.product_id].toString(),
        price: primaryProduct.price.toString(),
        business_name: "Express Dispatch",
      },
    });
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
        <Text style={styles.headerTitle}>{brandName} Products</Text>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.label}>Select {brandName} Products</Text>

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
              </View>
            </View>
          );
        })}

        {products.length === 0 && (
          <Text
            style={{
              textAlign: "center",
              marginTop: 40,
              color: theme.colors.textSecondary,
            }}
          >
            No {brandName} products found at nearby suppliers.
          </Text>
        )}

        {totalQty > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.row}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>₹{totalAmount.toFixed(2)}</Text>
            </View>
          </View>
        )}

        <Pressable
          style={[
            styles.btn,
            (totalQty === 0 || processing) && styles.btnDisabled,
          ]}
          onPress={handlePlaceOrder}
          disabled={totalQty === 0 || processing}
        >
          <Text style={styles.btnText}>
            {processing ? "Processing..." : "Place Order"}
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
    backgroundColor: theme.colors.surface,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: "bold" },
  content: { padding: 16 },
  label: { fontSize: 16, fontWeight: "bold", marginBottom: 12 },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
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
  prodName: { fontSize: 14, fontWeight: "bold", marginBottom: 4 },
  prodPrice: { fontSize: 14, color: theme.colors.primary },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: {
    backgroundColor: "#f0f0f0",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 16,
    fontWeight: "bold",
    minWidth: 20,
    textAlign: "center",
  },
  summaryCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 16,
    marginTop: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
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
