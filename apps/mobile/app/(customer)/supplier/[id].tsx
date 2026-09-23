import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SupplierService } from "../../../services/supplier";
import { theme } from "../../../constants/theme";
import { Card, Button, Badge } from "../../../components/ui";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { useAndroidBack } from "../../../hooks/useAndroidBack";
import { useLanguage } from "../../../features/i18n/LanguageProvider";

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useAndroidBack();
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    fetchSupplierDetails();
  }, [id]);

  const fetchSupplierDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const details = await SupplierService.getSupplierDetailForCustomer(id!);
      setData(details);
    } catch (err: any) {
      setError(err.message || "Failed to load supplier details");
    } finally {
      setLoading(false);
    }
  };

  const incrementQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

  const decrementQuantity = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const handleCheckout = () => {
    if (!data) return;

    router.push({
      pathname: "/(customer)/checkout",
      params: {
        supplier_id: data.id,
        product_id: data.product_id,
        price: data.price,
        business_name: data.business_name,
        quantity: quantity.toString(),
      },
    });
  };

  if (loading) return <LoadingState message="Loading details..." />;
  if (error)
    return (
      <ErrorState
        title="Error"
        message={error}
        onRetry={fetchSupplierDetails}
      />
    );
  if (!data)
    return <ErrorState title="Not Found" message="Supplier not found." />;

  const supplier = data;
  const mainProduct = data; // since the row includes both supplier and main product info

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.coverImageContainer}>
          <View style={styles.coverPlaceholder}>
            <Ionicons name="water" size={64} color="rgba(255,255,255,0.2)" />
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.iconButton}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={theme.colors.textPrimary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton}>
              <Ionicons
                name="heart-outline"
                size={24}
                color={theme.colors.textPrimary}
              />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.infoSection}>
          <Text style={styles.businessName}>{supplier.business_name}</Text>

          <View style={styles.tagsContainer}>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.ratingText}>4.8</Text>
            </View>
            <Badge
              label={
                supplier.is_accepting_orders ? t('Accepting Orders') : t('Closed')
              }
              variant={supplier.is_accepting_orders ? "success" : "error"}
            />
          </View>

          {supplier.description ? (
            <Text style={styles.description}>{supplier.description}</Text>
          ) : null}

          <View style={styles.deliveryInfoBox}>
            <View style={styles.deliveryInfoItem}>
              <Ionicons
                name="location-outline"
                size={20}
                color={theme.colors.primary}
              />
              <Text style={styles.deliveryInfoText}>{supplier.address}</Text>
            </View>
            <View style={styles.deliveryInfoDivider} />
            <View style={styles.deliveryInfoItem}>
              <Ionicons
                name="bicycle-outline"
                size={20}
                color={theme.colors.primary}
              />
              <Text style={styles.deliveryInfoText}>Delivery Available</Text>
            </View>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.productSection}>
          <Text style={styles.sectionTitle}>{t('Available Products')}</Text>

          {mainProduct ? (
            <Card elevated style={styles.productCard}>
              <View style={styles.productCardContent}>
                <View style={styles.productIconContainer}>
                  <Text style={styles.productIcon}>🚰</Text>
                </View>
                <View style={styles.productDetails}>
                  <Text style={styles.productName}>
                    {mainProduct.product_name || "20L RO Water Can"}
                  </Text>
                  <Text style={styles.productPrice}>
                    ₹{mainProduct.price}/can
                  </Text>
                </View>
              </View>

              <View style={styles.stepperContainer}>
                <Text style={styles.stepperLabel}>Quantity:</Text>
                <View style={styles.stepperControls}>
                  <TouchableOpacity
                    onPress={decrementQuantity}
                    style={styles.stepperButton}
                  >
                    <Ionicons
                      name="remove"
                      size={20}
                      color={theme.colors.textPrimary}
                    />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{quantity}</Text>
                  <TouchableOpacity
                    onPress={incrementQuantity}
                    style={styles.stepperButton}
                  >
                    <Ionicons
                      name="add"
                      size={20}
                      color={theme.colors.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          ) : (
            <Text style={styles.noProducts}>
              This supplier currently has no products available.
            </Text>
          )}
        </View>
        <View style={{ height: 100 }} /> {/* Space for footer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {mainProduct && (
        <View style={styles.footerBar}>
          <View style={styles.footerTotalContainer}>
            <Text style={styles.footerTotalLabel}>{t('Total Price')}</Text>
            <Text style={styles.footerTotalPrice}>
              ₹{mainProduct.price * quantity}
            </Text>
            <Text style={styles.footerTotalItems}>
              ({quantity} {quantity === 1 ? t('can') : t('cans')})
            </Text>
          </View>
          <Button
            title={t('Checkout')}
            onPress={handleCheckout}
            disabled={
              !supplier.is_accepting_orders ||
              supplier.available_quantity < quantity
            }
            style={styles.checkoutButton}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  coverImageContainer: {
    height: 220,
    backgroundColor: theme.colors.primary,
    position: "relative",
  },
  coverPlaceholder: {
    ...(StyleSheet.absoluteFill as any),
    justifyContent: "center",
    alignItems: "center",
  },
  headerActions: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoSection: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
  },
  businessName: {
    fontSize: 28,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  tagsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.sm,
  },
  ratingText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: "#D97706",
    marginLeft: 4,
  },
  description: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  deliveryInfoBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  deliveryInfoItem: {
    alignItems: "center",
    flex: 1,
  },
  deliveryInfoText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  deliveryInfoDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  divider: {
    height: 8,
    backgroundColor: theme.colors.background,
  },
  productSection: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
  },
  productCard: {
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  productCardContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  productIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  productIcon: {
    fontSize: 28,
  },
  productDetails: {
    flex: 1,
  },
  productName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
  },
  stepperContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  stepperLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textPrimary,
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepperButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  stepperValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    width: 32,
    textAlign: "center",
  },
  noProducts: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.lg,
  },
  footerBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    padding: theme.spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 34 : theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerTotalContainer: {
    flex: 1,
  },
  footerTotalLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footerTotalPrice: {
    fontSize: 22,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  },
  footerTotalItems: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  checkoutButton: {
    flex: 1.2,
    marginLeft: theme.spacing.lg,
  },
});
