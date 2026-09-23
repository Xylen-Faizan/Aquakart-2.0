import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SupplierOrderService } from "../../../services/supplier-order";
import { theme } from "../../../constants/theme";
import { Button, Card, Badge } from "../../../components/ui";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { supabase } from "../../../lib/supabase/client";
import { VALID_TRANSITIONS, OrderStatus } from "@aquakart/config";
import { useSupplierOrderRealtime } from "../../../hooks/useSupplierOrderRealtime";
import { useAndroidBack } from "../../../hooks/useAndroidBack";
import { useLanguage } from "../../../features/i18n/LanguageProvider";

export default function SupplierOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useAndroidBack();
  const { t } = useLanguage();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For rejection reason
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchOrder = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await SupplierOrderService.getOrderDetails(id!);
      setOrder(data);
    } catch (err: any) {
      setError(err.message || t('order.failed_load_details'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useSupplierOrderRealtime(order?.supplier_id, fetchOrder);

  const handleAccept = async () => {
    try {
      setActionLoading(true);
      await SupplierOrderService.acceptOrder(id!);
      Alert.alert(t('success'), t('order.accepted_success'));
      fetchOrder();
    } catch (err: any) {
      Alert.alert(t('order.failed_accept'), err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert(t('order.reason_required'), t('order.provide_reason'));
      return;
    }

    try {
      setActionLoading(true);
      await SupplierOrderService.rejectOrder(id!, rejectionReason);
      Alert.alert(t('order.rejected_title'), t('order.rejected_success'));
      setShowRejectForm(false);
      fetchOrder();
    } catch (err: any) {
      Alert.alert(t('order.failed_reject'), err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    Alert.alert(
      t('order.confirm_update'),
      `Update status to ${newStatus.replace(/_/g, " ")}?`,
      [
        { text: t('cancel'), style: "cancel" },
        {
          text: t('update'),
          onPress: async () => {
            try {
              setActionLoading(true);
              await SupplierOrderService.updateOrderStatus(id!, newStatus);
              fetchOrder();
            } catch (err: any) {
              Alert.alert(t('order.update_failed'), err.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "delivered":
        return "success";
      case "rejected":
      case "cancelled":
        return "error";
      case "placed":
        return "info";
      case "preparing":
      case "accepted":
        return "neutral";
      case "out_for_delivery":
        return "warning";
      default:
        return "neutral";
    }
  };

  if (loading) return <LoadingState message={t('order.loading')} />;
  if (error)
    return <ErrorState title={t('error')} message={error} onRetry={fetchOrder} />;
  if (!order)
    return <ErrorState title={t('not_found')} message={t('order.not_found')} />;

  const availableTransitions =
    VALID_TRANSITIONS[order.status as OrderStatus] || [];

  // Filter out customer-only transitions if needed, though they are valid in config.
  // Supplier shouldn't 'cancel' an order they've accepted typically (they can but for MVP maybe restrict UI)
  // Let's just show the valid forward transitions.

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.orderId}>{order.display_id}</Text>
          <Badge
            label={order.status.toUpperCase().replace(/_/g, " ")}
            variant={getStatusVariant(order.status)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('order.customer')}</Text>
          <Card style={styles.card}>
            <Text style={styles.infoText}>
              <Text style={styles.bold}>{t('order.name_label')}</Text> {order.customer?.name}
            </Text>
            {order.customer?.phone && (
              <Text style={styles.infoText}>
                <Text style={styles.bold}>{t('order.phone_label')}</Text> {order.customer.phone}
              </Text>
            )}
            <Text style={styles.infoText}>
              <Text style={styles.bold}>{t('order.address_label')}</Text> {order.address?.label} -{" "}
              {order.address?.address}
            </Text>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('order.order_items')}</Text>
          <Card style={styles.card}>
            {order.order_items?.map((item: any) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.quantity}x {t('order.water_jar')}</Text>
                <Text style={styles.itemPrice}>₹{item.total}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalText}>
                {t('order.total')} ({order.payment_method})
              </Text>
              <Text style={styles.totalAmount}>₹{order.total}</Text>
            </View>
          </Card>
        </View>

        {order.rejection_reason && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('order.rejection_reason_title')}</Text>
            <Card style={styles.card}>
              <Text style={styles.infoText}>{order.rejection_reason}</Text>
            </Card>
          </View>
        )}
      </ScrollView>

      {/* ACTION BUTTONS */}
      <View style={styles.footer}>
        {order.status === "placed" && !showRejectForm && (
          <View style={styles.actionButtons}>
            <Button
              title={t('order.reject_btn')}
              variant="danger"
              disabled={actionLoading}
              onPress={() => setShowRejectForm(true)}
              style={styles.flexBtn}
            />
            <Button
              title={t('order.accept_btn')}
              variant="primary"
              disabled={actionLoading}
              onPress={handleAccept}
              style={styles.flexBtn}
            />
          </View>
        )}

        {showRejectForm && (
          <View style={styles.rejectForm}>
            <TextInput
              style={styles.input}
              placeholder={t('order.reject_placeholder')}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
            />
            <View style={styles.actionButtons}>
              <Button
                title={t('cancel')}
                variant="outline"
                onPress={() => setShowRejectForm(false)}
                style={styles.flexBtn}
              />
              <Button
                title={t('order.confirm_reject')}
                variant="danger"
                disabled={actionLoading}
                onPress={handleReject}
                style={styles.flexBtn}
              />
            </View>
          </View>
        )}

        {/* Forward Transitions */}
        {order.status !== "placed" &&
          availableTransitions
            .filter((t) => t !== "cancelled" && t !== "rejected")
            .map((status: any) => (
              <Button
                key={status}
                title={`Mark as ${status.replace(/_/g, " ")}`}
                variant="primary"
                disabled={actionLoading}
                style={styles.statusBtn}
                onPress={() => handleUpdateStatus(status)}
              />
            ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  header: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderId: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  section: { padding: theme.spacing.lg, paddingBottom: 0 },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  card: { padding: theme.spacing.md },
  infoText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    marginBottom: 4,
    lineHeight: 22,
  },
  bold: { fontWeight: theme.fontWeight.bold as any },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  itemName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  itemPrice: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.sm,
  },
  totalText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  totalAmount: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  },
  footer: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionButtons: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  flexBtn: { flex: 1 },
  statusBtn: { marginBottom: theme.spacing.sm },
  rejectForm: {
    gap: theme.spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.md,
    minHeight: 80,
    textAlignVertical: "top",
    backgroundColor: theme.colors.white,
  },
});
