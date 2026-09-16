import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';
import { CustomerService, SupplierCustomer, CustomerType } from '../../services/customer';
import { LedgerService, CustomerLedger } from '../../services/ledger';
import { useFocusEffect } from 'expo-router';

export default function CustomersScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | CustomerType | 'Credit Due'>('All');
  
  const [customers, setCustomers] = useState<SupplierCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Customer Modal State
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newType, setNewType] = useState<CustomerType>('household');
  const [isAdding, setIsAdding] = useState(false);

  // Edit Price Modal State
  const [editPriceModalVisible, setEditPriceModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SupplierCustomer | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);

  // Schedule Modal State
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [intervalDays, setIntervalDays] = useState('2');
  const [scheduleQuantity, setScheduleQuantity] = useState('1');
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);

  // Ledger Modal State
  const [ledgerModalVisible, setLedgerModalVisible] = useState(false);
  const [ledgerData, setLedgerData] = useState<CustomerLedger | null>(null);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  const filters = ['All', 'household', 'office', 'shop', 'Credit Due'];
  
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const data = await CustomerService.getCustomers({
        search: searchQuery,
        customer_type: activeFilter !== 'All' && activeFilter !== 'Credit Due' ? (activeFilter as CustomerType) : undefined,
      });
      setCustomers(data);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchCustomers();
    }, [activeFilter])
  );

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddCustomer = async () => {
    if (!newName.trim() || !newPhone.trim()) {
      Alert.alert('Validation Error', 'Name and phone are required.');
      return;
    }
    
    try {
      setIsAdding(true);
      await CustomerService.addCustomer({
        name: newName,
        phone: newPhone,
        customer_type: newType
      });
      setAddModalVisible(false);
      setNewName('');
      setNewPhone('');
      fetchCustomers();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add customer');
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditPrice = (customer: SupplierCustomer) => {
    setSelectedCustomer(customer);
    setNewPrice(customer.active_price ? customer.active_price.toString() : '');
    setEditPriceModalVisible(true);
  };

  const handleSchedule = (customer: SupplierCustomer) => {
    setSelectedCustomer(customer);
    setScheduleModalVisible(true);
  };

  const handleViewLedger = async (customer: SupplierCustomer) => {
    setSelectedCustomer(customer);
    setLedgerModalVisible(true);
    setIsLedgerLoading(true);
    try {
      const data = await LedgerService.getCustomerLedger(customer.id);
      setLedgerData(data);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load ledger');
      setLedgerModalVisible(false);
    } finally {
      setIsLedgerLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedCustomer) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }

    try {
      setIsPaying(true);
      await LedgerService.recordPayment({
        customerId: selectedCustomer.id,
        amount
      });
      setPaymentAmount('');
      // Refresh ledger
      const data = await LedgerService.getCustomerLedger(selectedCustomer.id);
      setLedgerData(data);
      // Refresh customers (since outstanding balance is also shown on cards)
      fetchCustomers();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to record payment');
    } finally {
      setIsPaying(false);
    }
  };

  const saveNewPrice = async () => {
    if (!selectedCustomer) return;
    const parsedPrice = parseFloat(newPrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }

    try {
      setIsUpdatingPrice(true);
      const { supabase } = require('../../lib/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();
      const { data: supplier } = await supabase.from('suppliers').select('id').eq('profile_id', user?.id).single();
      const { data: products } = await supabase.from('supplier_products').select('id').eq('supplier_id', supplier?.id).limit(1).single();
      
      if (!products) {
        throw new Error('No active products found for your business.');
      }

      await CustomerService.setCustomerPrice({
        customerId: selectedCustomer.id,
        productId: products.id,
        price: parsedPrice,
      });

      setEditPriceModalVisible(false);
      fetchCustomers();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update price');
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const saveSchedule = async () => {
    if (!selectedCustomer) return;
    const qty = parseInt(scheduleQuantity, 10);
    const interval = parseInt(intervalDays, 10);

    if (isNaN(qty) || qty <= 0 || isNaN(interval) || interval <= 0) {
      Alert.alert('Invalid Input', 'Quantity and interval must be positive numbers.');
      return;
    }

    try {
      setIsUpdatingSchedule(true);
      const { supabase } = require('../../lib/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();
      const { data: supplier } = await supabase.from('suppliers').select('id').eq('profile_id', user?.id).single();
      const { data: products } = await supabase.from('supplier_products').select('id').eq('supplier_id', supplier?.id).limit(1).single();
      
      if (!products) {
        throw new Error('No active products found for your business.');
      }

      // First delivery is today (in a real app, you might let them select the date)
      const firstDeliveryDate = new Date().toISOString().split('T')[0];

      await CustomerService.setCustomerSchedule({
        customerId: selectedCustomer.id,
        productId: products.id,
        quantity: qty,
        intervalDays: interval,
        firstDeliveryDate,
      });

      setScheduleModalVisible(false);
      fetchCustomers();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update schedule');
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const getFilteredCustomers = () => {
    if (activeFilter === 'Credit Due') {
      return customers.filter(c => c.outstanding_balance > 0);
    }
    return customers;
  };

  const displayedCustomers = getFilteredCustomers();
  const activeCount = customers.filter(c => c.is_active).length;
  const totalJarsOut = customers.reduce((sum, c) => sum + (c.jar_balance || 0), 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>Customers</Text>
            <Text style={styles.headerSubtitle}>My Business • {customers.length} Total Accounts</Text>
          </View>
          <Badge variant="success" label={`Active (${activeCount})`} />
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={theme.colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search customer name or phone..."
              placeholderTextColor={theme.colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <Button title="+ Add Customer" size="sm" style={styles.addButton} onPress={() => setAddModalVisible(true)} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterContainer}>
            {filters.map(f => (
              <TouchableOpacity 
                key={f} 
                style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
                onPress={() => setActiveFilter(f as any)}
              >
                <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Quick Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{customers.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalJarsOut}</Text>
            <Text style={styles.summaryLabel}>Jars Out</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>--</Text>
            <Text style={styles.summaryLabel}>Monthly Vol</Text>
          </View>
        </View>

        {/* Customer List */}
        <View style={styles.customerList}>
          {loading ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
          ) : displayedCustomers.length === 0 ? (
            <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40 }}>No customers found.</Text>
          ) : (
            displayedCustomers.map((customer) => (
              <Card key={customer.id} style={styles.customerCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.customerName}>{customer.name}</Text>
                    <Text style={styles.customerAddress}>{customer.address || customer.phone}</Text>
                  </View>
                  <TouchableOpacity style={styles.callButton}>
                    <Ionicons name="call" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.tagsRow}>
                  <Badge variant={customer.customer_type === 'household' ? 'neutral' : 'warning'} label={customer.customer_type} />
                  <Badge variant="success" label={customer.active_price ? `₹${customer.active_price} / 20L` : 'Default Price'} />
                </View>
                
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{customer.jar_balance}</Text>
                    <Text style={styles.statLabel}>Jars Out</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: customer.outstanding_balance > 0 ? theme.colors.error : theme.colors.success }]}>
                      ₹{customer.outstanding_balance}
                    </Text>
                    <Text style={styles.statLabel}>Balance</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <Button title="Schedule" variant="outline" size="sm" style={styles.actionBtn} onPress={() => handleSchedule(customer)} />
                  <Button title="Edit Price" variant="outline" size="sm" style={styles.actionBtn} onPress={() => handleEditPrice(customer)} />
                  <Button title="Ledger" variant="primary" size="sm" style={styles.actionBtn} onPress={() => handleViewLedger(customer)} />
                </View>
              </Card>
            ))
          )}
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Price Modal */}
      <Modal visible={editPriceModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: 'auto' }]}>
            <Text style={styles.modalTitle}>Edit Customer Price</Text>
            <Text style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>
              Setting custom price for {selectedCustomer?.name}
            </Text>
            
            <TextInput 
              style={styles.input} 
              placeholder="Price (e.g. 20)" 
              keyboardType="numeric"
              value={newPrice} 
              onChangeText={setNewPrice} 
            />
            
            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setEditPriceModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Save Price" variant="primary" onPress={saveNewPrice} loading={isUpdatingPrice} style={{ flex: 1, marginLeft: 12 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Schedule Modal */}
      <Modal visible={scheduleModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: 'auto' }]}>
            <Text style={styles.modalTitle}>Delivery Schedule</Text>
            <Text style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>
              Set recurring deliveries for {selectedCustomer?.name}
            </Text>
            
            <TextInput 
              style={styles.input} 
              placeholder="Quantity (e.g. 1)" 
              keyboardType="numeric"
              value={scheduleQuantity} 
              onChangeText={setScheduleQuantity} 
            />

            <TextInput 
              style={styles.input} 
              placeholder="Interval in Days (e.g. 2)" 
              keyboardType="numeric"
              value={intervalDays} 
              onChangeText={setIntervalDays} 
            />
            
            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setScheduleModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Save Schedule" variant="primary" onPress={saveSchedule} loading={isUpdatingSchedule} style={{ flex: 1, marginLeft: 12 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Customer Modal */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Customer</Text>
            
            <TextInput 
              style={styles.input} 
              placeholder="Customer Name" 
              value={newName} 
              onChangeText={setNewName} 
            />
            <TextInput 
              style={styles.input} 
              placeholder="Phone Number" 
              keyboardType="phone-pad" 
              value={newPhone} 
              onChangeText={setNewPhone} 
            />
            
            <View style={styles.typeSelector}>
              <TouchableOpacity 
                style={[styles.typeBtn, newType === 'household' && styles.typeBtnActive]}
                onPress={() => setNewType('household')}
              >
                <Text style={newType === 'household' ? styles.typeTextActive : styles.typeText}>Household</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.typeBtn, newType === 'office' && styles.typeBtnActive]}
                onPress={() => setNewType('office')}
              >
                <Text style={newType === 'office' ? styles.typeTextActive : styles.typeText}>Office</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setAddModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Save" variant="primary" onPress={handleAddCustomer} loading={isAdding} style={{ flex: 1, marginLeft: 12 }} />
            </View>
          </View>
        </View>
      </Modal>
      {/* Ledger Modal */}
      <Modal visible={ledgerModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: 60, flex: 1 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Ledger: {selectedCustomer?.name}</Text>
              <TouchableOpacity onPress={() => setLedgerModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            {isLedgerLoading ? (
               <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <>
                <Card style={{ padding: 16, marginBottom: 16, backgroundColor: theme.colors.primary + '10' }}>
                  <Text style={{ fontSize: 14, color: theme.colors.textSecondary, marginBottom: 4 }}>Outstanding Balance</Text>
                  <Text style={{ fontSize: 32, fontWeight: 'bold', color: ledgerData?.outstanding_balance! > 0 ? theme.colors.error : theme.colors.success }}>
                    ₹{ledgerData?.outstanding_balance || 0}
                  </Text>
                </Card>

                <Text >Record Payment</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                  <TextInput 
                    style={[styles.input, { flex: 1, marginTop: 0 }]} 
                    placeholder="Amount (₹)"
                    keyboardType="numeric"
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                  />
                  <Button title="Accept Cash" variant="primary" loading={isPaying} onPress={handleRecordPayment} />
                </View>

                <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: 12 }}>Transaction History</Text>
                <ScrollView>
                  {ledgerData?.entries.map(entry => (
                    <View key={entry.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                      <View>
                        <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.textPrimary }}>
                          {entry.reference_type === 'delivery' ? 'Delivery Cost' : 'Payment Received'}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                          {new Date(entry.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={{ 
                        fontSize: 16, 
                        fontWeight: 'bold', 
                        color: entry.entry_type === 'credit' ? theme.colors.success : theme.colors.error 
                      }}>
                        {entry.entry_type === 'credit' ? '+' : '-'}₹{entry.amount}
                      </Text>
                    </View>
                  ))}
                  {(!ledgerData?.entries || ledgerData.entries.length === 0) && (
                    <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 20 }}>No ledger history.</Text>
                  )}
                </ScrollView>
              </>
            )}
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
    paddingTop: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
    marginBottom: 16,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  addButton: {
    height: 40,
    paddingHorizontal: 16,
  },
  filterScroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary + '10',
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  customerList: {
    gap: 16,
  },
  customerCard: {
    padding: 16,
  },
  cardHeader: {
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
  customerAddress: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    width: 250,
  },
  callButton: {
    padding: 8,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 16,
  },
  statBox: {
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
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
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: theme.colors.primary + '10',
    borderColor: theme.colors.primary,
  },
  typeText: {
    color: theme.colors.textSecondary,
  },
  typeTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 16,
  }
});

