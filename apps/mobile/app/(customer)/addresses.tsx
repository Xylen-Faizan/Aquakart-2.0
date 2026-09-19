import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback } from 'react';
import { useAuth } from '../../features/auth/AuthProvider';
import { AddressService } from '../../services/address';
import type { Address } from '@aquakart/types';
import { theme } from '../../constants/theme';
import { Card, Button, Badge } from '../../components/ui';
import { EmptyState, ErrorState, LoadingState } from '../../components/feedback';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

const BOKARO_SECTORS = [
  { label: 'Sector 1', lat: 23.6693, lng: 86.1511 },
  { label: 'Sector 2', lat: 23.6743, lng: 86.1581 },
  { label: 'Sector 3', lat: 23.6663, lng: 86.1621 },
  { label: 'Sector 4', lat: 23.6613, lng: 86.1661 },
  { label: 'Sector 5', lat: 23.6643, lng: 86.1711 },
  { label: 'Sector 6', lat: 23.6703, lng: 86.1751 },
  { label: 'Sector 8', lat: 23.6763, lng: 86.1801 },
  { label: 'Sector 9', lat: 23.6823, lng: 86.1851 },
  { label: 'Sector 11', lat: 23.6883, lng: 86.1901 },
  { label: 'Sector 12', lat: 23.6943, lng: 86.1951 },
  { label: 'Camp 2', lat: 23.6553, lng: 86.1451 },
  { label: 'Cooperative Colony', lat: 23.6583, lng: 86.1501 },
];

export default function AddressesScreen() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form State
  const [isAdding, setIsAdding] = useState(false);
  const [formHouse, setFormHouse] = useState('');
  const [formSector, setFormSector] = useState(BOKARO_SECTORS[3]); // Default Sector 4
  const [formLandmark, setFormLandmark] = useState('');
  const [formLabel, setFormLabel] = useState<'Home' | 'Office' | 'Other'>('Home');
  const [formInstructions, setFormInstructions] = useState('');
  
  const router = useRouter();

  const [activeAddressId, setActiveAddressId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadActiveAddress();
      fetchAddresses();
    }, [user?.id])
  );

  const loadActiveAddress = async () => {
    try {
      const id = await AsyncStorage.getItem('selectedAddressId');
      setActiveAddressId(id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectAddress = async (id: string) => {
    try {
      await AsyncStorage.setItem('selectedAddressId', id);
      setActiveAddressId(id);
      router.back();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      setError(null);
      if (!user?.id) return;
      const data = await AddressService.getAddresses(user.id);
      setAddresses(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!formHouse.trim()) {
      Alert.alert('Validation Error', 'Please enter your House/Flat Number');
      return;
    }

    try {
      setLoading(true);
      // Construct a human readable address from the fields to match existing DB schema
      const parts = [
        formHouse.trim(),
        formSector.label + ', Bokaro'
      ];
      if (formLandmark.trim()) parts.push(`Landmark: ${formLandmark.trim()}`);
      if (formInstructions.trim()) parts.push(`Instr: ${formInstructions.trim()}`);
      
      const fullAddress = parts.join(' | ');

      if (!user?.id) return;
      await AddressService.addAddress(user.id, {
        label: formLabel,
        address: fullAddress,
        lat: formSector.lat,
        lng: formSector.lng
      });
      
      setIsAdding(false);
      setFormHouse('');
      setFormLandmark('');
      setFormInstructions('');
      await fetchAddresses();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add address');
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Address', 'Are you sure you want to delete this address?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await AddressService.deleteAddress(id);
            setAddresses(prev => prev.filter(a => a.id !== id));
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete address');
          }
        }
      }
    ]);
  };

  const handleUseCurrentLocation = async () => {
    try {
      setLoading(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow location access to use this feature.');
        setLoading(false);
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      let reverseGeo = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (reverseGeo && reverseGeo.length > 0) {
        const place = reverseGeo[0];
        const formattedAddress = [place.name, place.street, place.subregion, place.city].filter(Boolean).join(', ');
        setFormHouse(formattedAddress);
        setFormLandmark(place.district || '');
      } else {
        Alert.alert('Error', 'Could not find address for your location.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to fetch location');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchAddresses} />;

  if (isAdding) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.header}>
            <Pressable onPress={() => setIsAdding(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
            </Pressable>
            <Text style={styles.title}>Add Delivery Address</Text>
          </View>
          
          <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 40 }}>
            <Pressable style={styles.gpsButton} onPress={handleUseCurrentLocation}>
              <Ionicons name="navigate" size={20} color={theme.colors.primary} />
              <Text style={styles.gpsButtonText}>Use Current Location</Text>
            </Pressable>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>House/Flat Number & Building *</Text>
              <TextInput 
                style={styles.input}
                placeholder="e.g. Flat 302, Green Valley Apts"
                value={formHouse}
                onChangeText={setFormHouse}
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bokaro Sector *</Text>
              <View style={styles.sectorsGrid}>
                {BOKARO_SECTORS.map((sector) => (
                  <Pressable 
                    key={sector.label}
                    style={[styles.sectorChip, formSector.label === sector.label && styles.sectorChipActive]}
                    onPress={() => setFormSector(sector)}
                  >
                    <Text style={[styles.sectorChipText, formSector.label === sector.label && styles.sectorChipTextActive]}>
                      {sector.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Landmark (Optional)</Text>
              <TextInput 
                style={styles.input}
                placeholder="e.g. Near City Center Mall"
                value={formLandmark}
                onChangeText={setFormLandmark}
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Save As</Text>
              <View style={styles.labelSelectorRow}>
                {(['Home', 'Office', 'Other'] as const).map(l => (
                  <Pressable 
                    key={l}
                    style={[styles.labelChip, formLabel === l && styles.labelChipActive]}
                    onPress={() => setFormLabel(l)}
                  >
                    <Ionicons 
                      name={l === 'Home' ? 'home' : l === 'Office' ? 'business' : 'location'} 
                      size={16} 
                      color={formLabel === l ? theme.colors.white : theme.colors.textSecondary} 
                    />
                    <Text style={[styles.labelChipText, formLabel === l && styles.labelChipTextActive]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Delivery Instructions (Optional)</Text>
              <TextInput 
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Leave jars near the door, do not ring bell"
                value={formInstructions}
                onChangeText={setFormInstructions}
                multiline
                numberOfLines={3}
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>
            
            <View style={{ height: 20 }} />
            <Button title="Save Address" onPress={handleSaveAddress} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>My Addresses</Text>
      </View>

      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable onPress={() => handleSelectAddress(item.id)}>
            <Card style={[styles.card, activeAddressId === item.id && styles.activeCard]}>
              <View style={styles.cardHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  {activeAddressId === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                  )}
                  <Badge 
                    label={item.label || "Other"} 
                    variant={item.label === 'Home' ? 'success' : item.label === 'Office' ? 'info' : 'neutral'} 
                  />
                </View>
                <Button 
                  title="Delete" 
                  variant="danger" 
                  size="sm" 
                  onPress={() => handleDelete(item.id)} 
                />
              </View>
              <Text style={styles.addressText}>{item.address}</Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState 
            title="No addresses saved" 
            message="Add a delivery address to start ordering."
          />
        }
      />
      
      <View style={styles.footer}>
        <Button 
          title="Add New Address" 
          onPress={() => setIsAdding(true)} 
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    marginRight: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  list: {
    padding: theme.spacing.md,
  },
  card: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
  },
  activeCard: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    backgroundColor: theme.colors.primaryLight + '20',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  addressText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
  footer: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  formContainer: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryLight + '30',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  gpsButtonText: {
    marginLeft: theme.spacing.sm,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.bold as any,
    fontSize: theme.fontSize.md,
  },
  inputGroup: {
    marginBottom: theme.spacing.xl,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  sectorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  sectorChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  sectorChipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  sectorChipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
  },
  sectorChipTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.bold as any,
  },
  labelSelectorRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  labelChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  labelChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  labelChipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
  },
  labelChipTextActive: {
    color: theme.colors.white,
    fontWeight: theme.fontWeight.bold as any,
  },
});
