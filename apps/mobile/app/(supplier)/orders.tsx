import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SupplierOrderService } from '../../services/supplier-order';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';
import { EmptyState, ErrorState, LoadingState } from '../../components/feedback';
import { supabase } from '../../lib/supabase/client';
import type { OrderStatus } from '@aquakart/types';

type TabType = 'pending' | 'active' | 'completed';

export default function SupplierOrdersScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const router = useRouter();

  useEffect(() => {
    fetchOrders();

    const subscription = supabase
      .channel('public:orders:supplier')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await SupplierOrderService.getAssignedOrders();
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'delivered': return 'success';
      case 'rejected':
      case 'cancelled': return 'error';
      case 'placed': return 'info'; // Pending
      case 'preparing':
      case 'accepted': return 'neutral';
      case 'out_for_delivery': return 'warning';
      default: return 'neutral';
    }
  };

  const isPendingOrder = (status: OrderStatus) => status === 'placed';
  const isActiveOrder = (status: OrderStatus) => ['accepted', 'preparing', 'out_for_delivery'].includes(status);
  const isCompletedOrder = (status: OrderStatus) => ['delivered', 'cancelled', 'rejected'].includes(status);

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'pending') return isPendingOrder(order.status);
    if (activeTab === 'active') return isActiveOrder(order.status);
    if (activeTab === 'completed') return isCompletedOrder(order.status);
    return true;
  });

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      // In a real app we'd call the API:
      // await SupplierOrderService.updateOrderStatus(orderId, newStatus);
      // For now we just update locally
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err: any) {
      Alert.alert('Update Failed', err.message);
    }
  };

  if (loading && orders.length === 0) return <LoadingState message="Loading orders..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchOrders} />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Orders</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>Completed</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const totalItems = item.order_items?.reduce((sum: number, oi: any) => sum + oi.quantity, 0) || 1;
          
          return (
            <TouchableOpacity onPress={() => router.push(`/(supplier)/order/${item.id}`)} activeOpacity={0.9}>
              <Card style={styles.card}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.orderIdContainer}>
                    <Text style={styles.orderId}>#{item.display_id}</Text>
                    <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
                  </View>
                  <Badge label={item.status.toUpperCase().replace(/_/g, ' ')} variant={getStatusVariant(item.status)} />
                </View>

                {/* Customer Details */}
                <View style={styles.customerSection}>
                  <Text style={styles.customerName}>{item.address?.label || 'Customer'}</Text>
                  <View style={styles.addressRow}>
                    <Ionicons name="location" size={16} color={theme.colors.primary} />
                    <Text style={styles.addressText} numberOfLines={1}>
                      {item.address?.address}
                    </Text>
                  </View>
                </View>

                {/* Order Meta */}
                <View style={styles.orderMetaRow}>
                  <Text style={styles.metaText}>{totalItems}x 20L Water Can</Text>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.metaTextPrice}>₹{item.total_amount || item.total}</Text>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.metaText}>{item.payment_method?.toUpperCase() || 'CASH'}</Text>
                </View>

                {/* Actions */}
                {activeTab === 'pending' && (
                  <View style={styles.actionsRow}>
                    <Button 
                      title="Reject" 
                      variant="outline" 
                      style={styles.actionButton}
                      onPress={() => handleUpdateStatus(item.id, 'rejected')}
                    />
                    <View style={{ width: theme.spacing.md }} />
                    <Button 
                      title="Accept" 
                      style={styles.actionButton}
                      onPress={() => handleUpdateStatus(item.id, 'accepted')}
                    />
                  </View>
                )}

                {activeTab === 'active' && item.status === 'accepted' && (
                  <View style={styles.actionsRow}>
                    <Button 
                      title="Mark Out for Delivery" 
                      style={styles.fullWidthButton}
                      onPress={() => handleUpdateStatus(item.id, 'out_for_delivery')}
                    />
                  </View>
                )}
                
                {activeTab === 'active' && item.status === 'out_for_delivery' && (
                  <View style={styles.actionsRow}>
                    <Button 
                      title="Mark Delivered" 
                      style={styles.fullWidthButton}
                      onPress={() => handleUpdateStatus(item.id, 'delivered')}
                    />
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState 
            title={`No ${activeTab} orders`} 
            message="You don't have any orders in this category right now."
            actionLabel="Refresh"
            onAction={fetchOrders}
          />
        }
      />
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
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.bold as any,
  },
  list: { 
    padding: theme.spacing.lg 
  },
  card: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  orderIdContainer: {
    flexDirection: 'column',
  },
  orderId: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  timeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  customerSection: {
    marginBottom: theme.spacing.md,
  },
  customerName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  orderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.md,
  },
  metaText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
  },
  metaTextPrice: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.bold as any,
  },
  metaDivider: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.border,
    marginHorizontal: theme.spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  fullWidthButton: {
    width: '100%',
  }
});
