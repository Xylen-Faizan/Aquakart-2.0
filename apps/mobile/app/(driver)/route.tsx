import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { routeOpsService } from '../../services/route-ops';
import { locationService } from '../../services/location';
import { useAuth } from '../../features/auth/AuthProvider';

export default function DriverRouteScreen() {
  const { session } = useAuth();
  const [run, setRun] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodayRoute();
  }, []);

  const fetchTodayRoute = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const runs = await routeOpsService.getDriverRuns(session!.user.id, today);
      
      if (runs && runs.length > 0) {
        setRun(runs[0]);
        const runStops = await routeOpsService.getRunStops(runs[0].id);
        setStops(runStops || []);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to load route');
    } finally {
      setLoading(false);
    }
  };

  const handleStartRoute = async () => {
    if (!run) return;
    try {
      await routeOpsService.startRun(run.id);
      await locationService.startTracking(run.id);
      setRun({ ...run, status: 'in_progress' });
      Alert.alert('Route Started', 'Background location tracking is active.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleCompleteRoute = async () => {
    if (!run) return;
    try {
      await routeOpsService.completeRun(run.id);
      await locationService.stopTracking();
      setRun({ ...run, status: 'completed' });
      Alert.alert('Route Completed', 'Great job! Location tracking stopped.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleAction = async (stopId: string, action: 'delivered' | 'skipped' | 'en_route') => {
    try {
      await routeOpsService.updateStopStatus(stopId, action);
      // Optimistic UI update
      setStops(prev => prev.map(s => s.id === stopId ? { ...s, status: action } : s));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  if (!run) return <View style={styles.center}><Text>No route assigned for today.</Text></View>;

  // Find the active stop
  const currentStop = stops.find(s => s.status === 'planned' || s.status === 'en_route');

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>Vehicle: {run.vehicles?.vehicle_number}</Text>
        <Text style={styles.subtitle}>{stops.length} Deliveries</Text>
        
        {run.status === 'planned' && (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleStartRoute}>
            <Text style={styles.btnText}>START ROUTE</Text>
          </TouchableOpacity>
        )}
        
        {run.status === 'in_progress' && !currentStop && (
          <TouchableOpacity style={styles.successBtn} onPress={handleCompleteRoute}>
            <Text style={styles.btnText}>COMPLETE ROUTE</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.list}>
        <Text style={styles.sectionTitle}>Stops</Text>
        {stops.map((stop, index) => {
          const isCurrent = currentStop?.id === stop.id;
          return (
            <View key={stop.id} style={[styles.stopCard, isCurrent && styles.activeCard]}>
              <View style={styles.stopHeader}>
                <Text style={styles.stopSequence}>{index + 1}</Text>
                <Text style={styles.stopName}>{stop.profiles?.full_name}</Text>
                <Text style={styles.stopStatus}>{stop.status.toUpperCase()}</Text>
              </View>
              
              <Text style={styles.address}>
                {stop.addresses?.street}, {stop.addresses?.city}
              </Text>
              
              <Text style={styles.qty}>
                {stop.quantity} × {stop.products?.name}
              </Text>

              {isCurrent && run.status === 'in_progress' && (
                <View style={styles.actions}>
                  <TouchableOpacity 
                    style={styles.actionBtn} 
                    onPress={() => handleAction(stop.id, 'delivered')}>
                    <Text style={styles.btnText}>Delivered</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.skipBtn]} 
                    onPress={() => handleAction(stop.id, 'skipped')}>
                    <Text style={styles.btnText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  headerCard: { backgroundColor: '#fff', padding: 20, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#6b7280', marginVertical: 8 },
  primaryBtn: { backgroundColor: '#2563eb', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  successBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  list: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  stopCard: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  activeCard: { borderColor: '#2563eb', borderWidth: 2 },
  stopHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stopSequence: { backgroundColor: '#f3f4f6', width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontWeight: 'bold', marginRight: 8 },
  stopName: { flex: 1, fontSize: 16, fontWeight: 'bold' },
  stopStatus: { fontSize: 12, color: '#6b7280', fontWeight: 'bold' },
  address: { color: '#4b5563', marginBottom: 4 },
  qty: { color: '#1f2937', fontWeight: '600', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, backgroundColor: '#10b981', padding: 12, borderRadius: 6, alignItems: 'center' },
  skipBtn: { backgroundColor: '#ef4444' }
});
