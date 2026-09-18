import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../lib/supabase/client';

const LOCATION_TASK_NAME = 'background-location-task';
let activeRunId: string | null = null;

// Define the background task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const loc = locations[0];
    
    try {
      if (!activeRunId) return;

      // Call the RPC to process the location and evaluate ETA
      await supabase.rpc('process_vehicle_location', {
        p_run_id: activeRunId,
        p_lat: loc.coords.latitude,
        p_lng: loc.coords.longitude,
        p_speed: loc.coords.speed || 0,
        p_accuracy_m: loc.coords.accuracy || 0,
        p_heading: loc.coords.heading || 0,
        p_altitude: loc.coords.altitude || 0,
        p_captured_at: new Date(loc.timestamp).toISOString(),
      });
      
    } catch (err) {
      console.error('Error syncing background location:', err);
    }
  }
});

export const locationService = {
  async requestPermissions() {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      throw new Error('Foreground location permission denied');
    }
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      throw new Error('Background location permission denied');
    }
  },

  async startTracking(runId: string) {
    await this.requestPermissions();
    
    activeRunId = runId;

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000, // Update every 15 seconds
      distanceInterval: 50, // OR every 50 meters
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'AquaKart Driver',
        notificationBody: 'Route tracking is active',
      }
    });
  },

  async stopTracking() {
    activeRunId = null;
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  }
};
