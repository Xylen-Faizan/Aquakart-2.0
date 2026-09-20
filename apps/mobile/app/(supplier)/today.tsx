import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';
import { DashboardService, TodayStats, TodayManifestItem, SupplierForecast } from '../../services/dashboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase/client';
import { Alert, TextInput, Modal } from 'react-native';

import { useAuth } from '../../features/auth/AuthProvider';

export default function SupplierTodayScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [manifest, setManifest] = useState<TodayManifestItem[]>([]);
  const [forecast, setForecast] = useState<SupplierForecast | null>(null);
  const [capacity, setCapacity] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [capacityModalVisible, setCapacityModalVisible] = useState(false);
  const [newCapacity, setNewCapacity] = useState('');
  const [isUpdatingCapacity, setIsUpdatingCapacity] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [statsData, manifestData, forecastData] = await Promise.all([
        DashboardService.getTodayStats(),
        DashboardService.getTodayManifest(),
        DashboardService.getForecast()
      ]);
      setStats(statsData);
      setManifest(manifestData);
      setForecast(forecastData);
    } catch (error) {
      console.error('Failed to fetch dashboard main data:', error);
    }

    try {
      // Fetch capacity via DashboardService so it uses the same fallback logic as customer app
      const cap = await DashboardService.getCapacity();
      setCapacity(cap);
    } catch (error) {
      console.error('Failed to fetch capacity:', error);
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
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const handleUpdateCapacity = async () => {
    const qty = parseInt(newCapacity, 10);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Invalid', 'Please enter a valid number.');
      return;
    }
    
    setIsUpdatingCapacity(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error('Not authenticated');
      
      const { data: supplierData } = await supabase
        .from('suppliers')
        .select('id')
        .eq('profile_id', userData.user.id)
        .single();
        
      if (!supplierData) {
        Alert.alert('Error', 'Please complete your Business Profile first.');
        setCapacityModalVisible(false);
        return;
      }
      
      const d = new Date();
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const nd = new Date(utc + (3600000 * 5.5)); // IST is UTC+5.5
      const dateStr = nd.toISOString().split('T')[0];
      
      const { error: rpcError } = await supabase.rpc('set_supplier_capacity', {
        p_date: dateStr,
        p_max_capacity: qty
      });

      if (rpcError) throw rpcError;
      
      setCapacity(qty);
      Alert.alert('Success', `Today's marketplace capacity set to ${qty} jars.`);
      setCapacityModalVisible(false);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Failed to update capacity.');
    } finally {
      setIsUpdatingCapacity(false);
    }
  };

  if (loading && !stats) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  // Format the date header
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
  
  const currentHour = today.getHours();
  let greeting = 'Good evening';
  if (currentHour < 12) greeting = 'Good morning';
  else if (currentHour < 17) greeting = 'Good afternoon';
  
  const supplierName = profile?.name || 'Partner';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.headerSubtitle}>Supplier Operations</Text>
          <Text style={styles.headerTitle}>{dateString}</Text>
          <Text style={styles.headerGreeting}>{greeting}, {supplierName}</Text>
        </View>
        <Button 
          title="Fleet & Routes" 
          variant="outline" 
          size="sm" 
          onPress={() => router.push('/(supplier)/routes' as any)} 
        />
      </View>

      <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        
        {/* FORECAST */}
        {forecast && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TOMORROW'S FORECAST</Text>
            {forecast.is_at_risk ? (
              <Card style={{ padding: 16, backgroundColor: theme.colors.error + '10', borderColor: theme.colors.error, borderWidth: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="warning" size={24} color={theme.colors.error} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.colors.error }}>Shortfall Risk</Text>
                </View>
                <Text style={{ color: theme.colors.textPrimary, marginBottom: 8 }}>
                  Warning: You have only {forecast.current_inventory} jars available but expect {forecast.total_forecast} demand tomorrow.
                </Text>
                <Button title="Request Stock" variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} />
              </Card>
            ) : (
              <Card style={{ padding: 16, backgroundColor: theme.colors.success + '10', borderColor: theme.colors.success, borderWidth: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.colors.success }}>Healthy Stock</Text>
                </View>
                <Text style={{ color: theme.colors.textPrimary }}>
                  You have {forecast.current_inventory} jars available. Expected demand tomorrow is {forecast.total_forecast} jars.
                </Text>
              </Card>
            )}
          </View>
        )}

        {/* TODAY's MARKETPLACE CAPACITY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MARKETPLACE AVAILABILITY</Text>
          <Card style={{ padding: 16, backgroundColor: capacity > 0 ? theme.colors.success + '10' : theme.colors.error + '10', borderColor: capacity > 0 ? theme.colors.success : theme.colors.error, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: capacity > 0 ? theme.colors.success : theme.colors.error }}>
                  {capacity > 0 ? `${capacity} Jars Available` : 'Offline / No Capacity'}
                </Text>
                <Text style={{ color: theme.colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                  Your capacity for marketplace orders today.
                </Text>
              </View>
              <Button 
                title="Update" 
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
          <Text style={styles.sectionTitle}>TODAY</Text>
          <View style={styles.statsGrid}>
            <Card style={[styles.statCard, { backgroundColor: theme.colors.primary + '10' }]}>
              <Text style={styles.statValue}>{stats?.deliveries_due || 0}</Text>
              <Text style={styles.statLabel}>Deliveries Due</Text>
            </Card>
            <Card style={[styles.statCard, { backgroundColor: theme.colors.warning + '10' }]}>
              <Text style={styles.statValue}>{stats?.jars_required || 0}</Text>
              <Text style={styles.statLabel}>Jars Required</Text>
            </Card>
            <Card style={[styles.statCard, { backgroundColor: theme.colors.success + '10' }]}>
              <Text style={styles.statValue}>₹{stats?.expected_revenue || 0}</Text>
              <Text style={styles.statLabel}>Expected Revenue</Text>
            </Card>
            <Card style={[styles.statCard, { backgroundColor: theme.colors.error + '10' }]}>
              <Text style={styles.statValue}>₹{stats?.outstanding_total || 0}</Text>
              <Text style={styles.statLabel}>Total Outstanding</Text>
            </Card>
          </View>

          <View style={styles.progressRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.progressLabel}>Deliveries Completed</Text>
              <Text style={styles.progressValue}>{stats?.deliveries_done || 0} / {(stats?.deliveries_due || 0) + (stats?.deliveries_done || 0)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.progressLabel}>Cash Collected</Text>
              <Text style={styles.progressValue}>₹{stats?.collected_today || 0}</Text>
            </View>
          </View>
        </View>

        {/* TODAY'S MANIFEST */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TODAY'S WORK</Text>
          
          {manifest.length === 0 ? (
            <Card style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.success} style={{ marginBottom: 12 }} />
              <Text style={{ fontSize: 16, color: theme.colors.textPrimary, fontWeight: '600' }}>All Caught Up!</Text>
              <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 4 }}>
                No pending deliveries remaining for today.
              </Text>
            </Card>
          ) : (
            manifest.map((item, index) => (
              <Card key={`${item.customer_id}-${index}`} style={styles.manifestCard}>
                <View style={styles.manifestHeader}>
                  <View>
                    <Text style={styles.customerName}>{item.customer_name}</Text>
                    <Text style={styles.customerLocation}>
                      {item.sector ? `${item.sector}` : 'No Area'} {item.address ? `• ${item.address}` : ''}
                    </Text>
                  </View>
                  <Badge 
                    label={item.status === 'placed' ? 'New Request' : item.status === 'scheduled' ? 'Scheduled' : 'Pending'} 
                    variant={item.status === 'placed' ? 'error' : item.status === 'scheduled' ? 'neutral' : 'warning'} 
                  />
                </View>
                
                <View style={styles.manifestDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="water-outline" size={16} color={theme.colors.primary} />
                    <Text style={styles.detailText}>{item.quantity} × 20L</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="pricetag-outline" size={16} color={theme.colors.success} />
                    <Text style={styles.detailText}>@ ₹{item.effective_unit_price} (Total: ₹{item.expected_amount})</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.detailText}>{item.phone}</Text>
                  </View>
                </View>
                
                {item.status === 'placed' ? (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    <Button 
                      title="Decline" 
                      variant="outline" 
                      style={{ flex: 1, borderColor: theme.colors.error }} 
                      textStyle={{ color: theme.colors.error }}
                      onPress={async () => {
                        try {
                          await DashboardService.rejectOrder(item.order_id);
                          onRefresh();
                        } catch(e) {
                          Alert.alert('Error', 'Failed to decline order.');
                        }
                      }}
                    />
                    <Button 
                      title="Accept Order" 
                      variant="primary" 
                      style={{ flex: 1 }}
                      onPress={async () => {
                        try {
                          await DashboardService.acceptOrder(item.order_id);
                          onRefresh();
                        } catch(e) {
                          Alert.alert('Error', 'Failed to accept order.');
                        }
                      }}
                    />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    <Button 
                      title="🔔 Send Arrival Alert" 
                      variant="outline" 
                      style={{ flex: 1, borderColor: theme.colors.primary }} 
                      textStyle={{ color: theme.colors.primary }}
                      onPress={async () => {
                        try {
                          await DashboardService.notifyArrival(item.order_id);
                          Alert.alert('Success', 'Arrival alert sent to customer!');
                        } catch(e: any) {
                          Alert.alert('Error', e.message || 'Failed to send alert.');
                        }
                      }}
                    />
                  </View>
                )}
              </Card>
            ))
          )}
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Capacity Modal */}
      <Modal visible={capacityModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: 'auto' }]}>
            <Text style={styles.modalTitle}>Update Daily Capacity</Text>
            <Text style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>
              How many jars can you fulfill for new marketplace orders today?
            </Text>
            
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 8 }}>Quantity</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric"
              value={newCapacity} 
              onChangeText={setNewCapacity} 
            />

            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setCapacityModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Set Capacity" variant="primary" onPress={handleUpdateCapacity} loading={isUpdatingCapacity} style={{ flex: 1, marginLeft: 12 }} />
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
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 4,
  },
  headerGreeting: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
    fontWeight: '500',
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
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginBottom: 16,
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    padding: 16,
    marginBottom: 0,
    borderWidth: 0,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  manifestCard: {
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.warning,
  },
  manifestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
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
  }
});
