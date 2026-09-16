import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';
import { InventoryService, InventoryStats, JarActivity } from '../../services/inventory';
import { CustomerService, SupplierCustomer } from '../../services/customer';
import { useFocusEffect } from 'expo-router';

export default function JarsScreen() {
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [activity, setActivity] = useState<JarActivity[]>([]);
  const [customers, setCustomers] = useState<SupplierCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  // Manual Adjustment State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [returnCount, setReturnCount] = useState(0);
  const [dispatchCount, setDispatchCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Purchase State
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [purchaseCount, setPurchaseCount] = useState('10');
  const [isPurchasing, setIsPurchasing] = useState(false);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const [statsData, activityData, customersData] = await Promise.all([
        InventoryService.getStats(),
        InventoryService.getActivity(20),
        CustomerService.getCustomers()
      ]);
      setStats(statsData);
      setActivity(activityData);
      setCustomers(customersData);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
    }, [])
  );

  const handleConfirmAdjustment = async () => {
    if (!selectedCustomerId) {
      Alert.alert('Validation Error', 'Please select a customer first.');
      return;
    }
    if (returnCount === 0 && dispatchCount === 0) {
      Alert.alert('Validation Error', 'Please adjust at least one jar.');
      return;
    }

    try {
      setIsSubmitting(true);
      await InventoryService.recordManualAdjustment({
        customerId: selectedCustomerId,
        jarsDelivered: dispatchCount,
        jarsReturned: returnCount,
      });
      
      Alert.alert('Success', 'Jar adjustment recorded.');
      setReturnCount(0);
      setDispatchCount(0);
      setSelectedCustomerId('');
      fetchInventory();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to record adjustment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePurchase = async () => {
    const qty = parseInt(purchaseCount, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid positive number.');
      return;
    }
    
    try {
      setIsPurchasing(true);
      await InventoryService.recordPurchase(qty);
      setPurchaseModalVisible(false);
      Alert.alert('Success', `Added ${qty} jars to warehouse stock.`);
      fetchInventory();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to record purchase');
    } finally {
      setIsPurchasing(false);
    }
  };

  if (loading && !stats) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const total = stats?.owned || 0;
  const availablePerc = total > 0 ? (stats!.available / total) * 100 : 0;
  const withCustPerc = total > 0 ? (stats!.with_customers / total) * 100 : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Jars Inventory</Text>
          <Text style={styles.headerSubtitle}>Manage your 20L can circulation</Text>
        </View>
        <Button 
          title="Buy Stock" 
          variant="outline" 
          size="sm" 
          
          onPress={() => setPurchaseModalVisible(true)} 
        />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Overview Stats */}
        <Card style={styles.overviewCard}>
          <Text style={styles.sectionTitle}>Current Status</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.available || 0}</Text>
              <Text style={styles.statLabel}>Available (Warehouse)</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.warning as string }]}>{stats?.with_customers || 0}</Text>
              <Text style={styles.statLabel}>Out with Customers</Text>
            </View>
          </View>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${availablePerc}%`, backgroundColor: theme.colors.primary }]} />
            <View style={[styles.progressBar, { width: `${withCustPerc}%`, backgroundColor: theme.colors.warning }]} />
          </View>
          <Text style={styles.totalText}>Total Owned Inventory: {total} Jars</Text>
        </Card>

        {/* Record Manual Return/Dispatch */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manual Adjustments</Text>
          <Card style={styles.actionCard}>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Customer</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 8 }}>
                {customers.map(c => (
                  <TouchableOpacity 
                    key={c.id} 
                    style={[
                      styles.chip, 
                      selectedCustomerId === c.id && styles.chipActive
                    ]}
                    onPress={() => setSelectedCustomerId(c.id)}
                  >
                    <Text style={[
                      styles.chipText,
                      selectedCustomerId === c.id && styles.chipTextActive
                    ]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Empty Jars Returned</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity style={styles.counterBtn} onPress={() => setReturnCount(Math.max(0, returnCount - 1))}>
                  <Ionicons name="remove" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={styles.counterValue}>{returnCount}</Text>
                <TouchableOpacity style={styles.counterBtn} onPress={() => setReturnCount(returnCount + 1)}>
                  <Ionicons name="add" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Filled Jars Dispatched (Manual)</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity style={styles.counterBtn} onPress={() => setDispatchCount(Math.max(0, dispatchCount - 1))}>
                  <Ionicons name="remove" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={styles.counterValue}>{dispatchCount}</Text>
                <TouchableOpacity style={styles.counterBtn} onPress={() => setDispatchCount(dispatchCount + 1)}>
                  <Ionicons name="add" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <Button title="Confirm Adjustment" variant="primary" style={{ marginTop: 8 }} onPress={handleConfirmAdjustment} loading={isSubmitting} />
          </Card>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Jar Activity</Text>
          
          {activity.length === 0 ? (
            <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 20 }}>No recent jar activity.</Text>
          ) : (
            activity.map((act) => {
              const isDispatch = act.jars_delivered > 0 && act.jars_returned === 0;
              const isReturn = act.jars_returned > 0 && act.jars_delivered === 0;
              const isBoth = act.jars_delivered > 0 && act.jars_returned > 0;
              
              let title = '';
              let icon = 'swap-horizontal';
              let color: string = theme.colors.primary;

              if (isDispatch) {
                title = `Dispatched ${act.jars_delivered} Jars`;
                icon = 'arrow-up-circle';
                color = theme.colors.warning;
              } else if (isReturn) {
                title = `Returned ${act.jars_returned} Jars`;
                icon = 'arrow-down-circle';
                color = theme.colors.success;
              } else if (isBoth) {
                title = `Dispatched ${act.jars_delivered}, Returned ${act.jars_returned}`;
                icon = 'swap-horizontal';
                color = theme.colors.primary;
              }

              return (
                <Card key={act.id} style={styles.activityCard}>
                  <View style={styles.activityRow}>
                    <View style={[styles.activityIconWrapper, { backgroundColor: color + '10' }]}>
                      <Ionicons name={icon as any} size={24} color={color} />
                    </View>
                    <View style={styles.activityDetails}>
                      <Text style={styles.activityTitle}>{title}</Text>
                      <Text style={styles.activitySubtitle}>{act.customer_name} • {new Date(act.created_at).toLocaleString()}</Text>
                    </View>
                  </View>
                </Card>
              );
            })
          )}

        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Purchase Modal */}
      <Modal visible={purchaseModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: 'auto' }]}>
            <Text style={styles.modalTitle}>Purchase New Jars</Text>
            <Text style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>
              Add newly purchased empty jars to your warehouse inventory.
            </Text>
            
            <Text style={styles.inputLabel}>Quantity</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric"
              value={purchaseCount} 
              onChangeText={setPurchaseCount} 
            />

            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setPurchaseModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Add to Stock" variant="primary" onPress={handlePurchase} loading={isPurchasing} style={{ flex: 1, marginLeft: 12 }} />
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
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  overviewCard: {
    padding: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
    marginHorizontal: 16,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  progressContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
  },
  totalText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  actionCard: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: theme.colors.background,
  },
  pickerText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  counterBtn: {
    padding: 8,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 24,
  },
  counterValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    minWidth: 40,
    textAlign: 'center',
  },
  activityCard: {
    padding: 16,
    marginBottom: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityIconWrapper: {
    padding: 8,
    backgroundColor: theme.colors.success + '10',
    borderRadius: 24,
  },
  activityDetails: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: theme.colors.surface,
    fontWeight: '600',
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
  }
});
