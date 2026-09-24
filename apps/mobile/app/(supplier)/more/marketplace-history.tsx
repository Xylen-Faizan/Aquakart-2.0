import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../../constants/theme";
import { Card, Badge } from "../../../components/ui";
import { SupplierOrderService } from "../../../services/supplier-order";
import { useLanguage } from "../../../features/i18n/LanguageProvider";

export default function MarketplaceHistoryScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await SupplierOrderService.getOpportunisticOrderHistory('supplier');
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'success';
      case 'cancelled': return 'error';
      default: return 'neutral';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Marketplace History</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
        ) : orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={48} color={theme.colors.textTertiary} />
            <Text style={styles.emptyStateText}>No marketplace history found.</Text>
          </View>
        ) : (
          orders.map((order) => {
            const date = new Date(order.created_at);
            return (
              <Card key={order.order_id} style={styles.orderCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.orderId}>#{order.display_id}</Text>
                  <Badge variant={getStatusColor(order.status) as any} label={order.status.toUpperCase()} />
                </View>
                
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{order.customer_name}</Text>
                  <Text style={styles.customerAddress}>{order.address || order.customer_phone}</Text>
                </View>

                <View style={styles.orderStats}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{order.quantity}</Text>
                    <Text style={styles.statLabel}>Jars</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: theme.colors.success }]}>₹{order.total_amount}</Text>
                    <Text style={styles.statLabel}>Amount</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    <Text style={styles.statLabel}>{date.toLocaleDateString()}</Text>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: theme.colors.textPrimary },
  container: { flex: 1 },
  content: { padding: 20 },
  emptyState: { alignItems: "center", marginTop: 60 },
  emptyStateText: { marginTop: 16, fontSize: 16, color: theme.colors.textSecondary },
  orderCard: { padding: 16, marginBottom: 16, backgroundColor: theme.colors.surface },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  orderId: { fontSize: 14, fontWeight: "bold", color: theme.colors.textSecondary },
  customerInfo: { marginBottom: 16 },
  customerName: { fontSize: 18, fontWeight: "bold", color: theme.colors.textPrimary, marginBottom: 4 },
  customerAddress: { fontSize: 14, color: theme.colors.textSecondary },
  orderStats: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: theme.colors.background, paddingTop: 12 },
  statBox: { alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "bold", color: theme.colors.textPrimary, marginBottom: 2 },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary }
});
