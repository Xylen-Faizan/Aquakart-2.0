import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../../constants/theme";
import { Card } from "../../../components/ui";
import { LedgerService, KhataSummary, KhataEvent } from "../../../services/ledger";
import { useLanguage } from "../../../features/i18n/LanguageProvider";

export default function KhataScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLanguage();

  const [summary, setSummary] = useState<KhataSummary | null>(null);
  const [timeline, setTimeline] = useState<KhataEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // For pilot, we use the current month
  const currentMonth = new Date().toISOString().substring(0, 7); // e.g. '2026-09'

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [sumData, timelineData] = await Promise.all([
        LedgerService.getCustomerKhataSummary(id, currentMonth),
        LedgerService.getCustomerKhataTimeline(id, currentMonth)
      ]);
      setSummary(sumData);
      setTimeline(timelineData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Loading Khata...</Text>
        </View>
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customer Khata</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>This Month</Text>
        
        <View style={styles.summaryGrid}>
          <Card style={styles.summaryCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="water-outline" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.summaryValue}>{summary?.total_jars || 0}</Text>
            <Text style={styles.summaryLabel}>Jars Taken</Text>
          </Card>
          
          <Card style={styles.summaryCard}>
            <View style={[styles.iconCircle, { backgroundColor: theme.colors.warning + '20' }]}>
              <Ionicons name="receipt-outline" size={20} color={theme.colors.warning} />
            </View>
            <Text style={styles.summaryValue}>₹{summary?.total_billed || 0}</Text>
            <Text style={styles.summaryLabel}>Total Bill</Text>
          </Card>
          
          <Card style={styles.summaryCard}>
            <View style={[styles.iconCircle, { backgroundColor: theme.colors.success + '20' }]}>
              <Ionicons name="cash-outline" size={20} color={theme.colors.success} />
            </View>
            <Text style={styles.summaryValue}>₹{summary?.total_paid || 0}</Text>
            <Text style={styles.summaryLabel}>Total Paid</Text>
          </Card>
          
          <Card style={styles.summaryCard}>
            <View style={[styles.iconCircle, { backgroundColor: (summary?.outstanding || 0) > 0 ? theme.colors.error + '20' : theme.colors.success + '20' }]}>
              <Ionicons name="wallet-outline" size={20} color={(summary?.outstanding || 0) > 0 ? theme.colors.error : theme.colors.success} />
            </View>
            <Text style={[styles.summaryValue, { color: (summary?.outstanding || 0) > 0 ? theme.colors.error : theme.colors.success }]}>
              ₹{summary?.outstanding || 0}
            </Text>
            <Text style={styles.summaryLabel}>Outstanding</Text>
          </Card>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Ledger Timeline</Text>
        
        {timeline.length === 0 ? (
          <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 20 }}>
            No transactions this month.
          </Text>
        ) : (
          <View style={styles.timeline}>
            {timeline.map((event, index) => {
              const date = new Date(event.event_timestamp);
              const isDelivery = event.event_type === 'delivery';
              return (
                <View key={index} style={styles.timelineItem}>
                  <View style={styles.timelineIcon}>
                    {isDelivery ? (
                      <View style={[styles.eventCircle, { backgroundColor: theme.colors.primary + '20' }]}>
                        <Ionicons name="cube-outline" size={16} color={theme.colors.primary} />
                      </View>
                    ) : (
                      <View style={[styles.eventCircle, { backgroundColor: theme.colors.success + '20' }]}>
                        <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.success} />
                      </View>
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Card style={styles.eventCard}>
                      <View style={styles.eventHeader}>
                        <Text style={styles.eventTitle}>
                          {isDelivery ? `${event.quantity} Jars Delivered` : 'Payment Received'}
                        </Text>
                        <Text style={[styles.eventAmount, { color: isDelivery ? theme.colors.textPrimary : theme.colors.success }]}>
                          {isDelivery ? `₹${event.amount}` : `+₹${event.amount}`}
                        </Text>
                      </View>
                      <View style={styles.eventFooter}>
                        <Text style={styles.eventTime}>
                          {date.toLocaleDateString()} • {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        {!isDelivery && event.payment_method && (
                          <Text style={styles.paymentMethod}>
                            via {event.payment_method.toUpperCase()}
                          </Text>
                        )}
                      </View>
                    </Card>
                  </View>
                </View>
              );
            })}
          </View>
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
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: theme.colors.textPrimary, marginBottom: 16 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  summaryCard: {
    width: "48%",
    padding: 16,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryValue: { fontSize: 24, fontWeight: "bold", color: theme.colors.textPrimary, marginBottom: 4 },
  summaryLabel: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: "500" },
  timeline: { marginTop: 8 },
  timelineItem: { flexDirection: "row", marginBottom: 16 },
  timelineIcon: { width: 40, alignItems: "center", marginRight: 12 },
  eventCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  timelineContent: { flex: 1 },
  eventCard: { padding: 16, borderWidth: 1, borderColor: theme.colors.border },
  eventHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, alignItems: "center" },
  eventTitle: { fontSize: 16, fontWeight: "600", color: theme.colors.textPrimary },
  eventAmount: { fontSize: 16, fontWeight: "bold" },
  eventFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eventTime: { fontSize: 13, color: theme.colors.textTertiary },
  paymentMethod: { fontSize: 12, fontWeight: "500", color: theme.colors.success, backgroundColor: theme.colors.success + '10', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }
});
