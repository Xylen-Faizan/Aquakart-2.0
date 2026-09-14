import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { OrderService } from '../../services/order';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';
import { EmptyState, ErrorState, LoadingState } from '../../components/feedback';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');
  const router = useRouter();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await OrderService.getMyOrders();
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
      case 'placed': return 'neutral';
      case 'preparing':
      case 'accepted': return 'info';
      case 'out_for_delivery': return 'warning';
      default: return 'neutral';
    }
  };

  const isPastOrder = (status: string) => {
    return ['delivered', 'cancelled', 'rejected'].includes(status);
  };

  const filteredOrders = orders.filter(order => 
    activeTab === 'active' ? !isPastOrder(order.status) : isPastOrder(order.status)
  );

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' • ' + 
           date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (loading) return <LoadingState message="Loading orders..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchOrders} />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>My Orders</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'past' && styles.activeTab]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.activeTabText]}>Past</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const totalItems = item.order_items?.reduce((sum: number, oi: any) => sum + oi.quantity, 0) || 1;
          const isPast = isPastOrder(item.status);
          
          return (
            <TouchableOpacity onPress={() => router.push(`/(customer)/order/${item.id}`)} activeOpacity={0.9}>
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.orderIdContainer}>
                    <Ionicons name="receipt-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.orderId}>Order #{item.display_id}</Text>
                  </View>
                  <Badge label={item.status.toUpperCase().replace(/_/g, ' ')} variant={getStatusVariant(item.status)} />
                </View>
                
                <Text style={styles.date}>{formatDateTime(item.created_at)}</Text>
                
                <View style={styles.divider} />
                
                <View style={styles.cardBody}>
                  <View style={styles.supplierContainer}>
                    <View style={styles.supplierIconWrapper}>
                      <Ionicons name="water" size={16} color={theme.colors.primary} />
                    </View>
                    <Text style={styles.supplierName}>{item.supplier?.business_name}</Text>
                  </View>
                  
                  <View style={styles.totalContainer}>
                    <Text style={styles.itemsCount}>{totalItems} {totalItems === 1 ? 'Item' : 'Items'} • </Text>
                    <Text style={styles.total}>₹{item.total_amount || item.total}</Text>
                  </View>
                </View>
                
                <View style={styles.actionContainer}>
                  <Button 
                    title={isPast ? "Reorder" : "Track Order"}
                    variant={isPast ? "outline" : "primary"}
                    size="sm"
                    style={styles.actionButton}
                    onPress={() => {
                      if (isPast) {
                        router.push(`/(customer)/supplier/${item.supplier_id}`);
                      } else {
                        router.push(`/(customer)/order/${item.id}`);
                      }
                    }}
                  />
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState 
            title={activeTab === 'active' ? "No active orders" : "No past orders"} 
            message={activeTab === 'active' 
              ? "You don't have any ongoing deliveries right now." 
              : "You haven't completed any orders yet."}
            actionLabel="Find Suppliers"
            onAction={() => router.push('/(customer)/suppliers')}
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
    fontSize: theme.fontSize.md,
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
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  orderIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderId: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginLeft: 6,
  },
  date: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  cardBody: {
    marginBottom: theme.spacing.md,
  },
  supplierContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  supplierIconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  supplierName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  totalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 32, // align with supplier name
  },
  itemsCount: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  total: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    minWidth: 120,
  },
});
