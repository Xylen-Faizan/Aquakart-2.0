import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../features/auth/AuthProvider';
import { helperOpsService } from '../../services/helper-ops';
import { supabase } from '../../lib/supabase/client';

export default function HelperOpportunities() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const runs = await helperOpsService.getHelperRun(user.id, today);
      const activeRun = runs?.[0] || null;
      setRun(activeRun);

      if (activeRun) {
        const offerData = await helperOpsService.getOffers(activeRun.id);
        setOffers(offerData || []);
      }
    } catch (err: any) {
      console.error('Error loading opportunities:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, today]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription for new offers
  useEffect(() => {
    if (!run?.id) return;
    const channel = supabase
      .channel(`offers-${run.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'delivery_offers',
        filter: `run_id=eq.${run.id}`,
      }, () => { loadData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [run?.id, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAccept = async (offerId: string) => {
    setAccepting(offerId);
    try {
      const orderId = await helperOpsService.acceptOffer(offerId);
      Alert.alert('Accepted!', 'The delivery has been added to your route.', [
        { text: 'OK', onPress: loadData },
      ]);
    } catch (err: any) {
      Alert.alert('Cannot Accept', err.message || 'Offer is no longer available');
    } finally {
      setAccepting(null);
    }
  };

  const handleDecline = async (offerId: string) => {
    try {
      await helperOpsService.declineOffer(offerId);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><Text style={styles.loadingText}>Loading...</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Ionicons name="flash" size={24} color="#F59E0B" />
          <Text style={styles.headerTitle}>Opportunity Orders</Text>
        </View>

        {!run?.id ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Active Run</Text>
            <Text style={styles.emptySubtitle}>Opportunities appear when your route is in progress.</Text>
          </View>
        ) : offers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="radio-outline" size={48} color="#64748B" />
            <Text style={styles.emptyTitle}>Listening for Orders</Text>
            <Text style={styles.emptySubtitle}>New on-demand orders nearby will appear here automatically.</Text>
          </View>
        ) : (
          offers.map((offer) => {
            const req = offer.order_dispatch_requests;
            const isAccepting = accepting === offer.id;

            return (
              <View key={offer.id} style={styles.offerCard}>
                {/* Timer */}
                <View style={styles.timerRow}>
                  <Ionicons name="timer-outline" size={14} color="#F59E0B" />
                  <Text style={styles.timerText}>
                    Expires in {Math.max(0, Math.round((new Date(offer.expires_at).getTime() - Date.now()) / 1000))}s
                  </Text>
                </View>

                {/* Customer + Product */}
                <Text style={styles.offerCustomer}>{req?.profiles?.full_name || 'Customer'}</Text>
                <Text style={styles.offerProduct}>
                  {req?.quantity}× {req?.products?.name || 'Water'}
                </Text>

                {/* Location */}
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color="#94A3B8" />
                  <Text style={styles.locationText}>
                    {[req?.addresses?.street, req?.addresses?.sector, req?.addresses?.city].filter(Boolean).join(', ')}
                  </Text>
                </View>

                {/* Stats */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{offer.distance_km?.toFixed(1)}</Text>
                    <Text style={styles.statUnit}>km away</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>~{offer.eta_minutes}</Text>
                    <Text style={styles.statUnit}>min ETA</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: offer.detour_minutes <= 5 ? '#22C55E' : '#F59E0B' }]}>
                      +{offer.detour_minutes}
                    </Text>
                    <Text style={styles.statUnit}>min detour</Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.offerActions}>
                  <TouchableOpacity
                    style={[styles.acceptBtn, isAccepting && styles.disabledBtn]}
                    onPress={() => handleAccept(offer.id)}
                    disabled={isAccepting}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={styles.acceptBtnText}>{isAccepting ? 'Accepting...' : 'Accept'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(offer.id)}>
                    <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#F8FAFC' },
  emptyCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 32, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  offerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  timerText: { fontSize: 12, color: '#F59E0B', fontWeight: '700' },
  offerCustomer: { fontSize: 18, fontWeight: '700', color: '#F8FAFC', marginBottom: 2 },
  offerProduct: { fontSize: 14, color: '#CBD5E1', marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 12 },
  locationText: { fontSize: 12, color: '#94A3B8', flex: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 12 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  statUnit: { fontSize: 10, color: '#64748B', marginTop: 2 },
  offerActions: { flexDirection: 'row', gap: 10 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22C55E', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, flex: 1, justifyContent: 'center' },
  acceptBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  declineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF444415', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  declineBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  disabledBtn: { opacity: 0.6 },
});
