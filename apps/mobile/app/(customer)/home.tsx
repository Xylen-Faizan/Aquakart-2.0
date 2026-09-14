import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, Platform, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../features/auth/AuthProvider';
import { theme } from '../../constants/theme';
import { SupplierService } from '../../services/supplier';
import type { AvailableSupplier } from '@aquakart/types';

export default function HomeScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<AvailableSupplier[]>([]);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const data = await SupplierService.getAvailableSuppliers();
      setSuppliers(data);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <View style={styles.header}>
          <View>
            <Text style={styles.deliverToLabel}>Deliver to</Text>
            <View style={styles.locationContainer}>
              <Ionicons name="location" size={16} color={theme.colors.primary} />
              <Text style={styles.locationText}>Sector 4, Bokaro</Text>
              <Ionicons name="chevron-down" size={16} color={theme.colors.textPrimary} style={{ marginLeft: 4 }} />
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.avatarBtn}>
              <Text style={styles.avatarText}>{profile?.name?.[0]?.toUpperCase() || 'U'}</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={signOut}>
              <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
            </Pressable>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={theme.colors.textTertiary} style={styles.searchIcon} />
            <TextInput 
              placeholder="Search water, jars, suppliers..." 
              style={styles.searchInput}
              placeholderTextColor={theme.colors.textTertiary}
              editable={false}
            />
          </View>
        </View>

        {/* Main CTA Card */}
        <View style={styles.mainCardWrapper}>
          <View style={styles.mainCard}>
            <View style={styles.mainCardContent}>
              <View style={styles.mainCardLeft}>
                <Text style={styles.cardTitle}>Fresh & Pure Water{'\n'}Delivered to your doorstep</Text>
              </View>
              <View style={styles.cardIconContainer}>
                <Text style={styles.cardIcon}>💧</Text>
              </View>
            </View>
            <Pressable 
              style={styles.orderButton} 
              onPress={() => router.push('/(customer)/suppliers')}
            >
              <Text style={styles.orderButtonText}>Order Now</Text>
            </Pressable>
          </View>
        </View>

        {/* Nearby Suppliers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Nearby Suppliers</Text>
            <Pressable onPress={() => router.push('/(customer)/suppliers')}>
              <Text style={styles.seeAllText}>See All</Text>
            </Pressable>
          </View>
          
          <View style={styles.suppliersList}>
            {suppliers.length > 0 ? suppliers.slice(0, 3).map(supplier => (
              <Pressable 
                key={supplier.id} 
                style={styles.supplierCard}
                onPress={() => router.push(`/(customer)/supplier/${supplier.id}`)}
              >
                <View style={styles.supplierCardHeader}>
                  <View style={styles.supplierAvatar}>
                    <Text style={styles.supplierAvatarText}>🚰</Text>
                  </View>
                  <View style={styles.supplierInfo}>
                    <Text style={styles.supplierName}>{supplier.business_name}</Text>
                    <View style={styles.supplierMetaRow}>
                      <Ionicons name="star" size={12} color={theme.colors.warning} />
                      <Text style={styles.supplierRating}>4.8</Text>
                      <Text style={styles.supplierDot}>•</Text>
                      <Text style={styles.supplierDistance}>{(supplier.distance_km || 1.2).toFixed(1)} km</Text>
                    </View>
                  </View>
                </View>
                
                <View style={styles.supplierProductRow}>
                  <Text style={styles.supplierProductText}>20L Jar • ₹{supplier.price || 80}</Text>
                </View>
                
                <View style={styles.supplierStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: supplier.is_accepting_orders ? theme.colors.success : theme.colors.error }]} />
                  <Text style={styles.supplierStatusText}>
                    {supplier.is_accepting_orders ? 'Accepting orders' : 'Currently closed'}
                  </Text>
                </View>
              </Pressable>
            )) : (
              <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', padding: theme.spacing.lg }}>Finding nearby suppliers...</Text>
            )}
          </View>
        </View>

        {/* Popular Products */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Products</Text>
          <View style={styles.productsGrid}>
            <View style={styles.productCard}>
              <View style={styles.productIconWrapper}>
                <Text style={styles.productIcon}>💧</Text>
              </View>
              <Text style={styles.productName}>20L Jar</Text>
              <Text style={styles.productPrice}>₹80</Text>
            </View>
            <View style={styles.productCard}>
              <View style={styles.productIconWrapper}>
                <Text style={styles.productIcon}>🍾</Text>
              </View>
              <Text style={styles.productName}>1L Bottles</Text>
              <Text style={styles.productPrice}>₹120</Text>
            </View>
          </View>
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: theme.colors.background 
  },
  container: { 
    flex: 1 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: theme.spacing.lg,
    paddingTop: Platform.OS === 'ios' ? theme.spacing.xl : theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  deliverToLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
    marginBottom: 2,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: { 
    fontSize: theme.fontSize.md, 
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginLeft: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    padding: theme.spacing.lg,
    paddingBottom: 0,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  mainCardWrapper: {
    padding: theme.spacing.lg,
  },
  mainCard: { 
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  mainCardContent: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: theme.spacing.lg 
  },
  mainCardLeft: {
    flex: 1,
  },
  cardTitle: { 
    fontSize: 22, 
    fontWeight: theme.fontWeight.bold as any, 
    color: theme.colors.white, 
    lineHeight: 30,
  },
  cardIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 32,
  },
  orderButton: { 
    backgroundColor: theme.colors.white,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  orderButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
  },
  section: { 
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: { 
    fontSize: theme.fontSize.lg, 
    fontWeight: theme.fontWeight.bold as any, 
    color: theme.colors.textPrimary, 
  },
  seeAllText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold as any,
    color: theme.colors.primary,
  },
  suppliersList: {
    gap: theme.spacing.md,
  },
  supplierCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  supplierCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  supplierAvatar: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  supplierAvatarText: {
    fontSize: 24,
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  supplierMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  supplierRating: {
    fontSize: 12,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  supplierDot: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginHorizontal: 4,
  },
  supplierDistance: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  supplierProductRow: {
    marginBottom: theme.spacing.sm,
  },
  supplierProductText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  supplierStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  supplierStatusText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium as any,
  },
  productsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  productCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  productIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  productIcon: {
    fontSize: 32,
  },
  productName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  }
});
