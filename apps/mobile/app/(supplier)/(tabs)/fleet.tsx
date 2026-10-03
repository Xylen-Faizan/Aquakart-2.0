import { formatISTDate, formatISTTime, formatISTDateTime, getIndiaBusinessDate } from '../../../lib/date';
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Callout, UrlTile } from "react-native-maps";
import { theme } from "../../../constants/theme";
import { supabase } from "../../../lib/supabase/client";
import { useAuth } from "../../../features/auth/AuthProvider";
import { useLanguage } from "../../../features/i18n/LanguageProvider";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

export default function FleetScreen() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { focusRunId } = useLocalSearchParams<{ focusRunId?: string }>();
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<{ [key: string]: any }>({});
  
  // Center of Bokaro
  const defaultRegion = {
    latitude: 23.6693,
    longitude: 86.1511,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

  const fetchFleet = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      setLoading(true);
      // Get supplier id for this user
      const { data: supplierProfile } = await supabase
        .from('suppliers')
        .select('id')
        .eq('profile_id', session.user.id)
        .single();
        
      if (!supplierProfile) return;

      const { data, error } = await supabase
        .from('delivery_run_live_state')
        .select('*, delivery_runs!inner(supplier_id, status)')
        .eq('delivery_runs.supplier_id', supplierProfile.id)
        .in('delivery_runs.status', ['loading', 'in_progress']);

      if (!error && data) {
        // Fetch capacity for each vehicle using RPC
        const vehiclePromises = data.map(async (v: any) => {
          const { data: capData } = await supabase.rpc('get_vehicle_capacity_state', {
            p_run_id: v.run_id
          });
          
          return {
            ...v,
            capacity: capData ? capData[0] : null
          };
        });

        const enrichedVehicles = await Promise.all(vehiclePromises);
        setVehicles(enrichedVehicles);
      }
    } catch (error) {
      console.error("Failed to fetch fleet:", error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchFleet();
    }, [fetchFleet]),
  );

  useEffect(() => {
    // Subscribe to realtime updates
    const channelName = `fleet-live-${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_run_live_state' },
        () => {
          fetchFleet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFleet]);


  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    if (focusRunId && vehicles.length > 0) {
      const targetVehicle = vehicles.find(v => v.run_id === focusRunId);
      if (targetVehicle && mapRef.current && targetVehicle.latitude != null && targetVehicle.longitude != null) {
        try {
          mapRef.current.animateToRegion({
            latitude: Number(targetVehicle.latitude),
            longitude: Number(targetVehicle.longitude),
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }, 1000);
        } catch (e) {}
        
        timeoutId = setTimeout(() => {
          if (isMounted && markerRefs.current[focusRunId]?.showCallout) {
            try {
              markerRefs.current[focusRunId].showCallout();
            } catch (e) {}
          }
        }, 1200);
      }
    }

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [focusRunId, vehicles]);

  const getMarkerColor = (vehicle: any) => {
    const staleThreshold = 5 * 60 * 1000; // 5 mins
    const isStale = (new Date().getTime() - new Date(vehicle.captured_at).getTime()) > staleThreshold;
    
    if (isStale) return "black";
    
    const cap = vehicle.capacity?.opportunity_capacity || 0;
    if (cap === 0) return "red";
    if (cap <= 5) return "orange";
    
    return "green";
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>{t('fleet.title')}</Text>
            <Text style={styles.headerSubtitle}>
              {vehicles.length} Active Vehicles
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.container}>
        {loading && vehicles.length === 0 ? (
          <ActivityIndicator
            size="large"
            color={theme.colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={defaultRegion}
          >
            {vehicles.filter(v => v.latitude != null && v.longitude != null).map((v) => (
              <Marker
                ref={(ref) => { if (ref) markerRefs.current[v.run_id] = ref; }}
                key={v.run_id}
                coordinate={{ latitude: Number(v.latitude), longitude: Number(v.longitude) }}
                pinColor={getMarkerColor(v)}
              >
                <Callout>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>Vehicle {v.vehicle_id?.substring(0,8) || 'Unknown'}</Text>
                    {v.capacity && (
                      <>
                        <Text style={styles.calloutText}>Remaining: {v.capacity.physical_remaining}</Text>
                        <Text style={styles.calloutText}>Available: {v.capacity.opportunity_capacity}</Text>
                      </>
                    )}
                    <Text style={styles.calloutTime}>
                      GPS: {formatISTTime(v.captured_at)}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
        )}
      </View>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  container: {
    flex: 1,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  callout: {
    padding: 8,
    minWidth: 120,
  },
  calloutTitle: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  calloutText: {
    fontSize: 12,
    marginBottom: 2,
  },
  calloutTime: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
});
