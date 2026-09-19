import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, TouchableOpacity, Platform, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Link, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback } from 'react';
import { useAuth } from '../../features/auth/AuthProvider';
import { theme } from '../../constants/theme';
import { SupplierService } from '../../services/supplier';
import { AddressService } from '../../services/address';
import type { AvailableSupplier, Address } from '@aquakart/types';

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<AvailableSupplier[]>([]);
  const [activeAddress, setActiveAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [user?.id])
  );

  const loadHomeData = async () => {
    try {
      setLoading(true);
      if (!user?.id) return;
      const addresses = await AddressService.getAddresses(user.id);
      if (addresses && addresses.length > 0) {
        const storedId = await AsyncStorage.getItem('selectedAddressId');
        let addr = addresses.find(a => a.id === storedId);
        if (!addr) {
          addr = addresses[0];
          await AsyncStorage.setItem('selectedAddressId', addr.id);
        }
        setActiveAddress(addr);
        await fetchSuppliers(addr.lat ?? undefined, addr.lng ?? undefined);
      } else {
        setActiveAddress(null);
        setSuppliers([]);
        await AsyncStorage.removeItem('selectedAddressId');
      }
    } catch (e) {
      console.error('Error loading home data:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async (lat?: number, lng?: number) => {
    try {
      const data = await SupplierService.getAvailableSuppliers(lat, lng);
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
          <Link href="/(customer)/addresses" asChild>
            <Pressable 
              style={styles.headerLeftBtn}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 40 }}
            >
              <Text style={styles.deliverToLabel}>Deliver to</Text>
              <View style={styles.locationContainer}>
                <Ionicons name="location" size={16} color={theme.colors.primary} />
                {activeAddress ? (
                  <Text style={styles.locationText} numberOfLines={1}>
                    {activeAddress.address.includes('|') 
                      ? activeAddress.address.split('|')[1].trim() 
                      : activeAddress.address}
                  </Text>
                ) : (
                  <Text style={styles.locationText}>Add delivery address</Text>
                )}
                <Ionicons name="chevron-down" size={16} color={theme.colors.textPrimary} style={{ marginLeft: 4 }} />
              </View>
            </Pressable>
          </Link>
          <View style={styles.headerRight}>
            <Link href="/(customer)/profile" asChild>
              <Pressable style={styles.avatarBtn}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarBtnImage} />
                ) : (
                  <Text style={styles.avatarText}>{profile?.name?.[0]?.toUpperCase() || 'U'}</Text>
                )}
              </Pressable>
            </Link>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Pressable 
            style={styles.searchBar}
            onPress={() => router.push('/(customer)/search' as any)}
          >
            <Ionicons name="search" size={20} color={theme.colors.textTertiary} style={styles.searchIcon} />
            <Text style={[styles.searchInput, { color: theme.colors.textTertiary, paddingVertical: 12 }]}>
              Search water, jars, suppliers...
            </Text>
          </Pressable>
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
              onPress={() => {
                if (!activeAddress) {
                  router.push('/(customer)/addresses');
                } else {
                  router.push('/(customer)/search' as any);
                }
              }}
            >
              <Text style={styles.orderButtonText}>Order Now</Text>
            </Pressable>
          </View>
        </View>

        {/* Popular Brands */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Brands</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {[
              { name: 'Bisleri', image: require('../../assets/images/bisleri_20l.png') },
              { name: 'Aquacia', image: require('../../assets/images/aquacia_1l.png') },
              { name: 'Aquafina', image: require('../../assets/images/aquafina_20l.png') },
              { name: 'Kinley', image: require('../../assets/images/kinley_1l.png') }
            ].map((brand, i) => (
              <Pressable 
                key={i} 
                style={styles.brandCard}
                onPress={() => router.push(`/(customer)/brand/${brand.name}` as any)}
              >
                <View style={[styles.brandIconPlaceholder, { backgroundColor: 'transparent', padding: 0 }]}>
                  <Image source={brand.image} style={{ width: 64, height: 64, borderRadius: 32 }} resizeMode="contain" />
                </View>
                <Text style={styles.brandName}>{brand.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Bulk Orders Banner */}
        <Pressable 
          style={styles.bulkBanner}
          onPress={() => router.push('/(customer)/bulk-orders' as any)}
        >
          <View style={styles.bulkBannerContent}>
            <Text style={styles.bulkBannerTitle}>🎉 Party & Bulk Orders</Text>
            <Text style={styles.bulkBannerSubtitle}>Get 10% off on orders of 100+ jars!</Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>

        {/* Nearby Suppliers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Nearby Suppliers</Text>
            {activeAddress && (
              <Pressable onPress={() => router.push('/(customer)/suppliers')}>
                <Text style={styles.seeAllText}>See All</Text>
              </Pressable>
            )}
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
                      {supplier.distance != null && (
                        <>
                          <Text style={styles.supplierDot}>•</Text>
                          <Text style={styles.supplierDistance}>~ {supplier.distance.toFixed(1)} km</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
                
                <View style={styles.supplierProductRow}>
                  <Text style={styles.supplierProductText}>20L Jar • {supplier.price ? `₹${supplier.price}` : 'Price varies'}</Text>
                </View>
                
                <View style={styles.supplierStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: supplier.is_accepting_orders ? theme.colors.success : theme.colors.error }]} />
                  <Text style={styles.supplierStatusText}>
                    {supplier.is_accepting_orders ? 'Accepting orders' : 'Currently closed'}
                  </Text>
                </View>
              </Pressable>
            )) : (
              <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', padding: theme.spacing.lg }}>
                {!activeAddress 
                  ? 'Please add a delivery address to find nearby suppliers.' 
                  : loading 
                    ? 'Finding nearby suppliers...' 
                    : 'No suppliers available in your area.'}
              </Text>
            )}
          </View>
        </View>

        {/* Popular Products */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Products</Text>
          <View style={styles.productsGrid}>
            <Pressable 
              style={styles.productCard}
              onPress={() => router.push('/(customer)/suppliers')}
            >
              <View style={styles.productIconWrapper}>
                <Image source={require('../../assets/images/jar_20l.png')} style={styles.productImage} resizeMode="contain" />
              </View>
              <Text style={styles.productName}>20L Jar</Text>
              <Text style={styles.productPrice}>View prices</Text>
            </Pressable>
            <Pressable 
              style={styles.productCard}
              onPress={() => router.push('/(customer)/suppliers')}
            >
              <View style={styles.productIconWrapper}>
                <Image source={require('../../assets/images/bottle_1l.png')} style={styles.productImage} resizeMode="contain" />
              </View>
              <Text style={styles.productName}>1L Bottles</Text>
              <Text style={styles.productPrice}>View prices</Text>
            </Pressable>
            <Pressable 
              style={styles.productCard}
              onPress={() => router.push('/(customer)/suppliers')}
            >
              <View style={styles.productIconWrapper}>
                <Image source={require('../../assets/images/cool_jar.jpg')} style={styles.productImage} resizeMode="contain" />
              </View>
              <Text style={styles.productName}>20L Cool Jar</Text>
              <Text style={styles.productPrice}>View prices</Text>
            </Pressable>
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
  headerLeftBtn: {
    flex: 1,
    paddingVertical: theme.spacing.xs,
    paddingRight: theme.spacing.md,
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
  avatarBtnImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    overflow: 'hidden',
  },
  productIcon: {
    fontSize: 32,
  },
  productImage: {
    width: '100%',
    height: '100%',
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
  },
  brandCard: {
    alignItems: 'center',
    marginRight: theme.spacing.lg,
  },
  brandIconPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  brandIconText: {
    fontSize: 24,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  brandName: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textPrimary,
  },
  bulkBanner: {
    margin: theme.spacing.lg,
    marginTop: 0,
    padding: theme.spacing.lg,
    backgroundColor: '#ff6b6b',
    borderRadius: theme.borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bulkBannerContent: {
    flex: 1,
  },
  bulkBannerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  bulkBannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  }
});
