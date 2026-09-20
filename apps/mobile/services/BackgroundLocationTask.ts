import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCATION_TASK_NAME = 'BACKGROUND_LOCATION_TASK';

// Define the background task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    
    if (locations && locations.length > 0) {
      const location = locations[locations.length - 1]; // Get the most recent location
      
      try {
        // Retrieve the active run_id from AsyncStorage (set when route starts)
        const activeRunId = await AsyncStorage.getItem('active_run_id');
        
        if (activeRunId) {
          // Push location to Supabase ETA Engine
          const { error: rpcError } = await supabase.rpc('process_vehicle_location', {
            p_run_id: activeRunId,
            p_lat: location.coords.latitude,
            p_lng: location.coords.longitude,
            p_accuracy: location.coords.accuracy || 0,
            p_speed: location.coords.speed || 0,
            p_timestamp: new Date(location.timestamp).toISOString()
          });
          
          if (rpcError) {
            console.error('Failed to update vehicle location in backend:', rpcError);
          }
        }
      } catch (err) {
        console.error('Error processing background location:', err);
      }
    }
  }
});

// Helper function to start adaptive tracking
export async function startAdaptiveTracking(runId: string) {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    console.log('Foreground location permission denied');
    return false;
  }
  
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') {
    console.log('Background location permission denied');
    return false;
  }
  
  // Store runId for the background task to access
  await AsyncStorage.setItem('active_run_id', runId);
  
  // Start the background tracking with power-saving parameters
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50, // Minimum change (in meters) to trigger update
    deferredUpdatesInterval: 30000, // Batch updates every 30 seconds to save battery
    deferredUpdatesDistance: 50,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "AquaKart Delivery Active",
      notificationBody: "Tracking your route to update customers automatically."
    }
  });
  
  console.log('Started background location tracking for run:', runId);
  return true;
}

// Helper function to stop tracking
export async function stopAdaptiveTracking() {
  await AsyncStorage.removeItem('active_run_id');
  
  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    console.log('Stopped background location tracking');
  }
}
