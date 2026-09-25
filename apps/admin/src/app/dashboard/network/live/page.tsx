'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import styles from './live.module.css';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

// Center of Bokaro
const defaultCenter = {
  lat: 23.6693,
  lng: 86.1511
};

export default function LiveNetworkPage() {
  const [supabase] = useState(() => createClient());
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  });

  const fetchVehicles = useCallback(async () => {
    // In a real app we'd want a specialized RPC that joins delivery_run_live_state with supplier info and capacity.
    // For now we query delivery_run_live_state and delivery_runs.
    const { data: liveState, error: liveError } = await supabase
      .from('delivery_run_live_state')
      .select('*, delivery_runs!inner(supplier_id, driver_id, helper_id, status)')
      .in('delivery_runs.status', ['loading', 'in_progress']);

    if (!liveError && liveState) {
      // Fetch capacity for each vehicle using RPC
      const vehiclePromises = liveState.map(async (v: any) => {
        const { data: capData } = await supabase.rpc('admin_get_vehicle_capacity_state', {
          p_run_id: v.run_id
        });
        
        let supplierName = 'Unknown Supplier';
        if (v.delivery_runs?.supplier_id) {
            const { data: supData } = await supabase.from('suppliers').select('business_name').eq('id', v.delivery_runs.supplier_id).single();
            if (supData) supplierName = supData.business_name;
        }

        return {
          ...v,
          supplierName,
          capacity: capData ? capData[0] : null
        };
      });

      const enrichedVehicles = await Promise.all(vehiclePromises);
      setVehicles(enrichedVehicles);
    }
  }, [supabase]);

  useEffect(() => {
    fetchVehicles();
    
    // Subscribe to realtime updates
    const channel = supabase.channel('public:delivery_run_live_state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_run_live_state' },
        () => {
          fetchVehicles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchVehicles, supabase]);

  const getMarkerIcon = (vehicle: any) => {
    // 🟢 (Active + Spare), 🟡 (Low Spare), 🔴 (Full), ⚫ (Stale GPS)
    const staleThreshold = 5 * 60 * 1000; // 5 mins
    const isStale = (new Date().getTime() - new Date(vehicle.captured_at).getTime()) > staleThreshold;
    
    if (isStale) return 'http://maps.google.com/mapfiles/ms/icons/black-dot.png';
    
    const cap = vehicle.capacity?.opportunity_capacity || 0;
    if (cap === 0) return 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
    if (cap <= 5) return 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
    
    return 'http://maps.google.com/mapfiles/ms/icons/green-dot.png';
  };

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Loading Map...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Live Network Fleet</h1>
        <p className={styles.subtitle}>Bokaro Control Tower</p>
      </header>

      <div className={styles.mapLayout}>
        <div className={styles.mapWrapper}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            zoom={13}
            center={defaultCenter}
            options={{
              disableDefaultUI: false,
              zoomControl: true,
            }}
          >
            {vehicles.map(v => (
              <Marker
                key={v.run_id}
                position={{ lat: v.latitude, lng: v.longitude }}
                icon={getMarkerIcon(v)}
                onClick={() => setSelectedVehicle(v)}
              />
            ))}

            {selectedVehicle && (
              <InfoWindow
                position={{ lat: selectedVehicle.latitude, lng: selectedVehicle.longitude }}
                onCloseClick={() => setSelectedVehicle(null)}
              >
                <div className={styles.infoWindow}>
                  <h3 className={styles.infoTitle}>{selectedVehicle.supplierName}</h3>
                  <p className={styles.infoText}><strong>Vehicle:</strong> {selectedVehicle.vehicle_id.substring(0,8)}</p>
                  
                  {selectedVehicle.capacity && (
                    <div className={styles.capacityCard}>
                      <h4>Live Capacity</h4>
                      <div className={styles.capRow}><span>Loaded:</span> <span>{selectedVehicle.capacity.loaded_quantity}</span></div>
                      <div className={styles.capRow}><span>Delivered:</span> <span>{selectedVehicle.capacity.delivered_quantity}</span></div>
                      <hr className={styles.capDivider}/>
                      <div className={styles.capRow}><span>Physical Remaining:</span> <span>{selectedVehicle.capacity.physical_remaining}</span></div>
                      <div className={styles.capRow}><span>Scheduled Remaining:</span> <span>{selectedVehicle.capacity.scheduled_remaining}</span></div>
                      <div className={styles.capRow}><span>Opportunity Reserved:</span> <span>{selectedVehicle.capacity.opportunity_reserved}</span></div>
                      <hr className={styles.capDivider}/>
                      <div className={styles.capRow}><strong>Available for Dispatch:</strong> <strong>{selectedVehicle.capacity.opportunity_capacity}</strong></div>
                    </div>
                  )}
                  <p className={styles.gpsText}>GPS: {new Date(selectedVehicle.captured_at).toLocaleTimeString()}</p>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>
        
        {/* We can add a side panel here later if we want the drawer open persistently */}
      </div>
    </div>
  );
}
