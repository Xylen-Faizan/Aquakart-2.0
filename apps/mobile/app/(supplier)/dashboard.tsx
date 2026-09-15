import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../features/auth/AuthProvider';
import { Button, Card, Badge } from '../../components/ui';
import { LoadingState, ErrorState, EmptyState } from '../../components/feedback';
import { theme } from '../../constants/theme';
import { SupplierCapacityService } from '../../services/supplier-capacity';
import { SupplierOrderService } from '../../services/supplier-order';
import { SupplierService } from '../../services/supplier';
import { useSupplierOrderRealtime } from '../../hooks/useSupplierOrderRealtime';

export default function DashboardScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  
  const [capacity, setCapacity] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supplierProfile, setSupplierProfile] = useState<any>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supplier = await SupplierService.getCurrentSupplier();
      setSupplierProfile(supplier);

      const cap = await SupplierCapacityService.getTodayCapacity();
      setCapacity(cap);

      const allOrders = await SupplierOrderService.getAssignedOrders();
      if (allOrders) {
        const activeCount = allOrders.filter((o: any) => 
          ['placed', 'accepted', 'preparing', 'out_for_delivery'].includes(o.status)
        ).length;
        setActiveOrdersCount(activeCount);
        
        // Show up to 3 recent pending orders
        const recent = allOrders
          .filter((o: any) => o.status === 'placed')
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 3);
          
        setOrders(recent);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  useSupplierOrderRealtime(supplierProfile?.id, fetchDashboardData);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'placed': return 'warning';
      case 'accepted': return 'info';
      default: return 'neutral';
    }
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return 'Unknown time';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid time';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (loading) return <LoadingState message="Loading dashboard..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchDashboardData} />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {profile?.name}</Text>
            <Text style={styles.title}>{supplierProfile?.business_name || profile?.business_name || 'Aqua Pure Solutions'}</Text>
          </View>
          <TouchableOpacity 
            style={styles.profileButton}
            onPress={() => router.push('/(supplier)/profile')}
          >
            <Ionicons name="person-circle-outline" size={32} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Overview Cards */}
        <View style={styles.overviewSection}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.cardsRow}>
            
            {/* Capacity Card */}
            <TouchableOpacity 
              style={[styles.overviewCard, { marginRight: theme.spacing.md }]} 
              activeOpacity={0.8}
              onPress={() => router.push('/(supplier)/capacity')}
            >
              <View style={styles.cardHeader}>
                <View style={styles.iconContainer}>
                  <Ionicons name="water" size={20} color={theme.colors.primary} />
                </View>
                <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} />
              </View>
              <Text style={styles.cardValue}>{capacity?.available_quantity || 0}</Text>
              <Text style={styles.cardLabel}>Today's Capacity</Text>
            </TouchableOpacity>

            {/* Orders Card */}
            <TouchableOpacity 
              style={styles.overviewCard} 
              activeOpacity={0.8}
              onPress={() => router.push('/(supplier)/orders')}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                  <Ionicons name="receipt" size={20} color={theme.colors.warning} />
                </View>
              </View>
              <Text style={styles.cardValue}>{activeOrdersCount}</Text>
              <Text style={styles.cardLabel}>Active Orders</Text>
            </TouchableOpacity>

          </View>
        </View>

        {/* Recent Orders Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Orders</Text>
            <TouchableOpacity onPress={() => router.push('/(supplier)/orders')}>
              <Text style={styles.seeAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {orders.length === 0 ? (
            <EmptyState 
              title="No recent orders" 
              message="You don't have any new incoming orders right now."
            />
          ) : (
            <View style={styles.recentOrdersList}>
              {orders.map((order) => (
                <Card key={order.id || Math.random().toString()} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderId}>#{order.display_id || 'UNKNOWN'}</Text>
                    <Badge label={(order.status || 'placed').toUpperCase()} variant={getStatusVariant(order.status || 'placed')} />
                  </View>
                  
                  <View style={styles.orderBody}>
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName}>{order.address?.label || 'Customer'}</Text>
                      <Text style={styles.customerAddress} numberOfLines={1}>{order.address?.address}</Text>
                    </View>
                    <View style={styles.orderMeta}>
                      <Text style={styles.orderTime}>{formatTime(order.created_at)}</Text>
                      <View style={styles.quantityBadge}>
                        <Text style={styles.quantityText}>{order.order_items?.[0]?.quantity || 1}x Cans</Text>
                      </View>
                    </View>
                  </View>
                  
                  <Button 
                    title="View Details" 
                    variant="outline" 
                    size="sm"
                    onPress={() => router.push(`/(supplier)/order/${order.id}`)} 
                  />
                </Card>
              ))}
            </View>
          )}
        </View>
        
        <View style={{ height: 40 }} />
        <Button title="Sign Out" variant="outline" onPress={signOut} style={styles.signOutButton} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: theme.colors.background 
  },
  container: { 
    flex: 1, 
    padding: theme.spacing.lg 
  },
  header: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    paddingTop: Platform.OS === 'ios' ? theme.spacing.xl : theme.spacing.md,
  },
  greeting: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  title: { 
    fontSize: theme.fontSize.xl, 
    fontWeight: theme.fontWeight.bold as any, 
    color: theme.colors.textPrimary 
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  section: { 
    marginBottom: theme.spacing.xl 
  },
  overviewSection: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: { 
    fontSize: theme.fontSize.lg, 
    fontWeight: theme.fontWeight.bold as any, 
    color: theme.colors.textPrimary, 
    marginBottom: theme.spacing.md 
  },
  seeAllText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  },
  cardsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between'
  },
  overviewCard: { 
    flex: 1, 
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardValue: {
    fontSize: 28,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
  },
  recentOrdersList: {
    gap: theme.spacing.md,
  },
  orderCard: {
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  orderId: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  orderBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  customerInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  customerName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  customerAddress: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  orderMeta: {
    alignItems: 'flex-end',
  },
  orderTime: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  quantityBadge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  quantityText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  },
  signOutButton: {
    borderColor: theme.colors.error,
  },
});
