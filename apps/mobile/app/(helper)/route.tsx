import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../features/auth/AuthProvider';
import { helperOpsService } from '../../services/helper-ops';

export default function HelperRoute() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const runs = await helperOpsService.getHelperRun(user.id, today);
      const activeRun = runs?.[0] || null;
      setRun(activeRun);

      if (activeRun) {
        const stopsData = await helperOpsService.getRunStops(activeRun.id);
        setStops(stopsData || []);
      }
    } catch (err: any) {
      console.error('Error loading route:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, today]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCompleteStop = async (stopId: string, customerName: string) => {
    Alert.alert(
      'Mark Delivered',
      `Confirm delivery to ${customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delivered',
          onPress: async () => {
            try {
              await helperOpsService.completeStop(stopId);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const handleSkipStop = async (stopId: string) => {
    Alert.alert('Skip Delivery', 'Why are you skipping this stop?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Not Available',
        onPress: async () => {
          try {
            const { supabase } = require('../../lib/supabase/client');
            await supabase.rpc('update_stop_status', {
              p_stop_id: stopId,
              p_status: 'skipped',
              p_skip_reason: 'Customer not available',
            });
            await loadData();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const callCustomer = (phone: string) => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const getStopStatusStyle = (status: string) => {
    switch (status) {
      case 'delivered': return { bg: '#22C55E20', color: '#22C55E', label: '✓ Delivered' };
      case 'skipped': return { bg: '#EF444420', color: '#EF4444', label: '✕ Skipped' };
      case 'en_route': return { bg: '#F59E0B20', color: '#F59E0B', label: '→ En Route' };
      default: return { bg: '#64748B20', color: '#64748B', label: '○ Planned' };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><Text style={styles.loadingText}>Loading route...</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5E9" />}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Today's Route</Text>
          <Text style={styles.stopCount}>{stops.filter(s => s.status === 'delivered').length}/{stops.length} delivered</Text>
        </View>

        {stops.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="navigate-outline" size={48} color="#64748B" />
            <Text style={styles.emptyTitle}>No Stops</Text>
            <Text style={styles.emptySubtitle}>No delivery stops for today's run.</Text>
          </View>
        ) : (
          stops.map((stop, index) => {
            const statusStyle = getStopStatusStyle(stop.status);
            const isActive = stop.status === 'planned' || stop.status === 'en_route';
            const isOpportunistic = stop.stop_type === 'opportunistic';

            return (
              <View key={stop.id} style={[styles.stopCard, isActive && styles.activeStopCard]}>
                {/* Sequence + Type badge */}
                <View style={styles.stopHeader}>
                  <View style={styles.seqBadge}>
                    <Text style={styles.seqText}>{stop.sequence_number}</Text>
                  </View>
                  {isOpportunistic && (
                    <View style={styles.oppBadge}>
                      <Ionicons name="flash" size={10} color="#F59E0B" />
                      <Text style={styles.oppText}>ON-DEMAND</Text>
                    </View>
                  )}
                  <View style={[styles.statusChip, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusChipText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                  </View>
                </View>

                {/* Customer info */}
                <Text style={styles.customerName}>{stop.profiles?.full_name || 'Customer'}</Text>
                <Text style={styles.address}>
                  {[stop.addresses?.street, stop.addresses?.city].filter(Boolean).join(', ') || 'Address not set'}
                </Text>

                {/* Product info */}
                <View style={styles.productRow}>
                  <Ionicons name="water-outline" size={14} color="#0EA5E9" />
                  <Text style={styles.productText}>
                    {stop.quantity}× {stop.products?.name || 'Product'} {stop.products?.size || ''}
                  </Text>
                  <Text style={styles.priceText}>₹{stop.total_amount}</Text>
                </View>

                {/* ETA */}
                {stop.eta_minutes && isActive && (
                  <View style={styles.etaRow}>
                    <Ionicons name="time-outline" size={14} color="#F59E0B" />
                    <Text style={styles.etaText}>ETA: ~{stop.eta_minutes} min</Text>
                  </View>
                )}

                {/* Actions */}
                {isActive && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.deliverBtn}
                      onPress={() => handleCompleteStop(stop.id, stop.profiles?.full_name)}
                    >
                      <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                      <Text style={styles.deliverBtnText}>Delivered</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.skipBtn}
                      onPress={() => handleSkipStop(stop.id)}
                    >
                      <Text style={styles.skipBtnText}>Skip</Text>
                    </TouchableOpacity>

                    {stop.profiles?.phone && (
                      <TouchableOpacity
                        style={styles.callBtn}
                        onPress={() => callCustomer(stop.profiles.phone)}
                      >
                        <Ionicons name="call" size={18} color="#0EA5E9" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', fontSize: 16 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#F8FAFC' },
  stopCount: { fontSize: 14, color: '#0EA5E9', fontWeight: '600' },
  emptyCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 32, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  emptySubtitle: { fontSize: 14, color: '#64748B' },
  stopCard: { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#334155' },
  activeStopCard: { borderLeftColor: '#0EA5E9' },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  seqBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  seqText: { fontSize: 12, fontWeight: '800', color: '#F8FAFC' },
  oppBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F59E0B15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  oppText: { fontSize: 9, fontWeight: '800', color: '#F59E0B', letterSpacing: 0.5 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 'auto' },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  customerName: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 2 },
  address: { fontSize: 12, color: '#64748B', marginBottom: 8 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  productText: { fontSize: 13, color: '#CBD5E1', flex: 1 },
  priceText: { fontSize: 14, fontWeight: '700', color: '#22C55E' },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  etaText: { fontSize: 12, color: '#F59E0B' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#334155' },
  deliverBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22C55E', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, flex: 1, justifyContent: 'center' },
  deliverBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  skipBtn: { backgroundColor: '#EF444420', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  skipBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  callBtn: { backgroundColor: '#0EA5E920', padding: 8, borderRadius: 8 },
});
