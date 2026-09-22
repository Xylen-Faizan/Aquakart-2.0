import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScheduleService } from "../../services/schedule";
import { theme } from "../../constants/theme";
import { Card, Badge, Button } from "../../components/ui";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/feedback";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";

export default function ReorderScreen() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchSchedules();
    }, []),
  );

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ScheduleService.getMySchedules();
      setSchedules(data);
    } catch (err: any) {
      setError(err.message || "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  };

  const toggleSchedule = async (id: string, currentStatus: boolean) => {
    try {
      await ScheduleService.updateScheduleStatus(id, !currentStatus);
      // Optimistic update
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, is_active: !currentStatus } : s,
        ),
      );
    } catch (err: any) {
      Alert.alert("Error", "Failed to update schedule status");
      fetchSchedules();
    }
  };

  if (loading && schedules.length === 0)
    return <LoadingState message="Loading your schedules..." />;
  if (error)
    return (
      <ErrorState title="Error" message={error} onRetry={fetchSchedules} />
    );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Repeat Deliveries</Text>
      </View>

      <FlatList
        data={schedules}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const supplierName =
            item.supplier_customer?.supplier?.business_name || "Water Supplier";
          const productName =
            item.product?.products?.name || "20L RO Water Can";

          return (
            <Card
              elevated
              style={[styles.card, !item.is_active && styles.cardInactive]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.supplierInfo}>
                  <View style={styles.iconContainer}>
                    <Ionicons
                      name="repeat"
                      size={20}
                      color={
                        item.is_active
                          ? theme.colors.primary
                          : theme.colors.textTertiary
                      }
                    />
                  </View>
                  <View>
                    <Text style={styles.supplierName}>{supplierName}</Text>
                    <Text style={styles.productName}>
                      {productName} x {item.quantity}
                    </Text>
                  </View>
                </View>
                <Badge
                  label={item.is_active ? "Active" : "Paused"}
                  variant={item.is_active ? "success" : "neutral"}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.scheduleDetailsRow}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Frequency</Text>
                  <Text style={styles.detailValue}>
                    {item.interval_days === 1
                      ? "Daily"
                      : `Every ${item.interval_days} days`}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Next Delivery</Text>
                  <Text style={styles.detailValue}>
                    {item.next_delivery_date
                      ? new Date(item.next_delivery_date).toLocaleDateString(
                          "en-GB",
                          { day: "2-digit", month: "short", year: "numeric" },
                        )
                      : "Pending"}
                  </Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <Button
                  title={item.is_active ? "Pause Schedule" : "Resume Schedule"}
                  variant={item.is_active ? "outline" : "primary"}
                  size="sm"
                  onPress={() => toggleSchedule(item.id, item.is_active)}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No Active Schedules"
            message="You don't have any recurring deliveries set up yet. Order water and choose 'Subscribe' to save time."
            actionLabel="Order Water"
            onAction={() => router.push("/(customer)/home")}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: theme.spacing.lg,
    paddingTop: Platform.OS === "ios" ? theme.spacing.xl : theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  list: {
    padding: theme.spacing.lg,
  },
  card: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  cardInactive: {
    opacity: 0.8,
    borderLeftColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.md,
  },
  supplierInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  supplierName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  productName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  scheduleDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing.lg,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  actionsRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
});
