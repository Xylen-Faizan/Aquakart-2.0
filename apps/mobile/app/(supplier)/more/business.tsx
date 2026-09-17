import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card, Button } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';
import { supabase } from '../../lib/supabase/client';
import * as Location from 'expo-location';

export default function BusinessProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('profile_id', user.id)
        .single();
        
      if (error) {
        if (error.code !== 'PGRST116') {
          console.error(error);
        }
      } else if (data) {
        setBusinessName(data.business_name || '');
        setOwnerName(data.owner_name || '');
        setPhone(data.phone || '');
        // We won't parse postgis point directly here for simplicity, we'll just show if it's set
        if (data.location) {
           setLocation({lat: 0, lng: 0}); // placeholder to indicate it's set
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLocation = async () => {
    try {
      setSaving(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow location permissions to set your coverage area.');
        return;
      }
      const locationData = await Location.getCurrentPositionAsync({});
      setLocation({
        lat: locationData.coords.latitude,
        lng: locationData.coords.longitude
      });
      Alert.alert('Success', 'Location updated. Remember to tap Save.');
    } catch (error) {
      Alert.alert('Error', 'Failed to get location.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!businessName || !phone) {
      Alert.alert('Validation Error', 'Business name and phone are required.');
      return;
    }

    try {
      setSaving(true);
      
      const { data: existing } = await supabase
        .from('suppliers')
        .select('id')
        .eq('profile_id', user!.id)
        .single();

      if (existing) {
        const updateData: any = {
          business_name: businessName,
          owner_name: ownerName,
          phone: phone,
        };
        
        const { error } = await supabase
          .from('suppliers')
          .update(updateData)
          .eq('profile_id', user!.id);
          
        if (error) throw error;
        
        // Update location via RPC if changed
        if (location && location.lat !== 0) {
            await supabase.rpc('update_supplier_location', {
                p_supplier_id: existing.id,
                p_lng: location.lng,
                p_lat: location.lat
            });
        }
        
      } else {
        // Insert new supplier
        const { data: newSupplier, error } = await supabase
          .from('suppliers')
          .insert({
            profile_id: user!.id,
            business_name: businessName,
            owner_name: ownerName,
            phone: phone,
            is_active: true
          })
          .select('id')
          .single();
          
        if (error) throw error;
        
        if (location && location.lat !== 0 && newSupplier) {
            await supabase.rpc('update_supplier_location', {
                p_supplier_id: newSupplier.id,
                p_lng: location.lng,
                p_lat: location.lat
            });
        }
      }

      Alert.alert('Success', 'Business profile updated successfully!');
      router.back();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Profile</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.label}>Business Name *</Text>
          <TextInput
            style={styles.input}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="e.g. Pure Jal Enterprise"
          />

          <Text style={styles.label}>Owner Name</Text>
          <TextInput
            style={styles.input}
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder="e.g. Rahul Kumar"
          />

          <Text style={styles.label}>Business Phone *</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 9999999999"
            keyboardType="phone-pad"
          />
          
          <Text style={styles.label}>Service Location</Text>
          <View style={styles.locationContainer}>
            <Text style={styles.locationText}>
                {location ? "GPS Coordinates Set ✓" : "Location not set"}
            </Text>
            <Button 
                title="Update GPS" 
                variant="outline" 
                size="small" 
                onPress={handleUpdateLocation} 
            />
          </View>
          <Text style={styles.hintText}>
            Updating your GPS ensures you appear in the marketplace for nearby customers.
          </Text>
        </Card>

        <Button 
          title={saving ? "Saving..." : "Save Profile"} 
          onPress={handleSave} 
          disabled={saving}
          style={styles.saveBtn}
        />
      </ScrollView>
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
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  card: {
    padding: theme.spacing.lg,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: theme.colors.surface,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  locationText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  hintText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  saveBtn: {
    marginTop: 8,
  }
});
