import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OrderService } from '../../../services/order';
import { theme } from '../../../constants/theme';
import { Button, Card, Badge } from '../../../components/ui';
import { ErrorState, LoadingState } from '../../../components/feedback';
import { supabase } from '../../../lib/supabase/client';
import type { OrderStatus } from '@aquakart/types';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrder();

    // Set up realtime subscription for this order
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
      const data = await OrderService.getOrderDetails(id!);
      setOrder(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'delivered': return 'success';
      case 'rejected':
      case 'cancelled': return 'error';
      case 'placed': return 'neutral';
      case 'preparing':
      case 'accepted': return 'info';
      case 'out_for_delivery': return 'warning';
      default: return 'neutral';
    }
  };

  const stages: { status: OrderStatus, label: string }[] = [
    { status: 'placed', label: 'Order Placed' },
    { status: 'accepted', label: 'Order Accepted' },
    { status: 'preparing', label: 'Preparing Order' },
    { status: 'out_for_delivery', label: 'Out for Delivery' },
    { status: 'delivered', label: 'Delivered' }
  ];

  const getStageIndex = (status: OrderStatus) => {
    if (status === 'rejected' || status === 'cancelled') return -1;
    const index = stages.findIndex(s => s.status === status);
    return index >= 0 ? index : 0;
  };

  const handleCancelOrder = async () => {
    // In a real app, we'd call an API to cancel
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: () => {
         // Dummy update for UI
         setOrder((prev: any) => ({ ...prev, status: 'cancelled' }));
      } },
    ]);
  };

  const handleCall = () => {
    if (order?.supplier?.phone) {
      Linking.openURL(`tel:${order.supplier.phone}`);
    } else {
      Alert.alert('Unavailable', 'No phone number provided for this supplier.');
    }
  };

  if (loading) return <LoadingState message="Loading order details..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchOrder} />;
  if (!order) return <ErrorState title="Not Found" message="Order not found." />;

  const currentStageIndex = getStageIndex(order.status);
  const isFailed = order.status === 'rejected' || order.status === 'cancelled';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Order #{order.display_id}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        
        {/* Status Highlight */}
        <View style={styles.statusHeader}>
           <Badge label={order.status.toUpperCase().replace(/_/g, ' ')} variant={getStatusVariant(order.status)} />
           <Text style={styles.estimatedTime}>
              {order.status === 'delivered' ? 'Completed' : isFailed ? 'Order Terminated' : 'Arriving in 20-30 mins'}
           </Text>
        </View>

        {order.rejection_reason && (
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionTitle}>Order Rejected</Text>
            <Text style={styles.rejectionText}>{order.rejection_reason}</Text>
          </View>
        )}

        {/* Status Tracker */}
        {!isFailed && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Status</Text>
            <Card style={styles.trackerCard}>
              {stages.map((stage, index) => {
                const isActive = index <= currentStageIndex;
                const isLast = index === stages.length - 1;
                return (
                  <View key={stage.status} style={styles.timelineRow}>
                    <View style={styles.timelineNodeContainer}>
                      <View style={[styles.timelineNode, isActive && styles.timelineNodeActive]} />
                      {!isLast && (
                        <View style={[styles.timelineLine, isActive && currentStageIndex > index && styles.timelineLineActive]} />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[styles.timelineLabel, isActive && styles.timelineLabelActive]}>
                        {stage.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        {/* Supplier Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Supplier Details</Text>
          <Card style={styles.supplierCard}>
            <View style={styles.supplierInfoContainer}>
              <View style={styles.supplierIconWrapper}>
                 <Ionicons name="storefront" size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.supplierDetails}>
                <Text style={styles.businessName}>{order.supplier?.business_name}</Text>
                <Text style={styles.supplierPhone}>{order.supplier?.phone || 'No phone provided'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.callButton} onPress={handleCall}>
              <Ionicons name="call" size={20} color={theme.colors.white} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* Delivery Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Card style={styles.card}>
            <View style={styles.addressContainer}>
               <Ionicons name="location" size={20} color={theme.colors.primary} style={{ marginTop: 2, marginRight: 8 }} />
               <View>
                 <Text style={styles.label}>{order.address?.label}</Text>
                 <Text style={styles.infoText}>{order.address?.address}</Text>
               </View>
            </View>
          </Card>
        </View>

        {/* Order Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          <Card style={styles.card}>
            {order.order_items?.map((item: any) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemLeft}>
                  <Text style={styles.itemQuantity}>{item.quantity}x</Text>
                  <Text style={styles.itemName}>20L RO Water Can</Text>
                </View>
                <Text style={styles.itemPrice}>₹{item.total_price || item.total}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalText}>Total ({order.payment_method})</Text>
              <Text style={styles.totalAmount}>₹{order.total_amount || order.total}</Text>
            </View>
          </Card>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
      
      {/* Footer */}
      <View style={styles.footerBar}>
        {order.status === 'placed' || order.status === 'accepted' ? (
          <Button 
            title="Cancel Order" 
            variant="outline"
            onPress={handleCancelOrder}
            style={styles.actionButton}
          />
        ) : (
          <Button 
            title="Reorder" 
            onPress={() => router.push(`/(customer)/supplier/${order.supplier_id}`)}
            style={styles.actionButton}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: theme.colors.background 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    paddingTop: Platform.OS === 'ios' ? theme.spacing.xl : theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  container: { 
    flex: 1 
  },
  statusHeader: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  estimatedTime: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textSecondary,
  },
  rejectionBox: {
    margin: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)', // Light red
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  rejectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.error,
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  section: { 
    padding: theme.spacing.lg, 
    paddingBottom: 0 
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  trackerCard: {
    padding: theme.spacing.lg,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineNodeContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  timelineNode: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
    zIndex: 2,
  },
  timelineNodeActive: {
    backgroundColor: theme.colors.primary,
    borderWidth: 4,
    borderColor: theme.colors.primaryLight,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.border,
    marginVertical: -4,
  },
  timelineLineActive: {
    backgroundColor: theme.colors.primary,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 32,
    paddingTop: -4,
  },
  timelineLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
  },
  timelineLabelActive: {
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.bold as any,
  },
  supplierCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  supplierInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  supplierIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  supplierDetails: {
    flex: 1,
  },
  businessName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  supplierPhone: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: { 
    padding: theme.spacing.md 
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    paddingRight: theme.spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemQuantity: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
    marginRight: 8,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium as any,
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
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  totalText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textSecondary,
  },
  totalAmount: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  },
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  actionButton: {
    width: '100%',
  },
});
