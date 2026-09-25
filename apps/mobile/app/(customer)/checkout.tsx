import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AddressService } from "../../services/address";
import { OrderService } from "../../services/order";
import { dispatchService } from "../../services/dispatch";
import { theme } from "../../constants/theme";
import { Button, Card, Badge, Input } from "../../components/ui";
import { LoadingState } from "../../components/feedback";
import { useAuth } from "../../features/auth/AuthProvider";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import { supabase } from "../../lib/supabase/client";
import * as Location from "expo-location";
import type { Address, PaymentMethod } from "@aquakart/types";
import { useLanguage } from "../../features/i18n/LanguageProvider";

type DispatchState = "none" | "searching" | "assigned" | "failed";

export default function CheckoutScreen() {
  const params = useLocalSearchParams<{
    supplier_id?: string;
    product_id: string;
    price: string;
    business_name?: string;
    quantity?: string;
  }>();
  const router = useRouter();
  const { t } = useLanguage();
  useAndroidBack();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user, profile, refreshProfile } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submittingPhone, setSubmittingPhone] = useState(false);

  // Dispatch state
  const [dispatchState, setDispatchState] = useState<DispatchState>("none");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [assignedOrderId, setAssignedOrderId] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fix for on-demand pricing: fallback to 80 if no supplier provided
  const price = parseFloat(params.price || (params.supplier_id ? "0" : "80"));
  const quantity = parseInt(params.quantity || "1", 10);
  const deliveryFee = 0; // Configured to 0 in this app version
  const subtotal = price * quantity;
  const total = subtotal + deliveryFee;

  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        if (!user?.id) return;
        const data = await AddressService.getAddresses(user.id);
        setAddresses(data);
        if (data.length > 0) {
          setSelectedAddress(data[0].id);
        }
      } catch (err: any) {
        Alert.alert(t('common.error') || "Error", t('checkout.loadAddressError') || "Failed to load addresses.");
      } finally {
        setLoading(false);
      }
    };
    fetchAddresses();
  }, [user?.id]);

  useEffect(() => {
    if (dispatchState === "searching") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [dispatchState]);

  useEffect(() => {
    if (!requestId) return;

    const channel = dispatchService.subscribeToDispatchRequest(
      requestId,
      (payload: any) => {
        const newStatus = payload.new?.status;
        if (['offered', 'accepted', 'assigned', 'failed', 'expired'].includes(newStatus)) {
          if (retryIntervalRef.current) {
            clearInterval(retryIntervalRef.current);
            retryIntervalRef.current = null;
          }
        }
        
        if (newStatus === "assigned") {
          setAssignedOrderId(payload.new.assigned_order_id);
          setDispatchState("assigned");
        } else if (newStatus === "failed" || newStatus === "expired") {
          setDispatchState("failed");
        }
      },
    );

    return () => {
      supabase.removeChannel(channel);
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    };
  }, [requestId]);

  const handlePlaceOrder = async () => {
    if (!selectedAddress) {
      Alert.alert(t('checkout.addressRequired') || "Address Required", t('checkout.addressRequiredMsg') || "Please select a delivery address.");
      return;
    }

    try {
      setSubmitting(true);

      const selectedAddr = addresses.find((a) => a.id === selectedAddress);
      if (!selectedAddr?.lat || !selectedAddr?.lng) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            t('checkout.permissionDenied') || "Permission Denied",
            t('checkout.permissionDeniedMsg') || "Location permissions are required since the selected address lacks coordinates.",
          );
          setSubmitting(false);
          return;
        }
        const providerStatus = await Location.getProviderStatusAsync();
        if (!providerStatus.locationServicesEnabled) {
          Alert.alert(t('checkout.gpsDisabled') || "GPS Disabled", t('checkout.gpsDisabledMsg') || "Please enable GPS/Location services.");
          setSubmitting(false);
          return;
        }
      }

      if (params.supplier_id) {
        // Explicit Supplier - Standard Order
        const orderId = await OrderService.placeOrder({
          supplier_id: params.supplier_id,
          delivery_address_id: selectedAddress,
          items: [{ product_id: params.product_id, quantity }],
          payment_method: paymentMethod,
        });
        router.replace(`/(customer)/order/${orderId}`);
      } else {
        // No explicit supplier - Dispatch engine mode
        setDispatchState("searching");
        const reqId = await dispatchService.createDispatchRequest(
          selectedAddress,
          params.product_id,
          quantity,
        );
        setRequestId(reqId);

        // Initial search
        await dispatchService.searchVehicles(reqId).catch(() => {});
        
        // Retry loop
        retryIntervalRef.current = setInterval(async () => {
          try {
            await dispatchService.searchVehicles(reqId);
          } catch (e) { /* ignore */ }
        }, 5000);
        
        setTimeout(() => {
          if (retryIntervalRef.current) {
            clearInterval(retryIntervalRef.current);
            retryIntervalRef.current = null;
          }
        }, 55000);
      }
    } catch (err: any) {
      Alert.alert(
        t('checkout.orderFailed') || "Order Failed",
        err.message || t('checkout.orderFailedMsg') || "Something went wrong while placing your order.",
      );
      setSubmitting(false);
      setDispatchState("none");
    }
  };

  const handleCancelDispatch = async () => {
    if (requestId) {
      try {
        await dispatchService.cancelDispatchRequest(requestId);
      } catch (err) {
        console.error("Cancel error:", err);
      }
    }
    setDispatchState("none");
    setRequestId(null);
    setSubmitting(false);
  };

  const handleTrackOrder = () => {
    if (assignedOrderId) {
      router.push({
        pathname: "/(customer)/track-order",
        params: { order_id: assignedOrderId },
      } as any);
    }
  };

  const handleRetryDispatch = () => {
    setDispatchState("none");
    setRequestId(null);
    setSubmitting(false);
  };

  const selectedAddrObj = addresses.find((a) => a.id === selectedAddress);

  if (loading) return <LoadingState message={t('checkout.loading') || "Loading checkout..."} />;

  const needsPhone = !profile?.phone;

  if (needsPhone) {
    const handleSavePhone = async () => {
      if (phoneNumber.length < 10) {
        Alert.alert(t('checkout.invalidPhone'), t('checkout.invalidPhoneMsg'));
        return;
      }
      try {
        setSubmittingPhone(true);
        const { error } = await supabase
          .from("profiles")
          .update({ phone: phoneNumber })
          .eq("id", profile?.id);
        if (error) throw error;
        await refreshProfile();
      } catch (err: any) {
        Alert.alert(t('common.error') || "Error", err.message);
      } finally {
        setSubmittingPhone(false);
      }
    };

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
        <View
          style={[
            styles.container,
            { padding: theme.spacing.xl, justifyContent: "center" },
          ]}
        >
          <Text style={styles.title}>{t('checkout.phoneCta')}</Text>
          <Text
            style={{
              fontSize: 16,
              color: theme.colors.textSecondary,
              marginBottom: 32,
              marginTop: 8,
            }}
          >
            {t('checkout.phoneDesc')}
          </Text>
          <Input
            label={t('checkout.mobileNumber')}
            placeholder={t('checkout.phonePlaceholder')}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            leftElement={
              <Ionicons
                name="call-outline"
                size={20}
                color={theme.colors.textTertiary}
              />
            }
          />
          <Button
            title={t('checkout.continueToCheckout')}
            onPress={handleSavePhone}
            loading={submittingPhone}
            style={{ marginTop: 16 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Active Dispatch Screens (Searching, Assigned, Failed)
  if (dispatchState !== "none") {
    return (
      <SafeAreaView style={styles.safeDark}>
        {dispatchState === "searching" && (
          <View style={styles.centered}>
            <Animated.View
              style={[
                styles.searchCircle,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Ionicons name="water" size={48} color="#0EA5E9" />
            </Animated.View>
            <Text style={styles.searchTitle}>
              {t('checkout.findingVehicle') || "Finding a delivery vehicle..."}
            </Text>
            <Text style={styles.searchSubtitle}>
              {t('checkout.lookingForVehicles') || "Looking for available vehicles near you"}
            </Text>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelDispatch}
            >
              <Text style={styles.cancelBtnText}>{t('common.cancel') || "Cancel"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {dispatchState === "assigned" && (
          <View style={styles.centered}>
            <View style={styles.successCircle}>
              <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
            </View>
            <Text style={styles.successTitle}>{t('checkout.supplierFound') || "Supplier Found!"}</Text>
            <Text style={styles.successSubtitle}>
              {t('checkout.deliveryOnWay') || "Your water delivery is on its way."}
            </Text>
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={handleTrackOrder}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.trackBtnText}>{t('checkout.trackDelivery') || "Track Delivery"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {dispatchState === "failed" && (
          <View style={styles.centered}>
            <Ionicons name="sad-outline" size={64} color="#64748B" />
            <Text style={styles.failTitle}>{t('checkout.noVehicles') || "No Vehicles Available"}</Text>
            <Text style={styles.failSubtitle}>
              {t('checkout.noVehiclesDesc') || "No delivery vehicles with capacity are currently near you. Please try again later."}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={handleRetryDispatch}
            >
              <Text style={styles.retryBtnText}>{t('common.tryAgain') || "Try Again"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Normal Checkout View
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(customer)/home")
          }
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.title}>{t('checkout.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('checkout.deliveryAddress')}</Text>
          {selectedAddrObj ? (
            <Card style={styles.addressCard}>
              <View style={styles.addressContainer}>
                <View style={styles.addressIconContainer}>
                  <Ionicons
                    name="location"
                    size={24}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.addressContent}>
                  <View style={styles.addressLabelRow}>
                    <Text style={styles.addressLabel}>
                      {selectedAddrObj.label}
                    </Text>
                    <Badge
                      label={t('checkout.default')}
                      variant="info"
                      style={{ marginLeft: 8 }}
                    />
                  </View>
                  <Text style={styles.addressText} numberOfLines={2}>
                    {selectedAddrObj.address}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push("/(customer)/addresses")}
                >
                  <Text style={styles.changeBtnText}>{t('common.change')}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : (
            <Card style={styles.addressCard}>
              <View style={styles.noAddressContainer}>
                <Text style={styles.noAddressText}>
                  {t('checkout.noAddress')}
                </Text>
                <Button
                  title={t('checkout.addAddress')}
                  size="sm"
                  onPress={() => router.push("/(customer)/addresses")}
                />
              </View>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('checkout.orderSummary')}</Text>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <View style={styles.summaryItemInfo}>
                <View style={styles.productIconContainer}>
                  <Text style={styles.productIcon}>🚰</Text>
                </View>
                <View>
                  <Text style={styles.summaryItemName}>
                    {t('checkout.productName')} x {quantity}
                  </Text>
                  <Text style={styles.summaryItemSupplier}>
                    {params.business_name || t('checkout.expressDispatch')}
                  </Text>
                </View>
              </View>
              <Text style={styles.summaryItemPrice}>₹{subtotal}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('checkout.subtotal')}</Text>
              <Text style={styles.priceValue}>₹{subtotal}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('checkout.deliveryFee')}</Text>
              <Text style={styles.priceValue}>
                {deliveryFee === 0 ? t('common.free') : `₹${deliveryFee}`}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('common.total')}</Text>
              <Text style={styles.totalValue}>₹{total}</Text>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('checkout.paymentMethod')}</Text>
          <View style={styles.paymentMethodsGrid}>
            <TouchableOpacity
              style={[
                styles.paymentMethodCard,
                paymentMethod === "cash" && styles.paymentMethodCardActive,
              ]}
              onPress={() => setPaymentMethod("cash")}
            >
              <View
                style={[
                  styles.paymentIconContainer,
                  paymentMethod === "cash" && styles.paymentIconContainerActive,
                ]}
              >
                <Ionicons
                  name="cash-outline"
                  size={24}
                  color={
                    paymentMethod === "cash"
                      ? theme.colors.primary
                      : theme.colors.textSecondary
                  }
                />
              </View>
              <Text
                style={[
                  styles.paymentMethodName,
                  paymentMethod === "cash" && styles.paymentMethodNameActive,
                ]}
              >
                {t('checkout.cashOnDelivery')}
              </Text>
              {paymentMethod === "cash" ? (
                <View style={styles.checkmarkBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={theme.colors.primary}
                  />
                </View>
              ) : null}
            </TouchableOpacity>

            {/* UPI disabled for Bokaro Pilot due to dispatch hardcoding */}
            {/*
            <TouchableOpacity
              style={[
                styles.paymentMethodCard,
                paymentMethod === "upi" && styles.paymentMethodCardActive,
              ]}
              onPress={() => setPaymentMethod("upi")}
            >
              <View
                style={[
                  styles.paymentIconContainer,
                  paymentMethod === "upi" && styles.paymentIconContainerActive,
                ]}
              >
                <Ionicons
                  name="phone-portrait-outline"
                  size={24}
                  color={
                    paymentMethod === "upi"
                      ? theme.colors.primary
                      : theme.colors.textSecondary
                  }
                />
              </View>
              <Text
                style={[
                  styles.paymentMethodName,
                  paymentMethod === "upi" && styles.paymentMethodNameActive,
                ]}
              >
                {t('checkout.upiOnline')}
              </Text>
              {paymentMethod === "upi" ? (
                <View style={styles.checkmarkBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={theme.colors.primary}
                  />
                </View>
              ) : null}
            </TouchableOpacity>
            */}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.footerBar}>
        <View style={styles.footerTotalContainer}>
          <Text style={styles.footerTotalLabel}>{t('checkout.totalPayment')}</Text>
          <Text style={styles.footerTotalPrice}>₹{total}</Text>
        </View>
        <Button
          title={t('checkout.placeOrder')}
          onPress={handlePlaceOrder}
          disabled={submitting || !selectedAddress}
          style={styles.checkoutButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  safeDark: { flex: 1, backgroundColor: "#0F172A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.lg,
    paddingTop: Platform.OS === "ios" ? theme.spacing.xl : theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  container: { flex: 1 },
  section: {
    padding: theme.spacing.lg,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  addressCard: {
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  addressIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  addressContent: { flex: 1 },
  addressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  addressLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  addressText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    paddingRight: theme.spacing.md,
    lineHeight: 20,
  },
  changeBtnText: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.bold as any,
    padding: theme.spacing.sm,
  },
  noAddressContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  noAddressText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  summaryCard: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  summaryItemInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  productIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  productIcon: { fontSize: 24 },
  summaryItemName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  summaryItemSupplier: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  summaryItemPrice: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  priceLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  priceValue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium as any,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.xs,
  },
  totalLabel: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  totalValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  },
  paymentMethodsGrid: { flexDirection: "row", gap: theme.spacing.md },
  paymentMethodCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.border,
    position: "relative",
  },
  paymentMethodCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight + "10",
  },
  paymentIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  paymentIconContainerActive: { backgroundColor: theme.colors.primaryLight },
  paymentMethodName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
    textAlign: "center",
  },
  paymentMethodNameActive: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.bold as any,
  },
  checkmarkBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
  },
  footerBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 34 : theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  footerTotalContainer: { flex: 1 },
  footerTotalLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  footerTotalPrice: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  checkoutButton: { flex: 1.5, marginLeft: theme.spacing.md },

  // Dispatch Styles
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  searchCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#0EA5E915",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  searchTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F8FAFC",
    marginBottom: 8,
  },
  searchSubtitle: { fontSize: 14, color: "#64748B", textAlign: "center" },
  cancelBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#334155",
  },
  cancelBtnText: { color: "#94A3B8", fontWeight: "700" },
  successCircle: { marginBottom: 24 },
  successTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#22C55E",
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 24,
  },
  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  trackBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  failTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F8FAFC",
    marginTop: 16,
    marginBottom: 8,
  },
  failSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 24,
  },
  retryBtn: {
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
});
