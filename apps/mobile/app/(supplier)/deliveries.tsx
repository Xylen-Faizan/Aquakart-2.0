import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';
import { DeliveryService, DeliveryManifestItem } from '../../services/delivery';
import { useFocusEffect } from 'expo-router';

export default function DeliveriesScreen() {
  const [activeTab, setActiveTab] = useState('Pending');
  const [manifest, setManifest] = useState<DeliveryManifestItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Completion Modal State
  const [completionModalVisible, setCompletionModalVisible] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryManifestItem | null>(null);
  const [jarsDelivered, setJarsDelivered] = useState('');
  const [jarsReturned, setJarsReturned] = useState('');
  const [amountCollected, setAmountCollected] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);

  const fetchManifest = async () => {
    try {
      setLoading(true);
      const data = await DeliveryService.getTodayManifest();
      setManifest(data);
    } catch (error) {
      console.error('Failed to fetch manifest:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchManifest();
    }, [])
  );

  const openCompletionModal = (item: DeliveryManifestItem) => {
    setSelectedDelivery(item);
    setJarsDelivered(item.quantity.toString());
    setJarsReturned(item.quantity.toString()); // Assume they return what they took
    setAmountCollected((item.quantity * item.unit_price).toString());
    setCompletionModalVisible(true);
  };

  const handleComplete = async () => {
    if (!selectedDelivery) return;

    const jd = parseInt(jarsDelivered, 10) || 0;
    const jr = parseInt(jarsReturned, 10) || 0;
    const ac = parseFloat(amountCollected) || 0;

    try {
      setIsCompleting(true);
      await DeliveryService.completeDelivery({
        customerId: selectedDelivery.customer_id,
        productId: selectedDelivery.product_id,
        quantity: selectedDelivery.quantity, // what was scheduled
        jarsDelivered: jd,
        jarsReturned: jr,
        amountCollected: ac,
        paymentMethod: 'cash'
      });
      
      setCompletionModalVisible(false);
      Alert.alert('Success', 'Delivery completed successfully!');
      fetchManifest();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to complete delivery');
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>Today's Deliveries</Text>
            <Text style={styles.headerSubtitle}>{manifest.length} Stops Remaining</Text>
          </View>
          <Badge variant="warning" text="Route Active" />
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'Pending' && styles.activeTab]}
            onPress={() => setActiveTab('Pending')}
          >
            <Text style={[styles.tabText, activeTab === 'Pending' && styles.activeTabText]}>Pending ({manifest.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'Completed' && styles.activeTab]}
            onPress={() => setActiveTab('Completed')}
          >
            <Text style={[styles.tabText, activeTab === 'Completed' && styles.activeTabText]}>Completed</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {activeTab === 'Pending' && (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map" size={32} color={theme.colors.primary} />
            <Text style={styles.mapText}>Live Route Preview</Text>
          </View>
        )}

        <View style={styles.stopsList}>
          {loading ? (
             <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
          ) : activeTab === 'Pending' && manifest.length === 0 ? (
             <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40 }}>No deliveries due today.</Text>
          ) : activeTab === 'Pending' ? (
            manifest.map((item, index) => (
              <View key={item.schedule_id} style={styles.stopContainer}>
                <View style={styles.stopTimeline}>
                  <View style={styles.stopDot} />
                  {index < manifest.length - 1 && <View style={styles.stopLine} />}
                </View>
                <Card style={styles.stopCard}>
                  <View style={styles.stopHeader}>
                    <Badge variant={index === 0 ? "warning" : "default"} text={`Stop ${index + 1}`} />
                    <TouchableOpacity style={styles.iconBtn}>
                      <Ionicons name="navigate" size={18} color={theme.colors.primary} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.customerName}>{item.customer_name}</Text>
                  <Text style={styles.customerAddress}>{item.address || item.customer_phone}</Text>

                  <View style={styles.deliveryDetails}>
                    <View style={styles.detailRow}>
                      <Ionicons name="water" size={16} color={theme.colors.textSecondary} />
                      <Text style={styles.detailText}>{item.quantity}x {item.product_name}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="cash" size={16} color={theme.colors.textSecondary} />
                      <Text style={styles.detailText}>₹{item.quantity * item.unit_price} Expected</Text>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <Button title="Call" variant="outline" size="small" style={{ flex: 1 }} icon={<Ionicons name="call-outline" size={16} color={theme.colors.primary} />} />
                    <Button title="Mark Delivered" variant="primary" size="small" style={{ flex: 2 }} onPress={() => openCompletionModal(item)} />
                  </View>
                </Card>
              </View>
            ))
          ) : (
             <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40 }}>Completed deliveries will appear here (Requires ledger implementation).</Text>
          )}

        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Completion Modal */}
      <Modal visible={completionModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: 'auto' }]}>
            <Text style={styles.modalTitle}>Complete Delivery</Text>
            <Text style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>
              {selectedDelivery?.customer_name}
            </Text>
            
            <Text style={styles.inputLabel}>Jars Delivered</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric"
              value={jarsDelivered} 
              onChangeText={setJarsDelivered} 
            />

            <Text style={styles.inputLabel}>Jars Returned (Empty)</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric"
              value={jarsReturned} 
              onChangeText={setJarsReturned} 
            />

            <Text style={styles.inputLabel}>Amount Collected (₹)</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric"
              value={amountCollected} 
              onChangeText={setAmountCollected} 
            />
            
            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setCompletionModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Confirm" variant="primary" onPress={handleComplete} loading={isCompleting} style={{ flex: 1, marginLeft: 12 }} />
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
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  mapPlaceholder: {
    height: 120,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  mapText: {
    color: theme.colors.primary,
    fontWeight: '600',
    marginTop: 8,
  },
  stopsList: {
    gap: 0,
  },
  stopContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stopTimeline: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
    marginTop: 24,
    zIndex: 1,
  },
  stopLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.primary + '40',
    position: 'absolute',
    top: 36,
    bottom: -40,
  },
  stopCard: {
    flex: 1,
    padding: 16,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBtn: {
    padding: 6,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 16,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  customerAddress: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  deliveryDetails: {
    backgroundColor: theme.colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
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
    color: theme.colors.text,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 24,
    paddingBottom: 24,
  }
});
