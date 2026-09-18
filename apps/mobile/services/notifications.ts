import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notificationService = {
  async registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
      }
      
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } else {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    return token;
  },

  async syncPushToken(userId: string) {
    try {
      const token = await this.registerForPushNotificationsAsync();
      if (!token) return;

      // Upsert the token to the user_devices table
      const { error } = await supabase
        .from('user_devices')
        .upsert(
          { 
            user_id: userId, 
            expo_push_token: token, 
            platform: Platform.OS, 
            last_seen_at: new Date().toISOString() 
          },
          { onConflict: 'user_id, expo_push_token' }
        );

      if (error) {
        console.error('Error syncing push token:', error);
      }
    } catch (err) {
      console.error('Error in syncPushToken:', err);
    }
  }
};
