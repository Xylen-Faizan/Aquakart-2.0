import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SupplierOrderService } from '../../../services/supplier-order';
import { theme } from '../../../constants/theme';
import { Button, Card, Badge } from '../../../components/ui';
import { ErrorState, LoadingState } from '../../../components/feedback';
import { supabase } from '../../../lib/supabase/client';
import { VALID_TRANSITIONS, OrderStatus } from '@aquakart/config';

export default function SupplierOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // For rejection reason
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchOrder();

    const subscription = supabase
      .channel(`public:orders:id=eq.${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (payload) => {
          setOrder((prev: any) => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [id]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await SupplierOrderService.getOrderDetails(id!);
      setOrder(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    try {
      setActionLoading(true);
      await SupplierOrderService.acceptOrder(id!);
      Alert.alert('Success', 'Order accepted successfully.');
      fetchOrder();
    } catch (err: any) {
      Alert.alert('Failed to Accept', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for rejection.');
      return;
    }
    
    try {
      setActionLoading(true);
      await SupplierOrderService.rejectOrder(id!, rejectionReason);
      Alert.alert('Order Rejected', 'The order has been rejected.');
      setShowRejectForm(false);
      fetchOrder();
    } catch (err: any) {
      Alert.alert('Failed to Reject', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    Alert.alert(
      'Confirm Update',
      `Update status to ${newStatus.replace(/_/g, ' ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Update',
          onPress: async () => {
            try {
              setActionLoading(true);
              await SupplierOrderService.updateOrderStatus(id!, newStatus);
              fetchOrder();
            } catch (err: any) {
              Alert.alert('Update Failed', err.message);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'delivered': return 'success';
      case 'rejected':
      case 'cancelled': return 'error';
      case 'placed': return 'info';
      case 'preparing':
      case 'accepted': return 'neutral';
      case 'out_for_delivery': return 'warning';
      default: return 'neutral';
    }
  };

  if (loading) return <LoadingState message="Loading order details..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchOrder} />;
  if (!order) return <ErrorState title="Not Found" message="Order not found." />;

  const availableTransitions = VALID_TRANSITIONS[order.status as OrderStatus] || [];
  
  // Filter out customer-only transitions if needed, though they are valid in config.
  // Supplier shouldn't 'cancel' an order they've accepted typically (they can but for MVP maybe restrict UI)
  // Let's just show the valid forward transitions.

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.orderId}>{order.display_id}</Text>
          <Badge label={order.status.toUpperCase().replace(/_/g, ' ')} variant={getStatusVariant(order.status)} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <Card style={styles.card}>
            <Text style={styles.infoText}><Text style={styles.bold}>Name:</Text> {order.customer?.name}</Text>
            {order.customer?.phone && <Text style={styles.infoText}><Text style={styles.bold}>Phone:</Text> {order.customer.phone}</Text>}
            <Text style={styles.infoText}><Text style={styles.bold}>Address:</Text> {order.address?.label} - {order.address?.address}</Text>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          <Card style={styles.card}>
            {order.order_items?.map((item: any) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.quantity}x Water Jar</Text>
                <Text style={styles.itemPrice}>₹{item.total}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalText}>Total ({order.payment_method})</Text>
              <Text style={styles.totalAmount}>₹{order.total}</Text>
            </View>
          </Card>
        </View>

        {order.rejection_reason && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rejection Reason</Text>
            <Card style={styles.card}>
              <Text style={styles.infoText}>{order.rejection_reason}</Text>
            </Card>
          </View>
        )}

      </ScrollView>
      
      {/* ACTION BUTTONS */}
      <View style={styles.footer}>
        {order.status === 'placed' && !showRejectForm && (
          <View style={styles.actionButtons}>
            <Button 
              title="Reject" 
              variant="danger"
              disabled={actionLoading}
              onPress={() => setShowRejectForm(true)} 
              style={styles.flexBtn}
            />
            <Button 
              title="Accept Order" 
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
              placeholder="Reason for rejection (e.g. Out of stock, too far)"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
            />
            <View style={styles.actionButtons}>
              <Button 
                title="Cancel" 
                variant="outline"
                onPress={() => setShowRejectForm(false)} 
                style={styles.flexBtn}
              />
              <Button 
                title="Confirm Reject" 
                variant="danger"
                disabled={actionLoading}
                onPress={handleReject} 
                style={styles.flexBtn}
              />
            </View>
          </View>
        )}

        {/* Forward Transitions */}
        {order.status !== 'placed' && availableTransitions.filter(t => t !== 'cancelled' && t !== 'rejected').map((status: any) => (
          <Button
            key={status}
            title={`Mark as ${status.replace(/_/g, ' ')}`}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    flexDirection: 'row',
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
    textAlignVertical: 'top',
    backgroundColor: theme.colors.white,
  },
});
