import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AddressService } from '../../services/address';
import type { Address } from '@aquakart/types';
import { theme } from '../../constants/theme';
import { Card, Button, Badge } from '../../components/ui';
import { EmptyState, ErrorState, LoadingState } from '../../components/feedback';

export default function AddressesScreen() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchAddresses();
  }, []);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await AddressService.getAddresses();
      setAddresses(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMockAddress = async () => {
    try {
      setLoading(true);
      await AddressService.addAddress({
        label: 'Home',
        address: '123 Pilot Test Street, AquaCity, 400001',
        lat: 12.9716,
        lng: 77.5946
      });
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

  if (loading) return <LoadingState message="Loading addresses..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchAddresses} />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>My Addresses</Text>
      </View>

      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Badge 
                label={item.label} 
                variant={item.label === 'Home' ? 'success' : item.label === 'Office' ? 'info' : 'neutral'} 
              />
              <Button 
                title="Delete" 
                variant="danger" 
                size="sm" 
                onPress={() => handleDelete(item.id)} 
              />
            </View>
            <Text style={styles.addressText}>{item.address}</Text>
          </Card>
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
          onPress={handleAddMockAddress} 
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
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
});
