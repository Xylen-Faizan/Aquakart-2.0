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
  Image,
  Linking,
  Dimensions,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
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
  useAndroidBack(() => {
    if (dispatchState === "searching") {
      Alert.alert(
        t('checkout.cancelSearchTitle') || "Cancel Searching",
        t('checkout.cancelSearchMsg') || "Are you sure you want to cancel the searching?",
        [
          { text: t('common.no') || "No", style: "cancel" },
          { text: t('common.yes') || "Yes", onPress: handleCancelDispatch, style: "destructive" }
        ]
      );
      return true;
    }
    return false;
  });

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
  
  // Radar animations
  const pulseAnim1 = useRef(new Animated.Value(0)).current;
  const pulseAnim2 = useRef(new Animated.Value(0)).current;
  const pulseAnim3 = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  
  const [searchPhraseIndex, setSearchPhraseIndex] = useState(0);
  const searchPhrases = [
    t('checkout.findingVehicle') || "Finding best possible vehicles nearby...",
    t('checkout.waitFewSeconds') || "Wait for few more seconds...",
    t('checkout.aboutToFind') || "We are about to find the vehicle..."
  ];
  const [urgencyTip, setUrgencyTip] = useState<number>(0);
  const [showCancelBtn, setShowCancelBtn] = useState(false);
  
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
      const createPulse = (anim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 1,
              duration: 2500,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
      };

      const p1 = createPulse(pulseAnim1, 0);
      const p2 = createPulse(pulseAnim2, 800);
      const p3 = createPulse(pulseAnim3, 1600);

      p1.start();
      p2.start();
      p3.start();

      // Progressive blue line moving slowly (e.g. 30 seconds to complete)
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 30000, 
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();

      // Cycle text every 5 seconds
      const textInterval = setInterval(() => {
        setSearchPhraseIndex(prev => (prev + 1) % searchPhrases.length);
      }, 5000);

      // Show cancel button after 10 seconds
      const cancelTimeout = setTimeout(() => {
        setShowCancelBtn(true);
      }, 10000);

      return () => {
        p1.stop();
        p2.stop();
        p3.stop();
        progressAnim.stopAnimation();
        clearInterval(textInterval);
        clearTimeout(cancelTimeout);
      };
    } else {
      progressAnim.setValue(0);
      setSearchPhraseIndex(0);
      setShowCancelBtn(false);
      setUrgencyTip(0);
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
          <View style={styles.searchingContainer}>
            {/* Background Map */}
            <MapView
              style={StyleSheet.absoluteFillObject}
              initialRegion={{
                latitude: selectedAddrObj?.lat || 20.5937,
                longitude: selectedAddrObj?.lng || 78.9629,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              customMapStyle={mapDarkStyle}
            >
              {selectedAddrObj?.lat && selectedAddrObj?.lng && (
                <Marker
                  coordinate={{
                    latitude: selectedAddrObj.lat,
                    longitude: selectedAddrObj.lng,
                  }}
                >
                  <View style={styles.markerContainer}>
                    <Ionicons name="home" size={20} color="#FFF" />
                  </View>
                </Marker>
              )}
            </MapView>
            
            {/* Dark Overlay */}
            <View style={styles.mapOverlay} />

            {/* Radar Animation Area */}
            <View style={styles.radarCenter}>
              {[pulseAnim1, pulseAnim2, pulseAnim3].map((anim, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.radarRing,
                    {
                      opacity: anim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.8, 0.3, 0],
                      }),
                      transform: [
                        {
                          scale: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 3],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ))}
              <View style={styles.radarCore}>
                <Ionicons name="water" size={32} color="#FFF" />
              </View>
            </View>

            {/* Bottom Sheet Card */}
            <View style={styles.bottomSheet}>
              <View style={styles.sheetHandle} />
              
              <Text style={styles.sheetTitle}>
                {searchPhrases[searchPhraseIndex]}
              </Text>

              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <Animated.View 
                  style={[
                    styles.progressBarFill, 
                    {
                      transform: [{
                        translateX: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-Dimensions.get('window').width, 0],
                        })
                      }]
                    }
                  ]} 
                />
              </View>

              {/* Urgency Tips */}
              <Text style={styles.urgencyTitle}>Need it urgently? Add a tip</Text>
              <View style={styles.tipRow}>
                {[10, 20, 30].map(amount => (
                  <TouchableOpacity
                    key={amount}
                    style={[
                      styles.tipBox,
                      urgencyTip === amount && styles.tipBoxActive
                    ]}
                    onPress={() => setUrgencyTip(urgencyTip === amount ? 0 : amount)}
                  >
                    <Text style={[
                      styles.tipText,
                      urgencyTip === amount && styles.tipTextActive
                    ]}>
                      +₹{amount}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.actionRow}>
                {showCancelBtn && (
                  <TouchableOpacity
                    style={styles.cancelBtnOutline}
                    onPress={() => {
                      Alert.alert(
                        t('checkout.cancelSearchTitle') || "Cancel Searching",
                        t('checkout.cancelSearchMsg') || "Are you sure you want to cancel the searching?",
                        [
                          { text: t('common.no') || "No", style: "cancel" },
                          { text: t('common.yes') || "Yes", onPress: handleCancelDispatch, style: "destructive" }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="close" size={20} color="#F43F5E" />
                    <Text style={styles.cancelBtnTextOutline}>{t('common.cancel') || "Cancel"}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.adminBtn}
                  onPress={() => Linking.openURL('tel:7488830394')}
                >
                  <Ionicons name="call" size={20} color="#FFF" />
                  <Text style={styles.adminBtnText}>Contact Admin</Text>
                </TouchableOpacity>
              </View>
            </View>
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
            <Text style={styles.failTitle}>No delivery vehicle found nearby</Text>
            <Text style={styles.failSubtitle}>
              {t('checkout.noVehiclesDesc') || "No delivery vehicles with capacity are currently near you. Please try again later."}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={handleRetryDispatch}
            >
              <Text style={styles.retryBtnText}>{t('common.tryAgain') || "Try Again"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: theme.colors.primary, marginTop: 12 }]}
              onPress={() => Linking.openURL('tel:7488830394')}
            >
              <Text style={styles.retryBtnText}>📞 Call AquaKart Administrator</Text>
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
          onPress={() => {
            if (dispatchState === "searching") {
              Alert.alert(
                t('checkout.cancelSearchTitle') || "Cancel Searching",
                t('checkout.cancelSearchMsg') || "Are you sure you want to cancel the searching?",
                [
                  { text: t('common.no') || "No", style: "cancel" },
                  { text: t('common.yes') || "Yes", onPress: handleCancelDispatch, style: "destructive" }
                ]
              );
            } else {
              router.canGoBack() ? router.back() : router.replace("/(customer)/home");
            }
          }}
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
                  {params.image_url && params.image_url !== "fallback" ? (
                    <Image source={{ uri: params.image_url as string }} style={{ width: 40, height: 40 }} resizeMode="contain" />
                  ) : params.product_name && (params.product_name.toString().toLowerCase().includes('1l') || params.product_name.toString().toLowerCase().includes('bottle')) ? (
                    <Image source={require("../../assets/images/bottle_1l.png")} style={{ width: 40, height: 40 }} resizeMode="contain" />
                  ) : params.product_name && params.product_name.toString().toLowerCase().includes('cool') ? (
                    <Image source={require("../../assets/images/cool_jar.jpg")} style={{ width: 40, height: 40 }} resizeMode="contain" />
                  ) : params.product_name ? (
                    <Image source={require("../../assets/images/jar_20l.png")} style={{ width: 40, height: 40 }} resizeMode="contain" />
                  ) : (
                    <Text style={styles.productIcon}>🚰</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.summaryItemName}>
                    {params.product_name ? params.product_name : t('checkout.productName')} x {quantity}
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

  // New Searching UI Styles
  searchingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  markerContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  radarCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  radarRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  bottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  sheetSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressBarFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  urgencyTitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    fontWeight: '600' as any,
  },
  tipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  tipBox: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  tipBoxActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight + '20',
  },
  tipText: {
    fontSize: 15,
    fontWeight: '700' as any,
    color: theme.colors.textPrimary,
  },
  tipTextActive: {
    color: theme.colors.primary,
  },
  cancelBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  cancelBtnTextOutline: {
    color: '#F43F5E',
    fontWeight: '700',
    fontSize: 16,
  },
  adminBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  adminBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
});

const mapDarkStyle = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];
