import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { routeOpsService } from '../../services/route-ops';
import { useAuth } from '../../features/auth/AuthProvider';
import { supabase } from '../../lib/supabase/client';

export default function SupplierRoutesScreen() {
  const { session } = useAuth();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRuns();
  }, [session]);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      if (!session?.user?.id) return;
      
      // Get supplier ID
      const { data: supplierData } = await supabase
        .from('suppliers')
        .select('id')
        .eq('profile_id', session.user.id)
        .single();
        
      if (!supplierData?.id) return;
      const supplierId = supplierData.id;

      const today = new Date().toISOString().split('T')[0];
      const data = await routeOpsService.getRuns(supplierId, today);
      setRuns(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned': return '#f59e0b';
      case 'loading': return '#3b82f6';
      case 'in_progress': return '#10b981';
      case 'completed': return '#6b7280';
      default: return '#6b7280';
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Today's Routes</Text>
      
      {runs.length === 0 ? (
        <Text style={styles.emptyText}>No routes generated for today.</Text>
      ) : (
        runs.map((run) => (
          <View key={run.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.runTitle}>
                Vehicle: {run.vehicles?.vehicle_number || 'Unassigned'}
              </Text>
              <View style={[styles.badge, { backgroundColor: getStatusColor(run.status) }]}>
                <Text style={styles.badgeText}>{run.status.toUpperCase()}</Text>
              </View>
            </View>
            
            <Text style={styles.driverText}>
              Driver: {run.drivers?.profiles?.full_name || 'Unassigned'}
            </Text>
            
            <Text style={styles.stopsText}>
              {run.delivery_run_stops?.length || 0} Stops
            </Text>
            
            <TouchableOpacity style={styles.viewButton}>
              <Text style={styles.viewButtonText}>View Route Details</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#111827' },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  runTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  driverText: { fontSize: 15, color: '#4b5563', marginBottom: 4 },
  stopsText: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  viewButton: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  viewButtonText: { color: '#2563eb', fontWeight: '600' }
});
