import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Switch, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SupplierService } from '../../services/supplier';
import { theme } from '../../constants/theme';
import { Button, Card, Input } from '../../components/ui';
import { LoadingState } from '../../components/feedback';

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [profile, setProfile] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  // Form states
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  
  // Pricing states
  const [priceStr, setPriceStr] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ownData, globalProducts] = await Promise.all([
        SupplierService.getOwnProfile(),
        SupplierService.getProducts()
      ]);
      
      setAllProducts(globalProducts);

      if (ownData && ownData.supplier) {
        setProfile(ownData.supplier);
        setBusinessName(ownData.supplier.business_name || '');
        setDescription(ownData.supplier.description || '');
        setPhone(ownData.supplier.phone || '');
        setAddress(ownData.supplier.address || '');
        setIsAccepting(ownData.supplier.is_accepting_orders || false);

        if (ownData.products) {
          setProducts(ownData.products);
          const firstProduct = ownData.products[0];
          if (firstProduct) {
            setPriceStr(firstProduct.price?.toString() || '');
            setIsAvailable(firstProduct.available ?? true);
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await SupplierService.updateProfile({
        business_name: businessName,
        description,
        phone,
        address,
        is_accepting_orders: isAccepting
      });

      // Also save the product if we have global products
      if (allProducts.length > 0) {
        const productId = allProducts[0].id;
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
          throw new Error('Please enter a valid price for the product.');
        }
        await SupplierService.setProduct(productId, price, isAvailable);
      }

      Alert.alert('Success', 'Profile and settings updated successfully.');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading profile..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Profile & Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        
        {/* Business Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Details</Text>
          <Card style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Name</Text>
              <Input 
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="e.g. Aqua Pure Solutions"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <Input 
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+91"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <Input 
                value={description}
                onChangeText={setDescription}
                placeholder="Brief description of your business"
                multiline
                numberOfLines={3}
                style={styles.textArea}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Address</Text>
              <Input 
                value={address}
                onChangeText={setAddress}
                placeholder="Full street address"
              />
            </View>
          </Card>
        </View>

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product Pricing</Text>
          <Card style={styles.card}>
            <Text style={styles.helpText}>
              Set the price for a standard 20L RO Water Can.
            </Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Price (₹)</Text>
              <Input 
                value={priceStr}
                onChangeText={setPriceStr}
                keyboardType="decimal-pad"
              />
            </View>
          </Card>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Store Status</Text>
          <Card style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>Accepting Orders</Text>
                <Text style={styles.settingDescription}>
                  Turn this off to temporarily hide your store from customers.
                </Text>
              </View>
              <Switch 
                value={isAccepting} 
                onValueChange={setIsAccepting} 
                trackColor={{ false: theme.colors.border, true: theme.colors.success }}
                thumbColor={theme.colors.white}
              />
            </View>

            <View style={styles.divider} />
            
            <View style={styles.settingRow}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>Product Available</Text>
                <Text style={styles.settingDescription}>
                  Are 20L water cans currently in stock?
                </Text>
              </View>
              <Switch 
                value={isAvailable} 
                onValueChange={setIsAvailable} 
                trackColor={{ false: theme.colors.border, true: theme.colors.success }}
                thumbColor={theme.colors.white}
              />
            </View>
          </Card>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footerBar}>
        <Button 
          title="Save Changes" 
          onPress={handleSaveProfile} 
          disabled={saving}
          style={styles.saveButton}
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
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    paddingTop: Platform.OS === 'ios' ? theme.spacing.xl : theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  container: {
    flex: 1,
  },
  section: {
    padding: theme.spacing.lg,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  card: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inputGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: theme.spacing.lg,
  },
  settingTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.lg,
  },
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  saveButton: {
    width: '100%',
  },
});
