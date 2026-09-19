import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../features/auth/AuthProvider';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase/client';
import { dispatchService } from '../../services/dispatch';

type ScreenState = 'select' | 'searching' | 'assigned' | 'failed';

export default function OnDemandScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ product_id?: string; address_id?: string; quantity?: string }>();

  const [state, setState] = useState<ScreenState>('select');
  const [products, setProducts] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>(params.product_id || '');
  const [selectedAddress, setSelectedAddress] = useState<string>(params.address_id || '');
  const [quantity, setQuantity] = useState(parseInt(params.quantity || '1'));
  const [requestId, setRequestId] = useState<string | null>(null);
  const [assignedOrderId, setAssignedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Pulse animation for searching state
  const pulseAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    if (state === 'searching') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.ease, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [state]);

  // Load products and addresses
  useEffect(() => {
    const load = async () => {
      try {
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, size, unit, brand')
          .order('name');

        const { data: addrs } = await supabase
          .from('addresses')
          .select('id, label, street, city, zip')
          .eq('user_id', user?.id);

        setProducts(prods || []);
        setAddresses(addrs || []);

        if (prods && prods.length > 0 && !selectedProduct) setSelectedProduct(prods[0].id);
        if (addrs && addrs.length > 0 && !selectedAddress) setSelectedAddress(addrs[0].id);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  // Subscribe to dispatch request updates
  useEffect(() => {
    if (!requestId) return;

    const channel = dispatchService.subscribeToDispatchRequest(requestId, (payload: any) => {
      const newStatus = payload.new?.status;
      if (newStatus === 'assigned') {
        setAssignedOrderId(payload.new.assigned_order_id);
        setState('assigned');
      } else if (newStatus === 'failed' || newStatus === 'expired') {
        setState('failed');
      }
    });

    return () => { supabase.removeChannel(channel); };
  }, [requestId]);

  const handleSubmit = async () => {
    if (!selectedProduct || !selectedAddress) {
      Alert.alert('Missing Info', 'Please select a product and delivery address.');
      return;
    }

    try {
      setState('searching');

      // 1. Create dispatch request
      const reqId = await dispatchService.createDispatchRequest(selectedAddress, selectedProduct, quantity);
      setRequestId(reqId);

      // 2. Trigger vehicle search (kept separate per architecture spec)
      const offerCount = await dispatchService.searchVehicles(reqId);

      if (offerCount === 0) {
        setState('failed');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to create delivery request');
      setState('select');
    }
  };

  const handleCancel = async () => {
    if (requestId) {
      try {
        await dispatchService.cancelDispatchRequest(requestId);
      } catch (err) {
        console.error('Cancel error:', err);
      }
    }
    setState('select');
    setRequestId(null);
  };

  const handleTrackOrder = () => {
    if (assignedOrderId) {
      router.push({ pathname: '/(customer)/track-order', params: { order_id: assignedOrderId } } as any);
    }
  };

  const handleRetry = () => {
    setState('select');
    setRequestId(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><ActivityIndicator size="large" color="#0EA5E9" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deliver Now</Text>
      </View>

      {state === 'select' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Product Selection */}
          <Text style={styles.sectionLabel}>What do you need?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {products.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, selectedProduct === p.id && styles.chipActive]}
                onPress={() => setSelectedProduct(p.id)}
              >
                <Text style={[styles.chipText, selectedProduct === p.id && styles.chipTextActive]}>
                  {p.brand} {p.name} {p.size}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Quantity */}
          <Text style={styles.sectionLabel}>Quantity</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
              <Ionicons name="remove" size={20} color="#F8FAFC" />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(quantity + 1)}>
              <Ionicons name="add" size={20} color="#F8FAFC" />
            </TouchableOpacity>
          </View>

          {/* Address Selection */}
          <Text style={styles.sectionLabel}>Deliver to</Text>
          {addresses.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.addressCard, selectedAddress === a.id && styles.addressActive]}
              onPress={() => setSelectedAddress(a.id)}
            >
              <Ionicons name={selectedAddress === a.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={selectedAddress === a.id ? '#0EA5E9' : '#64748B'} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.addressLabel}>{a.label || 'Home'}</Text>
                <Text style={styles.addressDetail}>{a.street}, {a.city}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Submit */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Ionicons name="flash" size={20} color="#FFF" />
            <Text style={styles.submitBtnText}>Find Nearby Vehicle</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {state === 'searching' && (
        <View style={styles.centered}>
          <Animated.View style={[styles.searchCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons name="water" size={48} color="#0EA5E9" />
          </Animated.View>
          <Text style={styles.searchTitle}>Finding a delivery vehicle...</Text>
          <Text style={styles.searchSubtitle}>Looking for available vehicles near you</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'assigned' && (
        <View style={styles.centered}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
          </View>
          <Text style={styles.successTitle}>Supplier Found!</Text>
          <Text style={styles.successSubtitle}>Your water delivery is on its way.</Text>
          <TouchableOpacity style={styles.trackBtn} onPress={handleTrackOrder}>
            <Ionicons name="navigate" size={20} color="#FFF" />
            <Text style={styles.trackBtnText}>Track Delivery</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'failed' && (
        <View style={styles.centered}>
          <Ionicons name="sad-outline" size={64} color="#64748B" />
          <Text style={styles.failTitle}>No Vehicles Available</Text>
          <Text style={styles.failSubtitle}>No delivery vehicles with capacity are currently near you. Please try again later.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  chipRow: { flexDirection: 'row', marginBottom: 8 },
  chip: { backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#334155' },
  chipActive: { backgroundColor: '#0EA5E920', borderColor: '#0EA5E9' },
  chipText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#0EA5E9' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 8 },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  qtyValue: { fontSize: 28, fontWeight: '800', color: '#F8FAFC' },
  addressCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  addressActive: { borderColor: '#0EA5E9' },
  addressLabel: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  addressDetail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0EA5E9', padding: 16, borderRadius: 12, marginTop: 24 },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  searchCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#0EA5E915', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  searchTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', marginBottom: 8 },
  searchSubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  cancelBtn: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, backgroundColor: '#334155' },
  cancelBtnText: { color: '#94A3B8', fontWeight: '700' },
  successCircle: { marginBottom: 24 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#22C55E', marginBottom: 8 },
  successSubtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginBottom: 24 },
  trackBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0EA5E9', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  trackBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  failTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', marginTop: 16, marginBottom: 8 },
  failSubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 24 },
  retryBtn: { backgroundColor: '#0EA5E9', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  retryBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
