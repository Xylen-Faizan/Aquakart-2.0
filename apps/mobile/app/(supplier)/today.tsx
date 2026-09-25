import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../constants/theme";
import { Card, Badge, Button } from "../../components/ui";
import {
  DashboardService,
  TodayStats,
  TodayManifestItem,
  SupplierForecast,
  SupplierAlert,
} from "../../services/dashboard";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase/client";
import { Alert, TextInput, Modal } from "react-native";

import { useAuth } from "../../features/auth/AuthProvider";
import { useLanguage } from "../../features/i18n/LanguageProvider";

export default function SupplierTodayScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [manifest, setManifest] = useState<TodayManifestItem[]>([]);
  const [forecast, setForecast] = useState<SupplierForecast | null>(null);
  const [alerts, setAlerts] = useState<SupplierAlert[]>([]);
  const [capacity, setCapacity] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [capacityModalVisible, setCapacityModalVisible] = useState(false);
  const [newCapacity, setNewCapacity] = useState("");
  const [isUpdatingCapacity, setIsUpdatingCapacity] = useState(false);

  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);
  const [deliveryModalOrder, setDeliveryModalOrder] = useState<any>(null);
  const [modalJarsDelivered, setModalJarsDelivered] = useState('');
  const [modalJarsReturned, setModalJarsReturned] = useState('0');
  const [modalAmountCollected, setModalAmountCollected] = useState('0');
  const [modalPaymentMethod, setModalPaymentMethod] = useState('cash');

  const fetchDashboardData = async () => {
    try {
      const [statsData, manifestData, forecastData, alertsData] = await Promise.all([
        DashboardService.getTodayStats(),
        DashboardService.getTodayManifest(),
        DashboardService.getForecast(),
        DashboardService.getSupplierAlerts(),
      ]);
      setStats(statsData);
      setManifest(manifestData);
      setForecast(forecastData);
      setAlerts(alertsData);
    } catch (error) {
      console.error("Failed to fetch dashboard main data:", error);
    }

    try {
      // Fetch capacity via DashboardService so it uses the same fallback logic as customer app
      const cap = await DashboardService.getCapacity();
      setCapacity(cap);
    } catch (error) {
      console.error("Failed to fetch capacity:", error);
      setCapacity(0); // Safely fallback if the capacity read fails
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchDashboardData();
    }, []),
  );

  useEffect(() => {
    // Subscribe to realtime orders for instant UI updates
    const channel = supabase
      .channel("orders_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          console.log("Realtime order received!", payload);
          // Refresh the dashboard automatically
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const handleUpdateCapacity = async () => {
    const qty = parseInt(newCapacity, 10);
    if (isNaN(qty) || qty < 0) {
      Alert.alert(t("today.invalid"), t("today.validNumber"));
      return;
    }

    setIsUpdatingCapacity(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Not authenticated");

      const { data: supplierData } = await supabase
        .from("suppliers")
        .select("id")
        .eq("profile_id", userData.user.id)
        .single();

      if (!supplierData) {
        Alert.alert(t("today.error"), t("today.completeProfile"));
        setCapacityModalVisible(false);
        return;
      }

      const d = new Date();
      const utc = d.getTime() + d.getTimezoneOffset() * 60000;
      const nd = new Date(utc + 3600000 * 5.5); // IST is UTC+5.5
      const dateStr = nd.toISOString().split("T")[0];

      const { error: rpcError } = await supabase.rpc("set_supplier_capacity", {
        p_date: dateStr,
        p_max_capacity: qty,
      });

      if (rpcError) throw rpcError;

      setCapacity(qty);
      Alert.alert(
        t("today.success"),
        `${t("today.capacitySet")} ${qty} ${t("today.jars")}.`,
      );
      setCapacityModalVisible(false);
    } catch (err: any) {
      console.error(err);
      Alert.alert(t("today.error"), t("today.failedCapacity"));
    } finally {
      setIsUpdatingCapacity(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!deliveryModalOrder) return;
    try {
      await DashboardService.completeOrder(deliveryModalOrder.order_id, {
        jarsDelivered: parseInt(modalJarsDelivered) || 0,
        jarsReturned: parseInt(modalJarsReturned) || 0,
        amountCollected: parseFloat(modalAmountCollected) || 0,
        paymentMethod: modalPaymentMethod,
      });
      setDeliveryModalVisible(false);
      setDeliveryModalOrder(null);
      onRefresh();
    } catch (err) {
      Alert.alert('Error', 'Failed to complete delivery');
    }
  };

  if (loading && !stats) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  // Format the date header
  const today = new Date();
  const dateString = today.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const currentHour = today.getHours();
  let greeting = t("today.greetingEvening");
  if (currentHour < 12) greeting = t("today.greeting");
  else if (currentHour < 17) greeting = t("today.greetingAfternoon");

  const supplierName = profile?.name || t("today.partner");

  return (
    <SafeAreaView style={styles.safeArea}>
      <View
        style={[
          styles.header,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          },
        ]}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.headerSubtitle}>{t("today.supplierOperations")}</Text>
          <Text style={styles.headerTitle}>{dateString}</Text>
          <Text style={styles.headerGreeting}>
            {greeting}, {supplierName}
          </Text>
        </View>
        <TouchableOpacity
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.5)",
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: "rgba(255,255,255,0.1)",
          }}
          onPress={() => router.push("/(supplier)/routes" as any)}
        >
          <Text style={{ color: "#FFF", fontWeight: "bold", fontSize: 13 }}>
            {t("today.fleetRoutes")}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* FORECAST */}
        {forecast && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("today.tomorrowsForecast")}</Text>
            {forecast.is_at_risk ? (
              <Card
                style={{
                  padding: 16,
                  backgroundColor: theme.colors.error + "10",
                  borderColor: theme.colors.error,
                  borderWidth: 1,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Ionicons
                    name="warning"
                    size={24}
                    color={theme.colors.error}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "bold",
                      color: theme.colors.error,
                    }}
                  >
                    {t("today.shortfallRisk")}
                  </Text>
                </View>
                <Text
                  style={{ color: theme.colors.textPrimary, marginBottom: 8 }}
                >
                  {t("today.warningOnly")} {forecast.current_inventory} {t("today.jarsAvailableExpect")} {forecast.total_forecast} {t("today.demandTomorrow")}.
                </Text>
                <Button
                  title={t("today.requestStock")}
                  variant="primary"
                  size="sm"
                  style={{ alignSelf: "flex-start" }}
                />
              </Card>
            ) : (
              <Card
                style={{
                  padding: 16,
                  backgroundColor: theme.colors.success + "10",
                  borderColor: theme.colors.success,
                  borderWidth: 1,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={theme.colors.success}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "bold",
                      color: theme.colors.success,
                    }}
                  >
                    {t("today.healthyStock")}
                  </Text>
                </View>
                <Text style={{ color: theme.colors.textPrimary }}>
                  {t("today.youHave")} {forecast.current_inventory} {t("today.jarsAvailableExpectedDemand")} {forecast.total_forecast} {t("today.jars")}.
                </Text>
              </Card>
            )}
          </View>
        )}

        {/* ALERTS / NOTIFICATIONS */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("today.operationalAlerts")}</Text>
            {alerts.slice(0, 3).map((alert) => (
              <Card
                key={alert.id}
                style={{
                  padding: 16,
                  marginBottom: 8,
                  backgroundColor: alert.notification_type === 'alert' ? theme.colors.error + "10" : theme.colors.surface,
                  borderColor: alert.notification_type === 'alert' ? theme.colors.error : theme.colors.border,
                  borderWidth: 1,
                  borderLeftWidth: 4,
                  borderLeftColor: alert.notification_type === 'alert' ? theme.colors.error : theme.colors.primary,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "bold", color: theme.colors.textPrimary, marginBottom: 4, flex: 1 }}>
                    {alert.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                    {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                  {alert.body}
                </Text>
              </Card>
            ))}
          </View>
        )}

        {/* TODAY's MARKETPLACE CAPACITY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("today.marketplaceAvailability")}</Text>
          <Card
            style={{
              padding: 16,
              backgroundColor:
                capacity > 0
                  ? theme.colors.success + "10"
                  : theme.colors.error + "10",
              borderColor:
                capacity > 0 ? theme.colors.success : theme.colors.error,
              borderWidth: 1,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color:
                      capacity > 0 ? theme.colors.success : theme.colors.error,
                  }}
                >
                  {capacity > 0
                    ? `${capacity} ${t("today.jarsAvailable")}`
                    : t("today.offlineNoCapacity")}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    marginTop: 4,
                    fontSize: 12,
                  }}
                >
                  {t("today.yourCapacity")}
                </Text>
              </View>
              <Button
                title={t("today.update")}
                variant="primary"
                size="sm"
                onPress={() => {
                  setNewCapacity(capacity.toString());
                  setCapacityModalVisible(true);
                }}
              />
            </View>
          </Card>
        </View>

        {/* TODAY'S METRICS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("today.today")}</Text>
          <View style={styles.statsGrid}>
            <Card
              style={[
                styles.statCard,
                { backgroundColor: theme.colors.primary + "10" },
              ]}
            >
              <Text style={styles.statValue}>{stats?.deliveries_due || 0}</Text>
              <Text style={styles.statLabel}>{t("today.deliveriesDue")}</Text>
            </Card>
            <Card
              style={[
                styles.statCard,
                { backgroundColor: theme.colors.warning + "10" },
              ]}
            >
              <Text style={styles.statValue}>{stats?.jars_required || 0}</Text>
              <Text style={styles.statLabel}>{t("today.jarsRequired")}</Text>
            </Card>
            <Card
              style={[
                styles.statCard,
                { backgroundColor: theme.colors.success + "10" },
              ]}
            >
              <Text style={styles.statValue}>
                ₹{stats?.expected_revenue || 0}
              </Text>
              <Text style={styles.statLabel}>{t("today.expectedRevenue")}</Text>
            </Card>
            <Card
              style={[
                styles.statCard,
                { backgroundColor: theme.colors.error + "10" },
              ]}
            >
              <Text style={styles.statValue}>
                ₹{stats?.outstanding_total || 0}
              </Text>
              <Text style={styles.statLabel}>{t("today.totalOutstanding")}</Text>
            </Card>
          </View>

          <View style={styles.progressRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.progressLabel}>{t("today.deliveriesCompleted")}</Text>
              <Text style={styles.progressValue}>
                {stats?.deliveries_done || 0} /{" "}
                {(stats?.deliveries_due || 0) + (stats?.deliveries_done || 0)}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.progressLabel}>{t("today.cashCollected")}</Text>
              <Text style={styles.progressValue}>
                ₹{stats?.collected_today || 0}
              </Text>
            </View>
          </View>
        </View>

        {/* TODAY'S MANIFEST */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("today.todaysWork")}</Text>

          {manifest.length === 0 ? (
            <Card style={{ padding: 24, alignItems: "center" }}>
              <Ionicons
                name="checkmark-circle-outline"
                size={48}
                color={theme.colors.success}
                style={{ marginBottom: 12 }}
              />
              <Text
                style={{
                  fontSize: 16,
                  color: theme.colors.textPrimary,
                  fontWeight: "600",
                }}
              >
                {t("today.allCaughtUp")}
              </Text>
              <Text
                style={{
                  textAlign: "center",
                  color: theme.colors.textSecondary,
                  marginTop: 4,
                }}
              >
                {t("today.noPendingDeliveries")}
              </Text>
            </Card>
          ) : (
            manifest.map((item, index) => {
              // Determine badge label and color per status
              const getStatusBadge = () => {
                switch (item.status) {
                  case "placed":
                    return { label: t("today.newRequest"), variant: "error" as const };
                  case "accepted":
                    return { label: t("today.accepted"), variant: "warning" as const };
                  case "preparing":
                    return { label: t("today.preparing"), variant: "warning" as const };
                  case "out_for_delivery":
                    return { label: t("today.outForDelivery"), variant: "info" as const };
                  case "scheduled":
                    return { label: t("today.scheduled"), variant: "neutral" as const };
                  default:
                    return { label: t("today.pending"), variant: "warning" as const };
                }
              };

              const statusBadge = getStatusBadge();

              // Determine left border color by status
              const getBorderColor = () => {
                switch (item.status) {
                  case "placed": return theme.colors.error;
                  case "accepted":
                  case "preparing": return theme.colors.warning;
                  case "out_for_delivery": return theme.colors.primary;
                  default: return theme.colors.border;
                }
              };

              const locationText = item.address
                ? item.address
                : item.sector
                  ? item.sector
                  : t("today.noArea");

              return (
              <TouchableOpacity
                key={`${item.order_id || item.customer_id}-${index}`}
                activeOpacity={0.7}
                onPress={() => {
                  if (item.order_id) {
                    router.push(`/(supplier)/order/${item.order_id}` as any);
                  }
                }}
              >
              <Card
                style={[styles.manifestCard, { borderLeftColor: getBorderColor() }]}
              >
                {/* Header: Name + Badge */}
                <View style={styles.manifestHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.customerName}>
                      {item.customer_name}
                    </Text>
                    <Text style={styles.customerLocation} numberOfLines={2}>
                      {locationText}
                    </Text>
                  </View>
                  <Badge
                    label={statusBadge.label}
                    variant={statusBadge.variant}
                  />
                </View>

                {/* Details: Quantity + Price */}
                <View style={styles.manifestDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons
                      name="water-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.detailText}>{item.quantity} × 20L</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons
                      name="pricetag-outline"
                      size={16}
                      color={theme.colors.success}
                    />
                    <Text style={styles.detailText}>
                      @ ₹{item.effective_unit_price} (Total: ₹
                      {item.expected_amount})
                    </Text>
                  </View>
                </View>

                {/* Quick Actions: Call + Directions */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.border,
                  }}
                >
                  {item.phone ? (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: theme.colors.success + "15",
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 8,
                        gap: 6,
                      }}
                      onPress={() => Linking.openURL(`tel:${item.phone}`)}
                    >
                      <Ionicons name="call" size={16} color={theme.colors.success} />
                      <Text style={{ color: theme.colors.success, fontWeight: "600", fontSize: 13 }}>
                        {t("today.callCustomer")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {item.address ? (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: theme.colors.primary + "15",
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 8,
                        gap: 6,
                      }}
                      onPress={() => {
                        const query = encodeURIComponent(item.address || "");
                        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${query}`);
                      }}
                    >
                      <Ionicons name="navigate" size={16} color={theme.colors.primary} />
                      <Text style={{ color: theme.colors.primary, fontWeight: "600", fontSize: 13 }}>
                        {t("today.viewRoute")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Status-based Action Buttons */}
                {item.status === "placed" ? (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      marginTop: 12,
                    }}
                  >
                    <Button
                      title={t("today.reject")}
                      variant="outline"
                      style={{ flex: 1, borderColor: theme.colors.error }}
                      textStyle={{ color: theme.colors.error }}
                      onPress={async () => {
                        try {
                          await DashboardService.rejectOrder(item.order_id);
                          onRefresh();
                        } catch (e) {
                          Alert.alert(t("today.error"), t("today.failedDecline"));
                        }
                      }}
                    />
                    <Button
                      title={t("today.accept")}
                      variant="primary"
                      style={{ flex: 1 }}
                      onPress={async () => {
                        try {
                          await DashboardService.acceptOrder(item.order_id);
                          onRefresh();
                        } catch (e) {
                          Alert.alert(t("today.error"), t("today.failedAccept"));
                        }
                      }}
                    />
                  </View>
                ) : item.status === "out_for_delivery" ? (
                  <View style={{ marginTop: 12 }}>
                    <Button
                      title={t("today.markDelivered")}
                      variant="primary"
                      style={{ width: "100%" }}
                      onPress={() => {
                        setDeliveryModalOrder(item);
                        setModalJarsDelivered(String(item.quantity || 2));
                        setModalJarsReturned('0');
                        setModalAmountCollected('0');
                        setModalPaymentMethod('cash');
                        setDeliveryModalVisible(true);
                      }}
                    />
                  </View>
                ) : (item.status === "accepted" || item.status === "preparing") ? (
                  <View style={{ marginTop: 12 }}>
                    <Button
                      title={t("today.sendArrivalAlert")}
                      variant="outline"
                      style={{ width: "100%", borderColor: theme.colors.primary }}
                      textStyle={{ color: theme.colors.primary }}
                      onPress={async () => {
                        try {
                          await DashboardService.notifyArrival(item.order_id);
                          onRefresh();
                          Alert.alert(
                            t("today.success"),
                            t("today.arrivalAlertSent"),
                          );
                        } catch (e: any) {
                          Alert.alert(
                            t("today.error"),
                            e.message || t("today.failedSendAlert"),
                          );
                        }
                      }}
                    />
                  </View>
                ) : null}
              </Card>
              </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Capacity Modal */}
      <Modal visible={capacityModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: "auto" }]}>
            <Text style={styles.modalTitle}>{t("today.updateDailyCapacity")}</Text>
            <Text
              style={{ color: theme.colors.textSecondary, marginBottom: 16 }}
            >
              {t("today.howManyJars")}
            </Text>

            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: theme.colors.textPrimary,
                marginBottom: 8,
              }}
            >
              {t("today.quantity")}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={newCapacity}
              onChangeText={setNewCapacity}
            />

            <View style={styles.modalActions}>
              <Button
                title={t("today.cancel")}
                variant="outline"
                onPress={() => setCapacityModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={t("today.setCapacity")}
                variant="primary"
                onPress={handleUpdateCapacity}
                loading={isUpdatingCapacity}
                style={{ flex: 1, marginLeft: 12 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deliveryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDeliveryModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: '#1E293B', borderRadius: 16, padding: 24, width: '85%', maxWidth: 400 }}>
            <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Mark Delivery Complete</Text>
            <Text style={{ color: '#94A3B8', fontSize: 14, marginBottom: 16 }}>
              {deliveryModalOrder?.customer_name || 'Customer'}
            </Text>

            <Text style={{ color: '#CBD5E1', fontSize: 13, marginBottom: 4 }}>Jars Delivered</Text>
            <TextInput style={{ backgroundColor: '#334155', color: '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 }}
              keyboardType="numeric" value={modalJarsDelivered} onChangeText={setModalJarsDelivered} />

            <Text style={{ color: '#CBD5E1', fontSize: 13, marginBottom: 4 }}>Jars Returned</Text>
            <TextInput style={{ backgroundColor: '#334155', color: '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 }}
              keyboardType="numeric" value={modalJarsReturned} onChangeText={setModalJarsReturned} />

            <Text style={{ color: '#CBD5E1', fontSize: 13, marginBottom: 4 }}>Amount Collected (₹)</Text>
            <TextInput style={{ backgroundColor: '#334155', color: '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 }}
              keyboardType="numeric" value={modalAmountCollected} onChangeText={setModalAmountCollected} />

            <Text style={{ color: '#CBD5E1', fontSize: 13, marginBottom: 4 }}>Payment Method</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {(['cash', 'upi'] as const).map(m => (
                <TouchableOpacity key={m} onPress={() => setModalPaymentMethod(m)}
                  style={{ flex: 1, padding: 10, borderRadius: 8, alignItems: 'center',
                    backgroundColor: modalPaymentMethod === m ? '#3B82F6' : '#334155' }}>
                  <Text style={{ color: '#F8FAFC', fontWeight: '600', textTransform: 'uppercase' }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setDeliveryModalVisible(false)}
                style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#475569', alignItems: 'center' }}>
                <Text style={{ color: '#F8FAFC', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmDelivery}
                style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center' }}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFF",
    marginTop: 4,
  },
  headerGreeting: {
    fontSize: 16,
    color: "rgba(255,255,255,0.9)",
    marginTop: 6,
    fontWeight: "500",
  },
  container: {
    flex: 1,
  },
  section: {
    padding: theme.spacing.lg,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: theme.colors.textSecondary,
    marginBottom: 16,
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    width: "48%",
    padding: 16,
    marginBottom: 0,
    borderWidth: 0,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  progressLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  progressValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  manifestCard: {
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  manifestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  customerName: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  customerLocation: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  manifestDetails: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: "row",
    marginTop: 24,
    paddingBottom: 24,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
});
